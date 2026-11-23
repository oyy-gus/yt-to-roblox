import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { RobloxConfig, RobloxUploadResult } from '../types/index.js';

const ROBLOX_ASSETS_API = 'https://apis.roblox.com/assets/v1/assets';
const ROBLOX_OPERATIONS_API = 'https://apis.roblox.com/assets/v1';

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

  const safeName = displayName ? displayName.slice(0, 50).trim() : 'Maxistrong Audio';
  const safeDesc = (description || 'Uploaded via Maxistrong Audio Downloader').slice(0, 500);

  const creationContext = {
    creator: creatorType === 'group' 
      ? { groupId: cleanId }
      : { userId: cleanId }
  };

  const requestPayload = {
    assetType: 'Audio',
    displayName: safeName,
    description: safeDesc,
    creationContext
  };

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
