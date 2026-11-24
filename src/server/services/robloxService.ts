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
          let errMsg = data.message || data.error || `HTTP ${res.status}`;
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

/**
 * Lists existing assets (Audio, Animation, Decal, Mesh, Model, Video, etc.)
 * owned by the configured Roblox User or Group.
 */
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

  const params = new URLSearchParams();
  if (creatorType === 'group') {
    params.set('creator.groupId', cleanId);
  } else {
    params.set('creator.userId', cleanId);
  }
  params.set('maxPageSize', String(Math.min(Math.max(maxPageSize, 1), 100)));
  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const url = `${ROBLOX_ASSETS_API}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: authHeaders
  });

  const data = await res.json().catch(() => ({})) as any;

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        accessToken
          ? 'Sesi OAuth tidak valid atau belum memiliki izin asset:read.'
          : 'API Key tidak valid atau belum memiliki izin Assets:Read.'
      );
    }
    throw new Error(data.message || data.error || `Gagal mengambil daftar asset Roblox (HTTP ${res.status}).`);
  }

  const normalizedFilter = (assetType || 'All').trim().toLowerCase();
  const rawAssets: any[] = Array.isArray(data.assets) ? data.assets : [];
  const mappedAssets: CreatorAssetItem[] = rawAssets
    .filter(a => {
      if (!normalizedFilter || normalizedFilter === 'all') return true;
      const itemType = String(a.assetType || '').toLowerCase();
      if (normalizedFilter === 'image') {
        return itemType === 'image' || itemType === 'decal';
      }
      if (normalizedFilter === 'mesh') {
        return itemType === 'mesh' || itemType === 'meshpart';
      }
      return itemType === normalizedFilter;
    })
    .map(a => {
      const assetId = String(a.assetId || '');
      return {
        assetId,
        displayName: String(a.displayName || `Asset ${assetId}`),
        assetType: String(a.assetType || 'Asset'),
        moderationState: String(a.moderationResult?.moderationState || 'UNKNOWN'),
        state: a.state ? String(a.state) : undefined,
        createTime: a.createTime ? String(a.createTime) : undefined,
        assetUrl: `https://create.roblox.com/dashboard/creations/marketplace/${assetId}/configure`//create.roblox.com/dashboard/creations/marketplace/${assetId}/configure`,
      };
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

/**
 * Scans creator assets (or archives explicit assetIds) that are moderated/rejected and not yet archived.
 */
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
  id: string;
  name: string;
}

/**
 * Scans all active, non-moderated Audio assets owned by the creator and returns
 * a clean list of { id, name } entries suitable for JSON export.
 */
export async function scanCreatorAudioAssets({
  apiKey,
  accessToken,
  creatorId,
  creatorType = 'user'
}: {
  apiKey?: string;
  accessToken?: string;
  creatorId: string;
  creatorType?: 'user' | 'group';
}): Promise<{ audios: ScannedAudioEntry[]; totalScanned: number; skippedModerated: number }> {
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
  const audios: ScannedAudioEntry[] = [];

  for (const asset of allAudioAssets) {
    const isArchived = String(asset.state || '').toLowerCase() === 'archived';
    if (isAssetModerated(asset.moderationState) || isArchived) {
      skippedModerated++;
      continue;
    }
    audios.push({
      id: asset.assetId,
      name: asset.displayName
    });
  }

  return {
    audios,
    totalScanned: allAudioAssets.length,
    skippedModerated
  };
}
