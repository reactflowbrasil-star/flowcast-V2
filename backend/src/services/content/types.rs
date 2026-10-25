use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ─── Internal helper struct ───────────────────────────────────────────

#[derive(FromRow)]
pub(crate) struct SeriesData {
    pub id: i64,
    pub content_id: Option<i64>,
    pub total_seasons: i32,
    pub series_created_at: Option<DateTime<Utc>>,
    pub category_id: Option<i64>,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub stream_url: Option<String>,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub content_created_at: Option<DateTime<Utc>>,
}

// ─── Category Requests ────────────────────────────────────────────────

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

// ─── Generic Content Requests ─────────────────────────────────────────

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
    pub genre: Option<String>,
    pub duration: Option<i32>,
    pub rating: Option<f32>,
    pub quality: Option<String>,
    pub language: Option<String>,
    pub audio_languages: Option<String>,
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,
    pub channel_number: Option<i64>,
    pub is_live: Option<bool>,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<String>,
    pub epg_source_id: Option<i64>,
    pub epg_channel_id: Option<String>,
    pub epg_offset_minutes: Option<i64>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
    pub active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContentFromTmdbRequest {
    pub category_id: i64,
    pub tmdb_id: i64,
    pub media_type: String,
    pub stream_url: String,
    #[serde(default)]
    pub active: Option<bool>,
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
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<String>,
    pub active: Option<bool>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ContentWithDecryptedUrl {
    pub id: i64,
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub stream_url: String,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub channel_number: Option<i64>,
    pub created_at: String,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<String>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
    pub user_agent: Option<String>,
    pub origin: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
}

// ─── Movie Requests ───────────────────────────────────────────────────

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

// ─── TV Channel Requests ──────────────────────────────────────────────

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
    pub format: Option<String>,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<String>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    pub proxy_url: Option<String>,
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
    pub format: Option<String>,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<String>,
    pub active: Option<bool>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
}

// ─── Series/Season/Episode Requests ───────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateSeriesRequest {
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub total_seasons: i32,
    /// Optional category type override (e.g. "Anime"). Defaults to "Series".
    pub category_type: Option<String>,
    /// Optional episodes keyed by season_number
    #[serde(default)]
    pub episodes_by_season: Option<Vec<ServiceSeasonInput>>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServiceSeasonInput {
    pub season_number: i32,
    pub episodes: Vec<ServiceEpisodeInput>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServiceEpisodeInput {
    pub episode_number: i32,
    pub title: String,
    pub video_url: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSeriesFromTmdbRequest {
    pub tmdb_id: i64,
    pub episode_urls: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnimeSeriesFromTmdbRequest {
    pub tmdb_id: i64,
    pub episode_urls: Option<std::collections::HashMap<String, String>>,
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
    pub duration: Option<i32>,
    pub tmdb_id: Option<i64>,
    pub air_date: Option<String>,
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

// ─── Event Requests ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateEventRequest {
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub event_type: String,
    pub provider: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,
    pub drm_keys: Option<String>,
    pub stream_url: String,
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

// ─── Kids/Anime Content Requests ──────────────────────────────────────

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


