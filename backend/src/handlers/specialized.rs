use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Extension, Router,
};
use chrono::{NaiveDate, NaiveTime};
use serde::Deserialize;

use crate::{
    error::AppError,
    models::{ContentJoined, EventSchedule, EventWithSchedules, ScheduleWithDecryptedUrl, UserRole},
    services::drm::DrmService,
    services::{Claims, ContentService},
    validation::{Validate, ValidationUtils},
};

// Kids/Anime Content requests (Req 7.4)
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

impl Validate for CreateEventRequest {
    fn validate(&self) -> Result<(), AppError> {
        // Validate title
        ValidationUtils::validate_string_length(&self.title, "title", 1, 255)?;

        // Validate description if provided
        if let Some(ref description) = self.description {
            ValidationUtils::validate_string_length(description, "description", 0, 1000)?;
        }

        // Validate image URL if provided
        if let Some(ref image_url) = self.image_url {
            ValidationUtils::validate_url(image_url, "image_url")?;
        }

        // Validate event type
        ValidationUtils::validate_event_type(&self.event_type)?;

        Ok(())
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateEventScheduleRequest {
    pub event_id: i64,
    pub schedule_date: NaiveDate,
    pub start_time: NaiveTime,
    pub end_time: Option<NaiveTime>,
    pub stream_url: String,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i32>,
    pub limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct DateQuery {
    pub date: NaiveDate,
}

// Kids Content handlers (Req 7.4)
pub async fn create_kids_content(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateKidsContentRequest>,
) -> Result<(StatusCode, Json<ContentJoined>), AppError> {
    tracing::debug!(
        "create_kids_content handler called with title={}, tmdb_id={:?}",
        request.title,
        request.tmdb_id
    );

    // Only admins can create Kids content
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateKidsContentRequest {
        title: request.title,
        description: request.description,
        image_url: request.image_url,
        stream_url: request.stream_url,
        tmdb_id: request.tmdb_id,
        year: request.year,
    };

    let content = content_service.create_kids_content(service_request).await?;
    Ok((StatusCode::CREATED, Json(content)))
}

pub async fn get_kids_content(
    State(content_service): State<ContentService>,
    Query(params): Query<PaginationQuery>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<ContentJoined>>, AppError> {
    let content = content_service
        .get_kids_content(params.page, params.limit)
        .await?;
    Ok(Json(content))
}

// Anime Content handlers (Req 7.4)
pub async fn create_anime_content(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateAnimeContentRequest>,
) -> Result<(StatusCode, Json<ContentJoined>), AppError> {
    // Only admins can create Anime content
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateAnimeContentRequest {
        title: request.title,
        description: request.description,
        image_url: request.image_url,
        stream_url: request.stream_url,
        tmdb_id: request.tmdb_id,
        year: request.year,
    };

    let content = content_service
        .create_anime_content(service_request)
        .await?;
    Ok((StatusCode::CREATED, Json(content)))
}

pub async fn get_anime_content(
    State(content_service): State<ContentService>,
    Query(params): Query<PaginationQuery>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<ContentJoined>>, AppError> {
    let content = content_service
        .get_anime_content(params.page, params.limit)
        .await?;
    Ok(Json(content))
}

// Create anime series from TMDB
pub async fn create_anime_series_from_tmdb(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<crate::handlers::series::CreateSeriesFromTmdbRequest>,
) -> Result<(StatusCode, Json<crate::handlers::series::SeriesResponse>), AppError> {
    // Only admins can create anime series
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateAnimeSeriesFromTmdbRequest {
        tmdb_id: request.tmdb_id,
        episode_urls: request.episode_urls,
    };

    let series = content_service
        .create_anime_series_from_tmdb(service_request)
        .await?;
    Ok((StatusCode::CREATED, Json(series.into())))
}

// Events handlers (Req 7.3)
pub async fn create_event(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateEventRequest>,
) -> Result<(StatusCode, Json<EventWithSchedules>), AppError> {
    // Only admins can create events
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    request.validate()?;

    if let Some(ref drm_keys) = request.drm_keys {
        if !drm_keys.trim().is_empty() {
            DrmService::validate_hex_keys(drm_keys)?;
        }
    }

    let service_request = crate::services::content::CreateEventRequest {
        title: request.title,
        description: request.description,
        image_url: request.image_url,
        event_type: request.event_type,
        provider: request.provider,
        country: request.country,
        format: request.format,
        drm_keys: request.drm_keys,
        stream_url: request.stream_url,
        // Streaming headers
        origin: request.origin,
        user_agent: request.user_agent,
        referer: request.referer,
        custom_headers: request.custom_headers,
    };

    let event = content_service.create_event(service_request).await?;
    Ok((StatusCode::CREATED, Json(event)))
}

pub async fn create_event_schedule(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateEventScheduleRequest>,
) -> Result<(StatusCode, Json<EventSchedule>), AppError> {
    // Only admins can create event schedules
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateEventScheduleRequest {
        event_id: request.event_id,
        schedule_date: request.schedule_date,
        start_time: request.start_time,
        end_time: request.end_time,
        stream_url: request.stream_url,
        title: request.title,
        description: request.description,
        image_url: request.image_url,
    };

    let schedule = content_service
        .create_event_schedule(service_request)
        .await?;
    Ok((StatusCode::CREATED, Json(schedule)))
}

pub async fn get_all_events(
    State(content_service): State<ContentService>,
    Query(params): Query<PaginationQuery>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<EventWithSchedules>>, AppError> {
    let events = content_service
        .get_all_events(params.page, params.limit)
        .await?;
    Ok(Json(events))
}

pub async fn get_event_by_id(
    State(content_service): State<ContentService>,
    Path(id): Path<i64>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<EventWithSchedules>, AppError> {
    let event = content_service
        .get_event_by_id(id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(event))
}

pub async fn get_events_by_date(
    State(content_service): State<ContentService>,
    Query(params): Query<DateQuery>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<EventSchedule>>, AppError> {
    let schedules = content_service.get_events_by_date(params.date).await?;
    Ok(Json(schedules))
}

pub async fn get_schedule_for_delivery(
    State(content_service): State<ContentService>,
    Path(id): Path<i64>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<ScheduleWithDecryptedUrl>, AppError> {
    let schedule = content_service
        .get_schedule_for_delivery(id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(schedule))
}

// Public routes for specialized content
pub fn specialized_content_routes() -> Router<ContentService> {
    Router::new()
        .route("/kids", get(get_kids_content))
        .route("/anime", get(get_anime_content))
        .route("/events", get(get_all_events))
        .route("/events/:id", get(get_event_by_id))
        .route("/events/date", get(get_events_by_date))
}

// Delivery routes for specialized content
pub fn specialized_delivery_routes() -> Router<ContentService> {
    Router::new().route("/schedules/:id/stream", get(get_schedule_for_delivery))
}

// Admin routes for specialized content
pub fn admin_specialized_content_routes() -> Router<ContentService> {
    Router::new()
        .route("/kids", post(create_kids_content))
        .route("/anime", post(create_anime_content))
        .route("/anime/series/tmdb", post(create_anime_series_from_tmdb))
        .route("/events", post(create_event))
        .route("/events/schedules", post(create_event_schedule))
}
