import { hasAuth, requireAuthEnabled, validateUpstreamUrl } from '../proxyUtils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Simple streaming proxy for media manifests and segments.
 * Accepts absolute http(s) URL via ?url= and streams it with permissive CORS.
 * 
 * IMPORTANT: This API route requires a Node.js server runtime to proxy requests.
 * The 'force-dynamic' export above ensures this route runs at runtime.
 */

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'Range, Accept, Origin, Referer, User-Agent',
      'access-control-max-age': '86400'
    }
  });
}

function passthrough(resp: Response): Headers {
  const out = new Headers();
  const copy = (n: string) => {
    const v = resp.headers.get(n);
    if (v) out.set(n, v);
  };
  // Common content headers
  copy('content-type');
  copy('content-length');
  copy('content-range');
  copy('accept-ranges');
  copy('content-encoding');
  copy('cache-control');
  copy('etag');
  copy('last-modified');
  // CORS
  out.set('access-control-allow-origin', '*');
  out.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
  out.set('access-control-allow-headers', 'Range, Accept, Origin, Referer, User-Agent');
  out.set('access-control-expose-headers', 'Content-Type, Content-Length, Accept-Ranges, Content-Range, ETag, Cache-Control, Last-Modified');
  return out;
}

function buildHeaderParams(searchParams: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  const origin = searchParams.get('origin');
  const userAgent = searchParams.get('user_agent');
  const referer = searchParams.get('referer');
  const customHeaders = searchParams.get('custom_headers');
  if (origin) out.set('origin', origin);
  if (userAgent) out.set('user_agent', userAgent);
  if (referer) out.set('referer', referer);
  if (customHeaders) out.set('custom_headers', customHeaders);
  return out;
}

function appendHeaderParams(target: URLSearchParams, headers: URLSearchParams): void {
  for (const [key, value] of headers.entries()) {
    target.set(key, value);
  }
}

function buildUpstreamHeaders(req: Request, searchParams: URLSearchParams): Headers {
  const h = new Headers();
  const copy = (n: string) => {
    const v = req.headers.get(n);
    if (v) h.set(n, v);
  };
  copy('range');
  copy('accept');
  copy('accept-language');

  // Priority: query params > request headers (allows channel-specific overrides)
  const originParam = searchParams.get('origin');
  const userAgentParam = searchParams.get('user_agent');
  const refererParam = searchParams.get('referer');
  const customHeadersParam = searchParams.get('custom_headers');

  // Apply Origin (query param or fallback to request header)
  if (originParam) {
    h.set('origin', originParam);
  } else {
    copy('origin');
  }

  // Apply User-Agent (query param or fallback to request header)
  if (userAgentParam) {
    h.set('user-agent', userAgentParam);
  } else {
    copy('user-agent');
  }

  // Apply Referer (query param or fallback to request header)
  if (refererParam) {
    h.set('referer', refererParam);
  } else {
    copy('referer');
  }

  // Apply custom headers from JSON string
  if (customHeadersParam) {
    try {
      const custom = JSON.parse(customHeadersParam);
      if (typeof custom === 'object' && custom !== null) {
        for (const [key, value] of Object.entries(custom)) {
          if (typeof value === 'string') {
            h.set(key, value);
          }
        }
      }
    } catch {
      // Invalid JSON, ignore
    }
  }

  // Avoid stale caches for live streams
  h.set('cache-control', 'no-cache');
  return h;
}

function invalidResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}

export async function HEAD(req: Request): Promise<Response> {
  const searchParams = new URL(req.url).searchParams;
  const urlParam = searchParams.get('url') || '';
  if (requireAuthEnabled() && !(await hasAuth(req))) return invalidResponse('Unauthorized', 401);

  const validated = validateUpstreamUrl(urlParam);
  if (!validated.ok) return invalidResponse(validated.error, validated.status);

  try {
    const upstream = await fetch(validated.url, {
      method: 'HEAD',
      headers: buildUpstreamHeaders(req, searchParams),
      redirect: 'follow'
    });
    return new Response(null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: passthrough(upstream)
    });
  } catch (e: any) {
    return invalidResponse(e?.message || 'Proxy HEAD failed', 502);
  }
}

export async function GET(req: Request): Promise<Response> {
  const searchParams = new URL(req.url).searchParams;
  const urlParam = searchParams.get('url') || '';
  if (requireAuthEnabled() && !(await hasAuth(req))) return invalidResponse('Unauthorized', 401);

  const validated = validateUpstreamUrl(urlParam);
  if (!validated.ok) return invalidResponse(validated.error, validated.status);

  try {
    const upstream = await fetch(validated.url, {
      method: 'GET',
      headers: buildUpstreamHeaders(req, searchParams),
      redirect: 'follow'
    });

    const contentType = upstream.headers.get('content-type') || '';
    const isHls = contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      contentType.includes('audio/mpegurl');

    if (isHls && upstream.ok) {
      const text = await upstream.text();
      const baseUrl = new URL(validated.url);
      const headerParams = buildHeaderParams(searchParams);
      const shouldProxyAll = headerParams.toString().length > 0;

      // Basic rewrite: find lines that are URLs (not starting with #)
      // and wrap them in the proxy
      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        try {
          // Resolve relative URLs against the manifest URL
          const absolute = new URL(trimmed, baseUrl).toString();

          // Hybrid Proxy: Only proxy nested playlists
          // This saves bandwidth by letting the browser fetch segments directly
          const isPlaylist = absolute.includes('.m3u8') || absolute.includes('.m3u');

          if (isPlaylist || shouldProxyAll) {
            const params = new URLSearchParams();
            params.set('url', absolute);
            appendHeaderParams(params, headerParams);
            return `/api/proxy/stream?${params.toString()}`;
          } else {
            // Return absolute direct URL for segments
            return absolute;
          }
        } catch {
          return line;
        }
      }).join('\n');

      const headers = passthrough(upstream);
      headers.delete('content-length'); // Body size changed
      headers.set('content-length', String(new TextEncoder().encode(rewritten).length));

      return new Response(rewritten, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: passthrough(upstream)
    });
  } catch (e: any) {
    return invalidResponse(e?.message || 'Proxy GET failed', 502);
  }
}
