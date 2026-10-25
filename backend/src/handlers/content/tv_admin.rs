use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    models::UserRole,
    db_structure::DEFAULT_TV_CHANNEL_CATEGORIES,
    services::{
        content::TvChannelCategoryWithUsage,
        Claims, ContentService,
    },
};
use super::types::{
    TvChannelCategoryAdminResponse, CreateTvChannelCategoryPayload,
    UpdateTvChannelCategoryPayload,
};

// ---- TV Channel Categories (Admin) ----

pub async fn list_admin_tv_channel_categories(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<TvChannelCategoryAdminResponse>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let categories = content_service.get_admin_tv_channel_categories().await?;
    let response = map_category_usage_response(categories);
    Ok(Json(response))
}

pub async fn create_admin_tv_channel_category(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<CreateTvChannelCategoryPayload>,
) -> Result<(StatusCode, Json<TvChannelCategoryAdminResponse>), AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let created = content_service
        .create_tv_channel_category(&payload.name)
        .await?;
    let response = map_category_usage_response(vec![created])
        .into_iter()
        .next()
        .ok_or(AppError::InternalServerError)?;

    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn update_admin_tv_channel_category(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateTvChannelCategoryPayload>,
) -> Result<Json<TvChannelCategoryAdminResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let updated = content_service
        .update_tv_channel_category(id, &payload.name)
        .await?;
    let response = map_category_usage_response(vec![updated])
        .into_iter()
        .next()
        .ok_or(AppError::InternalServerError)?;

    Ok(Json(response))
}

pub async fn delete_admin_tv_channel_category(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    content_service.delete_tv_channel_category(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) fn map_category_usage_response(
    categories: Vec<TvChannelCategoryWithUsage>,
) -> Vec<TvChannelCategoryAdminResponse> {
    categories
        .into_iter()
        .map(|category| {
            let is_default = DEFAULT_TV_CHANNEL_CATEGORIES
                .iter()
                .any(|default: &&str| default.eq_ignore_ascii_case(&category.name));

            TvChannelCategoryAdminResponse {
                id: category.id,
                name: category.name,
                created_at: category.created_at.to_rfc3339(),
                usage_count: category.usage_count,
                is_default,
            }
        })
        .collect()
}

// ---- TV Providers (Admin) ----

#[derive(Debug, Deserialize)]
pub struct CreateTvProviderPayload {
    pub name: String,
    pub url: String,
    pub ttl_minutes: i32,
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct TvProviderAdminResponse {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub ttl_minutes: i32,
    pub enabled: bool,
    pub last_fetched_at: Option<String>,
    pub next_refresh_at: Option<String>,
    pub last_status: Option<String>,
    pub created_at: String,
}

pub async fn list_tv_providers_admin(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<TvProviderAdminResponse>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }
    let items = content_service.list_tv_providers().await?;
    let mapped: Vec<TvProviderAdminResponse> = items
        .into_iter()
        .map(|r| TvProviderAdminResponse {
            id: r.id,
            name: r.name,
            url: r.url,
            ttl_minutes: r.ttl_minutes,
            enabled: r.enabled,
            last_fetched_at: r.last_fetched_at.map(|dt| dt.to_rfc3339()),
            next_refresh_at: r.next_refresh_at.map(|dt| dt.to_rfc3339()),
            last_status: r.last_status,
            created_at: r.created_at.to_rfc3339(),
        })
        .collect();
    Ok(Json(mapped))
}

pub async fn create_tv_provider_admin(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<CreateTvProviderPayload>,
) -> Result<(StatusCode, Json<TvProviderAdminResponse>), AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }
    let created = content_service
        .create_tv_provider(crate::services::content::CreateTvProviderRequest {
            name: payload.name,
            url: payload.url,
            ttl_minutes: payload.ttl_minutes,
            enabled: payload.enabled,
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(TvProviderAdminResponse {
            id: created.id,
            name: created.name,
            url: created.url,
            ttl_minutes: created.ttl_minutes,
            enabled: created.enabled,
            last_fetched_at: created.last_fetched_at.map(|dt| dt.to_rfc3339()),
            next_refresh_at: created.next_refresh_at.map(|dt| dt.to_rfc3339()),
            last_status: created.last_status,
            created_at: created.created_at.to_rfc3339(),
        }),
    ))
}

pub async fn delete_tv_provider_admin(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }
    content_service.delete_tv_provider(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn sync_tv_provider_admin(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }
    let (created, updated) = content_service.sync_tv_provider(id).await?;
    Ok(Json(
        serde_json::json!({ "created": created, "updated": updated }),
    ))
}
