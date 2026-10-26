export type StreamHeaderOverrides = {
  origin?: string | null;
  userAgent?: string | null;
  user_agent?: string | null;
  referer?: string | null;
  customHeaders?: string | null;
  custom_headers?: string | null;
};

export type NormalizedStreamHeaders = {
  origin?: string;
  user_agent?: string;
  referer?: string;
  custom_headers?: string;
};

const STREAM_PROXY_ROUTE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/proxy/stream`;

export function normalizeStreamHeaders(overrides?: StreamHeaderOverrides | null): NormalizedStreamHeaders {
  if (!overrides) return {};
  const origin = (overrides.origin ?? '').trim();
  const userAgent = (overrides.user_agent ?? overrides.userAgent ?? '').trim();
  const referer = (overrides.referer ?? '').trim();
  const customHeaders = (overrides.custom_headers ?? overrides.customHeaders ?? '').trim();
  return {
    origin: origin || undefined,
    user_agent: userAgent || undefined,
    referer: referer || undefined,
    custom_headers: customHeaders || undefined};
}

export function hasStreamHeaderOverrides(headers: NormalizedStreamHeaders): boolean {
  return !!(headers.origin || headers.user_agent || headers.referer || headers.custom_headers);
}

export function appendStreamHeaderParams(params: URLSearchParams, headers: NormalizedStreamHeaders): void {
  if (headers.origin) params.set('origin', headers.origin);
  if (headers.user_agent) params.set('user_agent', headers.user_agent);
  if (headers.referer) params.set('referer', headers.referer);
  if (headers.custom_headers) params.set('custom_headers', headers.custom_headers);
}

/** Proxies insecure HTTP streams through the app's HTTPS origin. */
export function toProxiedStreamUrl(input: string, overrides?: StreamHeaderOverrides | null): string {
  const headers = normalizeStreamHeaders(overrides);
  const shouldProxyForHeaders = hasStreamHeaderOverrides(headers);

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    const url = new URL(input, base);

    if (url.pathname.endsWith('/api/proxy/stream')) {
      appendStreamHeaderParams(url.searchParams, headers);
      return `${STREAM_PROXY_ROUTE}?${url.searchParams.toString()}`;
    }

    if (url.protocol !== 'http:' && !shouldProxyForHeaders) return input;

    const params = new URLSearchParams({ url: url.toString() });
    appendStreamHeaderParams(params, headers);
    return `${STREAM_PROXY_ROUTE}?${params.toString()}`;
  } catch {
    return input;
  }
}
