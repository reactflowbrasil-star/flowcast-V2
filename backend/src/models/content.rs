use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::models::ContentJoined;

// TMDB API models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbSearchResponse {
    pub page: i32,
    pub results: Vec<TmdbSearchResult>,
    pub total_pages: i32,
    pub total_results: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbSearchResult {
    pub id: i64,
    pub title: Option<String>,
    pub name: Option<String>, // For TV shows
    pub original_title: Option<String>,
    pub original_name: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub release_date: Option<String>,
    pub first_air_date: Option<String>, // For TV shows
    pub media_type: Option<String>,
    pub original_language: Option<String>,
    pub genre_ids: Option<Vec<i32>>,
    pub origin_country: Option<Vec<String>>,
    pub popularity: Option<f64>,
    pub video: Option<bool>,
    pub vote_average: Option<f64>,
    pub vote_count: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbMovieDetails {
    pub id: i64,
    pub title: String,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub release_date: Option<String>,
    pub runtime: Option<i32>,
    pub genres: Vec<TmdbGenre>,
    pub vote_average: f64,
    pub vote_count: i32,
    pub imdb_id: Option<String>,
}

/// Cast member from TMDB credits API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbCastMember {
    pub id: i64,
    pub name: String,
    pub character: Option<String>,
    pub profile_path: Option<String>,
    pub order: Option<i32>,
}

/// Credits response from TMDB (includes cast and crew)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbCredits {
    pub id: i64,
    pub cast: Vec<TmdbCastMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbTvDetails {
    pub id: i64,
    pub name: String,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub first_air_date: Option<String>,
    pub last_air_date: Option<String>,
    pub number_of_seasons: i32,
    pub number_of_episodes: i32,
    pub genres: Vec<TmdbGenre>,
    pub vote_average: f64,
    pub vote_count: i32,
    pub seasons: Vec<TmdbSeason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbGenre {
    pub id: i32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbSeason {
    pub id: i64,
    pub season_number: i32,
    pub episode_count: i32,
    pub name: String,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub air_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbSeasonDetails {
    pub id: i64,
    pub season_number: i32,
    pub name: String,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub air_date: Option<String>,
    pub episodes: Vec<TmdbEpisode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbEpisode {
    pub id: i64,
    pub episode_number: i32,
    pub name: String,
    pub overview: Option<String>,
    pub still_path: Option<String>,
    pub air_date: Option<String>,
    pub runtime: Option<i32>,
    pub vote_average: f64,
    pub vote_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub category_type: String, // VOD, TV, Eventos, Kids, Anime, Series
    #[sqlx(default)]
    pub tmdb_id: Option<i64>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TvChannelCategory {
    pub id: i64,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MediaContent {
    pub id: i64,
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub media_type: String, // 'movie', 'tv_channel', 'series', 'event', 'anime', 'kids'
    pub active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Movie {
    pub media_content_id: i64,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub duration: Option<i32>,
    pub rating: Option<f32>,
    pub genre: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TvChannel {
    pub media_content_id: i64,
    pub channel_number: Option<i64>,
    pub is_live: bool,
    pub provider: Option<String>,
    pub country: Option<String>,
    pub epg_source_id: Option<i64>,
    pub epg_channel_id: Option<String>,
    pub epg_offset_minutes: Option<i64>,
    pub channel_category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MediaStream {
    pub id: i64,
    pub media_content_id: i64,
    pub stream_url: String,
    pub stream_type: String, // 'hls', 'dash', 'mp4', 'mkv', 'direct'
    pub quality: Option<String>, // '1080p', '720p', '4k'
    pub language: Option<String>,
    pub is_default: bool,
    pub format: Option<String>, // 'DRM' or 'M3U8' 
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
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Series {
    pub id: i64,
    pub content_id: i64,
    pub total_seasons: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Season {
    pub id: i64,
    pub series_id: i64,
    pub season_number: i32,
    pub total_episodes: i32,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub tmdb_id: Option<i64>,
    pub air_date: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Episode {
    pub id: i64,
    pub season_id: i64,
    pub episode_number: i32,
    pub title: String,
    pub description: Option<String>,
    pub stream_url: String,
    pub image_url: Option<String>,
    pub duration: Option<i32>,
    pub tmdb_id: Option<i64>,
    pub air_date: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ContentSubtitle {
    pub id: i64,
    pub media_content_id: i64,
    pub language: String,
    pub file_path: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EpisodeSubtitle {
    pub id: i64,
    pub episode_id: i64,
    pub language: String,
    pub file_path: String,
    pub created_at: DateTime<Utc>,
}

// Complete series structure with all related data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesWithDetails {
    pub id: i64,
    pub content: ContentJoined,
    pub total_seasons: i32,
    pub seasons: Vec<SeasonWithEpisodes>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeasonWithEpisodes {
    pub id: i64,
    pub series_id: i64,
    pub season_number: i32,
    pub total_episodes: i32,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub tmdb_id: Option<i64>,
    pub air_date: Option<String>,
    pub episodes: Vec<Episode>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeWithDecryptedUrl {
    pub id: i64,
    pub season_id: i64,
    pub episode_number: i32,
    pub title: String,
    pub description: Option<String>,
    pub stream_url: String, // Decrypted URL for delivery
    pub image_url: Option<String>,
    pub created_at: DateTime<Utc>,
}

// Specialized content types (Req 7.1, 7.3, 7.4)

// Events with daily scheduling (Req 7.3)
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Event {
    pub id: i64,
    pub content_id: i64,
    pub event_type: String, // 'live', 'scheduled', 'recurring'
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EventSchedule {
    pub id: i64,
    pub event_id: i64,
    pub schedule_date: chrono::NaiveDate,
    pub start_time: chrono::NaiveTime,
    pub end_time: Option<chrono::NaiveTime>,
    #[sqlx(rename = "stream_url")]
    pub stream_url: String,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventWithSchedules {
    pub id: i64,
    pub content: ContentJoined,
    pub event_type: String,
    pub schedules: Vec<EventSchedule>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleWithDecryptedUrl {
    pub id: i64,
    pub event_id: i64,
    pub schedule_date: chrono::NaiveDate,
    pub start_time: chrono::NaiveTime,
    pub end_time: Option<chrono::NaiveTime>,
    pub stream_url: String, // Decrypted URL for delivery
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub created_at: DateTime<Utc>,
}
// TMDB Videos/Trailers API models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbVideosResponse {
    pub id: i64,
    pub results: Vec<TmdbVideo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbVideo {
    pub id: String,
    pub iso_639_1: String,
    pub iso_3166_1: String,
    pub key: String,
    pub name: String,
    pub site: String,
    #[serde(rename = "type")]
    pub video_type: String,
    pub official: bool,
    pub published_at: Option<String>,
}

impl TmdbVideo {
    /// Get YouTube URL for this video
    pub fn get_youtube_url(&self) -> Option<String> {
        if self.site.to_lowercase() == "youtube" {
            Some(format!("https://www.youtube.com/watch?v={}", self.key))
        } else {
            None
        }
    }

    /// Check if this video is a trailer
    pub fn is_trailer(&self) -> bool {
        self.video_type.to_lowercase() == "trailer"
    }

    /// Check if this video is official
    pub fn is_official(&self) -> bool {
        self.official
    }
}
