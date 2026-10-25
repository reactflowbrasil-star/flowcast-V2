use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ContentJoined {
    // From MediaContent
    pub id: i64,
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub media_type: String,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub category_type: Option<String>,

    // From Movie
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub duration: Option<i32>,
    pub rating: Option<f32>,
    pub genre: Option<String>,

    // From TvChannel
    pub channel_number: Option<i64>,
    pub is_live: Option<bool>,
    pub provider: Option<String>,
    pub country: Option<String>,
    pub epg_source_id: Option<i64>,
    pub epg_channel_id: Option<String>,
    pub epg_offset_minutes: Option<i64>,
    pub channel_category: Option<String>,

    // From MediaStream (Default stream)
    pub stream_id: Option<i64>,
    pub stream_url: Option<String>,
    pub stream_type: Option<String>,
    pub quality: Option<String>,
    pub language: Option<String>,
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
