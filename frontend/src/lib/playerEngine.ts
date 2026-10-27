import { API_CONFIG } from '@/constants/api';

export const PLAYER_ENGINES = ['auto', 'hlsjs', 'shaka', 'videojs', 'native'] as const;

export type PlayerEngine = (typeof PLAYER_ENGINES)[number];

export const DEFAULT_PLAYER_ENGINE: PlayerEngine = 'auto';

let cachedEngine: PlayerEngine = DEFAULT_PLAYER_ENGINE;
let cacheExpiresAt = 0;
let pendingRequest: Promise<PlayerEngine> | null = null;
const PLAYER_ENGINE_UPDATED_EVENT = 'flowcast:player-engine-updated';

export function notifyPlayerEngineUpdated(engine: PlayerEngine): void {
  cachedEngine = engine;
  cacheExpiresAt = Date.now() + 15_000;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PlayerEngine>(PLAYER_ENGINE_UPDATED_EVENT, { detail: engine }));
    try { window.localStorage.setItem('flowcast-player-engine-updated', JSON.stringify({ engine, at: Date.now() })); } catch { /* storage may be unavailable */ }
  }
}

export function subscribeToPlayerEngineUpdates(listener: (engine: PlayerEngine) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onLocalUpdate = (event: Event) => {
    const engine = (event as CustomEvent<unknown>).detail;
    if (isPlayerEngine(engine)) listener(engine);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== 'flowcast-player-engine-updated' || !event.newValue) return;
    try {
      const value = JSON.parse(event.newValue)?.engine;
      if (isPlayerEngine(value)) listener(value);
    } catch { /* ignore malformed storage events */ }
  };
  window.addEventListener(PLAYER_ENGINE_UPDATED_EVENT, onLocalUpdate);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PLAYER_ENGINE_UPDATED_EVENT, onLocalUpdate);
    window.removeEventListener('storage', onStorage);
  };
}

function isPlayerEngine(value: unknown): value is PlayerEngine {
  return typeof value === 'string' && PLAYER_ENGINES.includes(value as PlayerEngine);
}

/** Read the non-sensitive, administrator-selected playback engine. */
export async function getPreferredPlayerEngine(forceRefresh = false): Promise<PlayerEngine> {
  if (typeof window === 'undefined') return DEFAULT_PLAYER_ENGINE;
  if (!forceRefresh && Date.now() < cacheExpiresAt) return cachedEngine;
  if (!pendingRequest) {
    pendingRequest = (async () => {
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL.replace(/\/$/, '')}/api/public/config/ui`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        });
        if (response.ok) {
          const config = await response.json();
          if (isPlayerEngine(config?.player_engine)) cachedEngine = config.player_engine;
        }
      } catch {
        // Playback falls back to automatic selection if settings are unavailable.
      }
      cacheExpiresAt = Date.now() + 15_000;
      return cachedEngine;
    })().finally(() => {
      pendingRequest = null;
    });
  }
  return pendingRequest;
}

export async function loadVideoJs(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('Video.js is only available in a browser.');
  const globalWindow = window as any;
  globalWindow.HELP_IMPROVE_VIDEOJS = false;
  if (!document.getElementById('videojs-player-style')) {
    const link = document.createElement('link');
    link.id = 'videojs-player-style';
    link.rel = 'stylesheet';
    link.href = 'https://vjs.zencdn.net/8.23.4/video-js.min.css';
    document.head.appendChild(link);
  }
  if (!globalWindow.videojs) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.getElementById('videojs-player-lib') as HTMLScriptElement | null;
      const script = existing ?? document.createElement('script');
      script.id = 'videojs-player-lib';
      script.src = 'https://vjs.zencdn.net/8.23.4/video.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Video.js could not be loaded.'));
      if (!existing) document.body.appendChild(script);
    });
  }
  if (!globalWindow.videojs) throw new Error('Video.js did not initialize.');
  return globalWindow.videojs;
}
