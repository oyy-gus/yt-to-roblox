'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getNormalizedApiUrl } from '../utils/api';
import { 
  Search, 
  Loader2, 
  Clipboard, 
  X, 
  AlertCircle, 
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Sliders,
  LogIn,
  LogOut,
  User
} from 'lucide-react';
import type { AudioSettings, RobloxConfig, AudioFormat, AudioQuality, CleanerMode } from '../types/index.js';

interface UrlInputPanelProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
  settings: AudioSettings;
  setSettings: (settings: AudioSettings) => void;
  robloxConfig?: RobloxConfig;
  setRobloxConfig?: (config: RobloxConfig) => void;
}

export default function UrlInputPanel({ 
  onAnalyze, 
  isLoading, 
  settings, 
  setSettings,
  robloxConfig = { authMode: 'oauth', apiKey: '', creatorId: '', creatorType: 'user' },
  setRobloxConfig
}: UrlInputPanelProps) {
  const [url, setUrl] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<{ checked: boolean; configured: boolean; redirectUri: string }>({
    checked: false,
    configured: false,
    redirectUri: 'http://localhost:5000/api/roblox/oauth/callback'
  });
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success: boolean | null; message: string }>({
    loading: false,
    success: null,
    message: ''
  });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch(`${getNormalizedApiUrl()}/roblox/oauth/status`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOauthStatus({
            checked: true,
            configured: Boolean(data.configured),
            redirectUri: data.redirectUri || 'http://localhost:5000/api/roblox/oauth/callback'
          });
        }
      })
      .catch(() => {});
  }, []);

  const authMode = robloxConfig?.authMode || (robloxConfig?.accessToken ? 'oauth' : robloxConfig?.apiKey ? 'apikey' : 'oauth');

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setInputError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setInputError('Silakan tempel atau masukkan URL YouTube terlebih dahulu.');
      inputRef.current?.focus();
      return;
    }

    let finalUrl = trimmed;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    onAnalyze(finalUrl);
  };

  const handlePasteClipboard = async () => {
    setInputError(null);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          setUrl(clipText.trim());
          inputRef.current?.focus();
          return;
        }
      }
    } catch {}
    inputRef.current?.focus();
  };

  const handleClearUrl = () => {
    setUrl('');
    setInputError(null);
    inputRef.current?.focus();
  };

  const handleLoadSample = (sampleUrl: string) => {
    setUrl(sampleUrl);
    setInputError(null);
    onAnalyze(sampleUrl);
  };

  const handleTestRobloxConnection = async () => {
    const hasAuth = Boolean(robloxConfig?.accessToken?.trim() || robloxConfig?.apiKey?.trim());
    if (!hasAuth) {
      setTestStatus({
        loading: false,
        success: false,
        message: authMode === 'oauth' ? 'Silakan login dengan Roblox terlebih dahulu.' : 'Masukkan Roblox API Key terlebih dahulu.'
      });
      return;
    }
    if (!robloxConfig?.creatorId?.trim()) {
      setTestStatus({ loading: false, success: false, message: 'Masukkan Creator ID (User atau Group ID).' });
      return;
    }

    setTestStatus({ loading: true, success: null, message: 'Menguji koneksi ke Roblox Cloud...' });

    try {
      const res = await fetch(`${getNormalizedApiUrl()}/roblox/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(robloxConfig)
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server mengembalikan respons non-JSON (HTTP ${res.status}).`);
      }
      const data = await res.json();
      setTestStatus({
        loading: false,
        success: data.success,
        message: data.message || (data.success ? 'Koneksi ke Roblox Open Cloud berhasil!' : 'Koneksi gagal.')
      });
    } catch (err: any) {
      setTestStatus({
        loading: false,
        success: false,
        message: `Gagal menguji koneksi: ${err.message}`
      });
    }
  };

  return (
    <div className="w-full music-card rounded-3xl p-6 sm:p-7 space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="space-y-6">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-300">
              Link YouTube
            </label>

            <button
              type="button"
              onClick={handlePasteClipboard}
              className="text-xs text-[#1ed760] hover:text-[#1fdf64] transition flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1ed760]/10 hover:bg-[#1ed760]/20 font-medium"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Tempel dari Clipboard</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (inputError) setInputError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Tempel link lagu tunggal, playlist, atau YouTube Music..."
              disabled={isLoading}
              className="w-full music-input rounded-2xl px-5 py-3.5 pr-36 text-sm placeholder-neutral-500 font-sans shadow-inner"
            />

            <div className="absolute right-2 flex items-center gap-1.5">
              {url && !isLoading && (
                <button
                  type="button"
                  onClick={handleClearUrl}
                  className="p-2 text-neutral-400 hover:text-white transition rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                type="submit"
                id="btn-analyze-url"
                disabled={isLoading}
                className="btn-spotify px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Analisis</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {inputError && (
            <div className="flex items-center gap-2 text-xs text-rose-400 pt-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{inputError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-neutral-400">
            <span className="text-neutral-500 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#1ed760]" />
              Coba Contoh:
            </span>
            <button
              type="button"
              onClick={() => handleLoadSample('https://www.youtube.com/playlist?list=PL_XvB5Xf7h9L3y_j3D_5F_9x_1_DEMO')}
              className="px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 transition"
            >
              Playlist 4 Lagu
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
              className="px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 transition"
            >
              Lagu Tunggal
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-amber-500/[0.06] border border-amber-500/25 p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-amber-500/15">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-300">
                  Autentikasi Roblox Open Cloud
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setTestStatus({ loading: false, success: null, message: '' });
                    setRobloxConfig && setRobloxConfig({ ...robloxConfig, authMode: 'oauth' });
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    authMode === 'oauth'
                      ? 'bg-[#f59e0b] text-black'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Login OAuth
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTestStatus({ loading: false, success: null, message: '' });
                    setRobloxConfig && setRobloxConfig({ ...robloxConfig, authMode: 'apikey' });
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    authMode === 'apikey'
                      ? 'bg-[#f59e0b] text-black'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  API Key
                </button>
              </div>
            </div>

            {authMode === 'oauth' ? (
              <div className="space-y-3">
                {robloxConfig?.accessToken ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                    <div className="flex items-center gap-3 min-w-0">
                      {robloxConfig.avatarUrl ? (
                        <img src={robloxConfig.avatarUrl} alt={robloxConfig.username || 'Roblox'} className="w-9 h-9 rounded-full border border-emerald-500/40 shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {robloxConfig.username || 'Akun Roblox Terhubung'}
                        </div>
                        <div className="text-[11px] text-emerald-300/90">
                          User ID: {robloxConfig.creatorId}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={robloxConfig.creatorType || 'user'}
                        onChange={(e) => setRobloxConfig && setRobloxConfig({ ...robloxConfig, creatorType: e.target.value as 'user' | 'group' })}
                        className="music-input rounded-xl px-2.5 py-1.5 text-xs text-neutral-200"
                      >
                        <option value="user" className="bg-[#181922]">Upload ke User</option>
                        <option value="group" className="bg-[#181922]">Upload ke Group</option>
                      </select>

                      {robloxConfig.creatorType === 'group' && (
                        <input
                          type="text"
                          value={robloxConfig.creatorId || ''}
                          onChange={(e) => setRobloxConfig && setRobloxConfig({ ...robloxConfig, creatorId: e.target.value })}
                          placeholder="Group ID"
                          className="w-28 music-input rounded-xl px-2.5 py-1.5 text-xs text-neutral-200"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setTestStatus({ loading: false, success: null, message: '' });
                          setRobloxConfig && setRobloxConfig({
                            authMode: 'oauth',
                            apiKey: '',
                            accessToken: undefined,
                            username: undefined,
                            avatarUrl: undefined,
                            creatorId: '',
                            creatorType: 'user'
                          });
                        }}
                        className="btn-glass px-3 py-1.5 text-xs text-rose-300 hover:text-rose-200 border-rose-500/30 flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const redirectParam = typeof window !== 'undefined' ? `?redirect=${encodeURIComponent(window.location.origin)}` : '';
                          window.location.href = `${getNormalizedApiUrl()}/roblox/oauth/login${redirectParam}`;
                        }}
                        className="px-5 py-2.5 rounded-full bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f59e0b]/25 cursor-pointer"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Login dengan Roblox</span>
                      </button>

                      <a
                        href="https://create.roblox.com/dashboard/credentials?activeTab=OAuthTab"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>Kelola OAuth 2.0 App Roblox</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {oauthStatus.checked && !oauthStatus.configured && (
                      <div className="text-[11px] text-amber-200/90 bg-black/30 border border-amber-500/20 px-3 py-2 rounded-xl space-y-1">
                        <p className="font-semibold text-amber-300">Setup OAuth 2.0 diperlukan di backend/.env:</p>
                        <p>Buat OAuth 2.0 App di Roblox Creator Hub (izin <code className="text-white">openid</code>, <code className="text-white">profile</code>, <code className="text-white">asset:read</code>, <code className="text-white">asset:write</code>) dengan Redirect URI: <code className="text-white select-all">{oauthStatus.redirectUri}</code>, lalu isi <code className="text-white">ROBLOX_CLIENT_ID</code> &amp; <code className="text-white">ROBLOX_CLIENT_SECRET</code> di <code className="text-white">backend/.env</code>.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <div className="flex justify-between text-xs text-neutral-300">
                    <span>API Key (Izin: Assets:Write &amp; Assets:Read)</span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={robloxConfig?.apiKey || ''}
                      onChange={(e) => setRobloxConfig && setRobloxConfig({ ...robloxConfig, authMode: 'apikey', apiKey: e.target.value })}
                      placeholder="Contoh: secret-token-xxxxxxxx..."
                      className="w-full music-input rounded-xl px-3.5 py-2 pr-9 text-xs text-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 text-neutral-400 hover:text-white"
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-neutral-300 block">Tipe &amp; Creator ID</span>
                  <div className="flex gap-1.5">
                    <select
                      value={robloxConfig?.creatorType || 'user'}
                      onChange={(e) => setRobloxConfig && setRobloxConfig({ ...robloxConfig, creatorType: e.target.value as 'user' | 'group' })}
                      className="music-input rounded-xl px-2.5 py-2 text-xs text-neutral-200"
                    >
                      <option value="user" className="bg-[#181922]">User</option>
                      <option value="group" className="bg-[#181922]">Group</option>
                    </select>
                    <input
                      type="text"
                      value={robloxConfig?.creatorId || ''}
                      onChange={(e) => setRobloxConfig && setRobloxConfig({ ...robloxConfig, creatorId: e.target.value })}
                      placeholder="12345678"
                      className="w-full music-input rounded-xl px-3 py-2 text-xs text-neutral-200"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestRobloxConnection}
                disabled={testStatus.loading}
                className="btn-glass px-3 py-1.5 text-xs flex items-center gap-1.5 text-amber-300 hover:text-amber-200 border-amber-500/30"
              >
                {testStatus.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                <span>Uji Koneksi Roblox</span>
              </button>

              {testStatus.message && (
                <span className={`text-xs flex items-center gap-1 font-medium ${testStatus.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {testStatus.success && <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{testStatus.message}</span>
                </span>
              )}
            </div>

            <p className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
              Filter Durasi: Batas resmi audio Roblox adalah 7 menit (420 detik). Lagu dengan durasi lebih dari 7 menit otomatis tidak akan ikut diunggah.
            </p>
          </div>

        <div className="space-y-2 pt-3 border-t border-white/[0.07]">
          <span className="text-xs font-semibold text-neutral-300">
            Pengaturan Kualitas & Nada
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 block font-medium">Format Output</label>
              <select
                value={settings.format}
                onChange={(e) => setSettings({ ...settings, format: e.target.value as AudioFormat })}
                className="w-full music-input rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 cursor-pointer"
              >
                <option value="mp3" className="bg-[#181922]">MP3 Audio (.mp3)</option>
                <option value="original" className="bg-[#181922]">Format Asli YouTube</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-400 block font-medium">Bitrate Audio</label>
              <select
                value={settings.quality}
                onChange={(e) => setSettings({ ...settings, quality: e.target.value as AudioQuality })}
                disabled={settings.format !== 'mp3'}
                className="w-full music-input rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 cursor-pointer disabled:opacity-40"
              >
                <option value="320" className="bg-[#181922]">320 kbps (Kualitas Maksimal)</option>
                <option value="256" className="bg-[#181922]">256 kbps (Standar Studio)</option>
                <option value="192" className="bg-[#181922]">192 kbps (Seimbang)</option>
                <option value="128" className="bg-[#181922]">128 kbps (Hemat Ruang)</option>
                <option value="best" className="bg-[#181922]">Kualitas Asli Terbaik</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-400 block font-medium">Pitch / Sinkronisasi Roblox</label>
              <select
                value={settings.pitch !== undefined ? String(settings.pitch) : '0'}
                onChange={(e) => setSettings({ ...settings, pitch: e.target.value })}
                className="w-full music-input rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 cursor-pointer"
              >
                <option value="0" className="bg-[#181922]">Normal (Nada Asli 0 st)</option>
                <optgroup label="🎮 Roblox PlaybackSpeed Sync" className="bg-[#181922]">
                  <option value="speed:1.25">Roblox 1.25x (Di Roblox: Speed 0.800)</option>
                  <option value="speed:1.33">Roblox 1.33x (Di Roblox: Speed 0.750)</option>
                  <option value="speed:1.50">Roblox 1.50x (Di Roblox: Speed 0.667)</option>
                  <option value="speed:2.00">Roblox 2.00x (Di Roblox: Speed 0.500)</option>
                  <option value="speed:0.80">Roblox 0.80x (Di Roblox: Speed 1.250)</option>
                  <option value="speed:0.50">Roblox 0.50x (Di Roblox: Speed 2.000)</option>
                </optgroup>
                <optgroup label="🎵 Semitone Pitch Shift" className="bg-[#181922]">
                  <option value="semitone:1">+1 Semitone (Roblox: Octave 0.944)</option>
                  <option value="semitone:2">+2 Semitones (Roblox: Octave 0.891)</option>
                  <option value="semitone:3">+3 Semitones (Roblox: Octave 0.841)</option>
                  <option value="semitone:4">+4 Semitones (Roblox: Octave 0.794)</option>
                  <option value="semitone:6">+6 Semitones (Roblox: Octave 0.707)</option>
                  <option value="semitone:12">+12 Semitones (Roblox: Octave 0.500)</option>
                  <option value="semitone:-1">-1 Semitone (Roblox: Octave 1.059)</option>
                  <option value="semitone:-2">-2 Semitones (Roblox: Octave 1.122)</option>
                  <option value="semitone:-3">-3 Semitones (Roblox: Octave 1.189)</option>
                  <option value="semitone:-6">-6 Semitones (Roblox: Octave 1.414)</option>
                  <option value="semitone:-12">-12 Semitones (Roblox: Octave 2.000)</option>
                </optgroup>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-400 block font-medium">Mode Pembersih Judul</label>
              <select
                value={settings.cleanerMode}
                onChange={(e) => setSettings({ ...settings, cleanerMode: e.target.value as CleanerMode })}
                className="w-full music-input rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 cursor-pointer"
              >
                <option value="Default" className="bg-[#181922]">Default (Tanpa Pembersihan)</option>
                <option value="Advanced" className="bg-[#181922]">Pembersih Cerdas (Direkomendasikan)</option>
                <option value="Standard" className="bg-[#181922]">Pembersih Standar</option>
                <option value="Custom" className="bg-[#181922]">Kustom Aturan</option>
              </select>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
