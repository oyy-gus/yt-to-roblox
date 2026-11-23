'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import UrlInputPanel from '../components/UrlInputPanel';
import PreviewCard from '../components/PreviewCard';
import TrackSelectionList from '../components/TrackSelectionList';
import JobProgressCard from '../components/JobProgressCard';
import AudioPreviewPlayer from '../components/AudioPreviewPlayer';
import Footer from '../components/Footer';
import { AlertCircle } from 'lucide-react';
import type { AudioSettings, AnalysisData, JobProgressData, TrackItem, TrackOverride, TargetAction, RobloxConfig } from '../types/index.js';
import { getNormalizedApiUrl } from '../utils/api';

async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${getNormalizedApiUrl()}${endpoint}`;
  return fetch(url, options);
}

export default function Home() {
  const [settings, setSettings] = useState<AudioSettings>({
    format: 'mp3',
    quality: '320',
    cleanerMode: 'Advanced',
    pitch: 0
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isStartingJob, setIsStartingJob] = useState(false);
  const [activeJob, setActiveJob] = useState<JobProgressData | null>(null);
  const [customMetadata, setCustomMetadata] = useState<Record<string, TrackOverride>>({});
  const [previewTrack, setPreviewTrack] = useState<TrackItem | null>(null);
  const [targetAction] = useState<TargetAction>('roblox');
  const [robloxConfig, setRobloxConfig] = useState<RobloxConfig>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('maxistrong_roblox_config');
        if (saved) {
          return JSON.parse(saved);
        }
      } catch {}
    }
    return {
      authMode: 'oauth',
      apiKey: '',
      creatorId: '',
      creatorType: 'user'
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthSessionId = params.get('roblox_oauth');
    const oauthError = params.get('roblox_oauth_error');

    if (oauthError) {
      setErrorMsg(`Login Roblox gagal: ${oauthError}`);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (oauthSessionId) {
      window.history.replaceState({}, '', window.location.pathname);
      fetch(`${getNormalizedApiUrl()}/roblox/oauth/session/${encodeURIComponent(oauthSessionId)}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data?.accessToken) {
            setRobloxConfig((prev) => ({
              ...prev,
              authMode: 'oauth',
              accessToken: json.data.accessToken,
              creatorId: json.data.userId || prev.creatorId,
              creatorType: 'user',
              username: json.data.username,
              avatarUrl: json.data.avatarUrl
            }));
          } else {
            setErrorMsg(json.message || 'Gagal mengambil sesi login Roblox.');
          }
        })
        .catch((err) => {
          setErrorMsg(`Gagal menyelesaikan login Roblox: ${err.message}`);
        });
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && robloxConfig) {
      try {
        localStorage.setItem('maxistrong_roblox_config', JSON.stringify(robloxConfig));
      } catch {}
    }
  }, [robloxConfig]);

  const handleAnalyzeUrl = async (url: string) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    setAnalysisResult(null);
    setCustomMetadata({});

    try {
      const res = await apiFetch(`/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, cleanerMode: settings.cleanerMode })
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || 'Gagal menganalisis URL.');
      }

      const seenIds = new Set<string>();
      const uniqueTracks: TrackItem[] = (json.data.tracks || []).filter((t: TrackItem) => {
        if (!t.id || seenIds.has(t.id)) return false;
        seenIds.add(t.id);
        return true;
      });

      setAnalysisResult({ ...json.data, tracks: uniqueTracks, totalEntries: uniqueTracks.length, url });
      setSelectedTrackIds(uniqueTracks.map((t: TrackItem) => t.id));

    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memeriksa URL.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleSelectTrack = (trackId: string) => {
    if (selectedTrackIds.includes(trackId)) {
      setSelectedTrackIds(selectedTrackIds.filter(id => id !== trackId));
    } else {
      setSelectedTrackIds([...selectedTrackIds, trackId]);
    }
  };

  const handleSelectAll = () => {
    if (analysisResult?.tracks) {
      if (targetAction === 'roblox') {
        setSelectedTrackIds(
          analysisResult.tracks
            .filter(t => !t.durationSec || t.durationSec <= 420)
            .map(t => t.id)
        );
      } else {
        setSelectedTrackIds(analysisResult.tracks.map(t => t.id));
      }
    }
  };

  const handleDeselectAll = () => {
    setSelectedTrackIds([]);
  };

  const handleUpdateTrackMetadata = (trackId: string, values: Partial<TrackOverride>) => {
    setCustomMetadata(prev => ({
      ...prev,
      [trackId]: {
        ...(prev[trackId] || {}),
        ...values
      }
    }));
  };

  const handleResetTrackMetadata = (trackId: string) => {
    setCustomMetadata(prev => {
      const next = { ...prev };
      delete next[trackId];
      return next;
    });
  };

  const handleBatchApplyMetadata = (batchData: any) => {
    if (!analysisResult?.tracks) return;
    setCustomMetadata(prev => {
      const next = { ...prev };
      selectedTrackIds.forEach((id, index) => {
        const existing = next[id] || {};
        next[id] = {
          ...existing,
          ...(batchData.album ? { album: batchData.album } : {}),
          ...(batchData.artist ? { artist: batchData.artist } : {}),
          ...(batchData.composer ? { composer: batchData.composer } : {}),
          ...(batchData.pitch !== undefined && batchData.pitch !== '' ? { pitch: batchData.pitch } : {}),
          ...(batchData.year ? { year: batchData.year } : {}),
          ...(batchData.genre ? { genre: batchData.genre } : {}),
          ...(batchData.autoNumber ? { trackNumber: String(index + 1) } : {})
        };
      });
      return next;
    });
  };

  const handleResetAllMetadata = () => {
    setCustomMetadata({});
  };

  const handleStartJob = async () => {
    if (!analysisResult || selectedTrackIds.length === 0) return;

    setIsStartingJob(true);
    setErrorMsg(null);

    const effectiveTrackIds = targetAction === 'roblox' && analysisResult?.tracks
      ? selectedTrackIds.filter(id => {
          const t = analysisResult.tracks.find(x => x.id === id);
          return !t || !t.durationSec || t.durationSec <= 420;
        })
      : selectedTrackIds;

    if (effectiveTrackIds.length === 0) {
      if (targetAction === 'roblox') {
        setErrorMsg('Tidak ada lagu yang memenuhi syarat (durasi maksimal 7 menit untuk Roblox).');
      } else {
        setErrorMsg('Pilih minimal satu lagu untuk diproses.');
      }
      setIsStartingJob(false);
      return;
    }

    try {
      const res = await apiFetch(`/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: (analysisResult as any).url,
          format: settings.format,
          quality: settings.quality,
          cleanerMode: settings.cleanerMode,
          pitch: settings.pitch,
          targetAction,
          robloxConfig: targetAction === 'roblox' ? robloxConfig : undefined,
          selectedTrackIds: effectiveTrackIds,
          customMetadata: Object.keys(customMetadata).length > 0 ? customMetadata : undefined
        })
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Gagal memulai proses unduhan');
      }

      const jobId = json.data.jobId;
      connectSseStream(jobId);

    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses lagu.');
    } finally {
      setIsStartingJob(false);
    }
  };

  const connectSseStream = (jobId: string) => {
    const eventSource = new EventSource(`${getNormalizedApiUrl()}/jobs/${jobId}/events`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.job) {
          setActiveJob(payload.job);

          if (['completed', 'failed', 'cancelled'].includes(payload.job.status)) {
            eventSource.close();
          }
        }
      } catch (e) {
        console.error('SSE error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await fetch(`${getNormalizedApiUrl()}/jobs/${activeJob.id}/cancel`, { method: 'POST' });
    } catch (e) {
      console.error('Cancel error:', e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0c0d12] text-white font-sans antialiased selection:bg-[#1ed760] selection:text-black relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-[#1ed760]/10 via-[#10b981]/5 to-transparent blur-3xl pointer-events-none -z-10" />

      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-7">
        <div className="text-center space-y-3 pt-4 pb-2">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Upload Audio YouTube ke Roblox
          </h1>

          <p className="text-sm sm:text-base text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Hapus teks promosi pada judul otomatis, atur nada & pitch sinkronisasi Roblox, dengarkan pratinjau audio, dan upload langsung ke Roblox Open Cloud.
          </p>
        </div>

        <UrlInputPanel
          onAnalyze={handleAnalyzeUrl}
          isLoading={isAnalyzing}
          settings={settings}
          setSettings={setSettings}
          robloxConfig={robloxConfig}
          setRobloxConfig={setRobloxConfig}
        />

        {errorMsg && (
          <div className="w-full rounded-2xl p-4 border border-rose-500/30 bg-rose-500/10 text-rose-200 flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {analysisResult && (
          <PreviewCard metadata={analysisResult} />
        )}

        {analysisResult && analysisResult.tracks && (
          <TrackSelectionList
            tracks={analysisResult.tracks}
            selectedIds={selectedTrackIds}
            onToggleSelect={handleToggleSelectTrack}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onStartJob={handleStartJob}
            isStartingJob={isStartingJob}
            customMetadata={customMetadata}
            onUpdateMetadata={handleUpdateTrackMetadata}
            onResetMetadata={handleResetTrackMetadata}
            onBatchApplyMetadata={handleBatchApplyMetadata}
            onResetAllMetadata={handleResetAllMetadata}
            playlistTitle={analysisResult.title || ''}
            settings={settings}
            targetAction={targetAction}
            onPlayPreview={(track) => setPreviewTrack(prev => (prev?.id === track.id ? null : track))}
            currentPreviewId={previewTrack?.id}
          />
        )}

        {activeJob && (
          <JobProgressCard
            job={activeJob}
            onCancelJob={handleCancelJob}
          />
        )}
      </main>

      {previewTrack && (
        <AudioPreviewPlayer
          track={previewTrack}
          initialPitch={settings.pitch}
          onClose={() => setPreviewTrack(null)}
        />
      )}

      <Footer />
    </div>
  );
}
