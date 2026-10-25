use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Extension, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::Path as StdPath;
use tower::ServiceExt; // for .oneshot()
use tower_http::services::ServeFile;

use crate::{
    error::AppError,
    handlers::content::{
        build_subtitle_response, convert_srt_to_webvtt, language_label, verify_user_access,
        SubtitleTrackResponse,
    },
    models::{Episode, EpisodeWithDecryptedUrl, Season, SeriesWithDetails, UserRole},
    services::{Claims, ContentService},
};

fn parse_claim_user_id(claims: &Claims) -> Result<i64, AppError> {
    claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)
}

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
}

#[derive(Debug, Deserialize)]
pub struct CreateMultipleEpisodesRequest {
    pub season_id: i64,
    pub episodes: Vec<EpisodeData>,
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

#[derive(Debug, Deserialize)]
pub struct UpdateEpisodeRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub stream_url: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i32>,
    pub limit: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct SeriesResponse {
    pub id: i64,
    pub content: ContentResponse,
    pub total_seasons: i32,
    pub seasons: Vec<SeasonResponse>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ContentResponse {
    pub id: i64,
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SeasonResponse {
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
    pub episodes: Vec<EpisodeResponse>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct EpisodeResponse {
    pub id: i64,
    pub season_id: i64,
    pub episode_number: i32,
    pub title: String,
    pub description: Option<String>,
    pub stream_url: Option<String>,
    pub image_url: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct EpisodeDeliveryResponse {
    pub id: i64,
    pub season_id: i64,
    pub episode_number: i32,
    pub title: String,
    pub description: Option<String>,
    pub stream_url: String, // Decrypted URL for delivery
    pub image_url: Option<String>,
    pub created_at: String,
    pub subtitle_url: Option<String>,
    pub subtitles: Vec<SubtitleTrackResponse>,
    // DRM fields inherited from parent content stream
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drm_keys: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drm_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_server_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drm_headers: Option<String>,
}

impl From<SeriesWithDetails> for SeriesResponse {
    fn from(series: SeriesWithDetails) -> Self {
        Self {
            id: series.id,
            content: ContentResponse {
                id: series.content.id,
                category_id: series.content.category_id,
                title: series.content.title,
                description: series.content.description,
                image_url: series.content.image_url,
                tmdb_id: series.content.tmdb_id,
                year: series.content.year,
                created_at: series.content.created_at.to_rfc3339(),
            },
            total_seasons: series.total_seasons,
            seasons: series.seasons.into_iter().map(Into::into).collect(),
            created_at: series.created_at.to_rfc3339(),
        }
    }
}

impl From<crate::models::SeasonWithEpisodes> for SeasonResponse {
    fn from(season: crate::models::SeasonWithEpisodes) -> Self {
        Self {
            id: season.id,
            series_id: season.series_id,
            season_number: season.season_number,
            total_episodes: season.total_episodes,
            title: season.title,
            description: season.description,
            image_url: season.image_url,
            poster_url: season.poster_url,
            backdrop_url: season.backdrop_url,
            tmdb_id: season.tmdb_id,
            air_date: season.air_date,
            episodes: season.episodes.into_iter().map(Into::into).collect(),
            created_at: season.created_at.to_rfc3339(),
        }
    }
}

impl From<Episode> for EpisodeResponse {
    fn from(episode: Episode) -> Self {
        Self {
            id: episode.id,
            season_id: episode.season_id,
            episode_number: episode.episode_number,
            title: episode.title,
            description: episode.description,
            stream_url: Some(episode.stream_url),
            image_url: episode.image_url,
            created_at: episode.created_at.to_rfc3339(),
        }
    }
}

impl From<EpisodeWithDecryptedUrl> for EpisodeDeliveryResponse {
    fn from(episode: EpisodeWithDecryptedUrl) -> Self {
        Self {
            id: episode.id,
            season_id: episode.season_id,
            episode_number: episode.episode_number,
            title: episode.title,
            description: episode.description,
            stream_url: episode.stream_url,
            image_url: episode.image_url,
            created_at: episode.created_at.to_rfc3339(),
            subtitle_url: None,
            subtitles: Vec::new(),
            drm_keys: None,
            drm_type: None,
            license_server_url: None,
            drm_headers: None,
        }
    }
}

// POST /api/admin/series - Create series manually (admin only)
pub async fn create_series_manual(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateSeriesRequest>,
) -> Result<(StatusCode, Json<SeriesResponse>), AppError> {
    // Only admins can create series
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateSeriesRequest {
        title: request.title,
        description: request.description,
        image_url: request.image_url,
        tmdb_id: request.tmdb_id,
        year: request.year,
        total_seasons: request.total_seasons,
        category_type: None,
        episodes_by_season: None,
    };

    let series = content_service
        .create_series_manual(service_request)
        .await?;
    Ok((StatusCode::CREATED, Json(series.into())))
}

// POST /api/admin/series/tmdb - Create series from TMDB (admin only)
pub async fn create_series_from_tmdb(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateSeriesFromTmdbRequest>,
) -> Result<(StatusCode, Json<SeriesResponse>), AppError> {
    // Only admins can create series
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateSeriesFromTmdbRequest {
        tmdb_id: request.tmdb_id,
        episode_urls: request.episode_urls,
    };

    let series = content_service
        .create_series_from_tmdb(service_request)
        .await?;
    Ok((StatusCode::CREATED, Json(series.into())))
}

// GET /api/series - Get all series with pagination
pub async fn get_all_series(
    State(content_service): State<ContentService>,
    Query(params): Query<PaginationQuery>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<SeriesResponse>>, AppError> {
    let series = content_service
        .get_all_series(params.page, params.limit)
        .await?;
    let response: Vec<SeriesResponse> = series.into_iter().map(Into::into).collect();
    Ok(Json(response))
}

// GET /api/series/:id - Get series by ID
pub async fn get_series_by_id(
    State(content_service): State<ContentService>,
    Path(id): Path<i64>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<SeriesResponse>, AppError> {
    let series = content_service
        .get_series_by_id(id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(series.into()))
}

// GET /api/series/search - Search series
pub async fn search_series(
    State(content_service): State<ContentService>,
    Query(params): Query<SearchQuery>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<SeriesResponse>>, AppError> {
    let series = content_service.search_series(&params.q).await?;
    let response: Vec<SeriesResponse> = series.into_iter().map(Into::into).collect();
    Ok(Json(response))
}

// GET /api/series/:id/seasons - Get seasons for a series
pub async fn get_series_seasons(
    State(content_service): State<ContentService>,
    Path(series_id): Path<i64>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<Season>>, AppError> {
    let seasons = content_service.get_series_seasons(series_id).await?;
    Ok(Json(seasons))
}

// GET /api/series/by-content/:content_id - Get series by content ID
pub async fn get_series_by_content_id(
    State(content_service): State<ContentService>,
    Path(content_id): Path<i64>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<SeriesResponse>, AppError> {
    let series = content_service
        .get_series_by_content_id(content_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(series.into()))
}

pub fn series_routes() -> Router<ContentService> {
    Router::new()
        .route("/", get(get_all_series))
        .route("/:id", get(get_series_by_id))
        .route("/:id/seasons", get(get_series_seasons))
        .route("/by-content/:content_id", get(get_series_by_content_id))
        .route("/search", get(search_series))
}

// POST /api/admin/seasons - Create season (admin only)
pub async fn create_season(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateSeasonRequest>,
) -> Result<(StatusCode, Json<Season>), AppError> {
    // Only admins can create seasons
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateSeasonRequest {
        series_id: request.series_id,
        season_number: request.season_number,
    };

    let season = content_service.create_season(service_request).await?;
    Ok((StatusCode::CREATED, Json(season)))
}

// POST /api/admin/episodes - Create single episode (admin only)
pub async fn create_episode(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateEpisodeRequest>,
) -> Result<(StatusCode, Json<EpisodeResponse>), AppError> {
    // Only admins can create episodes
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateEpisodeRequest {
        season_id: request.season_id,
        episode_number: request.episode_number,
        title: request.title,
        description: request.description,
        stream_url: request.stream_url,
        image_url: request.image_url,
        duration: None,
        tmdb_id: None,
        air_date: None,
    };

    let episode = content_service.create_episode(service_request).await?;
    Ok((StatusCode::CREATED, Json(episode.into())))
}

// POST /api/admin/episodes/bulk - Create multiple episodes (admin only)
pub async fn create_multiple_episodes(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateMultipleEpisodesRequest>,
) -> Result<(StatusCode, Json<Vec<EpisodeResponse>>), AppError> {
    // Only admins can create episodes
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateMultipleEpisodesRequest {
        season_id: request.season_id,
        episodes: request
            .episodes
            .into_iter()
            .map(|ep| crate::services::content::EpisodeData {
                episode_number: ep.episode_number,
                title: ep.title,
                description: ep.description,
                stream_url: ep.stream_url,
                image_url: ep.image_url,
                duration: None,
                tmdb_id: None,
                air_date: None,
            })
            .collect(),
    };

    let episodes = content_service
        .create_multiple_episodes(service_request)
        .await?;
    let response: Vec<EpisodeResponse> = episodes.into_iter().map(Into::into).collect();
    Ok((StatusCode::CREATED, Json(response)))
}

// GET /api/admin/episodes/:id - Get episode for editing (admin only) - returns raw file path
pub async fn get_episode_for_editing(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(episode_id): Path<i64>,
) -> Result<Json<EpisodeDeliveryResponse>, AppError> {
    // Only admins can access episode editing data
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let episode = content_service
        .get_episode_for_delivery(episode_id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Convert EpisodeWithDecryptedUrl to EpisodeDeliveryResponse with raw file path
    let response = EpisodeDeliveryResponse {
        id: episode.id,
        season_id: episode.season_id,
        episode_number: episode.episode_number,
        title: episode.title,
        description: episode.description,
        stream_url: episode.stream_url, // Raw file path for admin
        image_url: episode.image_url,
        created_at: episode.created_at.to_rfc3339(),
        subtitle_url: None,
        subtitles: vec![],
        drm_keys: None,
        drm_type: None,
        license_server_url: None,
        drm_headers: None,
    };

    Ok(Json(response))
}

// PUT /api/admin/episodes/:id - Update episode (admin only)
pub async fn update_episode(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(episode_id): Path<i64>,
    Json(request): Json<UpdateEpisodeRequest>,
) -> Result<(StatusCode, Json<EpisodeResponse>), AppError> {
    // Only admins can update content.episodes
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    tracing::debug!("UPDATE EPISODE {} - Request received", episode_id);

    let service_request = crate::services::content::UpdateEpisodeRequest {
        title: request.title,
        description: request.description,
        stream_url: request.stream_url,
        image_url: request.image_url,
    };

    let episode = content_service
        .update_episode(episode_id, service_request)
        .await?;
    tracing::debug!("UPDATE EPISODE {} - Success", episode_id);
    Ok((StatusCode::OK, Json(episode.into())))
}

// GET /api/episodes/:id/stream - Get episode with decrypted URL for delivery
pub async fn get_episode_for_delivery(
    State(content_service): State<ContentService>,
    Path(id): Path<i64>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<EpisodeDeliveryResponse>, AppError> {
    let episode = content_service
        .get_episode_for_delivery(id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(episode.into()))
}

// GET /api/episodes/:id/stream-tracked - Get episode with decrypted URL for delivery with activity tracking
pub async fn get_episode_for_delivery_with_tracking(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<EpisodeDeliveryResponse>, AppError> {
    let content_service = &app_state.content_service;
    let pool = &app_state.database.pool;

    // All episodes (series, anime) use unified episodes table
    let episode = content_service
        .get_episode_for_delivery(id)
        .await?
        .ok_or(AppError::NotFound)?;

    let base = crate::handlers::content::resolve_backend_base(&headers, &app_state.config);
    let base_trimmed = base.trim_end_matches('/');

    let subtitle_records = content_service
        .get_episode_subtitles(episode.id)
        .await?
        .into_iter()
        .filter_map(|record| {
            let fp = &record.file_path;
            if fp.starts_with("http://") || fp.starts_with("https://") {
                return Some(SubtitleTrackResponse {
                    id: record.id,
                    language: record.language.clone(),
                    label: language_label(&record.language),
                    url: fp.clone(),
                });
            }
            let path = std::path::Path::new(fp);
            if !path.exists() {
                return None;
            }
            let url = format!("{}/api/episodes/subtitle/{}", base_trimmed, record.id);
            Some(SubtitleTrackResponse {
                id: record.id,
                language: record.language.clone(),
                label: language_label(&record.language),
                url,
            })
        })
        .collect::<Vec<_>>();
    // Prefer English subtitle for legacy single-subtitle-url field; fall back to first available
    let subtitle_url = subtitle_records
        .iter()
        .find(|s| s.language.starts_with("en"))
        .or_else(|| subtitle_records.first())
        .map(|s| s.url.clone());

    // Get category type and series title from unified structure
    let category_and_title: Option<(String, String)> = sqlx::query_as(
        r#"
        SELECT cat.category_type as "category_type!", c.title as "series_title!"
        FROM content.episodes e
        JOIN content.seasons s ON e.season_id = s.id
        JOIN content.series ser ON s.series_id = ser.id
        JOIN content.media_content c ON ser.content_id = c.id
        JOIN content.categories cat ON c.category_id = cat.id
        WHERE e.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    let (content_type, series_title): (&str, Option<String>) = match category_and_title {
        Some(row) => {
            let ct = match row.0.as_str() {
                "Anime" => "anime",
                "Kids" => "kids",
                _ => "series",
            };
            (ct, Some(row.1))
        }
        None => ("series", None),
    };

    // Use episode title as the main content title for viewing history
    let content_title = if episode.title.is_empty() {
        format!("Episode {}", episode.episode_number)
    } else {
        episode.title.clone()
    };

    // Extract IP and device info using the robust helper function
    let (ip_address, device_info, _user_agent) =
        crate::middleware::extract_client_info(&headers, connect_info);

    tracing::info!(
        "🔍 EPISODE IP ip_address: {:?}, device_info: {:?}",
        ip_address,
        device_info
    );

    // Log episode viewing activity with correct data
    let user_id = parse_claim_user_id(&claims)?;
    match app_state
        .user_activity_service
        .log_simple_viewing(crate::services::user_activity::SimpleViewingEvent {
            user_id,
            username: &claims.username,
            content_id: episode.id,
            content_title: &content_title,
            content_type,
            series_title: series_title.as_ref().map(|s| s.as_str()),
            ip_address: ip_address.as_deref(),
            device_info: device_info.as_deref(),
        })
        .await
    {
        Ok(_) => tracing::info!("✅ Episode viewing logged successfully"),
        Err(e) => tracing::warn!("Failed to log episode viewing: {}", e),
    }

    let mut response: EpisodeDeliveryResponse = episode.into();
    // Convert local filesystem path to API file URL for episode preview
    if StdPath::new(&response.stream_url).is_absolute()
        && StdPath::new(&response.stream_url).exists()
    {
        // Extract file extension to include in URL (same as movies)
        let extension = StdPath::new(&response.stream_url)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp4"); // Default to mp4 if no extension

        response.stream_url = format!("{}/api/episodes/file/{}.{}", base_trimmed, id, extension);
        tracing::info!(
            "Local file detected for episode {} - exposing via {}",
            id,
            response.stream_url
        );
    }
    response.subtitle_url = subtitle_url;
    response.subtitles = subtitle_records;

    // Populate DRM keys from parent content's media_stream
    let drm_row: Option<(Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT s.drm_keys, s.drm_type, s.license_server_url, s.drm_headers
        FROM content.episodes e
        JOIN content.seasons sea ON e.season_id = sea.id
        JOIN content.series ser ON sea.series_id = ser.id
        JOIN content.media_streams s ON ser.content_id = s.media_content_id AND s.is_default = true
        WHERE e.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    if let Some((drm_keys, drm_type, license_url, drm_headers)) = drm_row {
        response.drm_keys = drm_keys;
        response.drm_type = drm_type;
        response.license_server_url = license_url;
        response.drm_headers = drm_headers;
    }

    Ok(Json(response))
}

pub async fn list_episode_subtitles(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<SubtitleTrackResponse>>, AppError> {
    tracing::info!(
        "🎬 [SUBTITLES] list_episode_subtitles called for episode_id={}",
        id
    );
    tracing::debug!(
        "🎬 [SUBTITLES] User: {} ({}), Role: {:?}",
        claims.username,
        claims.sub,
        claims.role
    );

    let content_service = &app_state.content_service;
    let pool = &app_state.database.pool;

    // All episodes use unified episodes table
    let row: (i64, String) = sqlx::query_as(
        r#"
        SELECT c.category_id as "category_id!", cat.category_type as "category_type!"
        FROM content.episodes e
        JOIN content.seasons s ON e.season_id = s.id
        JOIN content.series ser ON s.series_id = ser.id
        JOIN content.media_content c ON ser.content_id = c.id
        JOIN content.categories cat ON c.category_id = cat.id
        WHERE e.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    let (category_id, category_type) = (row.0, row.1);

    verify_user_access(
        content_service,
        &claims,
        Some(&category_type),
        Some(category_id),
    )
    .await?;
    let base = crate::handlers::content::resolve_backend_base(&headers, &app_state.config);
    let base_trimmed = base.trim_end_matches('/');

    let subtitle_records = content_service.get_episode_subtitles(id).await?;

    tracing::info!(
        "🎬 [SUBTITLES] Found {} subtitle records for episode {}",
        subtitle_records.len(),
        id
    );

    let subtitles: Vec<SubtitleTrackResponse> = subtitle_records
        .into_iter()
        .filter_map(|record| {
            let fp = &record.file_path;
            if fp.starts_with("http://") || fp.starts_with("https://") {
                return Some(SubtitleTrackResponse {
                    id: record.id,
                    language: record.language.clone(),
                    label: language_label(&record.language),
                    url: fp.clone(),
                });
            }
            let path = std::path::Path::new(fp);
            if !path.exists() {
                tracing::warn!(
                    "🎬 [SUBTITLES] Subtitle file not found: {}",
                    record.file_path
                );
                return None;
            }
            let url = format!("{}/api/episodes/subtitle/{}", base_trimmed, record.id);
            tracing::debug!(
                "🎬 [SUBTITLES] Subtitle {} ({}): {}",
                record.id,
                record.language,
                url
            );
            Some(SubtitleTrackResponse {
                id: record.id,
                language: record.language.clone(),
                label: language_label(&record.language),
                url,
            })
        })
        .collect();

    tracing::info!(
        "🎬 [SUBTITLES] Returning {} valid subtitles for episode {}",
        subtitles.len(),
        id
    );
    Ok(Json(subtitles))
}

async fn get_episode_category(
    pool: &sqlx::PgPool,
    episode_id: i64,
) -> Result<(i64, String), AppError> {
    let row: Option<(i64, String)> = sqlx::query_as(
        r#"
        SELECT c.category_id as "category_id!", cat.category_type as "category_type!"
        FROM content.episodes e
        JOIN content.seasons s ON e.season_id = s.id
        JOIN content.series ser ON s.series_id = ser.id
        JOIN content.media_content c ON ser.content_id = c.id
        JOIN content.categories cat ON c.category_id = cat.id
        WHERE e.id = $1
        "#,
    )
    .bind(episode_id)
    .fetch_optional(pool)
    .await?;

    row.ok_or(AppError::NotFound)
}

pub async fn serve_episode_subtitle(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    Path(subtitle_id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, AppError> {
    let content_service = &app_state.content_service;
    let subtitle = content_service
        .get_episode_subtitle_by_id(subtitle_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let (category_id, category_type) =
        get_episode_category(&app_state.database.pool, subtitle.episode_id).await?;

    verify_user_access(
        content_service,
        &claims,
        Some(&category_type),
        Some(category_id),
    )
    .await?;

    let path = std::path::Path::new(&subtitle.file_path);
    if !path.exists() {
        return Err(AppError::NotFound);
    }

    // Read subtitle file as string
    let subtitle_content = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read subtitle file: {}", e)))?;

    // Convert SRT to WebVTT if needed (browsers require WebVTT)
    let (content_type, final_content) = match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "srt" => {
            // Convert SRT to WebVTT
            let vtt_content = convert_srt_to_webvtt(&subtitle_content);
            ("text/vtt", vtt_content)
        }
        "vtt" => ("text/vtt", subtitle_content),
        _ => ("text/plain", subtitle_content),
    };

    build_subtitle_response(&headers, content_type, final_content)
}

// GET /api/episodes/season/:season_id - Get episodes by season
pub async fn get_episodes_by_season(
    State(content_service): State<ContentService>,
    Path(season_id): Path<i64>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<Episode>>, AppError> {
    let episodes = content_service.get_season_episodes(season_id).await?;
    Ok(Json(episodes))
}

pub fn episodes_routes() -> Router<ContentService> {
    Router::new().route("/season/:season_id", get(get_episodes_by_season))
}

pub fn episodes_streaming_routes() -> Router<crate::AppState> {
    Router::new()
        .route("/:id/stream", get(get_episode_for_delivery_with_tracking))
        .route("/:id/subtitles", get(list_episode_subtitles))
        .route("/subtitle/:id", get(serve_episode_subtitle))
        // Accept /file/123, /file/123.mp4, /file/123.mkv, etc. (same as movies)
        .route("/file/*path", get(serve_local_episode_file))
}

// Serve local episode files with standard Range support via ServeFile
// Uses Extension(claims) to require authentication via cookies (same as movies)
async fn serve_local_episode_file(
    State(app_state): State<crate::AppState>,
    Path(path): Path<String>,
    Extension(claims): Extension<Claims>,
    _headers: HeaderMap,
    req: axum::extract::Request,
) -> Result<Response, AppError> {
    let content_service = &app_state.content_service;

    // Extract ID from path (e.g., "123", "123.mp4", "123.mkv")
    let id_str = path.split('.').next().unwrap_or(&path);
    let id: i64 = id_str
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid episode ID".to_string()))?;

    tracing::info!(
        "🎬 [EPISODE-STREAM] Starting serve_local_episode_file for episode_id={} (path: {})",
        id,
        path
    );

    // Load episode for path
    let episode = content_service
        .get_episode_for_delivery(id)
        .await?
        .ok_or(AppError::NotFound)?;

    let (category_id, category_type) = get_episode_category(&app_state.database.pool, id).await?;

    tracing::info!(
        "🎬 [Episode] Episode {} belongs to category_id={} type={}",
        id,
        category_id,
        &category_type
    );

    verify_user_access(
        content_service,
        &claims,
        Some(&category_type),
        Some(category_id),
    )
    .await?;

    let p = StdPath::new(&episode.stream_url);
    if !p.is_absolute() || !p.exists() {
        return Err(AppError::BadRequest(
            "Episode is not a local file or path does not exist".to_string(),
        ));
    }

    tracing::info!("🎬 [Episode] File path: {}", episode.stream_url);

    // Let tower_http ServeFile handle Range, Accept-Ranges, Content-Range, etc.
    let serve_file = ServeFile::new(p);
    match serve_file.oneshot(req).await {
        Ok(response) => Ok(response.into_response()),
        Err(e) => {
            tracing::error!("❌ [Episode] Error serving episode file: {:?}", e);
            Err(AppError::InternalServerError)
        }
    }
}

pub fn admin_series_routes() -> Router<ContentService> {
    Router::new()
        .route("/", post(create_series_manual))
        .route("/tmdb", post(create_series_from_tmdb))
        .route("/seasons", post(create_season))
        .route("/episodes", post(create_episode))
        .route("/episodes/bulk", post(create_multiple_episodes))
        .route(
            "/episodes/:id",
            get(get_episode_for_editing).put(update_episode),
        )
}
