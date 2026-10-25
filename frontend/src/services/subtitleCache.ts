/**
 * Subtitle Cache Service
 * 
 * Provides caching and preloading functionality for subtitle files
 * to enable instant subtitle switching without delays.
 */

interface CachedSubtitle {
  url: string;
  content: string;
  timestamp: number;
}

class SubtitleCacheService {
  private cache: Map<string, CachedSubtitle> = new Map();
  private maxCacheSize: number = 50; // Maximum number of subtitles to cache
  private maxCacheAge: number = 1000 * 60 * 30; // 30 minutes

  /**
   * Preload all subtitles for a content item
   */
  async preloadSubtitles(subtitles: Array<{ url: string; language: string; label: string }>): Promise<void> {
    const promises = subtitles.map(sub => this.fetchAndCache(sub.url));
    await Promise.all(promises).catch(() => {});
  }

  /**
   * Fetch and cache a subtitle file
   */
  private async fetchAndCache(url: string): Promise<string> {
    // Check if already cached and not expired
    const cached = this.cache.get(url);
    if (cached && (Date.now() - cached.timestamp) < this.maxCacheAge) {
      return cached.content;
    }

    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'text/vtt,text/plain,*/*'}});

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    // Store in cache
    this.cache.set(url, {
      url,
      content,
      timestamp: Date.now()});

    // Enforce cache size limit
    this.enforceMaxCacheSize();

    return content;
  }

  /**
   * Get a subtitle from cache or fetch it
   */
  async getSubtitle(url: string): Promise<string> {
    return this.fetchAndCache(url);
  }

  /**
   * Check if a subtitle is cached
   */
  isCached(url: string): boolean {
    const cached = this.cache.get(url);
    if (!cached) return false;
    
    // Check if expired
    if ((Date.now() - cached.timestamp) >= this.maxCacheAge) {
      this.cache.delete(url);
      return false;
    }
    
    return true;
  }

  /**
   * Get cached subtitle content without fetching
   */
  getCachedContent(url: string): string | null {
    const cached = this.cache.get(url);
    if (!cached) return null;
    
    // Check if expired
    if ((Date.now() - cached.timestamp) >= this.maxCacheAge) {
      this.cache.delete(url);
      return null;
    }
    
    return cached.content;
  }

  /**
   * Create a blob URL from cached subtitle content
   */
  createBlobUrl(url: string): string | null {
    const content = this.getCachedContent(url);
    if (!content) return null;

    const blob = new Blob([content], { type: 'text/vtt' });
    return URL.createObjectURL(blob);
  }

  /**
   * Enforce maximum cache size by removing oldest entries
   */
  private enforceMaxCacheSize(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    // Sort by timestamp (oldest first)
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    // Remove oldest entries until we're under the limit
    const toRemove = entries.slice(0, this.cache.size - this.maxCacheSize);
    toRemove.forEach(([url]) => {
      this.cache.delete(url);
    });
  }

  /**
   * Clear all cached subtitles
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear expired cache entries
   */
  clearExpired(): void {
    const now = Date.now();

    for (const [url, cached] of this.cache.entries()) {
      if ((now - cached.timestamp) >= this.maxCacheAge) {
        this.cache.delete(url);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; urls: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      urls: Array.from(this.cache.keys())};
  }
}

// Export singleton instance
export const subtitleCache = new SubtitleCacheService();

// Periodically clear expired entries (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    subtitleCache.clearExpired();
  }, 1000 * 60 * 5);
}

