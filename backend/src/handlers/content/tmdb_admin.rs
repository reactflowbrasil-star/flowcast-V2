use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    Extension,
};
use serde::Deserialize;
use crate::{
    error::AppError,
    models::UserRole,
    services::{Claims, ContentService},
};
use super::types::*;

use crate::services::content::{TmdbMetadataRefreshRequest, TmdbMetadataRefreshResult};

pub async fn create_content_from_tmdb(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateContentFromTmdbRequest>,
) -> Result<(StatusCode, Json<ContentResponse>), AppError> {
    // Only admins can create content
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateContentFromTmdbRequest {
        category_id: request.category_id,
        tmdb_id: request.tmdb_id,
        media_type: request.media_type,
        stream_url: request.stream_url,
        active: request.active,
    };

    let content = content_service
        .create_content_from_tmdb(service_request)
        .await?;
    Ok((StatusCode::CREATED, Json(content.into())))
}

// POST /api/admin/movies - Create movie (admin only)

#[derive(Debug, Deserialize)]
pub struct RefreshTmdbMetadataPayload {
    pub category_type: String,
    pub limit: Option<i64>,
}

pub async fn refresh_tmdb_metadata(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<RefreshTmdbMetadataPayload>,
) -> Result<Json<TmdbMetadataRefreshResult>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let result = content_service
        .refresh_tmdb_metadata(TmdbMetadataRefreshRequest {
            category_type: payload.category_type,
            limit: payload.limit,
        })
        .await?;

    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct EnrichContentTmdbPayload {
    pub content_id: i64,
    pub tmdb_id: i64,
    pub media_type: String, // "movie" or "tv"
}

/// Enrich a single content item with TMDB metadata
pub async fn enrich_content_tmdb(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<EnrichContentTmdbPayload>,
) -> Result<Json<ContentResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let content: crate::models::ContentJoined = content_service
        .enrich_content_with_tmdb(payload.content_id, payload.tmdb_id, &payload.media_type)
        .await?;

    Ok(Json(content.into()))
}



