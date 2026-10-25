// Content types based on backend API requirements

export enum CategoryType {
  VOD = 'VOD',
  TV = 'TV',
  EVENTOS = 'Eventos',
  KIDS = 'Kids',
  ANIME = 'Anime'
}

export enum ContentType {
  VOD = 'vod',
  TV = 'tv',
  SERIES = 'series',
  EVENTS = 'events',
  KIDS = 'kids',
  ANIME = 'anime'
}

export interface Category {
  id: number;
  name: string;
  category_type: CategoryType;
  tmdb_id?: number;  // TMDB category/genre ID for metadata
  created_at?: string;
}

export interface TvChannelCategoryAdmin {
  id: number;
  name: string;
  created_at: string;
  usage_count: number;
  is_default: boolean;
}

export interface Content {
  id: number;
  title: string;
  description?: string;
  image_url?: string;
  poster_url?: string;
  backdrop_url?: string;
  stream_url?: string;
  video_url?: string;
  file_path?: string;
  content_type?: string; // Changed from 'type: ContentType' to match backend
  category_id?: number;
  tmdb_id?: number;
  year?: number;
  runtime?: number;
  duration?: number;  // Duration in seconds
  rating?: number;    // Content rating (e.g., 7.5/10)
  genre?: string;
  quality?: string;   // Quality indicator (HD, 4K, etc.)
  language?: string;  // Primary language
  subtitle_languages?: string;  // Available subtitle languages (JSON array)
  audio_languages?: string;     // Available audio languages (JSON array)
  channel_number?: number;
  channel_category?: string;
  is_live?: boolean;
  active: boolean;
  created_at: string;
  // TV Channel specific fields
  provider?: string;
  country?: string;
  format?: string;
  drm_keys?: string;
  // DRM configuration (Widevine/PlayReady)
  drm_type?: 'clearkey' | 'widevine' | 'playready';
  license_server_url?: string;
  drm_headers?: Record<string, string>;
  // EPG integration fields
  epg_source_id?: number;
  epg_channel_id?: string;
  epg_offset_minutes?: number;
  // LiveTV specific headers
  origin?: string;
  user_agent?: string;
  referer?: string;
  custom_headers?: string;
  // Per-channel HTTP proxy (Live TV only). Format: http://user:pass@ip:port
  proxy_url?: string;
  // Per-channel DNS-over-HTTPS resolver
  doh_url?: string;
}

export interface Series {
  id: number;
  title: string;
  description?: string;
  image_url?: string;
  poster_url?: string;
  backdrop_url?: string;
  category_id?: number;
  tmdb_id?: number;
  year?: number;
  total_seasons?: number;
  active?: boolean;
  created_at?: string;
  seasons?: Season[];
}

export interface Season {
  id: number;
  series_id: number;
  season_number: number;
  total_episodes?: number;
  title?: string;
  description?: string;
  poster_url?: string;
  image_url?: string;
  backdrop_url?: string;
  tmdb_id?: number;
  air_date?: string;
  episodes?: Episode[];
  created_at?: string;
}

export interface ContentListResponse {
  content: Content[];
  category?: Category;
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface DeliveryCategory {
  id: number;
  name: string;
  category_type: string;
  created_at: string;
}

export interface DeliveryContent {
  id: number;
  category: DeliveryCategory;
  title: string;
  description?: string;
  image_url?: string;
  backdrop_url?: string;
  tmdb_id?: number;
  year?: number;
  rating?: number;
  created_at: string;
  stream_url: string;
}

export interface DeliveryContentListResponse {
  content: DeliveryContent[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface SubtitleTrackResponse {
  id: number;
  language: string;
  label: string;
  url: string;
}

export interface StreamResponse {
  id: number;
  category_id: number;
  title: string;
  description?: string | null;
  image_url?: string | null;
  stream_url: string;
  subtitle_url?: string | null;
  subtitles?: SubtitleTrackResponse[];
  tmdb_id?: number | null;
  year?: number | null;
  channel_number?: number | null;
  created_at: string;
  drm_keys?: string | null;
  drm_keys_exo?: string | null;
  drm_type?: 'clearkey' | 'widevine' | 'playready' | null;
  license_server_url?: string | null;
  drm_headers?: Record<string, string> | null;
  proxy_url?: string | null;
  doh_url?: string | null;
  user_agent?: string | null;
  origin?: string | null;
  referer?: string | null;
  custom_headers?: string | null;
  requires_auth?: boolean;
  is_internal_stream?: boolean;
}

/** A single media stream entry for multi-stream support */
export interface StreamInfo {
  id: number;
  media_content_id: number;
  stream_url: string;
  stream_type: string;
  is_default: boolean;
  quality?: string | null;
  language?: string | null;
  audio_languages?: string | null;
  format?: string | null;
  drm_keys?: string | null;
  drm_type?: string | null;
  license_server_url?: string | null;
  drm_headers?: string | null;
  proxy_url?: string | null;
  doh_url?: string | null;
  origin?: string | null;
  user_agent?: string | null;
  referer?: string | null;
  custom_headers?: string | null;
}

/** Public stream response for user-facing quality selector (matches backend StreamPublicResponse) */
export interface StreamPublicInfo {
  id: number;
  is_default: boolean;
  quality?: string | null;
  language?: string | null;
  audio_languages?: string | null;
  format?: string | null;
  stream_url: string;
  drm_keys?: string | null;
  drm_keys_json?: string | null;
  drm_type?: string | null;
  license_server_url?: string | null;
  drm_headers?: Record<string, string> | null;
  proxy_url?: string | null;
  doh_url?: string | null;
  origin?: string | null;
  user_agent?: string | null;
  referer?: string | null;
  custom_headers?: string | null;
}

export interface Episode {
  id?: number;
  series_id?: number;
  season_id?: number;
  episode_number: number;
  title: string;
  description?: string;
  stream_url?: string;
  duration?: number;   // Duration in seconds
  runtime?: number;    // Runtime in minutes (alias for duration)
  tmdb_id?: number;    // TMDB episode ID
  image_url?: string;
  poster_url?: string; // Alias for image_url
  air_date?: string;
  created_at?: string;
}

export interface SearchRequest {
  q: string;
  category?: string;
  year?: number;
  tmdb_id?: number;
  page?: number;
  limit?: number;
}

export interface SearchResponse {
  content: DeliveryContent[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  total_pages: number;
}

// LiveTV specific interfaces
export interface CreateTvChannelRequest {
  name: string;
  description?: string;
  logo_url?: string;
  stream_url: string;
  channel_number?: number;
  is_live: boolean;
  channel_category?: string;
  provider?: string;
  country?: string;
  format?: string;
  drm_keys?: string;
  active?: boolean;
  // LiveTV specific headers
  origin?: string;
  user_agent?: string;
  referer?: string;
  custom_headers?: string;
  // Per-channel HTTP proxy (Live TV only)
  proxy_url?: string;
  // Per-channel DNS-over-HTTPS resolver
  doh_url?: string;
}

export interface TvProviderRecord {
  id: number;
  name: string;
  url: string;
  ttl_minutes: number;
  enabled: boolean;
  last_fetched_at?: string | null;
  next_refresh_at?: string | null;
  last_status?: string | null;
  created_at: string;
}

export interface ScanFolderIngestResult {
  movies_created: number;
  series_created: number;
  episodes_created: number;
  subtitles_added: number;
  skipped: number;
  replaced: number;
  logs: string[];
}

export interface TmdbMetadataRefreshResult {
  total_candidates: number;
  updated: number;
  skipped: number;
  errors: string[];
  logs: string[];
}

export interface UpdateTvChannelRequest {
  name: string;
  description?: string;
  logo_url?: string;
  stream_url: string;
  channel_number?: number;
  is_live: boolean;
  channel_category?: string;
  provider?: string;
  country?: string;
  format?: string;
  drm_keys?: string;
  active?: boolean;
  // LiveTV specific headers
  origin?: string;
  user_agent?: string;
  referer?: string;
  custom_headers?: string;
  // Per-channel HTTP proxy (Live TV only)
  proxy_url?: string;
  // Per-channel DNS-over-HTTPS resolver
  doh_url?: string;
}

export interface TvChannelFormData {
  name: string;
  description: string;
  logo_url: string;
  stream_url: string;
  channel_number: number;
  is_live: boolean;
  provider: string;
  country: string;
  format: string;
  drm_keys: string;
  active: boolean;
  // LiveTV specific headers
  origin: string;
  user_agent: string;
  referer: string;
  custom_headers: string;
  // Per-channel HTTP proxy (Live TV only)
  proxy_url?: string;
  // Per-channel DNS-over-HTTPS resolver
  doh_url?: string;
}
