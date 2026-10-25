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
