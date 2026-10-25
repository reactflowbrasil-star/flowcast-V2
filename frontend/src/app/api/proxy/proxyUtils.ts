const API_BASE_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw == null) return defaultValue;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

export function requireAuthEnabled(): boolean {
  return parseBoolEnv('STREAMCORE_PROXY_REQUIRE_AUTH', process.env.NODE_ENV !== 'development');
}

export function allowPrivateEnabled(): boolean {
  return parseBoolEnv('STREAMCORE_PROXY_ALLOW_PRIVATE', process.env.NODE_ENV === 'development');
}

export function getAllowedHosts(): string[] {
  const raw = process.env.STREAMCORE_PROXY_ALLOWED_HOSTS;

  // In production: require explicit allowlist. In development: default to '*' for convenience.
  if (!raw) {
    if (process.env.NODE_ENV === 'development') {
      return ['*'];
    }
    // Production without explicit allowlist: empty = proxy disabled
    return [];
  }

  const list = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return list;
}

/**
 * Extract the Bearer token from the request (Authorization header or cookie).
 * Returns the raw token string or null if not found.
 */
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

// Simple in-memory cache for validated tokens (token → expiry timestamp)
const tokenCache = new Map<string, number>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_CACHE_MAX_SIZE = 500;

function pruneTokenCache(): void {
  if (tokenCache.size <= TOKEN_CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, expiry] of tokenCache) {
    if (expiry < now) tokenCache.delete(key);
  }
  // If still too large, evict oldest entries
  if (tokenCache.size > TOKEN_CACHE_MAX_SIZE) {
    const entries = Array.from(tokenCache.entries());
    entries.sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, entries.length - TOKEN_CACHE_MAX_SIZE);
    for (const [key] of toRemove) tokenCache.delete(key);
  }
}

/**
 * Validate the JWT token by calling the backend /api/protected endpoint.
 * Uses an in-memory cache to avoid hitting the backend on every proxied segment request.
 */
export async function hasAuth(req: Request): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;

  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached > Date.now()) {
    return true;
  }

  // Validate against backend
  try {
    const resp = await fetch(`${API_BASE_URL}/api/protected`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (resp.ok) {
      pruneTokenCache();
      tokenCache.set(token, Date.now() + TOKEN_CACHE_TTL_MS);
      return true;
    }

    // Token is invalid — remove from cache if present
    tokenCache.delete(token);
    return false;
  } catch {
    // Network error to backend — be lenient in development, strict in production
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    return false;
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
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && c === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && c >= 16 && c <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && c === 168) return true;
  // 0.0.0.0/8, 100.64.0.0/10 (CGNAT)
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

  if (url.username || url.password) {
    return { ok: false, error: 'Credentials in URL are not allowed', status: 400 };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, error: 'Localhost is not allowed', status: 403 };
  }

  if (isIpV4(hostname) && isPrivateIpV4(hostname) && !allowPrivateEnabled()) {
    return { ok: false, error: 'Private IP ranges are not allowed', status: 403 };
  }

  const allowed = getAllowedHosts();
  if (allowed.length === 0) {
    return { ok: false, error: 'Proxy is disabled (no allowlist configured)', status: 403 };
  }

  if (!allowed.includes('*') && !allowed.includes(hostname)) {
    return { ok: false, error: `Host not allowed: ${hostname}`, status: 403 };
  }

  return { ok: true, url };
}
