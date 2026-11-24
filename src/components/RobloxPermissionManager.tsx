'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ListChecks,
  ExternalLink,
  Archive,
  FileJson,
  Copy,
  Check,
  Download
} from 'lucide-react';
import { getNormalizedApiUrl } from '../utils/api';
import type { PermissionGrantResult, PermissionSubjectType, RobloxConfig } from '../types/index.js';

interface CreatorAssetItem {
  assetId: string;
  displayName: string;
  assetType: string;
  moderationState: string;
  state?: string;
  createTime?: string;
  assetUrl: string;
}

interface RobloxPermissionManagerProps {
  robloxConfig: RobloxConfig;
  setRobloxConfig: (config: RobloxConfig) => void;
}

function parseIds(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const cleaned = part.trim();
    if (/^\d+$/.test(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

export default function RobloxPermissionManager({ robloxConfig, setRobloxConfig }: RobloxPermissionManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [assetSourceMode, setAssetSourceMode] = useState<'account' | 'manual'>('account');
  const [manualAssetIdsText, setManualAssetIdsText] = useState('');

  const [assets, setAssets] = useState<CreatorAssetItem[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const subjectType: PermissionSubjectType = robloxConfig.autoPermission?.subjectType || 'Universe';
  const permissionAction: 'Use' | 'Edit' = robloxConfig.autoPermission?.action || 'Use';
  const [targetIdsText, setTargetIdsText] = useState(
    (robloxConfig.autoPermission?.targetIds || []).join(', ')
  );

  const updateAutoPermission = (patch: Partial<NonNullable<RobloxConfig['autoPermission']>>) => {
    setRobloxConfig({
      ...robloxConfig,
      autoPermission: {
        enabled: robloxConfig.autoPermission?.enabled ?? false,
        subjectType: robloxConfig.autoPermission?.subjectType || 'Universe',
        targetIds: robloxConfig.autoPermission?.targetIds || [],
        action: robloxConfig.autoPermission?.action || 'Use',
        ...patch
      }
    });
  };

  const [assetTypeFilter, setAssetTypeFilter] = useState<string>('All');
  const [isGranting, setIsGranting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    jsonText: string;
    count: number;
    skippedModerated: number;
  } | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [grantSummary, setGrantSummary] = useState<{
    successCount: number;
    failCount: number;
    results: PermissionGrantResult[];
  } | null>(null);

  const hasAuth = Boolean(robloxConfig?.accessToken?.trim() || robloxConfig?.apiKey?.trim());

  const parsedManualAssets = useMemo(() => parseIds(manualAssetIdsText), [manualAssetIdsText]);
  const parsedTargetIds = useMemo(() => parseIds(targetIdsText), [targetIdsText]);

  const effectiveAssetIds = assetSourceMode === 'account' ? selectedAssetIds : parsedManualAssets;

  const filteredAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    const tFilter = assetTypeFilter.toLowerCase();
    return assets.filter((a) => {
      const matchesType =
        tFilter === 'all' ||
        (tFilter === 'image' && ['image', 'decal'].includes(a.assetType.toLowerCase())) ||
        (tFilter === 'mesh' && ['mesh', 'meshpart'].includes(a.assetType.toLowerCase())) ||
        a.assetType.toLowerCase() === tFilter;
      const matchesQuery =
        !q || a.displayName.toLowerCase().includes(q) || a.assetId.includes(q) || a.assetType.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [assets, assetSearch, assetTypeFilter]);

  const handleLoadAssets = async (append = false) => {
    setErrorMsg(null);
    if (!hasAuth) {
      setErrorMsg('Silakan login Roblox OAuth atau isi API Key di panel atas terlebih dahulu.');
      return;
    }
    if (!robloxConfig.creatorId?.trim()) {
      setErrorMsg('Creator ID (User ID atau Group ID) wajib diisi terlebih dahulu.');
      return;
    }

    setIsLoadingAssets(true);
    try {
      const res = await fetch(`${getNormalizedApiUrl()}/roblox/assets/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: robloxConfig.apiKey,
          accessToken: robloxConfig.accessToken,
          creatorId: robloxConfig.creatorId,
          creatorType: robloxConfig.creatorType || 'user',
          assetType: 'All',
          pageToken: append ? nextPageToken : undefined,
          maxPageSize: 50
        })
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Gagal memuat daftar audio dari Roblox.');
      }

      const fetched: CreatorAssetItem[] = json.data?.assets || [];
      setAssets(prev => (append ? [...prev, ...fetched] : fetched));
      setNextPageToken(json.data?.nextPageToken);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengambil daftar audio Roblox.');
    } finally {
      setIsLoadingAssets(false);
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds(prev =>
      prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId]
    );
  };

  const handleGrantPermissions = async () => {
    setErrorMsg(null);
    setGrantSummary(null);

    if (!hasAuth) {
      setErrorMsg('Silakan login Roblox OAuth atau isi API Key terlebih dahulu.');
      return;
    }
    if (effectiveAssetIds.length === 0) {
      setErrorMsg('Pilih atau masukkan minimal 1 Asset ID audio terlebih dahulu.');
      return;
    }
    if (parsedTargetIds.length === 0) {
      setErrorMsg(`Masukkan minimal 1 ${subjectType} ID yang valid.`);
      return;
    }

    setIsGranting(true);
    try {
      const res = await fetch(`${getNormalizedApiUrl()}/roblox/permissions/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: robloxConfig.apiKey,
          accessToken: robloxConfig.accessToken,
          assetIds: effectiveAssetIds,
          subjectType,
          targetIds: parsedTargetIds,
          action: permissionAction
        })
      });

      const json = await res.json();
      if (!json.data) {
        throw new Error(json.error || 'Gagal menerapkan permission.');
      }

      setGrantSummary({
        successCount: json.data.successCount || 0,
        failCount: json.data.failCount || 0,
        results: json.data.results || []
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memberikan permission.');
    } finally {
      setIsGranting(false);
    }
  };

  const handleArchiveModerated = async () => {
    setErrorMsg(null);
    setArchiveMessage(null);

    if (!hasAuth) {
      setErrorMsg('Silakan login Roblox OAuth atau isi API Key terlebih dahulu.');
      return;
    }
    if (!robloxConfig.creatorId?.trim()) {
      setErrorMsg('Creator ID (User ID atau Group ID) wajib diisi untuk memindai asset moderated.');
      return;
    }

    setIsArchiving(true);
    try {
      const res = await fetch(`${getNormalizedApiUrl()}/roblox/assets/archive-moderated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: robloxConfig.apiKey,
          accessToken: robloxConfig.accessToken,
          creatorId: robloxConfig.creatorId,
          creatorType: robloxConfig.creatorType || 'user',
          assetType: assetTypeFilter || 'All'
        })
      });

      const json = await res.json();
      if (!json.data) {
        throw new Error(json.error || 'Gagal mengarsipkan asset moderated.');
      }

      const { scannedCount, moderatedCount, successCount, failCount } = json.data;
      setArchiveMessage(
        moderatedCount === 0
          ? `Dipindai ${scannedCount} asset: tidak ditemukan asset moderated yang belum diarsipkan.`
          : `Dipindai ${scannedCount} asset: ${moderatedCount} moderated, ${successCount} berhasil diarsipkan${failCount > 0 ? `, ${failCount} gagal` : ''}.`
      );
      if (assets.length > 0 && successCount > 0) {
        handleLoadAssets(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat mengarsipkan asset moderated.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleScanAudioJson = async () => {
    setErrorMsg(null);
    setScanResult(null);

    if (!hasAuth) {
      setErrorMsg('Silakan login Roblox OAuth atau isi API Key terlebih dahulu.');
      return;
    }
    if (!robloxConfig.creatorId?.trim()) {
      setErrorMsg('Creator ID (User ID atau Group ID) wajib diisi untuk scan audio.');
      return;
    }

    setIsScanning(true);
    try {
      const res = await fetch(`${getNormalizedApiUrl()}/roblox/assets/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: robloxConfig.apiKey,
          accessToken: robloxConfig.accessToken,
          creatorId: robloxConfig.creatorId,
          creatorType: robloxConfig.creatorType || 'user'
        })
      });

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || 'Gagal melakukan scan audio Roblox.');
      }

      const audios = json.data.audios || [];
      setScanResult({
        jsonText: JSON.stringify(audios, null, 2),
        count: audios.length,
        skippedModerated: json.data.skippedModerated || 0
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat scan audio Roblox.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="w-full music-card rounded-3xl p-5 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <ListChecks className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Auto-Permission, Auto-Archive &amp; Scan Asset Roblox
            </h3>
            <p className="text-xs text-neutral-400">
              Pusat pengaturan permission (Universe / User / Group), auto-archive asset moderated, dan scan audio JSON.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {robloxConfig.autoPermission?.enabled && (
            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
              Auto-Perm Aktif ({parsedTargetIds.length} ID)
            </span>
          )}
          {robloxConfig.autoArchiveModerated && (
            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-medium">
              Auto-Archive Aktif
            </span>
          )}
          <span className="p-2 rounded-xl bg-white/[0.04] text-neutral-300">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="pt-4 border-t border-white/[0.08] space-y-4">
          <div className="rounded-2xl bg-black/25 border border-white/[0.08] p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-amber-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(robloxConfig.autoPermission?.enabled)}
                onChange={(e) => updateAutoPermission({ enabled: e.target.checked })}
                className="accent-[#f59e0b] w-3.5 h-3.5 shrink-0"
              />
              <span>Auto-Permission otomatis saat upload lagu baru</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-semibold text-rose-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(robloxConfig.autoArchiveModerated)}
                onChange={(e) =>
                  setRobloxConfig({ ...robloxConfig, autoArchiveModerated: e.target.checked })
                }
                className="accent-rose-500 w-3.5 h-3.5 shrink-0"
              />
              <span>Auto-Archive otomatis jika upload terkena moderasi</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setAssetSourceMode('account')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${assetSourceMode === 'account'
                    ? 'bg-[#1ed760] text-black'
                    : 'text-neutral-400 hover:text-white'
                  }`}
              >
                Ambil dari Akun Roblox
              </button>
              <button
                type="button"
                onClick={() => setAssetSourceMode('manual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${assetSourceMode === 'manual'
                    ? 'bg-[#1ed760] text-black'
                    : 'text-neutral-400 hover:text-white'
                  }`}
              >
                Tempel Asset ID Manual
              </button>
            </div>

            <span className="text-xs text-neutral-400">
              <strong className="text-white">{effectiveAssetIds.length}</strong> asset dipilih
            </span>
          </div>

          {assetSourceMode === 'account' ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => handleLoadAssets(false)}
                  disabled={isLoadingAssets}
                  className="btn-glass px-4 py-2 text-xs font-semibold text-amber-300 border-amber-500/30 flex items-center justify-center gap-2 shrink-0"
                >
                  {isLoadingAssets ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>{assets.length > 0 ? 'Muat Ulang Daftar Asset' : 'Muat Asset dari Akun Roblox'}</span>
                </button>

                {assets.length > 0 && (
                  <>
                    <select
                      value={assetTypeFilter}
                      onChange={(e) => setAssetTypeFilter(e.target.value)}
                      className="music-input rounded-xl px-3 py-2 text-xs text-neutral-200"
                    >
                      <option value="All" className="bg-[#181922]">Semua Tipe</option>
                      <option value="Audio" className="bg-[#181922]">Audio</option>
                      <option value="Animation" className="bg-[#181922]">Animation</option>
                      <option value="Image" className="bg-[#181922]">Image / Decal</option>
                      <option value="Mesh" className="bg-[#181922]">Mesh / MeshPart</option>
                      <option value="Model" className="bg-[#181922]">Model</option>
                      <option value="Video" className="bg-[#181922]">Video</option>
                    </select>
                    <input
                      type="text"
                      value={assetSearch}
                      onChange={(e) => setAssetSearch(e.target.value)}
                      placeholder="Cari nama asset atau ID..."
                      className="flex-1 music-input rounded-xl px-3.5 py-2 text-xs text-neutral-200"
                    />
                  </>
                )}
              </div>

              {assets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Menampilkan {filteredAssets.length} asset</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedAssetIds(filteredAssets.map(a => a.assetId))}
                        className="text-[#1ed760] hover:underline font-medium"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAssetIds([])}
                        className="text-neutral-400 hover:text-white"
                      >
                        Bersihkan
                      </button>
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {filteredAssets.map((asset) => {
                      const checked = selectedAssetIds.includes(asset.assetId);
                      return (
                        <label
                          key={asset.assetId}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-xs cursor-pointer transition ${checked
                              ? 'bg-[#1ed760]/10 border-[#1ed760]/35 text-white'
                              : 'bg-white/[0.02] border-white/[0.06] text-neutral-300 hover:bg-white/[0.04]'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssetSelection(asset.assetId)}
                              className="accent-[#1ed760] w-3.5 h-3.5 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold truncate">{asset.displayName}</span>
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] shrink-0">
                                  {asset.assetType}
                                </span>
                                {asset.moderationState?.toUpperCase().includes('REJECTED') && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] shrink-0">
                                    Moderated
                                  </span>
                                )}
                                {asset.state?.toLowerCase() === 'archived' && (
                                  <span className="px-2 py-0.5 rounded-full bg-neutral-500/20 border border-neutral-500/30 text-neutral-300 text-[10px] shrink-0">
                                    Archived
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-400">ID: {asset.assetId}</div>
                            </div>
                          </div>
                          <a
                            href={asset.assetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-neutral-400 hover:text-white shrink-0"
                            title="Buka di Creator Hub"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </label>
                      );
                    })}
                  </div>

                  {nextPageToken && (
                    <button
                      type="button"
                      onClick={() => handleLoadAssets(true)}
                      disabled={isLoadingAssets}
                      className="w-full py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-neutral-300 font-medium"
                    >
                      {isLoadingAssets ? 'Memuat...' : 'Muat Lebih Banyak Audio'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-neutral-300">
                <span>Daftar Asset ID (Audio, Animation, Decal, Mesh, dll. - bisa multi ID)</span>
                <span className="text-neutral-400">{parsedManualAssets.length} ID valid</span>
              </div>
              <textarea
                rows={3}
                value={manualAssetIdsText}
                onChange={(e) => setManualAssetIdsText(e.target.value)}
                placeholder="Tempel Asset ID dipisah koma, spasi, atau baris baru. Contoh:&#10;1841234567, 1847654321"
                className="w-full music-input rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 placeholder-neutral-500"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-white/[0.06]">
            <div className="space-y-1">
              <label className="text-xs text-neutral-300 font-medium block">Mode Target Permission</label>
              <select
                value={subjectType}
                onChange={(e) => updateAutoPermission({ subjectType: e.target.value as PermissionSubjectType })}
                className="w-full music-input rounded-xl px-3 py-2 text-xs text-neutral-200"
              >
                <option value="Universe" className="bg-[#181922]">Universe ID (Experience)</option>
                <option value="User" className="bg-[#181922]">User ID (Akun Roblox)</option>
                <option value="Group" className="bg-[#181922]">Group ID (Grup Roblox)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-300 font-medium block">Jenis Izin (Action)</label>
              <select
                value={permissionAction}
                onChange={(e) => updateAutoPermission({ action: e.target.value as 'Use' | 'Edit' })}
                className="w-full music-input rounded-xl px-3 py-2 text-xs text-neutral-200"
              >
                <option value="Use" className="bg-[#181922]">Use (Pakai di Game)</option>
                <option value="Edit" className="bg-[#181922]">Edit (Ubah Asset)</option>
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-300">
                <label className="font-medium">Target {subjectType} ID (Multi ID)</label>
                <span className="text-amber-300">{parsedTargetIds.length} target ID</span>
              </div>
              <textarea
                rows={2}
                value={targetIdsText}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTargetIdsText(raw);
                  updateAutoPermission({ targetIds: parseIds(raw) });
                }}
                placeholder={`Masukkan satu atau banyak ${subjectType} ID (pisahkan koma/baris baru)`}
                className="w-full music-input rounded-xl px-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-500"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl p-3 border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {grantSummary && (
            <div className="rounded-xl p-3.5 border border-white/[0.08] bg-black/25 space-y-2 text-xs">
              <div className="flex items-center gap-3 font-semibold">
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {grantSummary.successCount} berhasil
                </span>
                {grantSummary.failCount > 0 && (
                  <span className="text-rose-400 flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    {grantSummary.failCount} gagal
                  </span>
                )}
              </div>
              {grantSummary.results.some(r => !r.success) && (
                <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-rose-300">
                  {grantSummary.results
                    .filter(r => !r.success)
                    .map((r, i) => (
                      <div key={`${r.assetId}-${r.targetId}-${i}`}>
                        Asset {r.assetId} &rarr; {r.targetType} {r.targetId}: {r.error}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {archiveMessage && (
            <div className="rounded-xl p-3 border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{archiveMessage}</span>
            </div>
          )}

          {scanResult && (
            <div className="rounded-xl p-3.5 border border-emerald-500/25 bg-black/35 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <FileJson className="w-4 h-4" />
                  <span>
                    Hasil Scan: {scanResult.count} audio aktif ({scanResult.skippedModerated} moderated/archived dilewati)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(scanResult.jsonText);
                        setCopiedJson(true);
                        setTimeout(() => setCopiedJson(false), 2000);
                      }
                    }}
                    className="px-3 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-[11px] font-semibold flex items-center gap-1"
                  >
                    {copiedJson ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedJson ? 'Tersalin' : 'Salin JSON'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([scanResult.jsonText], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `roblox-audios-${robloxConfig.creatorId || 'scan'}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-neutral-200 text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Unduh .json</span>
                  </button>
                </div>
              </div>
              <pre className="max-h-56 overflow-auto rounded-lg bg-[#0c0d12] p-3 text-[11px] text-emerald-200 border border-white/[0.06]">
                {scanResult.jsonText}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleScanAudioJson}
              disabled={isScanning}
              className="btn-glass px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 border-emerald-500/30 flex items-center gap-2 cursor-pointer"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning Audio...</span>
                </>
              ) : (
                <>
                  <FileJson className="w-3.5 h-3.5" />
                  <span>Scan Audio (JSON)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleArchiveModerated}
              disabled={isArchiving}
              className="btn-glass px-4 py-2.5 text-xs font-semibold text-rose-300 hover:text-rose-200 border-rose-500/30 flex items-center gap-2 cursor-pointer"
            >
              {isArchiving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memindai &amp; Mengarsipkan...</span>
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  <span>Auto-Archive Asset Moderated</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleGrantPermissions}
              disabled={isGranting || effectiveAssetIds.length === 0 || parsedTargetIds.length === 0}
              className="px-5 py-2.5 rounded-full bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-45 text-black font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#f59e0b]/25 cursor-pointer"
            >
              {isGranting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menerapkan Permission...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Terapkan Permission Sekarang</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
