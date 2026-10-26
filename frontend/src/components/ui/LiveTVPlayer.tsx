'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX, Settings, Cast } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { streamKind } from '@/components/admin/contentManagement/stream';
import { toProxiedStreamUrl } from '@/lib/streamProxy';

type LiveTVPlayerProps = {
  src: string | null | undefined;
  title?: string;
  poster?: string;
  autoPlay?: boolean;
  className?: string;
  aspectClassName?: string;
  drmKeys?: string | null;
  drmKeysExo?: string | null;
  licenseServerUrl?: string | null;
  drmType?: 'clearkey' | 'widevine' | 'playready' | null;
  drmHeaders?: Record<string, string> | null;
  origin?: string | null;
  userAgent?: string | null;
  referer?: string | null;
  customHeaders?: string | null;
};

export default function LiveTVPlayer({
  src,
  title,
  poster,
  autoPlay = true,
  className = '',
  aspectClassName = 'aspect-video',
  drmKeys,
  drmKeysExo,
  licenseServerUrl,
  drmType,
  origin: headerOrigin,
  userAgent: headerUserAgent,
  referer: headerReferer,
  customHeaders: headerCustomHeaders }: LiveTVPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(!!autoPlay);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const controlTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hlsRef = useRef<any>(null);
  const shakaPlayerRef = useRef<any>(null);
  const playerTitle = title ?? t('user.live.title');
  const playbackErrorText = t('user.live.playbackError', {
    defaultValue: t('user.live.streamFailed')
  });

  function normalizeStreamUrl(input: string): string {
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const u = new URL(input, base);
      if (u.origin === base) return u.href;
      if (u.pathname.startsWith('/api/')) {
        return `${u.pathname}${u.search}${u.hash}`;
      }
      const apiBase = process.env.NEXT_PUBLIC_API_URL as string | undefined;
      if (apiBase) {
        try {
          const api = new URL(apiBase);
          if (u.origin === api.origin && u.pathname.startsWith('/api/')) {
            return `${u.pathname}${u.search}${u.hash}`;
          }
        } catch { }
      }
      return input;
    } catch {
      return input;
    }
  }

  async function playNative(video: HTMLVideoElement, streamUrl: string): Promise<void> {
    video.src = normalizeStreamUrl(streamUrl);
    if (autoPlay) {
      video.muted = true;
      video.volume = volume;
      try {
        await video.play();
        setIsPlaying(true);
        setTimeout(() => {
          const v = videoRef.current;
          if (v && !v.paused) {
            v.muted = false;
            setIsMuted(false);
          }
        }, 500);
      } catch {
        setIsPlaying(false);
      }
    }
  }

  function isUUID(s?: string) {
    return !!s && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
  }
  function cleanHex32(s?: string | null): string | null {
    if (!s) return null;
    let v = s.trim();
    if (isUUID(v)) v = v.replace(/-/g, '');
    v = v.replace(/[^0-9a-fA-F]/g, '');
    if (v.length === 32) return v.toLowerCase();
    return null;
  }
  function b64ToHex(s?: string | null): string | null {
    if (!s) return null;
    try {
      let v = s.trim().replace(/-/g, '+').replace(/_/g, '/');
      while (v.length % 4 !== 0) v += '=';
      const bin = typeof window !== 'undefined' ? window.atob(v) : Buffer.from(v, 'base64').toString('binary');
      let hex = '';
      for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
      return hex.toLowerCase();
    } catch {
      return null;
    }
  }
  function toHex32(s?: string | null): string | null {
    return cleanHex32(s) ?? b64ToHex(s);
  }
  function buildClearKeyMap(keys?: string | null, exo?: string | null): Record<string, string> {
    const map: Record<string, string> = {};

    if (keys && keys.trim()) {
      keys.split(',').forEach((pair) => {
        const [kid, key] = pair.split(':');
        if (kid && key) {
          const kidHex = toHex32(kid.trim());
          const keyHex = toHex32(key.trim());
          if (kidHex && keyHex) {
            map[kidHex] = keyHex;
          }
        }
      });
    }

    if (exo && exo.trim().startsWith('{')) {
      try {
        const parsed: any = JSON.parse(exo.trim());
        if (parsed && Array.isArray(parsed.keys)) {
          for (const item of parsed.keys) {
            if (item?.kid && item?.k) {
              const kidHex = toHex32(item.kid);
              const keyHex = toHex32(item.k);
              if (kidHex && keyHex) {
                map[kidHex] = keyHex;
              }
            }
          }
        }
      } catch { }
    }

    return map;
  }

  const loadExternalScript = async (id: string, scriptSrc: string) => {
    return new Promise<void>((resolve, reject) => {
      if (document.getElementById(id)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = scriptSrc;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      s.id = id;
      document.body.appendChild(s);
    });
  };

  async function loadHlsCtor(): Promise<any | null> {
    try {
      const mod: any = await import('hls.js');
      return mod?.default ?? mod;
    } catch {
      return null;
    }
  }


  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      teardown();
      return;
    }

    let cancelled = false;
    setErr(null);

    async function setup() {
      teardown();
      await new Promise(resolve => setTimeout(resolve, 50));
      if (!src) return;
      const normalizedSrc = normalizeStreamUrl(src);

      // Build custom headers map from admin-configured stream headers
      // NOTE: Browsers block setting Origin and User-Agent via XHR (forbidden
      // headers). For those to work a backend stream proxy is needed.
      // Referer and custom headers DO work client-side.
      const streamHeaders: Record<string, string> = {};
      if (headerReferer) streamHeaders['Referer'] = headerReferer;
      if (headerOrigin) streamHeaders['Origin'] = headerOrigin;
      if (headerUserAgent) streamHeaders['User-Agent'] = headerUserAgent;
      if (headerCustomHeaders) {
        try {
          const parsed = typeof headerCustomHeaders === 'string'
            ? JSON.parse(headerCustomHeaders)
            : headerCustomHeaders;
          if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([k, v]) => {
              if (typeof v === 'string') streamHeaders[k] = v;
            });
          }
        } catch { /* ignore invalid JSON */ }
      }
      const hasCustomHeaders = Object.keys(streamHeaders).length > 0;
      const directSrc = toProxiedStreamUrl(normalizedSrc, {
        origin: headerOrigin,
        userAgent: headerUserAgent,
        referer: headerReferer,
        customHeaders: typeof headerCustomHeaders === 'string' ? headerCustomHeaders : undefined,
      });
      const kind = streamKind(directSrc);

      try {
        if (kind === 'HLS') {
          // Safari/iOS: native HLS
          const canNative = !!video?.canPlayType('application/vnd.apple.mpegurl');
          if (canNative && video) {
            console.info('[LiveTVPlayer] HLS native playback (Safari/iOS)');
            await playNative(video, directSrc);
            return;
          }

          // hls.js – handles PHP proxy URLs (stream.php?url=...m3u8) that
          // Shaka Player cannot play due to text/html Content-Type responses.
          const HlsCtor = await loadHlsCtor();
          if (cancelled) return;
          if (HlsCtor?.isSupported?.() && video) {
            console.info('[LiveTVPlayer] HLS branch via hls.js', hasCustomHeaders ? streamHeaders : '');
            const hlsConfig: any = {
              enableWorker: true,
              lowLatencyMode: true
            };
            // Inject custom headers into every XHR request hls.js makes
            if (hasCustomHeaders) {
              hlsConfig.xhrSetup = (xhr: XMLHttpRequest, _url: string) => {
                for (const [key, value] of Object.entries(streamHeaders)) {
                  try { xhr.setRequestHeader(key, value); } catch { /* forbidden header */ }
                }
              };
            }
            const hls = new HlsCtor(hlsConfig);
            hlsRef.current = hls;

            hls.on(HlsCtor.Events.ERROR, (_event: any, data: any) => {
              if (!data?.fatal) return;
              console.error('[LiveTVPlayer] hls.js fatal error:', data.type, data.details);
              setErr(`${playbackErrorText} [${String(data.details ?? 'HLS_ERROR')}]`);
            });

            hls.loadSource(directSrc);
            hls.attachMedia(video);

            // Wait for manifest before autoplay to avoid premature play() calls
            if (autoPlay) {
              hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
                if (cancelled) return;
                video.muted = true;
                video.volume = volume;
                video.play()
                  .then(() => {
                    setIsPlaying(true);
                    setTimeout(() => {
                      const v = videoRef.current;
                      if (v && !v.paused) { v.muted = false; setIsMuted(false); }
                    }, 500);
                  })
                  .catch(() => setIsPlaying(false));
              });
            }
            return;
          }

          // Last resort: try native
          if (video) { await playNative(video, directSrc); return; }
        }

        if (kind === 'DASH') {
          console.info('[LiveTVPlayer] DASH branch via Shaka Player');
          await loadExternalScript('shaka-player-lib', '/vendor/shaka-player.compiled.min.js');
          const ShakaCtor = (window as any).shaka;
          if (cancelled) return;

          if (ShakaCtor) {
            if (ShakaCtor?.Player?.isBrowserSupported && !ShakaCtor.Player.isBrowserSupported()) {
              setErr('Browser does not support DASH playback.');
              if (video) { video.src = directSrc; if (autoPlay) { video.muted = true; await video.play().catch(() => setIsPlaying(false)); } }
              return;
            }

            const player = new ShakaCtor.Player();
            await player.attach(video);
            shakaPlayerRef.current = player;

            if (player?.addEventListener) {
              player.addEventListener('error', (ev: any) => {
                const detail = ev?.detail || ev;
                console.error('[LiveTVPlayer] Shaka error:', detail);
                const code = detail?.code ? ` (${detail.code})` : '';
                setErr(`${playbackErrorText}${code}`);
              });
            }

            const clearMap = buildClearKeyMap(drmKeys ?? undefined, drmKeysExo ?? undefined);
            const drmConfig: any = {
              retryParameters: { maxAttempts: 3, baseDelay: 1000, backoffFactor: 2, fuzzFactor: 0.5 }
            };

            const useWidevine = !!licenseServerUrl && (drmType === 'widevine' || !drmType);
            const usePlayReady = !!licenseServerUrl && drmType === 'playready';

            if (useWidevine) {
              drmConfig.servers = { 'com.widevine.alpha': licenseServerUrl };
              drmConfig.advanced = {
                'com.widevine.alpha': { videoRobustness: 'SW_SECURE_CRYPTO', audioRobustness: 'SW_SECURE_CRYPTO' }
              };
            } else if (usePlayReady) {
              drmConfig.servers = { 'com.microsoft.playready': licenseServerUrl };
            } else if (clearMap && Object.keys(clearMap).length > 0) {
              drmConfig.clearKeys = clearMap;
              drmConfig.preferredKeySystems = ['org.w3.clearkey'];
            } else {
              drmConfig.preferredKeySystems = ['org.w3.clearkey'];
            }

            player.configure({ drm: drmConfig });

            // Inject custom headers into Shaka network requests
            if (hasCustomHeaders) {
              const net = player.getNetworkingEngine();
              if (net) {
                net.registerRequestFilter((_type: any, request: any) => {
                  for (const [key, value] of Object.entries(streamHeaders)) {
                    request.headers[key] = value;
                  }
                });
              }
            }

            await player.load(directSrc, undefined, 'application/dash+xml');

            if (autoPlay && video) {
              video.muted = true;
              video.volume = volume;
              try {
                await video.play();
                setIsPlaying(true);
                setTimeout(() => {
                  const v = videoRef.current;
                  if (v && !v.paused) { v.muted = false; setIsMuted(false); }
                }, 500);
              } catch (e) {
                setIsPlaying(false);
              }
            }
          } else if (video) {
            await playNative(video, directSrc);
          } else {
            setErr(t('user.live.streamError'));
          }
        } else if (video) {
          // Non-streaming files (.mp4, .webm, etc.)
          await playNative(video, directSrc);
        }
      } catch (e: any) {
        console.error('[LiveTVPlayer] setup error:', e);
        const msg = e?.message ? ` (${String(e.message)})` : '';
        setErr(`${t('user.live.streamFailed')}${msg}`);
      }
    }

    setup();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [
    src,
    autoPlay,
    drmKeys,
    drmKeysExo,
    licenseServerUrl,
    drmType
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.volume = volume;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = () => setErr(playbackErrorText);
    const onFsChange = () => {
      const el = document.fullscreenElement || (document as any).webkitFullscreenElement;
      setIsFullscreen(!!el);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange as any);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange as any);
    };
  }, []);

  function teardown() {
    try {
      const v = videoRef.current;
      if (v) v.pause();
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch { }
        hlsRef.current = null;
      }
      if (shakaPlayerRef.current) {
        try { shakaPlayerRef.current.destroy(); } catch { }
        shakaPlayerRef.current = null;
      }
      if (v) {
        v.removeAttribute('src');
        v.srcObject = null;
        v.load();
      }
      setErr(null);
    } catch { }
  }

  const togglePlayPause = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      await v.play().catch(() => setIsPlaying(false));
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const onVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const nv = parseFloat(e.target.value);
    v.volume = nv;
    setVolume(nv);
    if (nv === 0) {
      v.muted = true;
      setIsMuted(true);
    } else if (isMuted) {
      v.muted = false;
      setIsMuted(false);
    }
  };

  const toggleFullscreen = async () => {
    const cont = containerRef.current;
    if (!cont) return;
    if (!isFullscreen) {
      if (cont.requestFullscreen) await cont.requestFullscreen();
      else if ((cont as any).webkitRequestFullscreen) await (cont as any).webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
    }
  };

  const handleInteract = () => {
    setShowControls(true);
    if (controlTimeoutRef.current) clearTimeout(controlTimeoutRef.current);
    controlTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 2500);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleInteract}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={handleInteract}
      className={cn(
        'relative w-full group overflow-hidden bg-black',
        aspectClassName,
        className
      )}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        poster={poster}
        playsInline
        controls={false}
      />

      <div className={cn(
        "absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-6 transition-opacity duration-300 pointer-events-none",
        showControls || !isPlaying ? "opacity-100" : "opacity-0"
      )}>
        <h2 className="text-lg font-bold text-white drop-shadow-md">{playerTitle}</h2>
      </div>

      {!isPlaying && !err && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-white/10 p-4 backdrop-blur-sm border border-white/20 shadow-2xl">
            <Play className="h-12 w-12 text-white fill-white" />
          </div>
        </div>
      )}

      <div className={cn(
        "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pb-6 transition-all duration-300",
        showControls || !isPlaying ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      )}>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white rounded-full h-10 w-10 transition-colors" onClick={togglePlayPause}>
            {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
          </Button>

          <div className="flex items-center gap-2 group/volume">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white rounded-full h-9 w-9" onClick={toggleMute}>
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            <div className="w-0 overflow-hidden group-hover/volume:w-24 transition-all duration-300 flex items-center">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={onVolumeChange}
                className="h-1 w-20 cursor-pointer rounded-full accent-blue-500 bg-white/20"
              />
            </div>
          </div>

          <div className="flex-1" />

          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9">
            <Cast className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9">
            <Settings className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-10 w-10" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {err ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 z-20">
          <div className="rounded-xl border border-red-500/30 bg-red-950/50 p-6 backdrop-blur-md max-w-md text-center">
            <h3 className="text-red-400 font-bold mb-2">{playbackErrorText}</h3>
            <p className="text-sm text-red-200">{err}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
