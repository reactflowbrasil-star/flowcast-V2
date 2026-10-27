'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import LogoutButton from '@/components/auth/LogoutButton';
import { useAuth } from '@/contexts/AuthContext';
import { contentService, userProfileService } from '@/services';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, ArrowLeft, Home, Tv, Film, Clapperboard, Stars, Flame, Wand2, Clock, Sparkles, MonitorSmartphone, Search, Settings, Captions, Download, Heart } from 'lucide-react';
import { ROUTES } from '@/constants/app';
import type { SubtitleTrackResponse, StreamPublicInfo } from '@/types';
import { cn } from '@/lib/utils';
import { ModernVideoPlayer } from '@/components/player/ModernVideoPlayer';
import { FavoriteButton } from '@/components/user/FavoriteButton';
import { StreamSelector } from '@/components/user/StreamSelector';
import { getSubtitleLanguageName } from '@/constants/subtitleLanguages';
import { subtitleCache } from '@/services/subtitleCache';
import { toProxiedStreamUrl, type StreamHeaderOverrides } from '@/lib/streamProxy';
import { useSubtitleControls } from './useSubtitleControls';
import { usePlayerEngine } from '@/hooks/usePlayerEngine';
import { loadVideoJs } from '@/lib/playerEngine';

// Helper to determine if a URL is from our own server (same-origin or relative)
// External URLs should not include credentials to avoid CORS issues
const isInternalUrl = (url: string): boolean => {
  if (!url) return false;

  // Relative URLs are always internal
  if (url.startsWith('/') && !url.startsWith('//')) return true;

  try {
    const urlObj = new URL(url, typeof window !== 'undefined' ? window.location.origin : '');
    // Check if it's same origin
    return typeof window !== 'undefined' && urlObj.origin === window.location.origin;
  } catch {
    // If URL parsing fails, assume it's internal (relative path)
    return true;
  }
};
export default function WatchPageClient() {
  const { t } = useTranslation();
  const playerEngine = usePlayerEngine();
  const params = useParams() as { id?: string };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get episode ID from URL query parameter (for continue watching series/anime)
  const episodeIdFromUrl = useMemo(() => {
    const ep = searchParams.get('episode');
    return ep ? Number(ep) : null;
  }, [searchParams]);

  // Extract content ID from pathname (e.g., /user/content/457/watch -> 457)
  // This is necessary because Next.js static export uses "_" as placeholder
  const contentId = useMemo(() => {
    if (!pathname) return NaN;
    const match = pathname.match(/\/user\/content\/(\d+)\/watch/);
    if (match && match[1]) {
      return Number(match[1]);
    }
    // Fallback to params if pathname doesn't match (shouldn't happen)
    return params?.id ? Number(params.id) : NaN;
  }, [pathname, params?.id]);

  const [content, setContent] = useState<any | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [drmKeys, setDrmKeys] = useState<string | null>(null);
  const [drmKeysExo, setDrmKeysExo] = useState<string | null>(null);
  const [licenseServerUrl, setLicenseServerUrl] = useState<string | null>(null);
  const [drmType, setDrmType] = useState<'clearkey' | 'widevine' | 'playready' | null>(null);
  const [drmHeaders, setDrmHeaders] = useState<Record<string, string> | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleTrackResponse[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Player integration state
  const shakaRef = useRef<any | null>(null);
  const hlsRef = useRef<any | null>(null);
  const videoJsRef = useRef<any | null>(null);
  const [playerInitialized, setPlayerInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const playerRootRef = useRef<HTMLDivElement | null>(null);
  const scriptPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

  // Enhanced player UI state
  const [showSubsPanel, setShowSubsPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const {
    selectedSubtitleIndex,
    setSelectedSubtitleIndex,
    subtitleSize,
    setSubtitleSize,
    applySubtitleSelection,
    disableAllSubtitles } = useSubtitleControls({
      contentId,
      subtitles,
      playerOpen,
      videoRef,
      shakaRef
    });

  // Track currently playing episode ID for series/anime progress saving
  const [currentEpisodeId, setCurrentEpisodeId] = useState<number | null>(null);

  // Multi-stream quality selector state
  const [availableStreams, setAvailableStreams] = useState<StreamPublicInfo[]>([]);
  const [showStreamSelector, setShowStreamSelector] = useState(false);
  const [selectedStreamId, setSelectedStreamId] = useState<number | null>(null);
  const [pendingEpisodeId, setPendingEpisodeId] = useState<number | null>(null);

  function setSpeed(rate: number) {
    const v = videoRef.current;
    if (v) {
      v.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }

  // Convert a hex string to base64 (used to build ClearKey map)
  function hexToBase64(hex: string): string {
    const bytes = hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [];
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return typeof window !== 'undefined' ? window.btoa(binary) : Buffer.from(bytes).toString('base64');
  }

  // Parse DRM hex pairs like "kidHex:keyHex[,kidHex2:keyHex2]" into a ClearKeys map { kid_b64: key_b64 }
  function parseHexDrmKeysToClearKeysMap(hexPairs: string): Record<string, string> {
    const map: Record<string, string> = {};
    const tokens = hexPairs.split(',').map((s) => s.trim()).filter(Boolean);
    for (const tok of tokens) {
      const parts = tok.split(':').map((p) => p.trim());
      if (parts.length !== 2) continue;
      const kidHex = parts[0];
      const keyHex = parts[1];
      try {
        const keyB64 = hexToBase64(keyHex);
        const kidB64 = hexToBase64(kidHex);
        map[kidB64] = keyB64;
      } catch {
        // skip malformed entries
        continue;
      }
    }
    return map;
  }

  function base64UrlToBase64(s: string) {
    let out = s.replace(/-/g, '+').replace(/_/g, '/');
    while (out.length % 4) out += '=';
    return out;
  }

  // Try to parse server-provided ExoPlayer JSON (drm_keys_exo) into ClearKeys map { kid_b64: key_b64 }
  function parseExoClearKeyJson(exoJsonStr: string | null | undefined): Record<string, string> | null {
    if (!exoJsonStr) return null;
    try {
      const parsedAny: any = JSON.parse(exoJsonStr);
      // ExoPlayer clearkey format may be: { "keys": [{"kid":"base64url", "k":"base64url"}], ... }
      if (parsedAny && parsedAny.keys && Array.isArray(parsedAny.keys)) {
        const map: Record<string, string> = {};
        for (const item of parsedAny.keys) {
          if (item.k && item.kid) {
            // Convert base64url -> base64
            const k = base64UrlToBase64(String(item.k));
            const kid = base64UrlToBase64(String(item.kid));
            map[kid] = k;
          }
        }
        return Object.keys(map).length ? map : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Helpers to detect stream type
  function isDashUrl(url: string) { return /\.mpd($|\?)/i.test(url); }
  function isHlsUrl(url: string) { return /\.m3u8($|\?)/i.test(url); }

  function toProxiedUrl(input: string, overrides?: StreamHeaderOverrides): string {
    // Backend media endpoints are already served through the same-origin API
    // reverse proxy. Keep their path so authentication cookies remain attached.
    try {
      const url = new URL(input, window.location.origin);
      const isBackendMedia = url.pathname.includes('/api/content/file/') ||
        url.pathname.includes('/api/episodes/file/');
      const hasOverrides = !!(
        overrides?.origin || overrides?.userAgent || overrides?.user_agent ||
        overrides?.referer || overrides?.customHeaders || overrides?.custom_headers
      );
      if (isBackendMedia && !hasOverrides) return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      // Let the shared helper retain its normal fallback for malformed URLs.
    }
    return toProxiedStreamUrl(input, overrides);
  }

  // Special proxy for subtitles that converts SRT to WebVTT
  function toProxiedSubtitleUrl(input: string): string {
    try {
      // For external subtitle URLs (user-provided), return directly
      if (input.startsWith('http://') || input.startsWith('https://')) {
        // If it contains /api/content/ or /api/episodes/ it's a backend subtitle URL
        // Extract the /api/... path so it goes through the Next.js proxy
        const apiMatch = input.match(/(\/api\/(?:content|episodes)\/.*)/);
        if (apiMatch) {
          return apiMatch[1]; // e.g. /api/content/47/subtitle/1
        }
        // External URL (user-provided subtitle URL) — use directly
        return input;
      }
      // Already relative or proxy URL — use as-is
      return input;
    } catch {
      return input;
    }
  }

  // External script loader (cdn-based fallback to avoid bundling optional deps)
  async function loadExternalScript(src: string): Promise<void> {
    if (typeof document === 'undefined') return;
    const existingPromise = scriptPromisesRef.current.get(src);
    if (existingPromise) return existingPromise;
    const promise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
      if (existing && (existing as any)._loaded) {
        resolve();
        return;
      }
      const s = existing ?? document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => { (s as any)._loaded = true; resolve(); };
      s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      if (!existing) document.head.appendChild(s);
    });
    scriptPromisesRef.current.set(src, promise);
    return promise;
  }

  // Initialize HLS via hls.js (loaded via CDN if not present)
  async function initHlsPlayer(m3u8Url: string) {
    try {
      if (typeof window === 'undefined') return false;
      const w = window as any;
      if (!w.Hls) {
        await loadExternalScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.14/dist/hls.min.js');
      }
      const Hls = (window as any).Hls;
      if (Hls && Hls.isSupported && Hls.isSupported()) {
        if (hlsRef.current) {
          try { hlsRef.current.destroy(); } catch { }
          hlsRef.current = null;
        }

        const hlsConfig: any = {
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 60,
          maxMaxBufferLength: 600,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 10,
          manifestLoadingTimeOut: 20000,
          manifestLoadingMaxRetry: 6,
          levelLoadingTimeOut: 20000,
          levelLoadingMaxRetry: 6,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 10,
          startLevel: -1,
          capLevelToPlayerSize: false,
        };

        const hls = new Hls(hlsConfig);
        hlsRef.current = hls;

        hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
          console.warn('hls.js error:', data.type, data.details, data.fatal);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('🔄 HLS network error, attempting hls.startLoad()...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('🔄 HLS media error, attempting hls.recoverMediaError()...');
                hls.recoverMediaError();
                break;
              default:
                if (!m3u8Url.includes('/api/proxy/stream')) {
                  const proxyUrl = `/api/proxy/stream?url=${encodeURIComponent(m3u8Url)}`;
                  console.log('🔄 HLS unrecoverable error, retrying via stream proxy:', proxyUrl);
                  hls.loadSource(proxyUrl);
                  hls.startLoad();
                } else {
                  try { hls.destroy(); } catch { }
                  hlsRef.current = null;
                }
                break;
            }
          }
        });

        if (videoRef.current) {
          hls.attachMedia(videoRef.current);
          hls.loadSource(m3u8Url);
          setPlayerInitialized(true);
        }
        return true;
      } else if (videoRef.current && videoRef.current.canPlayType && videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari)
        if (videoRef.current) {
          videoRef.current.src = m3u8Url;
          setPlayerInitialized(false);
        }
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  // Initialize Shaka Player + UI Overlay (supports HLS, DASH, ClearKey, Widevine, PlayReady)
  async function initShakaPlayer(
    manifestUrl: string,
    drmHex?: string | null,
    drmExo?: string | null,
    drmType?: string | null,
    licenseServerUrl?: string | null,
    drmHeaders?: Record<string, string> | null
  ) {
    try {
      if (typeof window === 'undefined') return false;
      // Load Shaka core + UI + CSS
      await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.9.6/shaka-player.compiled.min.js');
      await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.9.6/shaka-player.ui.min.js');
      // Inject CSS if not present
      (function injectShakaCss() {
        const href = 'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.9.6/controls.css';
        const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .some((l) => (l as HTMLLinkElement).href === href);
        if (!exists) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          document.head.appendChild(link);
        }
      })();

      const shaka = (window as any).shaka;
      const videoEl = videoRef.current;
      if (!shaka || !shaka.Player || !shaka.ui || !videoEl) {
        return false;
      }

      shaka.polyfill.installAll();

      // Destroy previous player if exists
      if (shakaRef.current) {
        try { await shakaRef.current.destroy(); } catch { }
        shakaRef.current = null;
        setPlayerInitialized(false);
      }

      // Create Player using new method (Shaka v5 compatible)
      const player = new shaka.Player();
      await player.attach(videoEl);
      shakaRef.current = player;

      const container = playerRootRef.current || videoEl.parentElement!;
      const overlay = new shaka.ui.Overlay(player, container, videoEl);
      const controls = overlay.getControls();
      controls.configure({
        controlPanelElements: ['play_pause', 'time_and_duration', 'spacer', 'mute', 'volume', 'language', 'captions', 'quality', 'overflow_menu'],
        overflowMenuButtons: ['language', 'captions', 'playback_rate', 'quality'],
        playbackRates: [0.5, 1, 1.25, 1.5, 2]
      });

      // DRM Configuration
      const drmConfig: any = {};

      // Widevine or PlayReady with license server
      if (licenseServerUrl && (drmType === 'widevine' || drmType === 'playready')) {
        const serverUrl = drmType === 'widevine'
          ? { 'com.widevine.alpha': licenseServerUrl }
          : { 'com.microsoft.playready': licenseServerUrl };

        drmConfig.servers = serverUrl;

        // Configure advanced settings with robustness levels and custom headers
        const advancedConfig: any = {};

        if (drmType === 'widevine') {
          advancedConfig['com.widevine.alpha'] = {
            // SW_SECURE_CRYPTO is the most compatible level for web playback
            videoRobustness: 'SW_SECURE_CRYPTO',
            audioRobustness: 'SW_SECURE_CRYPTO',
            ...(drmHeaders && Object.keys(drmHeaders).length > 0 ? { headers: drmHeaders } : {})
          };
        } else {
          advancedConfig['com.microsoft.playready'] = {
            videoRobustness: 'SW_SECURE_CRYPTO',
            audioRobustness: 'SW_SECURE_CRYPTO',
            ...(drmHeaders && Object.keys(drmHeaders).length > 0 ? { headers: drmHeaders } : {})
          };
        }

        drmConfig.advanced = advancedConfig;

        console.log(`🔐 Configuring ${drmType.toUpperCase()} DRM with license server and robustness levels`);
      }
      // ClearKey DRM (fallback)
      else {
        let clearKeys: Record<string, string> | null = null;
        if (drmHex) {
          const parsed = parseHexDrmKeysToClearKeysMap(drmHex);
          if (Object.keys(parsed).length) clearKeys = parsed;
        } else if (drmExo) {
          const parsed = parseExoClearKeyJson(drmExo);
          if (parsed) clearKeys = parsed;
        }
        if (clearKeys) {
          drmConfig.clearKeys = clearKeys;
          console.log('🔐 Configuring ClearKey DRM');
        }
      }

      if (Object.keys(drmConfig).length > 0) {
        player.configure({ drm: drmConfig });
      }

      player.addEventListener('error', (e: any) => {
        console.error('Shaka Player error', e);
        setError(t('user.live.playbackError'));
      });

      await player.load(manifestUrl);

      // Log available audio tracks
      try {
        // Audio track detection for debugging
        const tracks = player.getVariantTracks();
        const _audioTracks = tracks.filter((t: { type: string; language?: string }) => t.type === 'variant' && t.language);
        void _audioTracks; // Suppress unused variable warning
      } catch {
        // Ignore errors in audio track detection
      }

      // Attach external subtitles (as WebVTT) so they show in Shaka UI
      try {
        if (Array.isArray(subtitles) && subtitles.length) {

          for (const s of subtitles) {
            const lang = (s.language || s.label || 'und').toString();
            const label = getSubtitleLanguageName(s.language || s.label || '');
            const proxiedUrl = toProxiedSubtitleUrl(s.url); // Use subtitle-specific proxy


            // addTextTrack(uri, language, kind, mime, codec, label, forced)
            player.addTextTrack(proxiedUrl, lang, 'subtitle', 'text/vtt', undefined, label, false);
          }

          player.setTextTrackVisibility(true);

          // Try restore previous selection
          const anyPlayer = player as any;
          const tracks = anyPlayer.getTextTracks?.() || [];

          const saved = parseInt(localStorage.getItem(`iptv_subs_${contentId}`) || '-1', 10);
          const pick = Number.isFinite(saved) && saved >= 0 && saved < tracks.length ? saved : 0;

          if (tracks[pick]) {
            anyPlayer.selectTextTrack(tracks[pick]);
          }
        }
      } catch (e) {
        console.error('Failed to attach text tracks to Shaka', e);
      }

      setPlayerInitialized(true);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Cleanup on unmount - MEMORY LEAK FIX: Properly clean up all resources
  useEffect(() => {
    return () => {
      // Clean up Shaka player
      if (shakaRef.current) {
        try { shakaRef.current.destroy(); } catch { }
        shakaRef.current = null;
      }
      // Clean up HLS.js
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch { }
        hlsRef.current = null;
      }
      if (videoJsRef.current) {
        try { videoJsRef.current.dispose(); } catch { }
        videoJsRef.current = null;
      }
      // Clean up video element
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.src = '';
          videoRef.current.load();
        } catch { }
      }
      // Clear script promise cache to allow garbage collection
      scriptPromisesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
    };
  }, [streamUrl]);

  // Track if we've already restored position
  const hasRestoredPosition = useRef(false);
  const lastSavedTime = useRef(0);
  const currentEpisodeIdRef = useRef<number | null>(null);

  useEffect(() => {
    hasRestoredPosition.current = false;
    lastSavedTime.current = 0;
  }, [contentId, currentEpisodeId, streamUrl]);

  // Keep ref in sync with state for use in closures
  useEffect(() => {
    currentEpisodeIdRef.current = currentEpisodeId;
  }, [currentEpisodeId]);

  // Save progress every 30 seconds while playing
  useEffect(() => {
    if (!contentId || Number.isNaN(contentId) || !streamUrl || !playerOpen) return;

    let interval: NodeJS.Timeout | null = null;
    let mounted = true;

    const saveProgress = async (opts?: { allowPaused?: boolean; allowEnded?: boolean; force?: boolean }) => {
      const v = videoRef.current;
      if (!v) return;

      if (!opts?.allowPaused && v.paused) return;
      if (!opts?.allowEnded && v.ended) return;

      const currentTime = Math.floor(v.currentTime || 0);
      const durationValue = Number.isFinite(v.duration) ? Math.floor(v.duration) : 0;
      const duration = durationValue > 0 ? durationValue : 0;

      if (!opts?.force) {
        if (Math.abs(currentTime - lastSavedTime.current) < 5) return;
        if (currentTime < 10) return;
      }
      if (duration <= 0) return;

      lastSavedTime.current = currentTime;

      // Use ref for episodeId to always get current value
      const episodeIdToSave = currentEpisodeIdRef.current;

      try {
        await contentService.saveWatchProgress({
          contentId,
          contentType: content?.content_type || content?.type || 'movie',
          episodeId: episodeIdToSave ?? undefined,
          positionSeconds: currentTime,
          durationSeconds: duration
        });
        console.log(`💾 Progress saved: ${currentTime}s / ${duration}s${episodeIdToSave ? ` (episode ${episodeIdToSave})` : ''}`);
      } catch (err) {
        console.error('Failed to save progress:', err);
      }
    };

    const onPauseHandler = () => saveProgress({ allowPaused: true });
    const onEndedHandler = () => saveProgress({ allowPaused: true, allowEnded: true, force: true });

    // Wait for video element to be available after dialog opens
    const setupListeners = () => {
      const v = videoRef.current;
      if (!v || !mounted) return;

      v.addEventListener('pause', onPauseHandler);
      v.addEventListener('ended', onEndedHandler);

      // Save every 30 seconds while playing
      interval = setInterval(() => saveProgress(), 30000);
    };

    // Small delay to ensure video element is mounted after dialog animation
    const timeout = setTimeout(setupListeners, 100);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
      const v = videoRef.current;
      v?.removeEventListener('pause', onPauseHandler);
      v?.removeEventListener('ended', onEndedHandler);
      // Save on unmount even if paused (uses ref for current episodeId)
      saveProgress({ allowPaused: true, allowEnded: true });
    };
  }, [contentId, streamUrl, content, playerOpen]); // Removed currentEpisodeId - using ref instead

  // Restore position when video loads
  useEffect(() => {
    if (!contentId || Number.isNaN(contentId) || !streamUrl || hasRestoredPosition.current) return;

    const restorePosition = async () => {
      try {
        const res = await contentService.getWatchProgress(contentId);
        if (res.success && res.data?.progress && !res.data.progress.completed) {
          const savedPosition = res.data.progress.position_seconds;
          if (savedPosition > 10) {
            const v = videoRef.current;
            if (v) {
              // Wait for video to be ready
              const seekToSaved = () => {
                if (v.readyState >= 1) {
                  v.currentTime = savedPosition;
                  hasRestoredPosition.current = true;
                  lastSavedTime.current = savedPosition;
                  console.log(`▶️ Resumed at ${savedPosition}s`);
                }
              };

              if (v.readyState >= 1) {
                seekToSaved();
              } else {
                v.addEventListener('loadedmetadata', seekToSaved, { once: true });
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to restore position:', err);
      }
    };

    restorePosition();
  }, [contentId, streamUrl]);

  useEffect(() => {
    if (!contentId || Number.isNaN(contentId)) {
      setError(t('watch.invalidId'));
      return;
    }

    let mounted = true;
    const load = async () => {
      setLoadingContent(true);
      setError(null);
      try {
        const res = await contentService.getContentById(contentId);
        if (!mounted) return;
        if (res.success && res.data) {
          setContent(res.data);
        } else {
          setError(res.error?.error ?? t('watch.notFound'));
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoadingContent(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [contentId, t]);

  const fetchStream = async (): Promise<string | null> => {
    if (!contentId || Number.isNaN(contentId)) return null;
    setLoadingStream(true);
    setError(null);
    try {
      const res = await contentService.getStreamUrl(contentId);

      if (res.success && res.data) {

        const url = res.data.stream_url ?? null;
        if (url) {
          // Convert absolute API URLs to relative paths for same-origin requests
          // This ensures authentication cookies are sent properly
          const proxiedUrl = toProxiedUrl(url, {
            origin: res.data.origin ?? null,
            user_agent: res.data.user_agent ?? null,
            referer: res.data.referer ?? null,
            custom_headers: res.data.custom_headers ?? null
          });
          setStreamUrl(proxiedUrl);

          // Set DRM info
          setLicenseServerUrl(res.data.license_server_url ?? null);
          setDrmType(res.data.drm_type ?? null);
          setDrmKeys(res.data.drm_keys ?? null);
          setDrmKeysExo(res.data.drm_keys_exo ?? null);
          setDrmHeaders(res.data.drm_headers ?? null);

          // Process subtitles - only use what the backend explicitly provides
          const subs = res.data.subtitles ?? [];
          setSubtitles(subs);

          // Preload all subtitles for instant switching
          if (subs.length > 0) {
            subtitleCache.preloadSubtitles(subs).catch(err => {
            });
          }

          return proxiedUrl;
        } else {
          setError(t('watch.noStreamAvailable'));
          return null;
        }
      } else {
        setError(res.error?.error ?? t('watch.streamError'));
        return null;
      }
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoadingStream(false);
    }
  };

  // Player initializer for HLS/DASH/Direct streams
  async function ensurePlaybackReady(url: string | null): Promise<void> {
    if (!url || !videoRef.current) return;

    // Clean up any existing players first
    if (shakaRef.current) {
      try { await shakaRef.current.destroy(); } catch { }
      shakaRef.current = null;
    }
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch { }
      hlsRef.current = null;
    }

    if (videoJsRef.current) {
      try { videoJsRef.current.dispose(); } catch { }
      videoJsRef.current = null;
    }

    videoRef.current.crossOrigin = isInternalUrl(url) ? 'use-credentials' : 'anonymous';
    await new Promise(r => setTimeout(r, 50));

    const hasDrm = !!(drmType || licenseServerUrl || drmKeys);

    if (!hasDrm && playerEngine === 'native' && !isDashUrl(url)) {
      videoRef.current.src = url;
      setPlayerInitialized(false);
    } else if (!hasDrm && playerEngine === 'videojs' && !isDashUrl(url)) {
      try {
        const videojs = await loadVideoJs();
        const video = videoRef.current;
        if (!video) return;
        const player = videojs(video, {
          autoplay: false,
          controls: false,
          responsive: true,
          html5: { vhs: { overrideNative: true } },
        });
        videoJsRef.current = player;
        player.src(isHlsUrl(url) ? { src: url, type: 'application/x-mpegURL' } : { src: url });
        player.on('error', () => {
          const detail = player.error?.();
          setError(`Video.js: ${detail?.message || detail?.code || t('watch.streamError')}`);
        });
        setPlayerInitialized(true);
      } catch (e) {
        setError(`Video.js: ${String(e)}`);
      }
    } else if (isHlsUrl(url)) {
      // For HLS streams (m3u8), initialize HLS.js (or Shaka if DRM is present)
      if (hasDrm || playerEngine === 'shaka') {
        await initShakaPlayer(
          url,
          drmKeys,
          drmKeysExo,
          drmType,
          licenseServerUrl,
          drmHeaders
        );
      } else {
        const hlsOk = await initHlsPlayer(url);
        if (!hlsOk) {
          await initShakaPlayer(
            url,
            drmKeys,
            drmKeysExo,
            drmType,
            licenseServerUrl,
            drmHeaders
          );
        }
      }
    } else if (isDashUrl(url)) {
      await initShakaPlayer(
        url,
        drmKeys,
        drmKeysExo,
        drmType,
        licenseServerUrl,
        drmHeaders
      );
    } else {
      // Direct video file (.mp4, .mkv, .webm)
      try {
        videoRef.current.src = url;
        setPlayerInitialized(false);
      } catch (e) {
        console.error('🎬 Error setting up native video source:', e);
      }
    }
  }

  // Enter fullscreen and start playback
  async function startPlaybackFullscreen(): Promise<void> {
    // Kept for reference; using modal playback now
    let url = streamUrl;
    if (!url) {
      url = await fetchStream();
    }
    await ensurePlaybackReady(url);
    const v = videoRef.current;
    try {
      await v?.play();
      setIsPlaying(true);
    } catch { }
  }

  // Open modal (90vw) and start playback
  async function startPlaybackModal(): Promise<void> {
    setCurrentEpisodeId(null); // Clear episode ID for movie playback
    setPendingEpisodeId(null);

    // Check if there are multiple streams available (quality selector)
    try {
      const streamsRes = await contentService.getPublicContentStreams(contentId);
      if (streamsRes.success && streamsRes.data && streamsRes.data.length > 1) {
        setAvailableStreams(streamsRes.data);
        setSelectedStreamId(streamsRes.data.find(s => s.is_default)?.id ?? streamsRes.data[0].id);
        setShowStreamSelector(true);
        return; // Wait for user selection
      }
    } catch {
      // If streams fetch fails, fall through to default play
    }

    // Single stream or fetch failed — play directly
    await playContentDirectly();
  }

  // Play content directly with the default stream (no selector)
  async function playContentDirectly(overrideStream?: StreamPublicInfo): Promise<void> {
    setCurrentEpisodeId(null);
    let url = streamUrl;

    if (overrideStream) {
      // Fetch the default stream first to load subtitles and content metadata
      await fetchStream();
      // Now override with the selected stream's URL and DRM info
      const proxiedUrl = toProxiedUrl(overrideStream.stream_url, {
        origin: overrideStream.origin ?? null,
        user_agent: overrideStream.user_agent ?? null,
        referer: overrideStream.referer ?? null,
        custom_headers: overrideStream.custom_headers ?? null,
      });
      setStreamUrl(proxiedUrl);
      setLicenseServerUrl(overrideStream.license_server_url ?? null);
      setDrmType((overrideStream.drm_type as any) ?? null);
      setDrmKeys(overrideStream.drm_keys ?? null);
      setDrmKeysExo(overrideStream.drm_keys_json ?? null);
      setDrmHeaders(overrideStream.drm_headers ?? null);
      url = proxiedUrl;
    } else if (!url) {
      url = await fetchStream();
    }

    // open modal first so the video element exists
    setPlayerOpen(true);
    await new Promise((r) => setTimeout(r, 50));
    await ensurePlaybackReady(url);
    const v = videoRef.current;
    if (v) {
      try {
        await v.play();
        setIsPlaying(true);
      } catch {
        // autoplay may be blocked; user can press play manually
      }
    }
  }

  // Handle stream selection from the quality selector
  async function handleStreamSelected(stream: StreamPublicInfo): Promise<void> {
    setSelectedStreamId(stream.id);
    setShowStreamSelector(false);
    setAvailableStreams([]);

    if (pendingEpisodeId) {
      // Playing an episode with selected stream
      await playEpisodeDirectly(pendingEpisodeId, stream);
      setPendingEpisodeId(null);
    } else {
      // Playing movie/content with selected stream
      await playContentDirectly(stream);
    }
  }

  // Sidebar search submit on Enter
  function handleSidebarSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const q = searchTerm.trim();
      if (q) {
        router.push(`${ROUTES.CONTENT.SEARCH}?q=${encodeURIComponent(q)}`);
      }
    }
  }

  // React to leaving fullscreen -> pause and hide overlay player
  useEffect(() => {
    const onFsChange = () => {
      const fsActive = !!document.fullscreenElement;
      if (!fsActive) {
        setIsPlaying(false);
        setShowPlayer(false);
        const v = videoRef.current;
        try { v?.pause(); } catch { }
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Do not auto-fetch the stream. Wait for explicit user action (Play).

  // Sidebar menu and related content data

  // Background helpers for related rail
  const fallbackCardBackgrounds = [
    'linear-gradient(135deg, #1f2937 0%, #0f172a 100%)',
    'linear-gradient(135deg, #111827 0%, #1d4ed8 80%)',
    'linear-gradient(135deg, #111827 0%, #7c3aed 100%)',
    'linear-gradient(135deg, #111827 0%, #f97316 100%)',
    'linear-gradient(135deg, #111827 0%, #14b8a6 100%)',
    'linear-gradient(135deg, #111827 0%, #ef4444 100%)',
  ];
  function toBackgroundImage(src?: string | null, fallback?: string) {
    const s = (src ?? '').trim();
    if (!s) return fallback ?? 'linear-gradient(135deg, #1f2937 0%, #0f172a 100%)';
    if (s.startsWith('linear-gradient') || s.startsWith('radial-gradient') || s.startsWith('url(')) return s;
    return `url(${s})`;
  }

  // Build sidebar (categories + profile)
  const { user } = useAuth();

  const usernameLabel = useMemo(
    () => (user as any)?.username || t('user.dashboard.guest'),
    [t, (user as any)?.username],
  );

  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories', 'all'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getCategories();
      if (res.success && res.data) return res.data as any[];
      return [];
    }
  });

  const { data: profile } = useQuery({
    queryKey: ['user', 'profile-basic'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await userProfileService.getProfile();
      if (!res.success || !res.data) {
        throw new Error((res.error?.error as string) || t('products.errors.loadProfileFailed'));
      }
      return res.data;
    }
  });

  const userCategoryObjs = useMemo(() => {
    const result: Array<{ id: number; name: string; category_type: string }> = [];
    const pushUnique = (cat?: { id?: number; name?: string; category_type?: string } | null) => {
      if (!cat) return;
      const id = Number(cat.id ?? 0);
      const name = String(cat.name ?? cat.category_type ?? '').trim();
      const type = String(cat.category_type ?? cat.name ?? '').trim();
      if (!name && !type) return;
      const key = (type || name).toLowerCase();
      if (result.find((x) => (x.category_type || x.name).toLowerCase() === key)) return;
      result.push({
        id: Number.isFinite(id) && id > 0 ? id : 0,
        name: name || type,
        category_type: type || name
      });
    };

    const direct = (user as any)?.subscribed_categories as Array<any> | undefined;
    if (Array.isArray(direct) && direct.length) {
      if (typeof direct[0] === 'object') {
        direct.forEach((c) => pushUnique(c));
      } else {
        (direct as number[]).forEach((id) => {
          const found = (allCategories as any[]).find((c: any) => c.id === id);
          if (found) pushUnique(found);
        });
      }
    }

    if (result.length === 0) {
      const ids = (profile as any)?.subscribed_categories as number[] | undefined;
      if (ids && ids.length && (allCategories as any[]).length) {
        ids.forEach((id) => {
          const found = (allCategories as any[]).find((c: any) => c.id === id);
          if (found) pushUnique(found);
        });
      }
    }

    return result;
  }, [user?.subscribed_categories, (profile as any)?.subscribed_categories, allCategories]);

  const menuItems = useMemo(() => {
    type MenuItemKey = 'home' | 'liveTv' | 'movies' | 'series' | 'kids' | 'anime' | 'events' | 'search';
    type MenuItem = { key: MenuItemKey; href: string; icon: any; basePath: string };
    const add = new Map<string, MenuItem>();

    const byType = (typ: string): MenuItem | null => {
      const t = (typ || '').toLowerCase();
      if (t === 'tv') return { key: 'liveTv', href: `${ROUTES.CONTENT.BROWSE}?tab=live`, icon: Tv, basePath: ROUTES.CONTENT.BROWSE };
      if (t === 'vod' || t === 'movies' || t === 'movie') return { key: 'movies', href: `${ROUTES.CONTENT.BROWSE}?tab=movies`, icon: Film, basePath: ROUTES.CONTENT.BROWSE };
      if (t === 'series' || t === 'shows' || t === 'show') return { key: 'series', href: `${ROUTES.CONTENT.BROWSE}?tab=shows`, icon: Clapperboard, basePath: ROUTES.CONTENT.BROWSE };
      if (t === 'kids') return { key: 'kids', href: `${ROUTES.CONTENT.BROWSE}?category=Kids`, icon: Stars, basePath: ROUTES.CONTENT.BROWSE };
      if (t === 'anime') return { key: 'anime', href: `${ROUTES.CONTENT.BROWSE}?category=Anime`, icon: Wand2, basePath: ROUTES.CONTENT.BROWSE };
      if (t === 'events' || t === 'eventos') return { key: 'events', href: `${ROUTES.CONTENT.BROWSE}?category=events`, icon: Clock, basePath: ROUTES.CONTENT.BROWSE };
      return null;
    };

    for (const c of userCategoryObjs) {
      const mi = byType(c.category_type || c.name || '');
      if (mi) add.set(mi.key, mi);
    }

    const weight: Record<MenuItemKey, number> = {
      movies: 10,
      liveTv: 20,
      series: 30,
      kids: 40,
      anime: 50,
      events: 55,
      home: 0,
      search: 999,
    };

    const subs = Array.from(add.values()).sort((a, b) => (weight[a.key] ?? 999) - (weight[b.key] ?? 999));
    const homeItem: MenuItem = { key: 'home', href: ROUTES.USER.BASE, icon: Home, basePath: ROUTES.USER.BASE };
    const searchItem: MenuItem = { key: 'search', href: ROUTES.CONTENT.SEARCH, icon: Search, basePath: ROUTES.CONTENT.SEARCH };

    if (!subs.length) {
      const defaults: MenuItem[] = [
        { key: 'liveTv', href: `${ROUTES.CONTENT.BROWSE}?tab=live`, icon: Tv, basePath: ROUTES.CONTENT.BROWSE },
        { key: 'movies', href: `${ROUTES.CONTENT.BROWSE}?tab=movies`, icon: Film, basePath: ROUTES.CONTENT.BROWSE },
        { key: 'series', href: `${ROUTES.CONTENT.BROWSE}?tab=shows`, icon: Clapperboard, basePath: ROUTES.CONTENT.BROWSE },
        { key: 'kids', href: `${ROUTES.CONTENT.BROWSE}?category=Kids`, icon: Stars, basePath: ROUTES.CONTENT.BROWSE },
        { key: 'anime', href: `${ROUTES.CONTENT.BROWSE}?category=Anime`, icon: Wand2, basePath: ROUTES.CONTENT.BROWSE },
        { key: 'events', href: `${ROUTES.CONTENT.BROWSE}?category=events`, icon: Clock, basePath: ROUTES.CONTENT.BROWSE },
      ];
      return [homeItem, ...defaults, searchItem];
    }
    return [homeItem, ...subs, searchItem];
  }, [userCategoryObjs, ROUTES.CONTENT.BROWSE, ROUTES.CONTENT.SEARCH, ROUTES.USER.BASE]);

  // Infer active query for sidebar highlighting on watch pages
  const inferredActiveQuery = useMemo(() => {
    const tLower = String((content as any)?.content_type ?? '').toLowerCase();
    const catRaw = String(
      (content as any)?.category?.category_type ??
      (content as any)?.category?.name ??
      (content as any)?.category ??
      ''
    ).toLowerCase();
    const isLive = Boolean((content as any)?.is_live);

    const pick: { tab?: string; category?: string } = {};

    if (isLive || tLower === 'tv' || tLower === 'live' || catRaw === 'tv') {
      pick.tab = 'live';
    } else if (tLower === 'series' || tLower === 'show' || tLower === 'shows' || catRaw === 'series') {
      pick.tab = 'shows';
    } else if (tLower === 'movie' || tLower === 'movies' || tLower === 'vod' || catRaw === 'vod') {
      pick.tab = 'movies';
    } else if (catRaw === 'kids') {
      pick.category = 'kids';
    } else if (catRaw === 'anime') {
      pick.category = 'anime';
    } else if (catRaw === 'eventos' || catRaw === 'events') {
      pick.category = 'events';
    }

    return pick;
  }, [content]);

  // Determine if content is episodic (series, anime, shows) to decide whether to fetch series data
  // Must wait until content is fully loaded to make this determination
  const isEpisodicContent = useMemo(() => {
    // If content is not yet loaded, return undefined to indicate "unknown"
    if (!content || loadingContent) return undefined;

    const tLower = String((content as any)?.content_type ?? '').toLowerCase();
    const catRaw = String(
      (content as any)?.category?.category_type ??
      (content as any)?.category?.name ??
      (content as any)?.category ??
      ''
    ).toLowerCase();

    // Series and Anime are episodic content
    const isEpisodic = tLower === 'series' || tLower === 'show' || tLower === 'shows' || tLower === 'anime' ||
      catRaw === 'series' || catRaw === 'anime';

    console.log(`🎬 Content type check: content_type="${tLower}", category="${catRaw}", isEpisodic=${isEpisodic}`);
    return isEpisodic;
  }, [content, loadingContent]);

  // Series data (seasons and episodes) when viewing episodic content
  // Only enabled when: contentId exists, content is loaded, and content is confirmed episodic
  const { data: seriesInfo } = useQuery({
    queryKey: ['series-by-content', contentId],
    enabled: !!contentId && isEpisodicContent === true, // Must be explicitly true, not undefined
    queryFn: async () => {
      const res = await contentService.getSeriesByContentId(contentId);
      if (res.success && res.data) return res.data as any;
      return null;
    },
    staleTime: 5 * 60 * 1000
  });

  const { data: seasons = [] } = useQuery({
    queryKey: ['series-seasons', seriesInfo?.id ?? 0],
    enabled: !!(seriesInfo?.id),
    queryFn: async () => {
      const res = await contentService.getSeriesSeasons(seriesInfo!.id as number);
      if (res.success && res.data) return res.data as any[];
      return [];
    },
    staleTime: 5 * 60 * 1000
  });

  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, any[]>>({});

  useEffect(() => {
    let active = true;
    async function loadEpisodes() {
      if (!seasons?.length) return;
      const entries = await Promise.all(
        seasons.map(async (s: any) => {
          const r = await contentService.getSeasonEpisodes(s.id as number);
          const eps = r.success && r.data ? (r.data as any[]) : [];
          return [s.id as number, eps] as const;
        })
      );
      if (!active) return;
      const map: Record<number, any[]> = {};
      for (const [sid, eps] of entries) map[sid] = eps;
      setEpisodesBySeason(map);
    }
    loadEpisodes();
    return () => {
      active = false;
    };
  }, [seasons]);

  // Find which season contains the active episode (for highlighting and tab selection)
  const activeSeasonId = useMemo(() => {
    const targetEpisodeId = currentEpisodeId || episodeIdFromUrl;
    if (!targetEpisodeId) return seasons?.[0]?.id;

    for (const [seasonId, episodes] of Object.entries(episodesBySeason)) {
      if ((episodes as any[]).some((ep: any) => ep.id === targetEpisodeId)) {
        return Number(seasonId);
      }
    }
    return seasons?.[0]?.id;
  }, [currentEpisodeId, episodeIdFromUrl, episodesBySeason, seasons]);

  // Auto-play episode from URL parameter (for continue watching)
  const [autoPlayTriggered, setAutoPlayTriggered] = useState(false);
  useEffect(() => {
    let autoPlayTimer: NodeJS.Timeout | null = null;
    if (episodeIdFromUrl && !autoPlayTriggered && content && Object.keys(episodesBySeason).length > 0) {
      setAutoPlayTriggered(true);
      // Small delay to ensure everything is ready
      autoPlayTimer = setTimeout(() => {
        startPlaybackModalEpisode(episodeIdFromUrl);
      }, 100);
    }
    return () => {
      if (autoPlayTimer) clearTimeout(autoPlayTimer);
    };
  }, [episodeIdFromUrl, autoPlayTriggered, content, episodesBySeason]);

  async function startPlaybackModalEpisode(episodeId: number): Promise<void> {
    setError(null);
    setCurrentEpisodeId(episodeId);

    // Check available episode streams first
    try {
      const streamsRes = await contentService.getPublicEpisodeStreams(episodeId);
      if (streamsRes.success && streamsRes.data && streamsRes.data.length > 0) {
        if (streamsRes.data.length > 1) {
          setAvailableStreams(streamsRes.data);
          setSelectedStreamId(streamsRes.data.find(s => s.is_default)?.id ?? streamsRes.data[0].id);
          setPendingEpisodeId(episodeId);
          setShowStreamSelector(true);
          return; // Wait for user selection
        }

        // If there is exactly one stream, play it directly instead of relying on legacy
        // /api/episodes/:id/stream response (which can be stale in some flows).
        await playEpisodeDirectly(episodeId, streamsRes.data[0]);
        return;
      }
    } catch {
      // If streams fetch fails, fall through to legacy default play
    }

    // No streams found or fetch failed — play via legacy endpoint
    await playEpisodeDirectly(episodeId);
  }

  // Play episode directly with the default stream or a selected stream
  async function playEpisodeDirectly(episodeId: number, overrideStream?: StreamPublicInfo): Promise<void> {
    setCurrentEpisodeId(episodeId);
    let url: string | null = null;
    let episodeSubtitles: SubtitleTrackResponse[] = [];

    try {
      if (overrideStream) {
        // Use the user-selected stream
        url = toProxiedUrl(overrideStream.stream_url, {
          origin: overrideStream.origin ?? null,
          user_agent: overrideStream.user_agent ?? null,
          referer: overrideStream.referer ?? null,
          custom_headers: overrideStream.custom_headers ?? null,
        });
        setLicenseServerUrl(overrideStream.license_server_url ?? null);
        setDrmType((overrideStream.drm_type as any) ?? null);
        setDrmKeys(overrideStream.drm_keys ?? null);
        setDrmKeysExo(overrideStream.drm_keys_json ?? null);
        setDrmHeaders(overrideStream.drm_headers ?? null);
      } else {
        // Fetch default stream via delivery endpoint
        const res = await contentService.getEpisodeStreamUrl(episodeId);
        if (res.success && res.data?.stream_url) {
          url = toProxiedUrl(res.data.stream_url, {
            origin: res.data.origin ?? null,
            user_agent: res.data.user_agent ?? null,
            referer: res.data.referer ?? null,
            custom_headers: res.data.custom_headers ?? null,
          });
          // Set DRM from delivery response
          setLicenseServerUrl(res.data.license_server_url ?? null);
          setDrmType((res.data.drm_type as any) ?? null);
          setDrmKeys(res.data.drm_keys ?? null);
          setDrmKeysExo(res.data.drm_keys_exo ?? null);
          setDrmHeaders(res.data.drm_headers ?? null);
        } else {
          setError(t('watch.streamError'));
          return;
        }
      }

      // Load episode subtitles
      try {
        const subsRes = await contentService.getEpisodeSubtitles(episodeId);
        if (subsRes.success && subsRes.data && Array.isArray(subsRes.data)) {
          episodeSubtitles = subsRes.data;
        }
      } catch {
        // non-blocking
      }

      setSubtitles(episodeSubtitles);
      setStreamUrl(url);

      if (episodeSubtitles.length > 0) {
        subtitleCache.preloadSubtitles(episodeSubtitles).catch(() => { });
      }
    } catch (e) {
      setError(String(e));
      return;
    }

    // Open modal, prepare player and play
    setPlayerOpen(true);
    await new Promise((r) => setTimeout(r, 50));
    await ensurePlaybackReady(url);
    const v = videoRef.current;
    if (v) {
      try {
        await v.play();
        setIsPlaying(true);
      } catch {
        // autoplay may be blocked
      }
    }
  }

  // Related / recommended items
  type RelatedItem = { id: number; title: string; image?: string; backdrop?: string; year?: number };
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  useEffect(() => {
    let active = true;
    const loadRelated = async () => {
      if (!content) return;
      setLoadingRelated(true);
      try {
        let items: RelatedItem[] = [];
        if ((content as any).category_id) {
          const res = await contentService.getContentByCategory((content as any).category_id as number, 1, 12);
          if (res.success && res.data) {
            items = (res.data.content as any[]).map((it: any, idx: number) => ({
              id: it.id,
              title: it.title,
              image: it.image_url,
              backdrop: it.backdrop_url,
              year: it.year
            })).filter((it) => it.id !== (content as any).id);
          }
        }
        if (!items.length) {
          const q = String((content as any).title || '').split(' ').slice(0, 2).join(' ');
          if (q) {
            const sr = await contentService.searchContent({ q, limit: 12 });
            if (sr.success && sr.data) {
              items = (sr.data.content as any[]).map((it: any) => ({
                id: it.id,
                title: it.title,
                image: it.image_url ?? it.poster_url,
                backdrop: it.backdrop_url ?? it.image_url,
                year: it.year
              })).filter((it) => it.id !== (content as any).id);
            }
          }
        }
        if (active) setRelated(items);
      } catch {
        // ignore related errors
      } finally {
        if (active) setLoadingRelated(false);
      }
    };
    loadRelated();
    return () => { active = false; };
  }, [content]);

  // Loading skeleton with cinematic hero
  if (loadingContent) {
    return (
      <UserRoute>
        <div className="relative min-h-screen bg-slate-950 text-white">
          <div className="absolute inset-0 h-[80vh]">
            <div className="h-full w-full bg-slate-800/40 animate-pulse" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/85 to-slate-950" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-10 pb-16">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(260px,340px)_1fr]">
              <div className="rounded-xl overflow-hidden shadow-2xl border border-slate-800/60 bg-slate-900/50 aspect-[2/3] animate-pulse" />
              <div className="space-y-5">
                <div className="h-10 w-2/3 bg-slate-800/70 rounded animate-pulse" />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="h-6 w-16 bg-slate-800/70 rounded-full animate-pulse" />
                  <div className="h-6 w-20 bg-slate-800/70 rounded-full animate-pulse" />
                  <div className="h-6 w-24 bg-slate-800/70 rounded-full animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-full bg-slate-800/70 rounded animate-pulse" />
                  <div className="h-4 w-11/12 bg-slate-800/70 rounded animate-pulse" />
                  <div className="h-4 w-4/5 bg-slate-800/70 rounded animate-pulse" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="h-10 w-36 bg-slate-800/70 rounded-md animate-pulse" />
                  <div className="h-10 w-44 bg-slate-800/70 rounded-md animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </UserRoute>
    );
  }

  // Error state unchanged
  if (error) {
    return (
      <UserRoute>
        <div className="min-h-screen bg-slate-950 text-white">
          <div className="mx-auto max-w-4xl p-6">
            <h1 className="text-2xl font-semibold">{t('watch.title')}</h1>
            <div className="mt-4 text-red-400">{error}</div>
            <div className="mt-6">
              <Button onClick={() => router.back()}>{t('watch.goBack')}</Button>
            </div>
          </div>
        </div>
      </UserRoute>
    );
  }

  const backdrop = content?.backdrop_url ?? content?.poster_url ?? null;

  return (
    <UserRoute>
      <div className="min-h-screen bg-slate-950 text-white scrollbar-thin">
        {/* Fixed sidebar - hidden on mobile, visible on md+ */}
        <ModernUserSidebar />

        {/* Main content - needs left margin on desktop to account for fixed sidebar */}
        <main className="relative overflow-x-hidden pb-24 md:ml-72">
          {/* Backdrop hero inside main */}
          <div className="relative">
            <div className="absolute inset-0 h-[50vh]">
              {backdrop ? (
                <img
                  src={backdrop}
                  alt={content?.title ?? 'Backdrop'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-900" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/85 to-slate-950 backdrop-blur-sm" />
            </div>

            {/* Foreground content */}
            <div className="relative z-10 w-full px-4 md:px-6 pt-10 pb-16">
              <div className="mb-6">
                <Link href={ROUTES.USER.BASE}>
                  <Button variant="outline" className="rounded-full border-slate-700 bg-slate-900/50 text-slate-200 hover:bg-slate-800/70">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('watch.backToDashboard')}
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(260px,340px)_1fr] items-start">
                {/* Poster */}
                <div className="rounded-xl overflow-hidden shadow-2xl border border-slate-800/60 bg-slate-900/50">
                  {content?.poster_url ? (
                    <img
                      src={content.poster_url}
                      alt={content.title}
                      className="w-full aspect-[2/3] object-cover"
                    />
                  ) : (
                    <div className="aspect-[2/3] w-full bg-slate-800/50" />
                  )}
                </div>

                {/* Info */}
                <div className="space-y-6">
                  <div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight drop-shadow-md">
                      {content?.title ?? t('watch.title')}
                    </h1>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                      {content?.year ? (
                        <Badge variant="outline" className="border-slate-700 bg-slate-900/60 text-slate-200">
                          {content.year}
                        </Badge>
                      ) : null}
                      {content?.runtime ? (
                        <Badge variant="outline" className="border-slate-700 bg-slate-900/60 text-slate-200">
                          {content.runtime} min
                        </Badge>
                      ) : null}
                      {(content?.category?.name || content?.category || content?.content_type) ? (
                        <Badge variant="outline" className="border-slate-700 bg-slate-900/60 text-slate-200 capitalize">
                          {content?.category?.name ?? content?.category ?? content?.content_type}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {content?.description ? (
                    <section className="space-y-2">
                      <h2 className="text-sm font-semibold text-slate-300">{t('watch.synopsis')}</h2>
                      <p className="text-sm leading-relaxed text-slate-200/90" style={{ textAlign: 'justify' }}>
                        {content.description}
                      </p>
                    </section>
                  ) : null}

                  {/* Action buttons: Favorites + Play Now */}
                  {(() => {
                    const tLower = String(content?.content_type || '').toLowerCase();
                    const catRaw = String(
                      content?.category?.category_type ??
                      content?.category?.name ??
                      content?.category ??
                      ''
                    ).toLowerCase();

                    const isMovieLike = tLower === 'movie' || tLower === 'movies' || tLower === 'vod' || catRaw === 'vod';
                    const isKids = catRaw === 'kids' || tLower === 'kids';
                    const hideForSeries = tLower === 'series' || tLower === 'show' || tLower === 'shows' || catRaw === 'series';
                    const hideForAnime = catRaw === 'anime';

                    const shouldShowPlay = (isMovieLike || isKids) && !(hideForSeries || hideForAnime);

                    // Determine content type for favorites
                    const favoriteContentType = (hideForSeries || hideForAnime) ? 'series' : 'movie';

                    return (
                      <div className="flex flex-wrap items-center gap-4 pt-3">
                        {/* Favorites Button */}
                        <FavoriteButton
                          contentType={favoriteContentType as 'movie' | 'series'}
                          contentId={String(contentId)}
                          showLabel={true}
                          variant="default"
                          className="h-14 px-8 text-lg rounded-xl border-2 border-slate-600 bg-slate-900/70 hover:bg-slate-800/80 hover:border-slate-500"
                          iconClassName="h-6 w-6"
                        />

                        {/* Play Now Button (Movies/Kids only) */}
                        {shouldShowPlay && (
                          <Button
                            onClick={startPlaybackModal}
                            size="lg"
                            className="h-14 px-8 text-lg rounded-xl border-2 border-slate-500 bg-slate-800/80 text-slate-100 hover:bg-slate-700/90 hover:border-slate-400 transition-all"
                          >
                            <Play className="mr-3 h-6 w-6" />
                            {t('watch.playNow')}
                          </Button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Seasons & Episodes (for episodic content) */}
                  {seasons?.length ? (
                    <section className="space-y-4">
                      <h2 className="text-xl font-semibold">{t('watch.seasons')}</h2>
                      <Tabs defaultValue={String(activeSeasonId ?? seasons[0]?.id)} key={`season-tabs-${activeSeasonId}`} className="w-full">
                        <TabsList className="mb-2 flex w-full items-center gap-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-1">
                          {seasons.map((s: any, idx: number) => (
                            <TabsTrigger
                              key={`season-tab-${s.id}-${idx}`}
                              value={String(s.id)}
                              className="rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-blue-600/30 data-[state=active]:text-white text-slate-300 hover:bg-slate-900/70"
                            >
                              {String(t('watch.seasonShort', { n: s.season_number ?? idx + 1 }))}
                            </TabsTrigger>
                          ))}
                        </TabsList>

                        {seasons.map((s: any, idx: number) => {
                          const eps = episodesBySeason[s.id] || [];
                          return (
                            <TabsContent key={`season-panel-${s.id}-${idx}`} value={String(s.id)} className="mt-2">
                              {eps.length ? (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {eps.map((e: any, eidx: number) => {
                                    const epThumb = (e as any)?.image_url || (e as any)?.poster_url || (e as any)?.backdrop_url || '';
                                    const isActiveEpisode = e.id === currentEpisodeId || e.id === episodeIdFromUrl;
                                    return (
                                      <button
                                        key={`ep-${e.id}-${eidx}`}
                                        onClick={() => startPlaybackModalEpisode(e.id as number)}
                                        className={cn(
                                          "relative flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-all",
                                          isActiveEpisode
                                            ? "border-blue-500 bg-blue-500/20 text-white ring-1 ring-blue-500/50"
                                            : "border-slate-800 bg-slate-900/50 text-slate-200 hover:bg-slate-900/70"
                                        )}
                                      >
                                        {isActiveEpisode && (
                                          <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-blue-500" />
                                        )}
                                        <span className={cn(
                                          "h-12 w-20 flex-shrink-0 overflow-hidden rounded-md bg-slate-800/40",
                                          isActiveEpisode ? "ring-2 ring-blue-500" : "ring-1 ring-slate-800"
                                        )}>
                                          {epThumb ? (
                                            <img
                                              src={epThumb}
                                              alt={e.title || `E${e.episode_number ?? eidx + 1}`}
                                              className="h-full w-full object-cover"
                                            />
                                          ) : (
                                            <span className="block h-full w-full bg-slate-800/60" />
                                          )}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate">
                                          <span className={cn("font-semibold", isActiveEpisode && "text-blue-300")}>
                                            {String(t('watch.episodeLabel', { n: e.episode_number ?? eidx + 1 }))}
                                          </span>
                                          {e.title ? <span className={cn("ml-2", isActiveEpisode ? "text-blue-200" : "text-slate-300")}>{e.title}</span> : null}
                                        </span>
                                        <span className={cn("text-xs", isActiveEpisode ? "text-blue-300" : "text-slate-400")}>
                                          {(e as any)?.runtime ? `${(e as any).runtime}m` : ''}
                                        </span>
                                        {isActiveEpisode && (
                                          <Play className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">{t('watch.noEpisodes')}</p>
                              )}
                            </TabsContent>
                          );
                        })}
                      </Tabs>
                    </section>
                  ) : null}

                  {/* General play removed for series detail to encourage episode selection */}

                  {content?.drm_keys ? (
                    <div className="text-xs text-yellow-400/90">
                      {t('watch.drmNotice')}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Related / Recommended */}
          <div className="w-full px-4 md:px-6 pb-16">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">{t('watch.related')}</h2>
              {loadingRelated ? (
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`rel-skel-${i}`} className="h-40 w-64 flex-shrink-0 rounded-2xl bg-slate-800/60 animate-pulse" />
                  ))}
                </div>
              ) : related.length > 0 ? (
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                  {related.map((it, index) => {
                    const backgroundImage = toBackgroundImage(it.backdrop || it.image, fallbackCardBackgrounds[index % fallbackCardBackgrounds.length]);
                    return (
                      <Link
                        key={`rel-${it.id}`}
                        href={`/user/content/${it.id}/watch`}
                        className="group relative w-[240px] flex-shrink-0"
                      >
                        <div
                          className="h-40 rounded-2xl bg-cover bg-center transition-transform duration-300 group-hover:-translate-y-1"
                          style={{ backgroundImage }}
                        >
                          <div className="flex h-full w-full flex-col justify-end rounded-2xl bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent p-4">
                            <p className="mt-1 text-sm font-semibold text-white line-clamp-2">{it.title}</p>
                            {it.year ? <span className="text-xs text-slate-300">{it.year}</span> : null}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400">{t('watch.noRelated')}</p>
              )}
            </section>
          </div>

          {/* Mobile bottom nav - flat */}
          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-white/10 bg-white/[0.03] backdrop-blur px-6 py-3 text-xs md:hidden">
            {menuItems.map((item: any) => {
              const Icon = item.icon;

              // Same normalized active logic as desktop
              let isActive = false;
              const baseActive = pathname === item.basePath || pathname.startsWith(`${item.basePath}/`);

              if (item.basePath === ROUTES.CONTENT.BROWSE) {
                let itemTab = '';
                let itemCategory = '';
                try {
                  const u = new URL(item.href, 'https://local');
                  itemTab = (u.searchParams.get('tab') || '').toLowerCase();
                  itemCategory = (u.searchParams.get('category') || '').toLowerCase();
                } catch { }

                if (itemTab) {
                  isActive = (inferredActiveQuery.tab || '') === itemTab;
                } else if (itemCategory) {
                  isActive = (inferredActiveQuery.category || '') === itemCategory;
                } else {
                  isActive = false;
                }
              } else {
                isActive = baseActive;
              }

              return (
                <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1">
                  <Icon className={cn('h-5 w-5', isActive ? 'text-white' : 'text-white/70')} />
                  <span className={cn('text-[11px]', isActive ? 'text-white' : 'text-white/60')}>{t(`user.menu.${item.key}`)}</span>
                </Link>
              );
            })}
          </div>
        </main>

        {/* Modal overlay player (90vw wide, height auto with max 90vh) */}
        <Dialog
          open={playerOpen}
          onOpenChange={(open) => {
            setPlayerOpen(open);
            if (!open) {
              try { videoRef.current?.pause(); } catch { }
              setIsPlaying(false);
              try { hlsRef.current?.destroy(); } catch { }
              hlsRef.current = null;
              if (shakaRef.current) {
                try { shakaRef.current.destroy(); } catch { }
                shakaRef.current = null;
              }
            }
          }}
        >
          <DialogContent className="p-0 bg-black border-slate-800 max-w-[90vw] w-[90vw] sm:max-w-[90vw]">
            <DialogTitle className="sr-only">
              {content?.title ?? t('watch.title')}
            </DialogTitle>
            <div
              ref={playerRootRef}
              className="relative w-full"
              style={{ width: '90vw' }}
            >
              <ModernVideoPlayer
                ref={videoRef}
                src={!playerInitialized ? (streamUrl ? streamUrl : '') : ''}
                poster={content?.poster_url ?? content?.image_url ?? ''}
                subtitles={subtitles.map(s => ({
                  ...s,
                  url: toProxiedSubtitleUrl(s.url)
                }))}
                onSubtitleChange={(index: number) => {
                  setSelectedSubtitleIndex(index);
                  if (index === -1) {
                    disableAllSubtitles();
                  } else {
                    applySubtitleSelection(index);
                  }
                }}
                onPlaybackRateChange={(rate) => {
                  setPlaybackRate(rate);
                  setSpeed(rate);
                }}
                className="w-full aspect-video"
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Stream Quality Selector Overlay */}
        {showStreamSelector && availableStreams.length > 1 && (
          <StreamSelector
            streams={availableStreams}
            selectedStreamId={selectedStreamId}
            onSelect={handleStreamSelected}
            onClose={() => {
              // Close without playing — user dismissed
              setShowStreamSelector(false);
              setAvailableStreams([]);
              setPendingEpisodeId(null);
            }}
          />
        )}
      </div>
    </UserRoute >
  );
}
