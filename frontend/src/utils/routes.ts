/**
 * Normalize redirect paths collected from query params or middleware.
 * Ensures we never navigate to Next.js RSC payloads (e.g., "/admin.txt")
 * or allow absolute URLs that could trigger open redirects.
 */
export function sanitizeRedirectPath(input?: string | null): string | undefined {
  if (!input) return undefined;

  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Disallow absolute URLs to avoid open-redirect issues
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return sanitizeRedirectPath(`${url.pathname}${url.search}${url.hash}`);
    } catch {
      return undefined;
    }
  }

  // Ensure we operate on a leading slash path for URL parsing
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  try {
    const url = new URL(normalized, 'http://localhost');
    let pathname = url.pathname.replace(/\/{2}/g, '/');

    // Strip trailing "index" segments to keep canonical routes ("/admin/index" -> "/admin")
    if (pathname.endsWith('/index')) {
      pathname = pathname.slice(0, -6) || '/';
    }

    // Remove RSC/Text payload suffixes such as ".txt"
    if (pathname.endsWith('.txt')) {
      pathname = pathname.slice(0, -4) || '/';
    }

    if (!pathname.startsWith('/')) {
      pathname = `/${pathname}`;
    }

    const sanitized = `${pathname}${url.search}${url.hash}`;
    return sanitized || undefined;
  } catch {
    return undefined;
  }
}
