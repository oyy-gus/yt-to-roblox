import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { PermissionGrantResult, PermissionSubjectType, RobloxConfig, RobloxUploadResult } from '../types/index.js';

const ROBLOX_ASSETS_API = 'https://apis.roblox.com/assets/v1/assets';
const ROBLOX_OPERATIONS_API = 'https://apis.roblox.com/assets/v1';
const ROBLOX_ASSET_PERMISSIONS_API = 'https://apis.roblox.com/asset-permissions-api/v1/assets/permissions';
const VALID_SUBJECT_TYPES: PermissionSubjectType[] = ['Universe', 'User', 'Group'];

function buildRobloxAuthHeaders(auth: { apiKey?: string; accessToken?: string }): Record<string, string> {
  if (auth.accessToken && auth.accessToken.trim()) {
    return { Authorization: `Bearer ${auth.accessToken.trim()}` };
  }
  if (auth.apiKey && auth.apiKey.trim()) {
    return { 'x-api-key': auth.apiKey.trim() };
  }
  return {};
}

export async function validateRobloxCredentials({ apiKey, accessToken, creatorId, creatorType = 'user' }: RobloxConfig): Promise<{ isValid: boolean; reason: string }> {
  const authHeaders = buildRobloxAuthHeaders({ apiKey, accessToken });
  if (Object.keys(authHeaders).length === 0) {
    return { isValid: false, reason: 'Login Roblox OAuth atau Roblox API Key wajib diisi.' };
  }
  if (!creatorId || !creatorId.trim()) {
    return { isValid: false, reason: 'Creator ID (User ID atau Group ID) wajib diisi.' };
  }

  const cleanId = creatorId.trim();

  try {
    const creatorParam = creatorType === 'group'
      ? `creator.groupId=${cleanId}`
      : `creator.userId=${cleanId}`;

    const testUrl = `https://apis.roblox.com/assets/v1/assets?${creatorParam}&maxPageSize=1`;
    const res = await fetch(testUrl, {
      method: 'GET',
      headers: authHeaders
    });

    if (res.status === 401 || res.status === 403) {
      return {
        isValid: false,
        reason: accessToken
          ? 'Sesi OAuth Roblox tidak valid atau izin asset:read / asset:write belum diberikan. Silakan login ulang.'
          : 'User not authenticated: Pastikan API Key benar, memiliki izin Assets (Read & Write) di Roblox Creator Hub, dan IP tidak dibatasi (gunakan 0.0.0.0/0).'
      };
    }

    if (res.status === 400) {
      const body = await res.json().catch(() => ({})) as any;
      return {
        isValid: false,
        reason: body.message || 'Format Creator ID atau parameter tidak valid di Roblox.'
      };
    }

    return { isValid: true, reason: 'Koneksi ke Roblox Open Cloud berhasil!' };
  } catch (err: any) {
    return { isValid: false, reason: `Gagal menghubungi server Roblox: ${err.message}` };
  }
}

export interface UploadAssetParams {
  filePath: string;
  displayName: string;
  description?: string;
  apiKey?: string;
  accessToken?: string;
  creatorId: string;
  creatorType?: 'user' | 'group';
  durationSec?: number;
}

export async function uploadAudioAsset({ filePath, displayName, description = '', apiKey, accessToken, creatorId, creatorType = 'user', durationSec }: UploadAssetParams): Promise<RobloxUploadResult> {
  if (durationSec && durationSec > 420) {
    throw new Error('Durasi audio melebihi batas maksimum 7 menit untuk Roblox Open Cloud.');
  }

  if (!fsSync.existsSync(filePath)) {
    throw new Error(`File audio tidak ditemukan di path: ${filePath}`);
  }

  const authHeaders = buildRobloxAuthHeaders({ apiKey, accessToken });
  const cleanId = (creatorId || '').trim();

  if (Object.keys(authHeaders).length === 0) {
    throw new Error('Token OAuth atau Roblox API Key tidak boleh kosong.');
  }
  if (!cleanId) {
    throw new Error('Roblox Creator ID tidak boleh kosong.');
  }

  const safeName = displayName ? displayName.slice(0, 50).trim() : 'Audio';
  const safeDesc = description ? description.slice(0, 500).trim() : '';

  const creationContext = {
    creator: creatorType === 'group'
      ? { groupId: cleanId }
      : { userId: cleanId }
  };

  const requestPayload: Record<string, any> = {
    assetType: 'Audio',
    displayName: safeName,
    creationContext
  };
  if (safeDesc) {
    requestPayload.description = safeDesc;
  }

  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append('request', JSON.stringify(requestPayload));
  formData.append('fileContent', new Blob([fileBuffer], { type: 'audio/mpeg' }), fileName);

  console.log(`[ROBLOX] Uploading "${safeName}" to Roblox Open Cloud for ${creatorType} ${cleanId}...`);

  const uploadRes = await fetch(ROBLOX_ASSETS_API, {
    method: 'POST',
    headers: authHeaders,
    body: formData
  });

  const uploadData = await uploadRes.json().catch(() => ({})) as any;

  if (!uploadRes.ok) {
    let errMsg = uploadData.message || uploadData.error || `HTTP ${uploadRes.status}`;
    if (uploadRes.status === 401 || String(errMsg).toLowerCase().includes('not authenticated')) {
      errMsg = accessToken
        ? 'Sesi OAuth Roblox kedaluwarsa atau tidak valid. Silakan login ulang dengan Roblox.'
        : 'User not authenticated (Pastikan API Key memiliki izin Assets:Write di Roblox Creator Hub dan IP diizinkan: 0.0.0.0/0)';
    } else if (uploadRes.status === 403 || String(errMsg).toLowerCase().includes('forbidden')) {
      errMsg = 'Forbidden (Akun/API Key tidak memiliki izin menulis aset untuk Creator ID ini)';
    }
    console.error(`[ROBLOX] Upload failed:`, errMsg);
    throw new Error(`Roblox Upload Gagal: ${errMsg}`);
  }

  if (uploadData.path) {
    const operationPath = uploadData.path;
    console.log(`[ROBLOX] Asset operation queued: ${operationPath}. Polling status...`);
    return await pollOperationStatus(operationPath, authHeaders);
  }

  if (uploadData.assetId || uploadData.response?.assetId) {
    const assetId = uploadData.assetId || uploadData.response.assetId;
    const moderationState = uploadData.response?.moderationResult?.moderationState || 'MODERATION_STATE_APPROVED';
    return {
      assetId: String(assetId),
      assetUrl: `https://create.roblox.com/dashboard/creations/marketplace/${assetId}/configure`,
      moderationState
    };
  }

  throw new Error('Respons dari Roblox tidak memuat ID operasi atau Asset ID yang valid.');
}

async function pollOperationStatus(operationPath: string, authHeaders: Record<string, string>, maxAttempts: number = 20, delayMs: number = 1500): Promise<RobloxUploadResult> {
  const url = `${ROBLOX_OPERATIONS_API}/${operationPath}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, delayMs));

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: authHeaders
      });

      if (!res.ok) {
        console.warn(`[ROBLOX] Poll attempt ${attempt} returned HTTP ${res.status}`);
        continue;
      }

      const data = await res.json() as any;

      if (data.done) {
        if (data.error) {
          throw new Error(data.error.message || 'Operasi Roblox gagal diproses.');
        }

        const asset = data.response;
        if (!asset || !asset.assetId) {
          throw new Error('Roblox menyelesaikan operasi tetapi tidak mengembalikan Asset ID.');
        }

        const assetId = String(asset.assetId);
        const moderationState = asset.moderationResult?.moderationState || 'MODERATION_STATE_APPROVED';
        console.log(`[ROBLOX] Asset successfully published! Asset ID: ${assetId} (${moderationState})`);

        return {
          assetId,
          assetUrl: `https://create.roblox.com/dashboard/creations/marketplace/${assetId}/configure`,
          moderationState
        };
      }
    } catch (err) {
      if (attempt === maxAttempts) throw err;
    }
  }

  throw new Error('Waktu tunggu proses Roblox melebihi batas (Timeout 30 detik).');
}


export function parseNumericIds(input: string | string[] | undefined | null): string[] {
  if (!input) return [];
  const rawList = Array.isArray(input)
    ? input.flatMap(item => String(item).split(/[\s,;]+/))
    : String(input).split(/[\s,;]+/);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawList) {
    const cleaned = raw.trim();
    if (/^\d+$/.test(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

export interface GrantPermissionsParams {
  apiKey?: string;
  accessToken?: string;
  assetIds: string | string[];
  subjectType: PermissionSubjectType;
  targetIds: string | string[];
  action?: 'Use' | 'Edit';
}


export async function grantAssetPermissions({
  apiKey,
  accessToken,
  assetIds,
  subjectType,
  targetIds,
  action = 'Use'
}: GrantPermissionsParams): Promise<PermissionGrantResult[]> {
  const authHeaders = buildRobloxAuthHeaders({ apiKey, accessToken });
  if (Object.keys(authHeaders).length === 0) {
    throw new Error('Token OAuth atau Roblox API Key tidak boleh kosong.');
  }

  if (!VALID_SUBJECT_TYPES.includes(subjectType)) {
    throw new Error(`Tipe target permission tidak valid: ${subjectType}. Gunakan Universe, User, atau Group.`);
  }

  const parsedAssets = parseNumericIds(assetIds);
  const parsedTargets = parseNumericIds(targetIds);

  if (parsedAssets.length === 0) {
    throw new Error('Minimal satu Asset ID Roblox yang valid wajib diisi.');
  }
  if (parsedTargets.length === 0) {
    throw new Error(`Minimal satu ${subjectType} ID yang valid wajib diisi.`);
  }

  const results: PermissionGrantResult[] = [];
  const CHUNK_SIZE = 50;

  for (const targetId of parsedTargets) {
    for (let i = 0; i < parsedAssets.length; i += CHUNK_SIZE) {
      const assetChunk = parsedAssets.slice(i, i + CHUNK_SIZE);
      const requestsPayload = assetChunk.map(assetId => ({
        assetId,
        subject: {
          subjectType,
          subjectId: targetId
        },
        action
      }));

      try {
        const res = await fetch(ROBLOX_ASSET_PERMISSIONS_API, {
          method: 'PATCH',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests: requestsPayload })
        });

        const data = await res.json().catch(() => ({})) as any;

        if (!res.ok) {
          const rawErr = data?.error;
          const errDetail = typeof rawErr === 'string'
            ? rawErr
            : (rawErr?.message || rawErr?.code || '');
          let errMsg = String(data?.message || errDetail || `HTTP ${res.status}`);
          if (errMsg.toLowerCase().includes('subjecttype')) {
            errMsg = `Roblox menolak target "${subjectType}" (${errMsg}). Untuk Audio, gunakan target Universe ID (ID Experience/Game Roblox).`;
          }
          if (res.status === 401) {
            errMsg = accessToken
              ? 'Sesi OAuth kedaluwarsa atau belum memiliki izin asset:write.'
              : 'API Key tidak valid atau belum memiliki izin Assets:Write.';
          } else if (res.status === 403) {
            errMsg = `Akses ditolak untuk ${subjectType} ID ${targetId}. Pastikan akun/API Key adalah pemilik asset dan memiliki izin.`;
          }
          for (const assetId of assetChunk) {
            results.push({ assetId, targetType: subjectType, targetId, success: false, error: errMsg });
          }
          continue;
        }

        console.log(`[ROBLOX] Granted ${action} permission on ${assetChunk.length} asset(s) to ${subjectType} ${targetId}`);
        for (const assetId of assetChunk) {
          results.push({ assetId, targetType: subjectType, targetId, success: true });
        }
      } catch (err: any) {
        const msg = err?.message || 'Gagal menghubungi Roblox Asset Permissions API.';
        for (const assetId of assetChunk) {
          results.push({ assetId, targetType: subjectType, targetId, success: false, error: msg });
        }
      }
    }
  }

  return results;
}

export interface CreatorAssetItem {
  assetId: string;
  displayName: string;
  assetType: string;
  moderationState: string;
  state?: string;
  createTime?: string;
  assetUrl: string;
}

export interface ListCreatorAssetsParams {
  apiKey?: string;
  accessToken?: string;
  creatorId: string;
  creatorType?: 'user' | 'group';
  assetType?: string;
  pageToken?: string;
  maxPageSize?: number;
}

export async function listCreatorAssets({
  apiKey,
  accessToken,
  creatorId,
  creatorType = 'user',
  assetType = 'All',
  pageToken,
  maxPageSize = 50
}: ListCreatorAssetsParams): Promise<{ assets: CreatorAssetItem[]; nextPageToken?: string }> {
  const authHeaders = buildRobloxAuthHeaders({ apiKey, accessToken });
  if (Object.keys(authHeaders).length === 0) {
    throw new Error('Login Roblox OAuth atau Roblox API Key wajib diisi.');
  }

  const cleanId = (creatorId || '').trim();
  if (!/^\d+$/.test(cleanId)) {
    throw new Error('Creator ID (User ID atau Group ID) harus berupa angka yang valid.');
  }

  if (creatorType === 'group') {
    throw new Error('Roblox Open Cloud tidak mendukung pengambilan daftar aset Group secara langsung. Gunakan mode "Masukkan Asset ID Manual" untuk aset Group.');
  }

  const normalizedFilter = (assetType || 'All').trim().toLowerCase();
  const limit = Math.min(Math.max(maxPageSize, 1), 100);

  if (normalizedFilter === 'audio') {
    const params = new URLSearchParams({
      limit: String(limit),
      sortOrder: 'Desc'
    });
    if (pageToken) {
      params.set('cursor', pageToken);
    }

    const invUrl = `https://inventory.roblox.com/v2/users/${cleanId}/inventory/3?${params.toString()}`;
    const res = await fetch(invUrl, { method: 'GET' });
    const data = await res.json().catch(() => ({})) as any;

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('Inventory audio akun Roblox ini bersifat privat. Buka pengaturan privasi Inventory Roblox agar dapat dipindai.');
      }
      throw new Error(data.errors?.[0]?.message || data.message || `Gagal mengambil daftar audio Roblox (HTTP ${res.status}).`);
    }

    const rawItems: any[] = Array.isArray(data.data) ? data.data : [];
    const mappedAssets: CreatorAssetItem[] = rawItems.map(a => {
      const assetId = String(a.assetId || '');
      return {
        assetId,
        displayName: String(a.assetName || `Audio ${assetId}`),
        assetType: 'Audio',
        moderationState: 'Approved',
        state: 'Active',
        createTime: a.created ? String(a.created) : undefined,
        assetUrl: `https://create.roblox.com/dashboard/creations/marketplace/${assetId}/configure`
      };
    });

    return {
      assets: mappedAssets,
      nextPageToken: data.nextPageCursor ? String(data.nextPageCursor) : undefined
    };
  }

  const cloudParams = new URLSearchParams({
    maxPageSize: String(limit)
  });
  if (pageToken) {
    cloudParams.set('pageToken', pageToken);
  }

  const cloudUrl = `https://apis.roblox.com/cloud/v2/users/${cleanId}/inventory-items?${cloudParams.toString()}`;
  const res = await fetch(cloudUrl, {
    method: 'GET',
    headers: authHeaders
  });

  const data = await res.json().catch(() => ({})) as any;

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        accessToken
          ? 'Sesi OAuth tidak valid atau belum memiliki izin user.inventory-item:read.'
          : 'API Key tidak valid atau belum memiliki izin Inventory:Read.'
      );
    }
    throw new Error(data.message || data.error || `Gagal mengambil daftar asset Roblox (HTTP ${res.status}).`);
  }

  const rawItems: any[] = Array.isArray(data.inventoryItems) ? data.inventoryItems : [];
  const mappedAssets: CreatorAssetItem[] = rawItems
    .map(item => {
      const details = item.assetDetails || {};
      const assetId = String(details.assetId || '');
      const rawType = String(details.inventoryItemAssetType || 'Asset');
      const normalizedType = rawType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      return {
        assetId,
        displayName: `${normalizedType} ${assetId}`,
        assetType: rawType,
        moderationState: 'UNKNOWN',
        state: 'Active',
        createTime: item.addTime ? String(item.addTime) : undefined,
        assetUrl: `https://create.roblox.com/dashboard/creations/marketplace/${assetId}/configure`
      };
    })
    .filter(a => {
      if (!a.assetId) return false;
      if (!normalizedFilter || normalizedFilter === 'all') return true;
      const itemType = a.assetType.toLowerCase();
      if (normalizedFilter === 'image') {
        return itemType.includes('image') || itemType.includes('decal');
      }
      if (normalizedFilter === 'mesh') {
        return itemType.includes('mesh');
      }
      return itemType.includes(normalizedFilter);
    });

  return {
    assets: mappedAssets,
    nextPageToken: data.nextPageToken ? String(data.nextPageToken) : undefined
  };
}

export const listCreatorAudioAssets = listCreatorAssets;

export function isAssetModerated(moderationState?: string | null): boolean {
  if (!moderationState) return false;
  const normalized = String(moderationState).toUpperCase();
  return normalized.includes('REJECTED') || normalized.includes('MODERATED');
}

export interface ArchiveAssetResult {
  assetId: string;
  success: boolean;
  error?: string;
}


export async function archiveAsset({
  apiKey,
  accessToken,
  assetId
}: {
  apiKey?: string;
  accessToken?: string;
  assetId: string;
}): Promise<ArchiveAssetResult> {
  const authHeaders = buildRobloxAuthHeaders({ apiKey, accessToken });
  if (Object.keys(authHeaders).length === 0) {
    throw new Error('Token OAuth atau Roblox API Key tidak boleh kosong.');
  }

  const cleanAssetId = String(assetId || '').trim();
  if (!/^\d+$/.test(cleanAssetId)) {
    return { assetId: cleanAssetId, success: false, error: 'Asset ID tidak valid.' };
  }

  try {
    const res = await fetch(`${ROBLOX_ASSETS_API}/${cleanAssetId}:archive`, {
      method: 'POST',
      headers: authHeaders
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as any;
      let errMsg = data.message || data.error || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        errMsg = accessToken
          ? 'Sesi OAuth tidak valid atau belum memiliki izin asset:write.'
          : 'API Key tidak valid atau belum memiliki izin Assets:Write.';
      }
      return { assetId: cleanAssetId, success: false, error: errMsg };
    }

    console.log(`[ROBLOX] Archived asset ${cleanAssetId}`);
    return { assetId: cleanAssetId, success: true };
  } catch (err: any) {
    return {
      assetId: cleanAssetId,
      success: false,
      error: err?.message || 'Gagal mengarsipkan asset Roblox.'
    };
  }
}

export async function archiveModeratedAssets({
  apiKey,
  accessToken,
  creatorId,
  creatorType = 'user',
  assetIds,
  assetType = 'All'
}: {
  apiKey?: string;
  accessToken?: string;
  creatorId?: string;
  creatorType?: 'user' | 'group';
  assetIds?: string | string[];
  assetType?: string;
}): Promise<{ results: ArchiveAssetResult[]; scannedCount: number; moderatedCount: number }> {
  const explicitIds = parseNumericIds(assetIds);

  if (explicitIds.length > 0) {
    const results: ArchiveAssetResult[] = [];
    for (const id of explicitIds) {
      results.push(await archiveAsset({ apiKey, accessToken, assetId: id }));
    }
    return {
      results,
      scannedCount: explicitIds.length,
      moderatedCount: explicitIds.length
    };
  }

  if (!creatorId || !creatorId.trim()) {
    throw new Error('Creator ID wajib diisi untuk memindai asset yang terkena moderasi.');
  }

  const allAssets: CreatorAssetItem[] = [];
  let pageToken: string | undefined = undefined;
  let pages = 0;

  do {
    const page = await listCreatorAssets({
      apiKey,
      accessToken,
      creatorId,
      creatorType,
      assetType,
      pageToken,
      maxPageSize: 100
    });
    allAssets.push(...page.assets);
    pageToken = page.nextPageToken;
    pages++;
  } while (pageToken && pages < 10);

  const moderatedAssets = allAssets.filter(
    a => isAssetModerated(a.moderationState) && String(a.state || '').toLowerCase() !== 'archived'
  );

  const results: ArchiveAssetResult[] = [];
  for (const asset of moderatedAssets) {
    results.push(await archiveAsset({ apiKey, accessToken, assetId: asset.assetId }));
  }

  return {
    results,
    scannedCount: allAssets.length,
    moderatedCount: moderatedAssets.length
  };
}

export interface ScannedAudioEntry {
  title: string;
  sound_id: string;
  speed?: number;
}

export function formatAudioJsonEntry(
  title: string,
  soundId: string,
  speed?: number | string | null
): ScannedAudioEntry {
  const entry: ScannedAudioEntry = {
    title,
    sound_id: String(soundId)
  };
  if (speed !== undefined && speed !== null && String(speed).trim() !== '') {
    const parsed = typeof speed === 'number' ? speed : parseFloat(String(speed));
    if (Number.isFinite(parsed) && Math.abs(parsed - 1) > 0.001) {
      entry.speed = parsed;
    }
  }
  return entry;
}

export interface ScanDateFilter {
  mode: 'all' | 'date' | 'month';
  date?: string;
  month?: string;
  tzOffsetMinutes?: number;
}

export function matchesScanDateFilter(createTime?: string, dateFilter?: ScanDateFilter): boolean {
  if (!dateFilter || dateFilter.mode === 'all') {
    return true;
  }
  if (!createTime) {
    return false;
  }

  const parsed = new Date(createTime);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const offsetMinutes = typeof dateFilter.tzOffsetMinutes === 'number' && Number.isFinite(dateFilter.tzOffsetMinutes)
    ? dateFilter.tzOffsetMinutes
    : 0;
  const localDate = new Date(parsed.getTime() - offsetMinutes * 60_000);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');

  if (dateFilter.mode === 'date') {
    if (!dateFilter.date) return true;
    return `${year}-${month}-${day}` === dateFilter.date.trim();
  }

  if (dateFilter.mode === 'month') {
    if (!dateFilter.month) return true;
    return `${year}-${month}` === dateFilter.month.trim();
  }

  return true;
}

export async function scanCreatorAudioAssets({
  apiKey,
  accessToken,
  creatorId,
  creatorType = 'user',
  dateFilter,
  speed
}: {
  apiKey?: string;
  accessToken?: string;
  creatorId: string;
  creatorType?: 'user' | 'group';
  dateFilter?: ScanDateFilter;
  speed?: number | string | null;
}): Promise<{ audios: ScannedAudioEntry[]; totalScanned: number; skippedModerated: number; skippedDateFilter: number }> {
  if (!creatorId || !creatorId.trim()) {
    throw new Error('Creator ID (User ID atau Group ID) wajib diisi untuk scan audio.');
  }

  const allAudioAssets: CreatorAssetItem[] = [];
  let pageToken: string | undefined = undefined;
  let pages = 0;

  do {
    const page = await listCreatorAssets({
      apiKey,
      accessToken,
      creatorId,
      creatorType,
      assetType: 'Audio',
      pageToken,
      maxPageSize: 100
    });
    allAudioAssets.push(...page.assets);
    pageToken = page.nextPageToken;
    pages++;
  } while (pageToken && pages < 20);

  let skippedModerated = 0;
  let skippedDateFilter = 0;
  const dateMatchedAssets: CreatorAssetItem[] = [];

  for (const asset of allAudioAssets) {
    if (!matchesScanDateFilter(asset.createTime, dateFilter)) {
      skippedDateFilter++;
      continue;
    }
    dateMatchedAssets.push(asset);
  }

  const authHeaders = buildRobloxAuthHeaders({ apiKey, accessToken });
  const audios: ScannedAudioEntry[] = [];
  const batchSize = 10;

  for (let i = 0; i < dateMatchedAssets.length; i += batchSize) {
    const batch = dateMatchedAssets.slice(i, i + batchSize);
    const checked = await Promise.all(
      batch.map(async (asset) => {
        let modState = asset.moderationState;
        let state = asset.state || 'Active';
        let name = asset.displayName;

        if (Object.keys(authHeaders).length > 0) {
          try {
            let res = await fetch(`${ROBLOX_ASSETS_API}/${asset.assetId}`, {
              method: 'GET',
              headers: authHeaders
            });
            if (res.status === 429) {
              await new Promise(r => setTimeout(r, 1000));
              res = await fetch(`${ROBLOX_ASSETS_API}/${asset.assetId}`, {
                method: 'GET',
                headers: authHeaders
              });
            }
            if (res.ok) {
              const detail = await res.json().catch(() => null) as any;
              if (detail) {
                modState = String(detail.moderationResult?.moderationState || modState);
                state = String(detail.state || state);
                if (detail.displayName) name = String(detail.displayName);
              }
            }
          } catch {
          }
        }

        const isArchived = String(state || '').toLowerCase() === 'archived';
        if (isAssetModerated(modState) || isArchived) {
          return null;
        }
        return formatAudioJsonEntry(name, asset.assetId, speed);
      })
    );

    for (const entry of checked) {
      if (entry === null) {
        skippedModerated++;
      } else {
        audios.push(entry);
      }
    }
  }

  return {
    audios,
    totalScanned: allAudioAssets.length,
    skippedModerated,
    skippedDateFilter
  };
}
