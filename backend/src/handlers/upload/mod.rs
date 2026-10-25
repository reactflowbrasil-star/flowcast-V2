pub mod helpers;
pub mod media;
pub mod subtitles;
pub mod video;

use axum::{
    extract::DefaultBodyLimit,
    routing::{delete, post},
    Router,
};
use serde::{Deserialize, Serialize};

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub success: bool,
    pub path: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct MediaUploadResponse {
    pub success: bool,
    pub url: String,
    pub path: String,
    pub filename: String,
    pub size: u64,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct UploadQuery {
    /// Optional filename override
    pub filename: Option<String>,
}

/// Create upload routes
pub fn upload_routes() -> Router<AppState> {
    Router::new()
        .route("/content/:id/upload", post(video::upload_content_video))
        .route(
            "/content/:id/subtitles/upload",
            post(subtitles::upload_content_subtitle),
        )
        .route(
            "/content/:id/subtitles/:subtitle_id",
            delete(subtitles::delete_content_subtitle),
        )
        .route(
            "/episodes/:id/subtitles/upload",
            post(subtitles::upload_episode_subtitle),
        )
        .route(
            "/episodes/:id/subtitles/:subtitle_id",
            delete(subtitles::delete_episode_subtitle),
        )
        .route(
            "/content/:id/subtitles/url",
            post(subtitles::add_content_subtitle_url),
        )
        .route(
            "/episodes/:id/subtitles/url",
            post(subtitles::add_episode_subtitle_url),
        )
        .route("/episodes/:id/upload", post(video::upload_episode_video))
        .route("/media/upload", post(media::upload_media_file))
        // Allow up to 10GB for video files
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024 * 1024))
}
