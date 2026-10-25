// Content service
/* eslint-disable @typescript-eslint/no-unused-vars */

import { apiService } from './api';
import { API_CONFIG } from '@/constants/api';
import { apiErrorMessage } from '@/lib/utils';

interface ContentFilterParams {
  category?: string;
  type?: ContentType;
  search?: string;
  page?: number;
  limit?: number;
  active?: boolean;
}

interface BackendContentItem {
  id: number;
  category_id: number;
  title: string;
  description?: string;
  image_url?: string;
  poster_url?: string;
  backdrop_url?: string;
  stream_url?: string;
  video_url?: string;
  year?: number;
  runtime?: number;
  channel_number?: number;
  channel_category?: string;
  is_live?: boolean;
  active: boolean;
  category?: string;
  type?: string;
  content_type?: string;
  tmdb_id?: number;
  created_at: string;
  updated_at?: string;
  provider?: string;
  country?: string;
  format?: string;
  drm_keys?: string;
  origin?: string;
  user_agent?: string;
  referer?: string;
  custom_headers?: string;
  proxy_url?: string;
  genre?: string;
}

interface BackendContentListResponse {
  content: BackendContentItem[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

interface BackendContentUpdate {
  title?: string;
  description?: string;
  image_url?: string;
  poster_url?: string;
  backdrop_url?: string;
  stream_url?: string;
  video_url?: string;
  year?: number;
  active?: boolean;
  category?: string;
  type?: string;
  tmdb_id?: number;
}

interface AnimeSeriesData {
  tmdb_id: number;
  seasons: Array<{
    season_number: number;
    episodes: Array<{
      episode_number: number;
      video_url?: string;
    }>;
  }>;
}

import { API_ENDPOINTS } from '@/constants';
import {
  Category,
  ContentListResponse,
  DeliveryContentListResponse,
  SearchRequest,
  SearchResponse,
  StreamResponse,
  StreamInfo,
  StreamPublicInfo,
  Content,
  ContentType,
  Series,
  Season,
  Episode,
  ApiResult,
  CreateTvChannelRequest,
  UpdateTvChannelRequest,
  TvChannelCategoryAdmin,
  TvProviderRecord,
  ScanFolderIngestResult,
  TmdbMetadataRefreshResult,
  SubtitleTrackResponse
} from '@/types';

// TV Channel interfaces (updated to use the main interface)
export type { CreateTvChannelRequest as CreateTVChannelRequest } from '../types/content';

// Normalize DRM key inputs to the canonical "kid_hex:key_hex" format
function normalizeDrmKeysInput(input: string): string {
  try {
    if (!input) return input;
    let s = input.trim();

    // Extract from KODIPROP style: ...license_key=KID:KEY or JSON
    const idx = s.toLowerCase().indexOf('license_key=');
    const hadLicenseKey = idx !== -1;
    if (hadLicenseKey) {
      s = s.slice(idx + 'license_key='.length).trim();
    }

    // JSON object handling
    if (s.startsWith('{')) {
      try {
        const obj = JSON.parse(s);
        // Single pair form: { "kid": "...", "key": "..." }
        if (obj && typeof obj === 'object' && ('kid' in obj || 'KID' in obj) && ('key' in obj || 'KEY' in obj)) {
          const kidHex = String((obj as any).kid ?? (obj as any).KID ?? '').trim();
          const keyHex = String((obj as any).key ?? (obj as any).KEY ?? '').trim();
          if (kidHex && keyHex) {
            // Canonical: KID:KEY
            return `${kidHex}:${keyHex}`.replace(/\s+/g, '');
          }
        }
        // Mapping form: { "kidHex1": "keyHex1", "kidHex2": "keyHex2" }
        const pairs: string[] = [];
        for (const [kidHex, keyVal] of Object.entries(obj as Record<string, unknown>)) {
          if (typeof keyVal === 'string') {
            const keyHex = keyVal.trim();
            if (kidHex && keyHex) {
              pairs.push(`${String(kidHex).trim()}:${keyHex}`); // KID:KEY
            }
          }
        }
        if (pairs.length > 0) {
          return pairs.join(',');
        }
      } catch {
        // fallthrough to plain parsing
      }
    }

    // Normalize separators
    s = s.replace(/[\r\n;]+/g, ',').replace(/\s+/g, '');
    const tokens = s.split(',').filter(Boolean);

    const isHex32 = (x: string) => /^[0-9a-fA-F]{32}$/.test(x);

    const normalized: string[] = [];
    for (const t of tokens) {
      const parts = t.split(':');
      if (parts.length !== 2) continue;

      let a = parts[0].trim();
      let b = parts[1].trim();

      // Remove optional labels like kid=... or key=...
      const aLabeledKid = /^kid=/i.test(a);
      const aLabeledKey = /^key=/i.test(a);
      const bLabeledKid = /^kid=/i.test(b);
      const bLabeledKey = /^key=/i.test(b);

      a = a.replace(/^kid=/i, '').replace(/^key=/i, '');
      b = b.replace(/^kid=/i, '').replace(/^key=/i, '');

      // Decide orientation -> canonical KID:KEY
      if (aLabeledKid || bLabeledKey) {
        // already KID:KEY orientation
        normalized.push(`${a}:${b}`);
      } else if (aLabeledKey || bLabeledKid) {
        // a was key or b was kid -> swap to KID:KEY
        normalized.push(`${b}:${a}`);
      } else if (hadLicenseKey && isHex32(a) && isHex32(b)) {
        // KODIPROP 'license_key' without labels is typically KID:KEY
        normalized.push(`${a}:${b}`);
      } else {
        // Manual entry without labels: preserve the entered order
        normalized.push(`${a}:${b}`);
      }
    }

    return normalized.join(',');
  } catch {
    // If anything goes wrong, fall back to original with whitespace removed
    return input.replace(/\s+/g, '').replace(/[\r\n;]+/g, ',');
  }
}

// Specialized Content interfaces
export interface CreateKidsContentRequest {
  title: string;
  description?: string;
  image_url?: string;
  stream_url: string;
  tmdb_id?: number;
  year?: number;
}

export interface CreateAnimeContentRequest {
  title: string;
  description?: string;
  image_url?: string;
  stream_url: string;
  tmdb_id?: number;
  year?: number;
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  image_url?: string;
  event_type: 'live' | 'scheduled' | 'recurring';
  provider?: string;
  country?: string;
  format?: string;
  drm_keys?: string;
  stream_url: string;
  // LiveTV/Streaming specific headers
  origin?: string;
  user_agent?: string;
  referer?: string;
  custom_headers?: string;
}

export interface CreateEventScheduleRequest {
  event_id: number;
  schedule_date: string; // YYYY-MM-DD format
  start_time: string; // HH:MM format
  end_time?: string; // HH:MM format
  stream_url: string;
  title: string;
  description?: string;
  image_url?: string;
}

// Helper: convert backend metadata relative URLs (/metadata/...) to an absolute URL.
// Prefers NEXT_PUBLIC_API_URL when set (backend host), otherwise falls back to window.location.origin.
function absolutizeMetadataUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  // Prefer explicitly configured backend address exposed to the browser (NEXT_PUBLIC_API_URL).
  // Fall back to the backend default (http://localhost:3000) so metadata requests target the backend,
  // not the frontend dev server that serves the UI.
  // Use process.env directly - Next.js replaces NEXT_PUBLIC_* at build time for both server and client
  const envBase = process.env.NEXT_PUBLIC_API_URL;
  const prefix = envBase || 'http://localhost:3000';
  const baseTrim = prefix.replace(/\/$/, '');
  const p = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${baseTrim}${p}`;
}
export class ContentService {
  // Categories (public, returns ALL)
  async getCategories(): Promise<ApiResult<Category[]>> {
    return apiService.get<Category[]>(API_ENDPOINTS.CONTENT.CATEGORIES);
  }

  // Categories (authenticated, filtered by user subscription)
  async getUserCategories(): Promise<ApiResult<Category[]>> {
    return apiService.get<Category[]>('/api/content/categories');
  }

  // Get content with optional filtering
  async getContent(params?: {
    type?: ContentType;
    page?: number;
    limit?: number;
    search?: string;
    active?: boolean;
  }): Promise<ApiResult<ContentListResponse>> {
    try {
      // Convert type to category for backend compatibility
      const backendParams: ContentFilterParams = { ...params };
      if (params?.type) {
        backendParams.category = this.mapContentTypeToCategory(params.type);
        delete backendParams.type;
      }

      const result = await apiService.get<BackendContentListResponse>(API_ENDPOINTS.ADMIN.CONTENT, { params: backendParams });

      if (result.success && result.data) {
        // Map backend fields to frontend fields and absolutize any local /metadata/... urls
        const mappedContent = result.data.content.map((item: BackendContentItem) => {
          const poster = absolutizeMetadataUrl(item.image_url ?? item.poster_url ?? undefined);
          const image = absolutizeMetadataUrl(item.image_url ?? item.poster_url ?? undefined);
          const backdrop = absolutizeMetadataUrl(item.backdrop_url ?? item.image_url ?? item.poster_url ?? undefined);
          return {
            ...item,
            poster_url: poster,
            image_url: image,
            backdrop_url: backdrop,
            video_url: item.stream_url || item.video_url,
            // Ensure required field exists to satisfy Content interface
            content_type: item.content_type ?? item.type ?? item.category?.toLowerCase?.() ?? 'vod'
          } as Content;
        });

        const response: ContentListResponse = {
          ...result.data,
          content: mappedContent as Content[]
        };

        return {
          success: true,
          data: response
        };
      }

      return result as ApiResult<ContentListResponse>;
    } catch {
      return {
        success: false,
        error: {
          error: 'Content Fetch Failed',
          details: 'Failed to fetch content',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Map frontend ContentType to backend category type
  private mapContentTypeToCategory(type: ContentType): string {
    switch (type) {
      case ContentType.VOD:
        return 'VOD';
      case ContentType.TV:
        return 'TV';
      case ContentType.SERIES:
        return 'Series';
      case ContentType.EVENTS:
        return 'Eventos';
      case ContentType.KIDS:
        return 'Kids';
      case ContentType.ANIME:
        return 'Anime';
      default:
        return 'VOD';
    }
  }

  private mapSearchCategory(category?: string): string | undefined {
    if (!category) return undefined;

    const trimmed = category.trim();
    if (!trimmed || trimmed.toLowerCase() === 'all') {
      return undefined;
    }

    const direct = new Set(['VOD', 'TV', 'Series', 'Eventos', 'Kids', 'Anime']);
    if (direct.has(trimmed)) {
      return trimmed;
    }

    const normalized = trimmed.toLowerCase();
    const aliases: Record<string, string> = {
      vod: 'VOD',
      movie: 'VOD',
      movies: 'VOD',
      tv: 'TV',
      live: 'TV',
      channel: 'TV',
      channels: 'TV',
      series: 'Series',
      show: 'Series',
      shows: 'Series',
      event: 'Eventos',
      events: 'Eventos',
      eventos: 'Eventos',
      kids: 'Kids',
      kid: 'Kids',
      children: 'Kids',
      anime: 'Anime'
    };

    return aliases[normalized];
  }

  async getContentById(contentId: number): Promise<ApiResult<Content>> {
    const result = await apiService.get<Content>(`/api/content/${contentId}`);

    if (result.success && result.data) {
      const data = result.data;
      // Absolutize any local metadata URLs the backend may have returned
      const poster = absolutizeMetadataUrl(data.poster_url ?? data.image_url ?? undefined);
      const image = absolutizeMetadataUrl(data.image_url ?? data.poster_url ?? undefined);
      const backdrop = absolutizeMetadataUrl(data.backdrop_url ?? data.image_url ?? data.poster_url ?? undefined);

      const normalized: Content = {
        ...data,
        poster_url: poster,
        image_url: image,
        backdrop_url: backdrop
      };

      return {
        success: true,
        data: normalized
      };
    }

    return result;
  }

  // Create content
  async createContent(data: {
    title: string;
    description?: string;
    year?: number;
    poster_url?: string;
    backdrop_url?: string;
    video_url: string;
    type: ContentType;
    tmdb_id?: number;
    channel_number?: number;
    channel_category?: string;
    is_live?: boolean;
    active: boolean;
    provider?: string;
    country?: string;
    format?: string;
    drm_keys?: string;
    drm_type?: string;
    license_server_url?: string;
    drm_headers?: string;
    // LiveTV specific headers
    origin?: string;
    user_agent?: string;
    referer?: string;
    custom_headers?: string;
    // Per-channel HTTP proxy (Live TV only)
    proxy_url?: string;
    // Per-channel DNS-over-HTTPS resolver
    doh_url?: string;
  }): Promise<ApiResult<Content>> {
    try {
      // For TV channels, use specific endpoint and format
      if (data.type === ContentType.TV) {
        const tvChannelData = {
          name: data.title,
          description: data.description || null,
          logo_url: data.poster_url || null,
          stream_url: data.video_url,
          channel_number: data.channel_number || null,
          is_live: data.is_live ?? true,
          channel_category: data.channel_category || null,
          provider: data.provider || null,
          country: data.country || null,
          format: data.format || null,
          drm_keys: data.drm_keys ? normalizeDrmKeysInput(data.drm_keys) : null,
          drm_type: data.drm_type || null,
          license_server_url: data.license_server_url || null,
          drm_headers: data.drm_headers || null,
          // LiveTV specific headers
          origin: data.origin || null,
          user_agent: data.user_agent || null,
          referer: data.referer || null,
          custom_headers: data.custom_headers || null,
          // Per-channel HTTP proxy (Live TV only)
          proxy_url: data.proxy_url || null,
          // Per-channel DNS-over-HTTPS resolver
          doh_url: data.doh_url || null
        };

        const result = await apiService.post<Content>(API_ENDPOINTS.ADMIN.TV_CHANNELS, tvChannelData);
        return result;
      }

      // For other content types, use general content endpoint
      const categoryId = await this.getCategoryIdByType(data.type);
      const backendData = {
        category_id: categoryId,
        title: data.title,
        description: data.description || null,
        image_url: data.poster_url || null,
        backdrop_url: data.backdrop_url || null,
        stream_url: data.video_url,
        tmdb_id: data.tmdb_id || null,
        year: data.year || null,
        // DRM fields — supported for all content types
        drm_keys: data.drm_keys ? normalizeDrmKeysInput(data.drm_keys) : null,
        drm_type: data.drm_type || null,
        license_server_url: data.license_server_url || null,
        drm_headers: data.drm_headers || null,
      };

      const result = await apiService.post<Content>(API_ENDPOINTS.ADMIN.CONTENT, backendData);
      return result;
    } catch (error) {
      console.error('Content creation error:', error);
      return {
        success: false,
        error: {
          error: 'Content Creation Failed',
          details: error instanceof Error ? error.message : 'Failed to create content',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async scanFolderIngest(data: {
    rootPath: string;
    media: 'mixed' | 'movies' | 'series' | 'anime' | 'kids';
    duplicatePolicy: 'omit' | 'replace' | 'allow';
    addSubs: boolean;
    // movieCategory/seriesCategory can be provided as category id (number) or null/undefined
    movieCategory?: number | string | null;
    seriesCategory?: number | string | null;
  }): Promise<ApiResult<ScanFolderIngestResult>> {
    const payload = {
      root_path: data.rootPath,
      media: data.media,
      duplicate_policy: data.duplicatePolicy,
      add_subs: data.addSubs,
      // Pass numeric IDs when available (backend accepts category id); otherwise undefined
      movie_category: data.movieCategory != null ? data.movieCategory : undefined,
      series_category: data.seriesCategory != null ? data.seriesCategory : undefined
    };

    // Use extended timeout specifically for scanning operations
    return apiService.post<ScanFolderIngestResult>(
      API_ENDPOINTS.ADMIN.INGEST.SCAN_FOLDER,
      payload,
      {
        timeout: 600000, // 10 minutes timeout specifically for folder scanning
      }
    );
  }

  async refreshTmdbMetadata(data: {
    categoryType: string;
    limit?: number;
  }): Promise<ApiResult<TmdbMetadataRefreshResult>> {
    const payload = {
      category_type: data.categoryType,
      limit: data.limit
    };

    return apiService.post<TmdbMetadataRefreshResult>(
      API_ENDPOINTS.ADMIN.CONTENT_TMDB_ENRICH,
      payload,
    );
  }

  // Enrich a single content item with TMDB metadata
  async enrichContentTmdb(
    contentId: number,
    tmdbId: number,
    mediaType: string
  ): Promise<ApiResult<Content>> {
    const payload = {
      content_id: contentId,
      tmdb_id: tmdbId,
      media_type: mediaType
    };

    return apiService.post<Content>(
      '/api/admin/content/tmdb/enrich-single',
      payload,
    );
  }

  async listTvProviders(): Promise<ApiResult<TvProviderRecord[]>> {
    return apiService.get<TvProviderRecord[]>(API_ENDPOINTS.ADMIN.TV_PROVIDERS);
  }

  async createTvProvider(data: {
    name: string;
    url: string;
    ttl_minutes: number;
    enabled?: boolean;
  }): Promise<ApiResult<TvProviderRecord>> {
    const payload = {
      name: data.name,
      url: data.url,
      ttl_minutes: data.ttl_minutes,
      enabled: data.enabled
    };

    return apiService.post<TvProviderRecord>(
      API_ENDPOINTS.ADMIN.TV_PROVIDERS,
      payload,
    );
  }

  async deleteTvProvider(id: number): Promise<ApiResult<void>> {
    return apiService.delete<void>(API_ENDPOINTS.ADMIN.TV_PROVIDER(id));
  }

  async syncTvProvider(id: number): Promise<ApiResult<{ created: number; updated: number }>> {
    return apiService.post<{ created: number; updated: number }>(
      API_ENDPOINTS.ADMIN.TV_PROVIDER_SYNC(id),
    );
  }

  // Helper method to get category ID by content type
  private async getCategoryIdByType(contentType: ContentType): Promise<number> {
    try {
      const categoriesResult = await this.getCategories();

      if (!categoriesResult.success || !categoriesResult.data) {
        throw new Error('Failed to fetch categories');
      }

      // Map content types to category types
      const typeMapping: Record<ContentType, string> = {
        [ContentType.VOD]: 'VOD',
        [ContentType.TV]: 'TV',
        [ContentType.SERIES]: 'Series',
        [ContentType.KIDS]: 'Kids',
        [ContentType.ANIME]: 'Anime',
        [ContentType.EVENTS]: 'Eventos'
      };

      const targetCategoryType = typeMapping[contentType] || 'VOD';

      // Find category with matching type
      const category = categoriesResult.data.find(cat => cat.category_type === targetCategoryType);

      if (!category) {
        // If no category found, use the first available
        if (categoriesResult.data.length > 0) {
          return categoriesResult.data[0].id;
        }
        throw new Error(`No category found for content type: ${contentType}`);
      }

      return category.id;
    } catch (error) {
      console.error('Error getting category ID:', error);
      // Fallback to category ID 1 if available
      return 1;
    }
  }

  // Update content
  async updateContent(contentId: number, data: Partial<Content>): Promise<ApiResult<Content>> {
    try {
      // Map frontend fields to backend fields
      const backendData: BackendContentUpdate = { ...data };

      if (data.poster_url !== undefined) {
        backendData.image_url = data.poster_url;
        delete backendData.poster_url;
      }

      if (data.video_url !== undefined) {
        backendData.stream_url = data.video_url;
        delete backendData.video_url;
      }



      const result = await apiService.put<any>(`/api/admin/content/${contentId}`, backendData);

      if (result.success && result.data) {
        // Map backend response back to frontend format
        const mappedData = {
          ...result.data,
          poster_url: result.data.image_url || result.data.poster_url,
          backdrop_url: result.data.backdrop_url || result.data.image_url,
          video_url: result.data.stream_url || result.data.video_url
        };

        return {
          ...result,
          data: mappedData as Content
        };
      }

      return result as ApiResult<Content>;
    } catch {
      return {
        success: false,
        error: {
          error: 'Content Update Failed',
          details: 'Failed to update content',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Delete content
  async deleteContent(contentId: number): Promise<ApiResult<{ success: boolean }>> {
    try {
      const result = await apiService.delete<{ success: boolean }>(`/api/admin/content/${contentId}`);
      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'Content Deletion Failed',
          details: 'Failed to delete content',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Bulk delete content items by IDs
  async bulkDeleteContent(ids: number[]): Promise<ApiResult<Array<{ id: number; success: boolean; error?: string }>>> {
    try {
      const payload = { ids };
      const result = await apiService.post<Array<{ id: number; success: boolean; error?: string }>>('/api/admin/content/bulk-delete', payload);
      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'Bulk Delete Failed',
          details: error instanceof Error ? error.message : 'Failed to bulk delete content',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Create series
  async createSeries(data: {
    title: string;
    description?: string;
    year?: number;
    poster_url?: string;
    backdrop_url?: string;
    tmdb_id?: number;
    active: boolean;
    category_type?: string;
    seasons: Array<{
      season_number: number;
      title: string;
      description?: string;
      poster_url?: string;
      episodes: Array<{
        episode_number: number;
        title: string;
        description?: string;
        video_url: string;
        poster_url?: string;
        runtime?: number;
      }>;
    }>;
  }): Promise<ApiResult<Series>> {
    try {
      // If we have TMDB ID, use the TMDB endpoint for automatic season/episode creation
      if (data.tmdb_id) {
        // Convert episodes URLs to the format expected by backend
        const episodeUrls: { [key: string]: string } = {};
        data.seasons.forEach(season => {
          season.episodes.forEach(episode => {
            if (episode.video_url) {
              const key = `${season.season_number}-${episode.episode_number}`;
              episodeUrls[key] = episode.video_url;
            }
          });
        });

        // IMPORTANT: anime created from TMDB must hit the anime-specific endpoint,
        // otherwise it is stored as regular Series and appears in the wrong tab.
        const isAnimeSeries = (data.category_type || '').trim().toLowerCase() === 'anime';
        const tmdbEndpoint = isAnimeSeries
          ? API_ENDPOINTS.ADMIN.ANIME_SERIES_TMDB
          : API_ENDPOINTS.ADMIN.SERIES_TMDB;

        const result = await apiService.post<Series>(tmdbEndpoint, {
          tmdb_id: data.tmdb_id,
          episode_urls: Object.keys(episodeUrls).length > 0 ? episodeUrls : undefined
        });
        return result;
      }

      // Otherwise, create manually with the provided data
      const backendData: Record<string, unknown> = {
        title: data.title,
        description: data.description || null,
        image_url: data.poster_url || null,
        tmdb_id: data.tmdb_id || null,
        year: data.year || null,
        total_seasons: data.seasons.length,
        seasons: data.seasons
      };

      // Pass category_type so backend creates under the correct category (e.g. "Anime")
      if (data.category_type) {
        backendData.category_type = data.category_type;
      }

      const result = await apiService.post<Series>(API_ENDPOINTS.ADMIN.SERIES, backendData);
      return result;
    } catch (error) {
      console.error('Series creation error:', error);
      return {
        success: false,
        error: {
          error: 'Series Creation Failed',
          details: error instanceof Error ? error.message : 'Failed to create series',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Content discovery
  async getContentByCategory(
    categoryId: number,
    page: number = 1,
    limit: number = 20
  ): Promise<ApiResult<DeliveryContentListResponse>> {
    const url = `${API_ENDPOINTS.CONTENT.BY_CATEGORY(categoryId)}?page=${page}&limit=${limit}`;
    return apiService.get<DeliveryContentListResponse>(url);
  }

  async searchContent(searchParams: SearchRequest): Promise<ApiResult<SearchResponse>> {
    const params = new URLSearchParams();
    params.append('q', searchParams.q);

    const mappedCategory = this.mapSearchCategory(searchParams.category);
    if (mappedCategory) params.append('category', mappedCategory);
    if (searchParams.year) params.append('year', searchParams.year.toString());
    if (searchParams.tmdb_id) params.append('tmdb_id', searchParams.tmdb_id.toString());
    if (searchParams.page) params.append('page', searchParams.page.toString());
    if (searchParams.limit) params.append('limit', searchParams.limit.toString());

    const url = `${API_ENDPOINTS.CONTENT.SEARCH}?${params.toString()}`;
    const result = await apiService.get<SearchResponse>(url);

    if (result.success && result.data) {
      return {
        success: true,
        data: {
          ...result.data,
          content: result.data.content.map((item) => ({
            ...item,
            image_url: absolutizeMetadataUrl(item.image_url ?? undefined),
            backdrop_url: absolutizeMetadataUrl(item.backdrop_url ?? undefined)
          }))
        }
      };
    }

    return result;
  }

  // Streaming
  async getStreamUrl(contentId: number): Promise<ApiResult<StreamResponse>> {
    return apiService.get<StreamResponse>(API_ENDPOINTS.CONTENT.STREAM(contentId));
  }

  // Toggle content status (activate/deactivate)
  async toggleContentStatus(contentId: number): Promise<ApiResult<Content>> {
    try {
      const result = await apiService.put<Content>(`${API_ENDPOINTS.ADMIN.CONTENT}/${contentId}/status`, {});
      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'Status Toggle Failed',
          details: 'Failed to toggle content status',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Series management
  async getSeries(page: number = 1, limit: number = 20): Promise<ApiResult<{ series: Series[]; total: number; page: number; limit: number; has_more: boolean }>> {
    const url = `${API_ENDPOINTS.SERIES.BASE}?page=${page}&limit=${limit}`;
    const result = await apiService.get<Series[]>(url);

    // Backend returns Vec<SeriesResponse> directly, wrap it in expected format
    if (result.success && result.data) {
      const series = Array.isArray(result.data) ? result.data : [];
      return {
        success: true,
        data: {
          series,
          total: series.length,
          page,
          limit,
          has_more: series.length >= limit
        }
      };
    }

    return result as any;
  }

  async getSeriesById(seriesId: number): Promise<ApiResult<Series>> {
    return apiService.get<Series>(`${API_ENDPOINTS.SERIES.BASE}/${seriesId}`);
  }

  async getSeriesByContentId(contentId: number): Promise<ApiResult<Series>> {
    return apiService.get<Series>(API_ENDPOINTS.SERIES.BY_CONTENT(contentId));
  }



  async getSeriesSeasons(seriesId: number): Promise<ApiResult<Season[]>> {
    return apiService.get<Season[]>(API_ENDPOINTS.SERIES.SEASONS(seriesId));
  }

  async getSeasonEpisodes(seasonId: number): Promise<ApiResult<Episode[]>> {
    return apiService.get<Episode[]>(API_ENDPOINTS.EPISODES.BY_SEASON(seasonId));
  }

  async getEpisodeStreamUrl(episodeId: number): Promise<ApiResult<StreamResponse>> {
    return apiService.get<StreamResponse>(API_ENDPOINTS.EPISODES.STREAM(episodeId));
  }

  async updateSeries(seriesId: number, seriesData: Partial<Series>): Promise<ApiResult<Series>> {
    return apiService.put<Series>(API_ENDPOINTS.SERIES.UPDATE(seriesId), seriesData);
  }

  async deleteSeries(seriesId: number): Promise<ApiResult<void>> {
    return apiService.delete<void>(API_ENDPOINTS.SERIES.DELETE(seriesId));
  }

  async createEpisode(episodeData: Partial<Episode>): Promise<ApiResult<Episode>> {
    return apiService.post<Episode>(`${API_ENDPOINTS.ADMIN.SERIES}/episodes`, episodeData);
  }

  async updateEpisode(episodeId: number, data: {
    title?: string;
    description?: string;
    stream_url?: string;
    image_url?: string;
  }): Promise<ApiResult<any>> {
    try {
      const result = await apiService.put<any>(API_ENDPOINTS.ADMIN.EPISODES_UPDATE(episodeId), data);
      return result;
    } catch (error) {
      console.error('Error updating episode:', error);
      throw error;
    }
  }

  async deleteEpisode(episodeId: number): Promise<ApiResult<void>> {
    return apiService.delete<void>(API_ENDPOINTS.ADMIN.EPISODES_UPDATE(episodeId));
  }

  async deleteSeason(seasonId: number): Promise<ApiResult<void>> {
    return apiService.delete<void>(`${API_ENDPOINTS.ADMIN.SERIES}/seasons/${seasonId}`);
  }

  // TV Channels
  async createTVChannel(channelData: CreateTvChannelRequest): Promise<ApiResult<Content>> {
    const payload = {
      ...channelData,
      drm_keys: channelData.drm_keys ? normalizeDrmKeysInput(channelData.drm_keys) : channelData.drm_keys
    };
    return apiService.post<Content>('/api/admin/content/tv-channels', payload);
  }

  async updateTVChannel(channelId: number, channelData: UpdateTvChannelRequest): Promise<ApiResult<Content>> {
    const payload = {
      ...channelData,
      drm_keys: channelData.drm_keys ? normalizeDrmKeysInput(channelData.drm_keys) : channelData.drm_keys
    };
    return apiService.put<Content>(`/api/admin/content/tv-channels/${channelId}`, payload);
  }

  async bulkImportTVChannels(data: {
    text: string;
    provider?: string;
    description?: string;
    format?: 'DRM' | 'M3U8';
    country?: string;
    start_channel_number?: number;
  }): Promise<ApiResult<Array<{ id: number; name: string; channel_number?: number }>>> {
    return apiService.post(API_ENDPOINTS.ADMIN.TV_CHANNELS_BULK, data);
  }

  async bulkImportContent(data: {
    text: string;
    category_type?: string;
  }): Promise<ApiResult<Array<{ id: number; title: string; error?: string }>>> {
    return apiService.post(API_ENDPOINTS.ADMIN.CONTENT_BULK_IMPORT, data);
  }

  async getTVChannelCategories(): Promise<ApiResult<string[]>> {
    return apiService.get<string[]>(API_ENDPOINTS.TV.CATEGORIES);
  }

  async getAdminTVChannelCategories(): Promise<ApiResult<TvChannelCategoryAdmin[]>> {
    return apiService.get<TvChannelCategoryAdmin[]>(API_ENDPOINTS.ADMIN.TV_CHANNEL_CATEGORIES);
  }

  async createTVChannelCategory(name: string): Promise<ApiResult<TvChannelCategoryAdmin>> {
    return apiService.post<TvChannelCategoryAdmin>(API_ENDPOINTS.ADMIN.TV_CHANNEL_CATEGORIES, { name });
  }

  async updateTVChannelCategory(id: number, name: string): Promise<ApiResult<TvChannelCategoryAdmin>> {
    return apiService.put<TvChannelCategoryAdmin>(API_ENDPOINTS.ADMIN.TV_CHANNEL_CATEGORY(id), { name });
  }

  async deleteTVChannelCategory(id: number): Promise<ApiResult<void>> {
    return apiService.delete<void>(API_ENDPOINTS.ADMIN.TV_CHANNEL_CATEGORY(id));
  }

  // Get content for editing (with decrypted URLs)
  async getContentForEdit(contentId: number): Promise<ApiResult<Content>> {
    return apiService.get<Content>(`/api/admin/content/${contentId}/edit`);
  }

  // ── Stream CRUD (multi-stream per content) ───────────────────────────────

  async getContentStreams(contentId: number): Promise<ApiResult<StreamInfo[]>> {
    return apiService.get<StreamInfo[]>(`/api/admin/content/${contentId}/streams`);
  }

  async addContentStream(contentId: number, stream: Partial<StreamInfo>): Promise<ApiResult<StreamInfo>> {
    return apiService.post<StreamInfo>(`/api/admin/content/${contentId}/streams`, stream);
  }

  async updateContentStream(contentId: number, streamId: number, data: Partial<StreamInfo>): Promise<ApiResult<StreamInfo>> {
    return apiService.put<StreamInfo>(`/api/admin/content/${contentId}/streams/${streamId}`, data);
  }

  async deleteContentStream(contentId: number, streamId: number): Promise<ApiResult<void>> {
    return apiService.delete<void>(`/api/admin/content/${contentId}/streams/${streamId}`);
  }

  // ── Episode Stream CRUD (multi-stream per episode) ──────────────────────

  async getEpisodeStreams(episodeId: number): Promise<ApiResult<StreamInfo[]>> {
    return apiService.get<StreamInfo[]>(`/api/admin/episodes/${episodeId}/streams`);
  }

  async addEpisodeStream(episodeId: number, stream: Partial<StreamInfo>): Promise<ApiResult<StreamInfo>> {
    return apiService.post<StreamInfo>(`/api/admin/episodes/${episodeId}/streams`, stream);
  }

  async updateEpisodeStream(episodeId: number, streamId: number, data: Partial<StreamInfo>): Promise<ApiResult<StreamInfo>> {
    return apiService.put<StreamInfo>(`/api/admin/episodes/${episodeId}/streams/${streamId}`, data);
  }

  async deleteEpisodeStream(episodeId: number, streamId: number): Promise<ApiResult<void>> {
    return apiService.delete<void>(`/api/admin/episodes/${episodeId}/streams/${streamId}`);
  }

  // ── Public Stream Listing (user-facing quality selector) ────────────────

  async getPublicContentStreams(contentId: number): Promise<ApiResult<StreamPublicInfo[]>> {
    return apiService.get<StreamPublicInfo[]>(`/api/content/${contentId}/streams`);
  }

  async getPublicEpisodeStreams(episodeId: number): Promise<ApiResult<StreamPublicInfo[]>> {
    return apiService.get<StreamPublicInfo[]>(`/api/episodes/${episodeId}/streams`);
  }

  // Get content for editing with total_seasons (for series)
  async getContentWithSeasonsForEdit(contentId: number): Promise<ApiResult<any>> {
    return apiService.get<any>(`/api/admin/content/${contentId}/edit-with-seasons`);
  }

  async getTVChannels(params?: { page?: number; limit?: number; channel_category?: string }): Promise<ApiResult<Content[]>> {
    return apiService.get<Content[]>(API_ENDPOINTS.TV.CHANNELS, { params });
  }

  // Kids Content
  async createKidsContent(contentData: CreateKidsContentRequest): Promise<ApiResult<Content>> {
    return apiService.post<Content>(API_ENDPOINTS.ADMIN.KIDS_CONTENT, contentData);
  }

  async getKidsContent(params?: { page?: number; limit?: number }): Promise<ApiResult<Content[]>> {
    return apiService.get<Content[]>(API_ENDPOINTS.SPECIALIZED.KIDS, { params });
  }

  // Anime Content
  async createAnimeContent(contentData: CreateAnimeContentRequest): Promise<ApiResult<Content>> {
    return apiService.post<Content>(API_ENDPOINTS.ADMIN.ANIME_CONTENT, contentData);
  }

  async createAnimeSeries(seriesData: AnimeSeriesData): Promise<ApiResult<Series>> {
    return apiService.post<Series>(API_ENDPOINTS.ADMIN.ANIME_SERIES_TMDB, {
      tmdb_id: seriesData.tmdb_id,
      episode_urls: seriesData.seasons.reduce((acc: Record<string, string>, season) => {
        season.episodes.forEach((episode) => {
          if (episode.video_url) {
            acc[`${season.season_number}-${episode.episode_number}`] = episode.video_url;
          }
        });
        return acc;
      }, {} as Record<string, string>)
    });
  }

  async getAnimeContent(params?: { page?: number; limit?: number }): Promise<ApiResult<Content[]>> {
    return apiService.get<Content[]>(API_ENDPOINTS.SPECIALIZED.ANIME, { params });
  }

  // Get regular episode with decrypted URL for editing
  async getEpisodeForDelivery(episodeId: number): Promise<ApiResult<Episode>> {
    return apiService.get<Episode>(`${API_ENDPOINTS.EPISODES.STREAM(episodeId)}`);
  }

  async getEpisodeForEditing(episodeId: number): Promise<ApiResult<Episode>> {
    return apiService.get<Episode>(`/api/admin/series/episodes/${episodeId}`);
  }

  async getEpisodeSubtitles(episodeId: number): Promise<ApiResult<SubtitleTrackResponse[]>> {
    return apiService.get<SubtitleTrackResponse[]>(`${API_ENDPOINTS.EPISODES.SUBTITLES(episodeId)}`);
  }

  // Events
  async createEvent(eventData: CreateEventRequest): Promise<ApiResult<Content>> {
    const payload = {
      ...eventData,
      drm_keys: eventData.drm_keys ? normalizeDrmKeysInput(eventData.drm_keys) : eventData.drm_keys
    };
    return apiService.post<Content>(API_ENDPOINTS.ADMIN.EVENTS, payload);
  }

  async getEvents(params?: { page?: number; limit?: number }): Promise<ApiResult<Content[]>> {
    return apiService.get<Content[]>(API_ENDPOINTS.SPECIALIZED.EVENTS, { params });
  }

  async getEventById(eventId: number): Promise<ApiResult<Content>> {
    return apiService.get<Content>(API_ENDPOINTS.SPECIALIZED.EVENT_BY_ID(eventId));
  }

  async getEventsByDate(date: string): Promise<ApiResult<Content[]>> {
    return apiService.get<Content[]>(API_ENDPOINTS.SPECIALIZED.EVENTS_BY_DATE, { params: { date } });
  }

  async createEventSchedule(scheduleData: CreateEventScheduleRequest): Promise<ApiResult<any>> {
    return apiService.post<any>(API_ENDPOINTS.ADMIN.EVENT_SCHEDULES, scheduleData);
  }

  // Movies
  async getMovies(params?: { page?: number; limit?: number }): Promise<ApiResult<Content[]>> {
    return apiService.get<Content[]>(API_ENDPOINTS.MOVIES.BASE, { params });
  }

  // Watch Progress
  async saveWatchProgress(data: {
    contentId: number;
    contentType?: string;
    episodeId?: number;
    positionSeconds: number;
    durationSeconds: number;
  }): Promise<ApiResult<{ success: boolean; message: string }>> {
    return apiService.post('/api/user/progress', data);
  }

  async getWatchProgress(contentId: number): Promise<ApiResult<{
    success: boolean;
    progress: {
      content_id: number;
      content_type: string;
      episode_id: number | null;
      position_seconds: number;
      duration_seconds: number;
      progress_percent: number;
      completed: boolean;
      updated_at: string;
    } | null;
  }>> {
    return apiService.get(`/api/user/progress/${contentId}`);
  }

  async getContinueWatching(): Promise<ApiResult<{
    success: boolean;
    items: Array<{
      content_id: number;
      content_type: string;
      episode_id: number | null;
      position_seconds: number;
      duration_seconds: number;
      progress_percent: number;
      updated_at: string;
      title: string | null;
      series_title?: string | null;
      poster_url: string | null;
      backdrop_url: string | null;
    }>;
  }>> {
    return apiService.get('/api/user/continue-watching');
  }

  /**
   * Upload video file for a movie/VOD content
   * @param contentId The content ID to upload video for
   * @param file The video file to upload
   * @returns The path where the video was stored
   */
  async uploadContentVideo(contentId: number, file: File): Promise<ApiResult<{ path: string }>> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/admin/content/${contentId}/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('iptv_auth_token')}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(error.message || error.details || 'Upload failed');
      }

      const data = await response.json();
      return {
        success: true,
        data: { path: data.path }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'Video Upload Failed',
          details: error instanceof Error ? error.message : 'Failed to upload video',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Upload subtitle file for a VOD/Series/Anime/Kids content item
   * @param contentId The content ID to attach subtitle to
   * @param file Subtitle file (.srt/.vtt)
   * @param language Language code (e.g. es, en, pt-br)
   */
  async uploadContentSubtitle(
    contentId: number,
    file: File,
    language: string
  ): Promise<ApiResult<{ path: string }>> {
    try {
      const formData = new FormData();
      formData.append('language', language.trim().toLowerCase());
      formData.append('file', file);

      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/admin/content/${contentId}/subtitles/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('iptv_auth_token')}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Subtitle upload failed' }));
        throw new Error(error.message || error.details || 'Subtitle upload failed');
      }

      const data = await response.json();
      return {
        success: true,
        data: { path: data.path }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'Subtitle Upload Failed',
          details: error instanceof Error ? error.message : 'Failed to upload subtitle',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async deleteContentSubtitle(
    contentId: number,
    subtitleId: number
  ): Promise<ApiResult<{ success: boolean; message?: string }>> {
    return apiService.delete<{ success: boolean; message?: string }>(
      `/api/admin/content/${contentId}/subtitles/${subtitleId}`
    );
  }

  async uploadEpisodeSubtitle(
    episodeId: number,
    file: File,
    language: string
  ): Promise<ApiResult<{ path: string }>> {
    try {
      const formData = new FormData();
      formData.append('language', language.trim().toLowerCase());
      formData.append('file', file);

      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/admin/episodes/${episodeId}/subtitles/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('iptv_auth_token')}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Subtitle upload failed' }));
        throw new Error(error.message || error.details || 'Subtitle upload failed');
      }

      const data = await response.json();
      return {
        success: true,
        data: { path: data.path }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'Episode Subtitle Upload Failed',
          details: error instanceof Error ? error.message : 'Failed to upload episode subtitle',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async deleteEpisodeSubtitle(
    episodeId: number,
    subtitleId: number
  ): Promise<ApiResult<{ success: boolean; message?: string }>> {
    return apiService.delete<{ success: boolean; message?: string }>(
      `/api/admin/episodes/${episodeId}/subtitles/${subtitleId}`
    );
  }

  async addContentSubtitleUrl(
    contentId: number,
    language: string,
    url: string
  ): Promise<ApiResult<{ path: string }>> {
    return apiService.post<{ path: string }>(
      `/api/admin/content/${contentId}/subtitles/url`,
      { language: language.trim().toLowerCase(), url: url.trim() }
    );
  }

  async addEpisodeSubtitleUrl(
    episodeId: number,
    language: string,
    url: string
  ): Promise<ApiResult<{ path: string }>> {
    return apiService.post<{ path: string }>(
      `/api/admin/episodes/${episodeId}/subtitles/url`,
      { language: language.trim().toLowerCase(), url: url.trim() }
    );
  }

  /**
   * Upload video file for a series episode
   * @param episodeId The episode ID to upload video for
   * @param file The video file to upload
   * @returns The path where the video was stored
   */
  async uploadEpisodeVideo(episodeId: number, file: File): Promise<ApiResult<{ path: string }>> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/admin/episodes/${episodeId}/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('iptv_auth_token')}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(error.message || error.details || 'Upload failed');
      }

      const data = await response.json();
      return {
        success: true,
        data: { path: data.path }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'Episode Video Upload Failed',
          details: error instanceof Error ? error.message : 'Failed to upload episode video',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

export const contentService = new ContentService();
