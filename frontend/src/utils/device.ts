/**
 * Browser device fingerprint utilities for stable device registration in the frontend.
 * Stores a stable device_id and a human-friendly device_name in localStorage.
 */

function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function detectOS(): string {
  if (typeof navigator === 'undefined') return 'Unknown OS';
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).platform || '';

  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/win/i.test(platform)) return 'Windows';
  if (/mac/i.test(platform)) return 'macOS';
  if (/linux/i.test(platform)) return 'Linux';
  return 'Unknown OS';
}

function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent || '';

  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return 'Safari';
  if (/opr\//i.test(ua)) return 'Opera';
  return 'Browser';
}

function defaultDeviceName(): string {
  const os = detectOS();
  const br = detectBrowser();
  return `${os} · ${br}`;
}

function generateDeviceId(): string {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }
  } catch {
    // ignore
  }

  // Fallback: pseudo-random plus weak fingerprint
  try {
    const pieces: string[] = [];
    if (typeof navigator !== 'undefined') {
      pieces.push(navigator.userAgent || '');
      pieces.push((navigator as any).platform || '');
      pieces.push((navigator as any).language || '');
    }
    if (typeof screen !== 'undefined') {
      pieces.push(String(screen.width));
      pieces.push(String(screen.height));
      pieces.push(String((screen as any).colorDepth || ''));
    }
    pieces.push(String(Date.now()));
    const raw = pieces.join('|');

    // Simple hash
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    const rand = Math.floor(Math.random() * 1e9).toString(36);
    return `web-${Math.abs(hash).toString(36)}-${rand}`;
  } catch {
    return `web-${Date.now().toString(36)}`;
  }
}

const STORAGE_KEYS = {
  DEVICE_ID: 'iptv_device_id',
  DEVICE_NAME: 'iptv_device_name'} as const;

export function getOrCreateBrowserDevice(): { id: string; name: string } {
  // 1) Try to read existing
  let id = safeLocalStorageGet(STORAGE_KEYS.DEVICE_ID);
  let name = safeLocalStorageGet(STORAGE_KEYS.DEVICE_NAME);

  // 2) Create new if missing
  if (!id) {
    id = generateDeviceId();
    safeLocalStorageSet(STORAGE_KEYS.DEVICE_ID, id);
  }

  if (!name) {
    name = defaultDeviceName();
    safeLocalStorageSet(STORAGE_KEYS.DEVICE_NAME, name);
  }

  return { id, name };
}

/**
 * Update the stored device name (user-customizable).
 */
export function setBrowserDeviceName(newName: string): void {
  const name = String(newName || '').trim() || defaultDeviceName();
  safeLocalStorageSet(STORAGE_KEYS.DEVICE_NAME, name);
}

/**
 * Force a new device id (not recommended, but available if needed).
 * Useful for debugging; production flows should keep device ID stable per browser profile.
 */
export function resetBrowserDeviceId(): string {
  const id = generateDeviceId();
  safeLocalStorageSet(STORAGE_KEYS.DEVICE_ID, id);
  return id;
}