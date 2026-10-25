use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserLoginHistory {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub login_timestamp: DateTime<Utc>,
    pub ip_address: Option<String>,
    pub device_info: Option<String>,
    pub user_agent: Option<String>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserViewingHistory {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub content_type: String,
    pub content_id: Option<i64>,
    pub content_title: String,
    pub episode_title: Option<String>,
    pub season_number: Option<i32>,
    pub episode_number: Option<i32>,
    pub start_timestamp: DateTime<Utc>,
    pub ip_address: Option<String>,
    pub device_info: Option<String>,
    pub user_agent: Option<String>,
    pub series_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateLoginHistoryRequest {
    pub user_id: i64,
    pub username: String,
    pub ip_address: Option<String>,
    pub device_info: Option<String>,
    pub user_agent: Option<String>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateViewingHistoryRequest {
    pub user_id: i64,
    pub username: String,
    pub content_type: String,
    pub content_id: Option<i64>,
    pub content_title: String,
    pub episode_title: Option<String>,
    pub season_number: Option<i32>,
    pub episode_number: Option<i32>,
    pub series_title: Option<String>,
    pub ip_address: Option<String>,
    pub device_info: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActivityFilters {
    pub page: Option<i64>,
    pub limit: Option<i64>,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub content_type: Option<String>,
    pub ip_address: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginHistoryResponse {
    pub logs: Vec<UserLoginHistory>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct ViewingHistoryResponse {
    pub logs: Vec<UserViewingHistory>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ContentType {
    Movie,
    SeriesEpisode,
    LiveTv,
    AnimeEpisode,
    Event,
}

impl std::fmt::Display for ContentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContentType::Movie => write!(f, "movie"),
            ContentType::SeriesEpisode => write!(f, "series_episode"),
            ContentType::LiveTv => write!(f, "live_tv"),
            ContentType::AnimeEpisode => write!(f, "anime_episode"),
            ContentType::Event => write!(f, "event"),
        }
    }
}

impl From<&str> for ContentType {
    fn from(s: &str) -> Self {
        match s {
            "movie" => ContentType::Movie,
            "series_episode" => ContentType::SeriesEpisode,
            "live_tv" => ContentType::LiveTv,
            "anime_episode" => ContentType::AnimeEpisode,
            "event" => ContentType::Event,
            _ => ContentType::Movie,
        }
    }
}

// Analytics models
#[derive(Debug, Serialize)]
pub struct DashboardMetrics {
    pub total_logins_today: i64,
    pub unique_active_users: i64,
    pub failed_login_attempts: i64,
    pub total_content_views: i64,
    pub most_viewed_content: Vec<PopularContent>,
    pub device_distribution: Vec<DeviceStats>,
    pub hourly_activity: Vec<HourlyActivity>,
    pub users_multiple_devices: Vec<MultiDeviceUser>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PopularContent {
    pub content_id: Option<i64>,
    pub content_title: String,
    pub content_type: String,
    pub view_count: i64,
}

#[derive(Debug, Serialize)]
pub struct DeviceStats {
    pub device_type: String,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Serialize)]
pub struct HourlyActivity {
    pub hour: i32,
    pub login_count: i64,
    pub view_count: i64,
}

#[derive(Debug, Serialize)]
pub struct MultiDeviceUser {
    pub user_id: i64,
    pub username: String,
    pub device_count: i64,
    pub devices: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginTrend {
    pub date: String,
    pub successful_logins: i64,
    pub failed_logins: i64,
    pub unique_users: i64,
}

#[derive(Debug, Serialize)]
pub struct ContentViewTrend {
    pub date: String,
    pub movie_views: i64,
    pub series_views: i64,
    pub live_tv_views: i64,
    pub total_views: i64,
}
