'use client';

import React, { useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Ban, Copy, Check, ExternalLink, CloudUpload, FileJson, Download } from 'lucide-react';
import type { JobProgressData } from '../types/index.js';

interface JobProgressCardProps {
  job: JobProgressData | null;
  onCancelJob: () => void;
}

export default function JobProgressCard({ job, onCancelJob }: JobProgressCardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!job) return null;

  const isFinished = ['completed', 'failed', 'cancelled'].includes(job.status);
  const completedTracksCount = job.tracks.filter(t => t.status === 'completed').length;
  const failedTracksCount = job.tracks.filter(t => t.status === 'failed').length;

  return (
    <div className="w-full music-card rounded-3xl p-6 sm:p-7 space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Proses Antrean Lagu
            </h3>
            <span className={`music-pill ${job.status === 'completed'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                : job.status === 'active'
                  ? 'bg-[#1ed760]/15 border border-[#1ed760]/30 text-emerald-300 animate-pulse'
                  : job.status === 'cancelled'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                    : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
              }`}>
              {job.status === 'completed' ? 'Selesai' : job.status === 'active' ? 'Memproses' : job.status}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            {job.title} &bull; Format {job.format.toUpperCase()} ({job.quality} kbps)
          </p>
        </div>

        {!isFinished && (
          <button
            type="button"
            onClick={onCancelJob}
            className="btn-glass px-4 py-1.5 text-xs text-rose-400 hover:text-rose-300 border-rose-500/30 flex items-center gap-1.5 font-medium"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Batalkan Proses</span>
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-neutral-400 font-medium">
          <span>Kemajuan Keseluruhan</span>
          <span className="text-white font-bold">{job.overallProgressPct || 0}%</span>
        </div>
        <div className="w-full h-2 bg-[#171822] rounded-full overflow-hidden border border-white/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-[#1ed760] to-[#10b981] rounded-full transition-all duration-300 ease-out shadow-sm shadow-[#1ed760]/50"
            style={{ width: `${job.overallProgressPct || 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {job.tracks.map((track, idx) => (
          <div
            key={track.id}
            className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {track.status === 'completed' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              {track.status === 'failed' && (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              {['pending', 'cleaning', 'processing'].includes(track.status || '') && (
                <Loader2 className="w-4 h-4 text-[#1ed760] animate-spin shrink-0" />
              )}

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 font-medium">{idx + 1}.</span>
                  <span className="font-semibold text-white truncate">
                    {track.cleanedTitle}
                  </span>
                  {track.isCustomMetadata && (
                    <span className="music-pill bg-[#1ed760]/15 text-emerald-300 border border-[#1ed760]/30 text-[10px]">
                      Tag Khusus
                    </span>
                  )}
                </div>

                {(track.artist || track.composer || track.album || track.robloxInfo || (track.pitch && track.pitch !== 0 && track.pitch !== '0')) && (
                  <div className="text-[11px] text-neutral-400 truncate flex items-center gap-2 flex-wrap">
                    {track.artist && <span>{track.artist}</span>}
                    {track.composer && <span className="text-amber-400">&bull; Cipt: {track.composer}</span>}
                    {track.robloxInfo ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px]">
                        <span>Roblox: {track.robloxInfo.value}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof navigator !== 'undefined' && navigator.clipboard && track.robloxInfo) {
                              navigator.clipboard.writeText(track.robloxInfo.code);
                              setCopiedId(track.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }
                          }}
                          className="px-1.5 py-0.2 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[9px] flex items-center gap-0.5"
                        >
                          {copiedId === track.id ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" />
                              <span>Luau</span>
                            </>
                          )}
                        </button>
                      </span>
                    ) : (track.pitch && track.pitch !== 0 && track.pitch !== '0') ? (
                      <span className="text-amber-400">&bull; Pitch: {track.pitch}</span>
                    ) : null}
                  </div>
                )}

                <p className="text-[11px] text-neutral-500 truncate">
                  {track.filename}
                </p>

                {track.robloxArchived && (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] border font-medium bg-amber-500/15 border-amber-500/30 text-amber-300">
                      Diarsipkan Otomatis (Moderated)
                    </span>
                  </div>
                )}

                {track.robloxArchiveError && (
                  <p className="text-[11px] text-rose-400 truncate" title={track.robloxArchiveError}>
                    Gagal auto-archive: {track.robloxArchiveError}
                  </p>
                )}

                {track.robloxPermissions && track.robloxPermissions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    {track.robloxPermissions.map((perm, pIdx) => (
                      <span
                        key={`${perm.targetType}-${perm.targetId}-${pIdx}`}
                        title={perm.error || `Izin Use diberikan ke ${perm.targetType} ${perm.targetId}`}
                        className={`px-2 py-0.5 rounded-full text-[10px] border font-medium ${
                          perm.success
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {perm.targetType} {perm.targetId} {perm.success ? '✓' : '✕'}
                      </span>
                    ))}
                  </div>
                )}

                {track.error && (
                  <p className={`text-[11px] font-medium truncate ${track.error.startsWith('Dilewati') ? 'text-amber-400' : 'text-rose-400'}`} title={track.error}>
                    {track.error.startsWith('Dilewati') ? track.error : `Gagal: ${track.error}`}
                  </p>
                )}
              </div>
            </div>

            {track.robloxAssetId ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(`rbxassetid://${track.robloxAssetId}`);
                      setCopiedId(`asset-${track.id}`);
                      setTimeout(() => setCopiedId(null), 2000);
                    }
                  }}
                  className="px-3 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-xs font-semibold flex items-center gap-1.5"
                >
                  {copiedId === `asset-${track.id}` ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>ID: {track.robloxAssetId}</span>
                    </>
                  )}
                </button>

                {track.robloxAssetUrl && (
                  <a
                    href={track.robloxAssetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-full btn-glass"
                    title="Buka di Dashboard Roblox"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {isFinished && job.targetAction === 'roblox' && completedTracksCount > 0 && (() => {
        const uploadedJsonList = job.tracks
          .filter(t => t.robloxAssetId && !t.robloxArchived && !(t.robloxModeration || '').toUpperCase().includes('REJECTED'))
          .map(t => ({
            id: String(t.robloxAssetId),
            name: t.cleanedTitle || t.originalTitle || `Audio ${t.robloxAssetId}`
          }));
        const uploadedJsonText = JSON.stringify(uploadedJsonList, null, 2);

        return (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-sm font-bold text-amber-300 flex items-center gap-2 justify-center sm:justify-start">
                  <CloudUpload className="w-4 h-4" />
                  <span>Semua Lagu Berhasil Di-upload ke Roblox!</span>
                </span>
                <p className="text-xs text-neutral-300">
                  {uploadedJsonList.length} audio aktif dalam format JSON (audio moderated dikecualikan). File lokal otomatis dibersihkan.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(uploadedJsonText);
                      setCopiedId('all-roblox');
                      setTimeout(() => setCopiedId(null), 2500);
                    }
                  }}
                  className="px-4 py-2.5 rounded-full bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#f59e0b]/25 cursor-pointer"
                >
                  {copiedId === 'all-roblox' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>JSON Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <FileJson className="w-3.5 h-3.5" />
                      <span>Salin JSON ({uploadedJsonList.length})</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([uploadedJsonText], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `roblox-uploaded-${job.id.slice(0, 8)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="btn-glass px-4 py-2.5 text-xs font-semibold text-amber-200 border-amber-500/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh .json</span>
                </button>
              </div>
            </div>

            <pre className="max-h-48 overflow-auto rounded-xl bg-[#0c0d12]/90 p-3 text-[11px] text-amber-200 border border-white/[0.08]">
              {uploadedJsonText}
            </pre>
          </div>
        );
      })()}
    </div>
  );
}
