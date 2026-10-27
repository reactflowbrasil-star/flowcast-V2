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

/** Parse M3U records while keeping each item's metadata for filtered re-import. */
export function parseM3uPlaylist(text: string): { header: string[]; entries: M3uEntry[] } {
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
    entries.push({
      index: entries.length,
      title: title || line,
      url: line,
      lines: [...pending, rawLine],
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
