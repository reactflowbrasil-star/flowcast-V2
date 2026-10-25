use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    Extension,
};

use crate::{
    error::AppError,
    handlers::content::{
        absolutize_content_response, ContentResponse, CreateTvChannelRequest, TvChannelsQuery,
    },
    models::UserRole,
    services::{Claims, ContentService, DrmService},
};

// POST /api/admin/tv-channels - Create TV channel (admin only)
pub async fn create_tv_channel(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateTvChannelRequest>,
) -> Result<(StatusCode, Json<ContentResponse>), AppError> {
    // Only admins can create TV channels
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Validate DRM keys if provided and not empty
    if let Some(ref drm_keys) = request.drm_keys {
        if !drm_keys.trim().is_empty() {
            DrmService::validate_hex_keys(drm_keys)?;
        }
    }

    let service_request = crate::services::content::CreateTvChannelRequest {
        name: request.name,
        description: request.description,
        logo_url: request.logo_url,
        stream_url: request.stream_url,
        channel_number: request.channel_number,
        is_live: request.is_live,
        channel_category: request.channel_category,
        provider: request.provider,
        country: request.country,
        format: request.format,
        drm_keys: request.drm_keys,
        drm_type: request.drm_type,
        license_server_url: request.license_server_url,
        drm_headers: request.drm_headers,
        origin: request.origin,
        user_agent: request.user_agent,
        referer: request.referer,
        custom_headers: request.custom_headers,
        proxy_url: request.proxy_url,
        doh_url: request.doh_url,
    };

    let content = content_service.create_tv_channel(service_request).await?;
    Ok((StatusCode::CREATED, Json(content.into())))
}

// PATCH /api/admin/tv-channels/:id/epg - Update EPG mapping (admin only)
pub async fn update_tv_channel_epg(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }
    let epg_source_id = payload.get("epg_source_id").and_then(|v| v.as_i64());
    let epg_channel_id = payload
        .get("epg_channel_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let epg_offset_minutes = payload.get("epg_offset_minutes").and_then(|v| v.as_i64());
    content_service
        .update_tv_channel_epg(id, epg_source_id, epg_channel_id, epg_offset_minutes)
        .await?;
    Ok(Json(serde_json::json!({"success": true})))
}

// GET /api/admin/tv-channels/:id/epg - Get EPG mapping (admin only)
pub async fn get_tv_channel_epg(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }
    let (source_id, channel_id, offset) = content_service.get_tv_channel_epg(id).await?;
    Ok(Json(serde_json::json!({
        "epg_source_id": source_id,
        "epg_channel_id": channel_id,
        "epg_offset_minutes": offset,
    })))
}

// PUT /api/admin/tv-channels/{id} - Update TV channel (admin only)
pub async fn update_tv_channel(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
    Json(request): Json<CreateTvChannelRequest>,
) -> Result<Json<ContentResponse>, AppError> {
    // Only admins can update TV channels
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Validate DRM keys if provided
    if let Some(ref drm_keys) = request.drm_keys {
        if !drm_keys.trim().is_empty() {
            DrmService::validate_hex_keys(drm_keys)?;
        }
    }

    let service_request = crate::services::content::UpdateTvChannelRequest {
        name: request.name,
        description: request.description,
        logo_url: request.logo_url,
        stream_url: request.stream_url,
        channel_number: request.channel_number,
        is_live: request.is_live,
        channel_category: request.channel_category,
        provider: request.provider,
        country: request.country,
        format: request.format,
        drm_keys: request.drm_keys,
        drm_type: request.drm_type,
        license_server_url: request.license_server_url,
        drm_headers: request.drm_headers,
        active: request.active,
        origin: request.origin,
        user_agent: request.user_agent,
        referer: request.referer,
        custom_headers: request.custom_headers,
        proxy_url: request.proxy_url,
        doh_url: request.doh_url,
    };

    let content = content_service
        .update_tv_channel(id, service_request)
        .await?;
    Ok(Json(content.into()))
}

// GET /api/tv-channels - Get TV channels with pagination
pub async fn get_tv_channels(
    State(content_service): State<ContentService>,
    Query(params): Query<TvChannelsQuery>,
    Extension(claims): Extension<Claims>,
    Extension(user): Extension<crate::models::user::User>,
) -> Result<Json<Vec<ContentResponse>>, AppError> {
    // Get TV channels (optionally filtered by channel category)
    let all_channels = if let Some(cat) = params.channel_category.clone() {
        content_service
            .get_tv_channels_by_channel_category(&cat, params.page, params.limit)
            .await?
    } else {
        content_service
            .get_tv_channels(params.page, params.limit)
            .await?
    };

    // Filter channels based on user's subscribed categories for end users
    let filtered_channels = if matches!(claims.role, crate::models::user::UserRole::EndUser) {
        if let Some(subscribed_category_ids) = &user.subscribed_categories {
            all_channels
                .into_iter()
                .filter(|channel| subscribed_category_ids.contains(&channel.category_id))
                .collect::<Vec<_>>()
        } else {
            // If no subscribed categories, return empty list
            Vec::new()
        }
    } else {
        // Admin and resellers can see all channels
        all_channels
    };

    let config_base = crate::config::Config::from_env()
        .ok()
        .map(|c| c.public_base_url)
        .unwrap_or_else(|| "http://localhost:3000".to_string());
    let response: Vec<ContentResponse> = filtered_channels
        .into_iter()
        .map(Into::into)
        .map(|item| absolutize_content_response(item, &config_base))
        .collect();
    Ok(Json(response))
}

// GET /api/tv/categories - List available TV channel categories
pub async fn get_tv_channel_categories(
    State(content_service): State<ContentService>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<String>>, AppError> {
    let categories = content_service.get_tv_channel_categories().await?;
    Ok(Json(categories))
}
