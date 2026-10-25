// Legacy type definitions below are kept for backward compatibility

#[derive(Debug, Deserialize)]
pub struct CreateCategoryRequest {
    pub name: String,
    pub category_type: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryRequest {
    pub name: Option<String>,
    pub category_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContentRequest {
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub backdrop_url: Option<String>, // Added backdrop URL for movies and series
    pub stream_url: String,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    // Optional content genre/subcategory (used for TV channel category)
    pub genre: Option<String>,
    // Media metadata
    pub duration: Option<i32>,
    pub rating: Option<f32>,
    pub quality: Option<String>,
    pub language: Option<String>,
    pub audio_languages: Option<String>,
    // TV Channel specific fields
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,
    pub channel_number: Option<i64>,
    pub is_live: Option<bool>,
    pub drm_keys: Option<String>, // ClearKey keys in hexadecimal format (kid:key pairs)
    pub drm_type: Option<String>, // 'clearkey', 'widevine', 'playready', or NULL
    pub license_server_url: Option<String>, // URL for Widevine/PlayReady license server
    pub drm_headers: Option<String>, // JSON string with custom headers for license requests
    // EPG integration
    pub epg_source_id: Option<i64>,
    pub epg_channel_id: Option<String>,
    pub epg_offset_minutes: Option<i64>,
    // LiveTV specific headers
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    // Per-channel HTTP proxy for Live TV (format: http://user:pass@ip:port)
    pub proxy_url: Option<String>,
    // Per-channel DNS-over-HTTPS resolver endpoint
    pub doh_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContentFromTmdbRequest {
    pub category_id: i64,
    pub tmdb_id: i64,
    pub media_type: String, // "movie" or "tv"
    pub stream_url: String,
    #[serde(default)]
    pub active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMovieRequest {
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub stream_url: String,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub runtime: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTvChannelRequest {
    pub name: String,
    pub description: Option<String>,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub channel_number: Option<i64>,
    pub is_live: bool,
    pub channel_category: Option<String>,
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,             // 'DRM' or 'M3U8'
    pub drm_keys: Option<String>,           // ClearKey keys in hexadecimal format (kid:key pairs)
    pub drm_type: Option<String>,           // 'clearkey', 'widevine', 'playready', or NULL
    pub license_server_url: Option<String>, // URL for Widevine/PlayReady license server
    pub drm_headers: Option<String>,        // JSON string with custom headers for license requests
    // LiveTV specific headers
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    // Per-channel HTTP proxy for Live TV
    pub proxy_url: Option<String>,
    // Per-channel DNS-over-HTTPS resolver
    pub doh_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TvChannelCategoryWithUsage {
    pub id: i64,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub usage_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTvChannelRequest {
    pub name: String,
    pub description: Option<String>,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub channel_number: Option<i64>,
    pub is_live: bool,
    pub channel_category: Option<String>,
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,             // 'DRM' or 'M3U8'
    pub drm_keys: Option<String>,           // ClearKey keys in hexadecimal format (kid:key pairs)
    pub drm_type: Option<String>,           // 'clearkey', 'widevine', 'playready', or NULL
    pub license_server_url: Option<String>, // URL for Widevine/PlayReady license server
    pub drm_headers: Option<String>,        // JSON string with custom headers for license requests
    pub active: Option<bool>,
    // LiveTV specific headers
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    // Per-channel HTTP proxy for Live TV
    pub proxy_url: Option<String>,
    // Per-channel DNS-over-HTTPS resolver
    pub doh_url: Option<String>,
}

#[derive(Debug)]
pub struct UpdateContentRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub stream_url: Option<String>,
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,
    pub channel_number: Option<i64>,
    pub is_live: Option<bool>,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>, // 'clearkey', 'widevine', 'playready', or NULL
    pub license_server_url: Option<String>, // URL for Widevine/PlayReady license server
    pub drm_headers: Option<String>, // JSON string with custom headers for license requests
    pub active: Option<bool>,
    // LiveTV specific headers
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    // Per-channel HTTP proxy for Live TV
    pub proxy_url: Option<String>,
    // Per-channel DNS-over-HTTPS resolver
    pub doh_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ContentWithDecryptedUrl {
    pub id: i64,
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub stream_url: String, // Decrypted URL for delivery
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub channel_number: Option<i64>, // Channel number for TV channels
    pub created_at: String,
    pub drm_keys: Option<String>, // ClearKey JSON for ExoPlayer (Base64URL format)
    pub drm_type: Option<String>, // 'clearkey', 'widevine', 'playready', or NULL
    pub license_server_url: Option<String>, // URL for Widevine/PlayReady license server
    pub drm_headers: Option<String>, // JSON string with custom headers for license requests
    pub proxy_url: Option<String>, // Optional HTTP proxy for Live TV streams
    pub doh_url: Option<String>,  // Optional DNS-over-HTTPS resolver
    // Stream request headers (CRITICAL for DRM on Android TV)
    pub user_agent: Option<String>, // Custom User-Agent header for stream requests
    pub origin: Option<String>,     // Origin header for CORS
    pub referer: Option<String>,    // Referer header for authentication
    pub custom_headers: Option<String>, // JSON string with additional custom headers
}

// Series management requests
#[derive(Debug, Deserialize)]
pub struct CreateSeriesRequest {
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub total_seasons: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateSeriesFromTmdbRequest {
    pub tmdb_id: i64,
    pub episode_urls: Option<std::collections::HashMap<String, String>>, // "season-episode" -> "url"
}

#[derive(Debug, Deserialize)]
pub struct CreateAnimeSeriesFromTmdbRequest {
    pub tmdb_id: i64,
    pub episode_urls: Option<std::collections::HashMap<String, String>>, // "season-episode" -> "url"
}

#[derive(Debug, Deserialize)]
pub struct TmdbMetadataRefreshRequest {
    pub category_type: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct TmdbMetadataRefreshResult {
    pub total_candidates: i64,
    pub updated: i64,
    pub skipped: i64,
    pub errors: Vec<String>,
    pub logs: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSeasonRequest {
    pub series_id: i64,
    pub season_number: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateEpisodeRequest {
    pub season_id: i64,
    pub episode_number: i32,
    pub title: String,
    pub description: Option<String>,
    pub stream_url: String,
    pub image_url: Option<String>,
    pub duration: Option<i32>,
    pub tmdb_id: Option<i64>,
    pub air_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMultipleEpisodesRequest {
    pub season_id: i64,
    pub episodes: Vec<EpisodeData>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEpisodeRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub stream_url: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EpisodeData {
    pub episode_number: i32,
    pub title: String,
    pub description: Option<String>,
    pub stream_url: String,
    pub image_url: Option<String>,
    pub duration: Option<i32>,
    pub tmdb_id: Option<i64>,
    pub air_date: Option<String>,
}

// Specialized content requests (Req 7.2, 7.3, 7.4)

// Events requests (Req 7.3)
#[derive(Debug, Deserialize)]
pub struct CreateEventRequest {
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub event_type: String, // 'live', 'scheduled', 'recurring'
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,
    pub drm_keys: Option<String>,
    pub stream_url: String,
    // LiveTV/Streaming specific headers
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEventScheduleRequest {
    pub event_id: i64,
    pub schedule_date: chrono::NaiveDate,
    pub start_time: chrono::NaiveTime,
    pub end_time: Option<chrono::NaiveTime>,
    pub stream_url: String,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
}

// Kids/Anime content requests (Req 7.4)
#[derive(Debug, Deserialize)]
pub struct CreateKidsContentRequest {
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub stream_url: String,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnimeContentRequest {
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub stream_url: String,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
}
