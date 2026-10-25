export type StreamKind = 'HLS' | 'DASH' | 'MP4' | 'OTHER';

/** Check the URL path AND query-param values for a manifest extension. */
const hasExt = (url: string, ext: string): boolean => {
  const re = new RegExp(`\\.${ext}([?&#]|$)`, 'i');
  if (re.test(url)) return true;
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : undefined);
    for (const val of u.searchParams.values()) {
      if (re.test(val)) return true;
    }
  } catch { /* ignore */ }
  return false;
};

export const inferVideoType = (url: string): string => {
  if (hasExt(url, 'm3u8')) return 'application/x-mpegURL';
  if (hasExt(url, 'mpd')) return 'application/dash+xml';
  const cleaned = url.split('?')[0]?.toLowerCase() ?? url.toLowerCase();
  if (cleaned.endsWith('.webm')) return 'video/webm';
  if (cleaned.endsWith('.ogv') || cleaned.endsWith('.ogg')) return 'video/ogg';
  if (cleaned.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
};

export const streamKind = (url?: string | null): StreamKind => {
  if (!url) return 'OTHER';
  if (hasExt(url, 'm3u8')) return 'HLS';
  if (hasExt(url, 'mpd')) return 'DASH';
  const cleaned = url.split('?')[0]?.toLowerCase() ?? url.toLowerCase();
  if (cleaned.endsWith('.mp4') || cleaned.endsWith('.mov') || cleaned.endsWith('.webm')) return 'MP4';
  return 'OTHER';
};
