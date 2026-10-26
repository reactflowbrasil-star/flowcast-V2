const API_BASE_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw == null) return defaultValue;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

export function requireAuthEnabled(): boolean {
  return parseBoolEnv('STREAMCORE_PROXY_REQUIRE_AUTH', false);
}

export function allowPrivateEnabled(): boolean {
  return parseBoolEnv('STREAMCORE_PROXY_ALLOW_PRIVATE', true);
}

export function getAllowedHosts(): string[] {
  const raw = process.env.STREAMCORE_PROXY_ALLOWED_HOSTS;
  if (!raw || raw.trim() === '') {
    return ['*'];
  }

  const list = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return list.length > 0 ? list : ['*'];
}

function extractToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  const cookie = req.headers.get('cookie') || '';
  const match = cookie.split(';').find((part) => part.trim().startsWith('iptv_auth_token='));
  if (match) {
    return match.trim().replace('iptv_auth_token=', '');
  }

  return null;
}

const tokenCache = new Map<string, number>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_CACHE_MAX_SIZE = 500;

function pruneTokenCache(): void {
  if (tokenCache.size <= TOKEN_CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, expiry] of tokenCache) {
    if (expiry < now) tokenCache.delete(key);
  }
  if (tokenCache.size > TOKEN_CACHE_MAX_SIZE) {
    const entries = Array.from(tokenCache.entries());
    entries.sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, entries.length - TOKEN_CACHE_MAX_SIZE);
    for (const [key] of toRemove) tokenCache.delete(key);
  }
}

export async function hasAuth(req: Request): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;

  const cached = tokenCache.get(token);
  if (cached && cached > Date.now()) {
    return true;
  }

  try {
    const resp = await fetch(`${API_BASE_URL}/api/protected`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });

    if (resp.ok) {
      pruneTokenCache();
      tokenCache.set(token, Date.now() + TOKEN_CACHE_TTL_MS);
      return true;
    }

    tokenCache.delete(token);
    return false;
  } catch {
    return true;
  }
}

function isIpV4(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function ipV4ToBytes(ip: string): number[] | null {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4) return null;
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function isPrivateIpV4(ip: string): boolean {
  const b = ipV4ToBytes(ip);
  if (!b) return false;
  const [a, c] = b;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && c === 254) return true;
  if (a === 172 && c >= 16 && c <= 31) return true;
  if (a === 192 && c === 168) return true;
  if (a === 0) return true;
  if (a === 100 && c >= 64 && c <= 127) return true;
  return false;
}

export function validateUpstreamUrl(urlParam: string): { ok: true; url: URL } | { ok: false; error: string; status: number } {
  let url: URL;
  try {
    url = new URL(urlParam);
  } catch {
    return { ok: false, error: 'Invalid url param', status: 400 };
  }

  if (!/^https?:$/.test(url.protocol)) {
    return { ok: false, error: 'Only http/https URLs are allowed', status: 400 };
  }

  const hostname = url.hostname.toLowerCase();
  const allowed = getAllowedHosts();

  if (!allowed.includes('*') && !allowed.includes(hostname)) {
    return { ok: false, error: `Host not allowed: ${hostname}`, status: 403 };
  }

  return { ok: true, url };
}
