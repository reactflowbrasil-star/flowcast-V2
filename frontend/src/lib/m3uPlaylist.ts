export type M3uEntry = {
  index: number;
  title: string;
  url: string;
  lines: string[];
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Give standalone links a useful title without ever exposing URL credentials. */
function inferStreamTitle(value: string, defaultKind: string): string {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    const xtreamId = last.match(/^(\d+)(?:\.[a-z0-9]+)?$/i)?.[1];
    if (xtreamId && segments.length >= 3) {
      const lowerPath = url.pathname.toLowerCase();
      const kind = /\/movie\//.test(lowerPath)
        ? 'Filme'
        : /\/series\//.test(lowerPath)
          ? 'Episódio'
          : /\/live\//.test(lowerPath)
            ? 'Canal'
            : defaultKind;
      return `${kind} ${xtreamId}`;
    }

    const filename = decodeURIComponent(last).replace(/\.[a-z0-9]{2,5}$/i, '').trim();
    return filename || `${defaultKind} ${segments.length + 1}`;
  } catch {
    return defaultKind;
  }
}

/** Parse M3U records while keeping each item's metadata for filtered re-import. */
export function parseM3uPlaylist(text: string, defaultKind = 'Conteúdo'): { header: string[]; entries: M3uEntry[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header: string[] = [];
  const entries: M3uEntry[] = [];
  let pending: string[] = [];
  let title = '';
  let sawEntry = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (pending.length) pending.push(rawLine);
      else if (!sawEntry) header.push(rawLine);
      continue;
    }

    if (line.startsWith('#')) {
      if (line.startsWith('#EXTINF:')) {
        pending = [rawLine];
        title = line.includes(',') ? line.slice(line.indexOf(',') + 1).trim() : '';
      } else if (pending.length) {
        pending.push(rawLine);
      } else if (!sawEntry) {
        header.push(rawLine);
      }
      continue;
    }

    if (!isHttpUrl(line)) {
      if (pending.length) pending.push(rawLine);
      continue;
    }

    sawEntry = true;
    const inferredTitle = title || inferStreamTitle(line, defaultKind);
    const metadataLines = pending.length > 0 ? pending : [`#EXTINF:-1,${inferredTitle}`];
    entries.push({
      index: entries.length,
      title: inferredTitle,
      url: line,
      lines: [...metadataLines, rawLine],
    });
    pending = [];
    title = '';
  }

  return { header, entries };
}

export function buildM3uPlaylist(header: string[], entries: M3uEntry[]): string {
  const lines = [...header];
  for (const entry of entries) lines.push(...entry.lines);
  return lines.join('\n');
}
