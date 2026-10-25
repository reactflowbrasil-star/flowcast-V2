use crate::models::{Category, ContentJoined};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct CategoryResponse {
    pub id: i64,
    pub name: String,
    pub category_type: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ContentResponse {
    pub id: i64,
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub poster_url: Option<String>,
    pub image_url: Option<String>, // Added for Android compatibility
    pub backdrop_url: Option<String>,
    pub stream_url: String,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub runtime: Option<i32>,
    pub channel_number: Option<i64>,
    pub channel_category: Option<String>,
    pub genre: Option<String>, // Added for movie genre filtering
    pub is_live: Option<bool>,
    pub active: bool,
    pub created_at: String,
    pub content_type: String,
    // TV Channel specific fields
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,
    pub drm_keys: Option<String>,
    // LiveTV specific headers
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    // Per-channel HTTP proxy for Live TV
    pub proxy_url: Option<String>,
    // Per-channel DNS-over-HTTPS
    pub doh_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TvChannelCategoryAdminResponse {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub usage_count: i64,
    pub is_default: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateTvChannelCategoryPayload {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTvChannelCategoryPayload {
    pub name: String,
}

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
pub struct AssignCategoryRequest {
    pub category_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateContentRequest {
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub stream_url: String,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    // TV Channel specific fields
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,
    pub channel_number: Option<i64>,
    pub is_live: Option<bool>,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>, // 'clearkey', 'widevine', 'playready', or NULL
    pub license_server_url: Option<String>, // URL for Widevine/PlayReady license server
    pub drm_headers: Option<String>, // JSON string with custom headers for license requests
    // LiveTV specific headers
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    // Per-channel HTTP proxy for Live TV (format: http://user:pass@ip:port)
    pub proxy_url: Option<String>,
    // Per-channel DNS-over-HTTPS resolver
    pub doh_url: Option<String>,
    pub active: Option<bool>,
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

#[derive(Debug, Deserialize)]
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
    // Series-specific fields
    pub tmdb_id: Option<i64>,
    pub total_seasons: Option<i32>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub channel_category: Option<String>,
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

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i32>,
    pub limit: Option<i32>,
}

/// Optional language query parameter for delivery endpoints
#[derive(Debug, Deserialize, Default)]
pub struct DeliveryLangQuery {
    pub lang: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TvChannelsQuery {
    pub page: Option<i32>,
    pub limit: Option<i32>,
    pub channel_category: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub category: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EnhancedSearchQuery {
    pub q: String,
    // Canonical input is `category` (type name). Keep `category_id` as alias
    // for frontend compatibility and resolve it in the handler layer.
    #[serde(alias = "category_id")]
    pub category: Option<String>,
    pub year: Option<i64>,
    pub tmdb_id: Option<i64>,
    pub page: Option<i32>,
    pub limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ContentQuery {
    pub category: Option<String>,
    pub page: Option<i32>,
    pub limit: Option<i32>,
    #[serde(default)]
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GenreQuery {
    pub genre: String,
    pub page: Option<i32>,
    pub limit: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct ContentDeliveryResponse {
    pub id: i64,
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub stream_url: String,                    // Decrypted URL for delivery
    pub subtitle_url: Option<String>,          // Optional external subtitle URL (served by backend)
    pub subtitles: Vec<SubtitleTrackResponse>, // Full list of available subtitle tracks
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub channel_number: Option<i64>, // Channel number for display
    pub created_at: String,
    pub drm_keys: Option<String>, // Original hexadecimal format (kid:key pairs)
    pub drm_keys_exo: Option<String>, // ClearKey JSON for ExoPlayer (Base64URL format)
    pub drm_type: Option<String>, // 'clearkey', 'widevine', 'playready', or NULL
    pub license_server_url: Option<String>, // URL for Widevine/PlayReady license server
    pub drm_headers: Option<serde_json::Value>, // Parsed JSON object with custom headers for license requests
    // Per-channel HTTP proxy for Live TV
    pub proxy_url: Option<String>,
    // Per-channel DNS-over-HTTPS for Live TV
    pub doh_url: Option<String>,
    // Stream request headers (CRITICAL for DRM on Android TV)
    pub user_agent: Option<String>, // Custom User-Agent header for stream requests
    pub origin: Option<String>,     // Origin header for CORS
    pub referer: Option<String>,    // Referer header for authentication
    pub custom_headers: Option<String>, // JSON string with additional custom headers
    // Auth scope flags - CRITICAL: tells client whether to send JWT auth headers
    #[serde(default)]
    pub requires_auth: bool, // True if stream_url is internal (served by backend), false for external URLs
    #[serde(default)]
    pub is_internal_stream: bool, // True if stream is served by our backend (local files, proxied content)
}

#[derive(Debug, Serialize, Clone)]
pub struct SubtitleTrackResponse {
    pub id: i64,
    pub language: String,
    pub label: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct EnhancedContentResponse {
    pub id: i64,
    pub category: CategoryResponse,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub created_at: String,
    pub stream_url: String,
}

#[derive(Debug, Serialize)]
pub struct ContentListResponse {
    pub content: Vec<EnhancedContentResponse>,
    pub total: i64,
    pub page: i32,
    pub limit: i32,
    pub has_more: bool,
}

#[derive(Debug, Serialize)]
pub struct AdminContentListResponse {
    pub content: Vec<ContentResponse>,
    pub total: i64,
    pub page: i32,
    pub limit: i32,
    pub has_more: bool,
}

impl From<Category> for CategoryResponse {
    fn from(category: Category) -> Self {
        Self {
            id: category.id,
            name: category.name,
            category_type: category.category_type,
            created_at: category.created_at.to_rfc3339(),
        }
    }
}

impl From<ContentJoined> for ContentResponse {
    fn from(content: ContentJoined) -> Self {
        Self {
            id: content.id,
            category_id: content.category_id,
            title: content.title,
            description: content.description,
            poster_url: content.image_url.clone(), // Map image_url to poster_url for frontend
            image_url: content.image_url,          // Direct mapping for Android compatibility
            backdrop_url: content.backdrop_url,    // Now supported!
            stream_url: content.stream_url.unwrap_or_default(),
            tmdb_id: content.tmdb_id,
            year: content.year,
            runtime: content.duration,
            channel_number: content.channel_number,
            channel_category: content.genre.clone(), // For TV channels
            genre: content.genre,                    // Added for movie genre filtering
            is_live: content.is_live,
            active: content.active,
            created_at: content.created_at.to_rfc3339(),
            // TECH DEBT RESOLVED: content_type is now retrieved directly from the categories table
            content_type: content.category_type.unwrap_or_else(|| {
                // Fallback if category_type is missing for some reason
                if content.is_live == Some(true) {
                    "tv".to_string()
                } else {
                    "vod".to_string()
                }
            }),
            // TV Channel specific fields
            provider: content.provider,
            country: content.country,
            format: content.format,
            drm_keys: content.drm_keys,
            // LiveTV specific headers
            origin: content.origin,
            user_agent: content.user_agent,
            referer: content.referer,
            custom_headers: content.custom_headers,
            // proxy per channel (Live TV)
            proxy_url: content.proxy_url,
            // doh per channel (Live TV)
            doh_url: content.doh_url,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::EnhancedSearchQuery;
    use axum::{extract::Query, http::Uri};

    #[test]
    fn enhanced_search_query_accepts_category_id_alias() {
        let uri: Uri = "/api/delivery/content/search?q=test&category_id=42&page=2&limit=10"
            .parse()
            .unwrap();

        let Query(parsed) =
            Query::<EnhancedSearchQuery>::try_from_uri(&uri).expect("query should parse");

        assert_eq!(parsed.q, "test");
        assert_eq!(parsed.category.as_deref(), Some("42"));
        assert_eq!(parsed.page, Some(2));
        assert_eq!(parsed.limit, Some(10));
    }
}
