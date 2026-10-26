import { hasAuth, requireAuthEnabled, validateUpstreamUrl } from '../proxyUtils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streaming proxy for media manifests and segments.
 * Accepts absolute http(s) URL via ?url= and streams it with permissive CORS.
 */

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'Range, Accept, Origin, Referer, User-Agent, Authorization',
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
  out.set('access-control-allow-headers', 'Range, Accept, Origin, Referer, User-Agent, Authorization');
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

function getProxyPath(req: Request): string {
  const requestPath = new URL(req.url).pathname;
  const routeSuffix = '/api/proxy/stream';
  const routeIndex = requestPath.lastIndexOf(routeSuffix);
  return routeIndex >= 0 ? `${requestPath.slice(0, routeIndex)}${routeSuffix}` : routeSuffix;
}

function createProxyUrl(url: string, headers: URLSearchParams, proxyPath: string): string {
  const params = new URLSearchParams({ url });
  appendHeaderParams(params, headers);
  return `${proxyPath}?${params.toString()}`;
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

  const originParam = searchParams.get('origin');
  const userAgentParam = searchParams.get('user_agent');
  const refererParam = searchParams.get('referer');
  const customHeadersParam = searchParams.get('custom_headers');

  if (originParam) {
    h.set('origin', originParam);
  } else {
    copy('origin');
  }

  if (userAgentParam) {
    h.set('user-agent', userAgentParam);
  } else {
    copy('user-agent');
  }

  if (refererParam) {
    h.set('referer', refererParam);
  } else {
    copy('referer');
  }

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

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    const urlLower = validated.url.toLowerCase();
    const isHlsExtension = urlLower.includes('.m3u8') || urlLower.includes('.m3u');
    const isLikelyHlsContent =
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      contentType.includes('audio/mpegurl') ||
      contentType.includes('text/plain') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('text/html');

    let text = '';
    let isHlsContent = false;

    if (upstream.ok) {
      if (isHlsExtension || isLikelyHlsContent) {
        text = await upstream.text();
        const trimmedText = text.trimStart();
        if (trimmedText.startsWith('#EXTM3U') || isHlsExtension || contentType.includes('mpegurl')) {
          isHlsContent = true;
        }
      }
    }

    if (isHlsContent && upstream.ok) {
      const baseUrl = new URL(upstream.url || validated.url);
      const headerParams = buildHeaderParams(searchParams);
      const proxyPath = getProxyPath(req);

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith('#')) {
          if (!/\bURI="([^"]+)"/i.test(line)) return line;
          return line.replace(/\bURI="([^"]+)"/gi, (attribute, reference: string) => {
            try {
              const absolute = new URL(reference, baseUrl).toString();
              return `URI="${createProxyUrl(absolute, headerParams, proxyPath)}"`;
            } catch {
              return attribute;
            }
          });
        }

        try {
          // Resolve relative or absolute URLs against the manifest URL
          const absolute = new URL(trimmed, baseUrl).toString();
          // Always proxy segment URLs through the stream proxy to guarantee CORS and SSL match
          return createProxyUrl(absolute, headerParams, proxyPath);
        } catch {
          return line;
        }
      }).join('\n');

      const headers = passthrough(upstream);
      headers.set('content-type', 'application/x-mpegurl');
      headers.delete('content-length');
      headers.set('content-length', String(new TextEncoder().encode(rewritten).length));

      return new Response(rewritten, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers
      });
    }

    if (text) {
      const headers = passthrough(upstream);
      return new Response(text, {
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
