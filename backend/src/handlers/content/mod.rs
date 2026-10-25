use axum::{
    routing::{get, post, put, patch, delete},
    Router,
};
use crate::{AppState, services::ContentService};

pub mod admin;
pub mod bulk_import;
pub mod categories;
pub mod crud;
pub mod delivery;
pub mod helpers;
pub mod movies;
pub mod tmdb_admin;
pub mod tv_admin;
pub mod tv_channels;
pub mod types;

pub mod m3u;
pub mod streaming;
pub mod streams;
pub mod subtitles;
pub mod url;

pub use streaming::content_streaming_routes;
pub(crate) use subtitles::{build_subtitle_response, convert_srt_to_webvtt, language_label};
pub use subtitles::{list_content_subtitles, serve_content_subtitle};
pub(crate) use url::resolve_backend_base;
pub(crate) use url::{absolutize_content_response, absolutize_metadata_url, absolutize_stream_url, is_internal_url};

pub use admin::*;
pub use bulk_import::*;
pub use categories::*;
pub use crud::*;
pub use delivery::*;
pub use helpers::*;
pub use movies::*;
pub use tmdb_admin::*;
pub use tv_admin::*;
pub use tv_channels::*;
pub use types::*;

pub fn content_routes() -> Router<crate::AppState> {
    Router::new()
        .route("/categories", get(get_categories))
        .route("/categories/:id", get(get_category_by_id))
        .route("/", get(get_content))
        .route("/search", get(search_content))
        .route("/by-genre", get(get_content_by_genre))
        .route("/:id", get(get_content_by_id))
        .route("/:id/category", put(assign_content_to_category))
        .route("/genres", get(get_all_genres))
        .route("/:id/streams", get(streams::list_content_streams_public))
}

pub fn delivery_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/content/category/:id",
            get(get_enhanced_content_by_category),
        )
        .route("/content/search", get(enhanced_search_content))
}

pub fn movies_routes() -> Router<ContentService> {
    Router::new().route("/", get(get_movies))
}

pub fn tv_routes() -> Router<ContentService> {
    Router::new()
        .route("/channels", get(get_tv_channels))
        .route("/categories", get(get_tv_channel_categories))
}

pub fn admin_content_routes() -> Router<ContentService> {
    Router::new()
        .route("/", get(admin_get_content))
        .route("/categories", post(create_category))
        .route("/categories/:id", put(update_category))
        .route("/categories/:id", delete(delete_category))
        .route("/", post(create_content_manual))
        .route("/:id/status", put(toggle_content_status))
        .route("/:id", put(update_content))
        .route("/:id", delete(delete_content))
        .route("/tmdb", post(create_content_from_tmdb))
        .route("/tmdb/enrich", post(refresh_tmdb_metadata))
        .route(
            "/tmdb/enrich-single",
            post(enrich_content_tmdb),
        )
        .route("/movies", post(create_movie))
        .route("/content/bulk-import", post(bulk_import_movies))
        .route("/tv-channels", post(create_tv_channel))
        .route("/tv-channels/bulk", post(bulk_import_tv_channels))
        .route("/bulk-delete", post(bulk_delete_content))
        .route(
            "/tv-channel-categories",
            get(list_admin_tv_channel_categories),
        )
        .route(
            "/tv-channel-categories",
            post(create_admin_tv_channel_category),
        )
        .route(
            "/tv-channel-categories/:id",
            put(update_admin_tv_channel_category),
        )
        .route(
            "/tv-channel-categories/:id",
            delete(delete_admin_tv_channel_category),
        )
        .route(
            "/tv-channels/:id/epg",
            get(get_tv_channel_epg),
        )
        .route(
            "/tv-channels/:id/epg",
            patch(update_tv_channel_epg),
        )
        .route("/tv-channels/:id", put(update_tv_channel))
        .route("/tv-providers", get(list_tv_providers_admin))
        .route(
            "/tv-providers",
            post(create_tv_provider_admin),
        )
        .route(
            "/tv-providers/:id",
            delete(delete_tv_provider_admin),
        )
        .route(
            "/tv-providers/:id/sync",
            post(sync_tv_provider_admin),
        )
        .route(
            "/:id/edit",
            get(get_content_for_edit),
        )
        .route(
            "/:id/edit-with-seasons",
            get(get_content_with_seasons_for_edit),
        )
}

/// Stream management routes — mounted under /api/admin/content with AppState
pub fn admin_streams_routes() -> Router<crate::AppState> {
    Router::new()
        .route("/:id/streams", get(streams::list_content_streams))
        .route("/:id/streams", post(streams::create_content_stream))
        .route("/:id/streams/:stream_id", put(streams::update_content_stream))
        .route("/:id/streams/:stream_id", delete(streams::delete_content_stream))
}

/// Episode stream management routes — mounted under /api/admin/episodes with AppState
pub fn admin_episode_streams_routes() -> Router<crate::AppState> {
    Router::new()
        .route("/:id/streams", get(streams::list_episode_streams))
        .route("/:id/streams", post(streams::create_episode_stream))
        .route("/:id/streams/:stream_id", put(streams::update_episode_stream))
        .route("/:id/streams/:stream_id", delete(streams::delete_episode_stream))
}
