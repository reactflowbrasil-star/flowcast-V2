use crate::{
    error::AppError,
    services::{ContentService, EpgService},
};
use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};

// ===== Admin DTOs =====
#[derive(Deserialize)]
pub struct CreateEpgSourceRequest {
    pub name: String,
    pub url: String,
    pub timezone: Option<String>,
    pub cache_ttl_minutes: Option<i32>,
    pub is_active: Option<bool>,
}
#[derive(Deserialize)]
pub struct UpdateEpgSourceRequest {
    pub name: Option<String>,
    pub url: Option<String>,
    pub timezone: Option<String>,
    pub cache_ttl_minutes: Option<i32>,
    pub is_active: Option<bool>,
}

#[derive(Serialize)]
pub struct EpgSourceResponse {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub timezone: String,
    pub cache_ttl_minutes: i32,
    pub is_active: bool,
}

// ===== Delivery DTOs =====
#[derive(Deserialize)]
pub struct EpgQuery {
    pub channel_ids: String,
    pub start: String,
    pub end: String,
}

#[derive(Serialize)]
pub struct EpgProgramsResponse {
    pub programs: Vec<crate::services::EpgProgramDto>,
}

#[derive(Serialize)]
pub struct EpgProgramsResponseWithContentIds {
    pub programs: Vec<crate::services::EpgProgramDto>,
}

#[derive(Clone)]
pub struct EpgHandlersState {
    pub content_service: ContentService,
    pub epg_service: EpgService,
}

// ===== Admin Handlers =====
pub async fn create_source(
    State(state): State<EpgHandlersState>,
    Json(req): Json<CreateEpgSourceRequest>,
) -> Result<Json<EpgSourceResponse>, AppError> {
    let id = state
        .epg_service
        .create_source(
            &req.name,
            &req.url,
            req.timezone.as_deref().unwrap_or("UTC"),
            req.cache_ttl_minutes.unwrap_or(15),
            req.is_active.unwrap_or(true),
        )
        .await?;
    let src = state.epg_service.get_source(id).await?;
    Ok(Json(EpgSourceResponse {
        id: src.id,
        name: src.name,
        url: src.url,
        timezone: src.timezone,
        cache_ttl_minutes: src.cache_ttl_minutes,
        is_active: src.is_active,
    }))
}

pub async fn update_source(
    State(state): State<EpgHandlersState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateEpgSourceRequest>,
) -> Result<Json<EpgSourceResponse>, AppError> {
    let mut src = state.epg_service.get_source(id).await?;
    let name = req.name.as_deref().unwrap_or(&src.name);
    let url = req.url.as_deref().unwrap_or(&src.url);
    let tz = req.timezone.as_deref().unwrap_or(&src.timezone);
    let ttl = req.cache_ttl_minutes.unwrap_or(src.cache_ttl_minutes);
    let act = req.is_active.unwrap_or(src.is_active);
    state
        .epg_service
        .update_source(id, name, url, tz, ttl, act)
        .await?;
    src = state.epg_service.get_source(id).await?;
    Ok(Json(EpgSourceResponse {
        id: src.id,
        name: src.name,
        url: src.url,
        timezone: src.timezone,
        cache_ttl_minutes: src.cache_ttl_minutes,
        is_active: src.is_active,
    }))
}

pub async fn delete_source(
    State(state): State<EpgHandlersState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    state.epg_service.delete_source(id).await?;
    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn list_sources(
    State(state): State<EpgHandlersState>,
) -> Result<Json<Vec<EpgSourceResponse>>, AppError> {
    let list = state.epg_service.get_sources().await?;
    Ok(Json(
        list.into_iter()
            .map(|s| EpgSourceResponse {
                id: s.id,
                name: s.name,
                url: s.url,
                timezone: s.timezone,
                cache_ttl_minutes: s.cache_ttl_minutes,
                is_active: s.is_active,
            })
            .collect(),
    ))
}

pub async fn discover_channels(
    State(state): State<EpgHandlersState>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<crate::services::EpgChannelInfo>>, AppError> {
    let channels = state.epg_service.discover_channels(id).await?;
    Ok(Json(channels))
}

// ===== Delivery Handler =====
// channel_ids: comma-separated content IDs; we resolve mapping (source_id, epg_channel_id, offset)
pub async fn get_epg(
    State(state): State<EpgHandlersState>,
    Query(q): Query<EpgQuery>,
) -> Result<Json<EpgProgramsResponse>, AppError> {
    // parse channel ids
    let ids: Vec<i64> = q
        .channel_ids
        .split(',')
        .filter_map(|s| s.trim().parse::<i64>().ok())
        .collect();
    // fetch mapping from content
    let mappings = state
        .content_service
        .get_epg_mappings_for_channels(&ids)
        .await?; // Vec<(source_id, epg_channel_id, offset)>
    let start = q
        .start
        .parse::<chrono::DateTime<chrono::Utc>>()
        .map_err(|_| AppError::BadRequest("Invalid start time".to_string()))?;
    let end = q
        .end
        .parse::<chrono::DateTime<chrono::Utc>>()
        .map_err(|_| AppError::BadRequest("Invalid end time".to_string()))?;
    let programs = state
        .epg_service
        .get_programs_window(mappings, start, end)
        .await?;

    // Map epg_channel_id back to content channel IDs requested by the client
    let id_list: Vec<i64> = ids.clone();
    let map = state
        .content_service
        .get_epg_mappings_map_by_epg_id(&id_list)
        .await?; // epg_id -> content_id
    let remapped_programs: Vec<crate::services::EpgProgramDto> = programs
        .into_iter()
        .map(|mut p| {
            if let Some(content_id) = map.get(&p.channel_id) {
                p.channel_id = content_id.to_string();
            }
            p
        })
        .collect();

    Ok(Json(EpgProgramsResponse {
        programs: remapped_programs,
    }))
}

pub fn admin_routes() -> Router<EpgHandlersState> {
    Router::new()
        .route("/sources", post(create_source).get(list_sources))
        .route("/sources/:id", put(update_source).delete(delete_source))
        .route("/sources/:id/channels", get(discover_channels))
}

pub fn delivery_routes() -> Router<EpgHandlersState> {
    Router::new().route("/epg", get(get_epg))
}
