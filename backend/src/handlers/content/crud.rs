use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    Extension,
};
use crate::{
    error::AppError,
    models::UserRole,
    services::{Claims, ContentService, DrmService},
};
use super::types::*;
use super::helpers::*;
use super::absolutize_content_response;

pub async fn get_content(
    State(app_state): State<crate::AppState>,
    Query(params): Query<ContentQuery>,
    Extension(claims): Extension<Claims>, // Require authentication
    Extension(user): Extension<crate::models::user::User>,
    headers: HeaderMap,
) -> Result<Json<Vec<ContentResponse>>, AppError> {
    let content_service = &app_state.content_service;
    let content = if let Some(ref category_type) = params.category {
        // Validate category type
        if !ContentService::is_valid_category_type(category_type) {
            return Err(AppError::BadRequest("Invalid category type".to_string()));
        }

        // Get category by type first
        let category = content_service
            .get_category_by_type(category_type)
            .await?
            .ok_or(AppError::NotFound)?;

        // Check if user has access to this category for end users
        if matches!(claims.role, crate::models::user::UserRole::EndUser) {
            if let Some(subscribed_category_ids) = &user.subscribed_categories {
                if !subscribed_category_ids.contains(&category.id) {
                    return Err(AppError::Forbidden);
                }
            } else {
                // If no subscribed categories, deny access
                return Err(AppError::Forbidden);
            }
        }

        // Get content for this category
        content_service
            .get_content_by_category(category.id, None, None, None)
            .await?
    } else {
        // If no category specified, return empty list
        Vec::new()
    };

    // Build base URL from incoming headers (x-forwarded-proto / x-forwarded-host or Host)
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http");
    let host = headers
        .get("x-forwarded-host")
        .and_then(|v| v.to_str().ok())
        .or_else(|| headers.get("host").and_then(|v| v.to_str().ok()))
        .unwrap_or("localhost:3000");
    let base = format!("{}://{}", scheme, host);

    let response: Vec<ContentResponse> = content
        .into_iter()
        .map(Into::into)
        .map(|item| absolutize_content_response(item, &base))
        .collect();

    tracing::info!(
        user_id = claims.sub,
        username = claims.username,
        role = ?claims.role,
        category = params.category.as_deref().unwrap_or("all"),
        content_count = response.len(),
        "📺 CONTENT ACCESSED - STREAMCORE: User requested IPTV content"
    );

    Ok(Json(response))
}

// GET /api/content/:id - Get content by ID

pub async fn get_content_by_id(
    State(app_state): State<crate::AppState>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>, // Require authentication
    headers: HeaderMap,
) -> Result<Json<ContentResponse>, AppError> {
    let content_service = &app_state.content_service;
    let content = content_service
        .get_content_by_id(id)
        .await?
        .ok_or(AppError::NotFound)?;

    let category = content_service
        .get_category_by_id(content.category_id)
        .await?
        .ok_or(AppError::NotFound)?;

    verify_user_access(
        content_service,
        &claims,
        Some(&category.category_type),
        Some(category.id),
    )
    .await?;

    // Build base URL from incoming headers (x-forwarded-proto / x-forwarded-host or Host)
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http");
    let host = headers
        .get("x-forwarded-host")
        .and_then(|v| v.to_str().ok())
        .or_else(|| headers.get("host").and_then(|v| v.to_str().ok()))
        .unwrap_or("localhost:3000");
    let base = format!("{}://{}", scheme, host);

    let item: ContentResponse = content.into();
    let absolutized = absolutize_content_response(item, &base);

    Ok(Json(absolutized))
}

// POST /api/admin/categories - Create new category (admin only)

pub async fn toggle_content_status(
    State(content_service): State<ContentService>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<ContentResponse>, AppError> {
    // Only admins can toggle content status
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let content = content_service.toggle_content_status(id).await?;
    Ok(Json(content.into()))
}

// DELETE /api/admin/content/:id - Delete content (admin only)

pub async fn delete_content(
    State(content_service): State<ContentService>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<StatusCode, AppError> {
    // Only admins can delete content
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    content_service.delete_content(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// PUT /api/content/:id/category - Assign content to category (admin only)

pub async fn assign_content_to_category(
    State(app_state): State<crate::AppState>,
    Path(content_id): Path<i64>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<AssignCategoryRequest>,
) -> Result<StatusCode, AppError> {
    let content_service = &app_state.content_service;
    // Only admins can assign content to categories
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    content_service
        .assign_content_to_category(content_id, request.category_id)
        .await?;

    Ok(StatusCode::OK)
}

// POST /api/admin/content - Create content manually (admin only)

pub async fn create_content_manual(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateContentRequest>,
) -> Result<(StatusCode, Json<ContentResponse>), AppError> {
    // Only admins can create content
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    tracing::debug!(
        "create_content_manual received: category_id={}, title={}, tmdb_id={:?}",
        request.category_id,
        request.title,
        request.tmdb_id
    );

    let service_request = crate::services::content::CreateContentRequest {
        category_id: request.category_id,
        title: request.title,
        description: request.description,
        image_url: request.image_url,
        backdrop_url: request.backdrop_url,
        stream_url: request.stream_url,
        tmdb_id: request.tmdb_id,
        year: request.year,
        genre: None,
        provider: request.provider,
        country: request.country,
        format: request.format,
        channel_number: request.channel_number,
        is_live: request.is_live,
        drm_keys: request.drm_keys,
        drm_type: request.drm_type,
        license_server_url: request.license_server_url,
        drm_headers: request.drm_headers,
        // LiveTV specific headers
        origin: request.origin,
        user_agent: request.user_agent,
        referer: request.referer,
        custom_headers: request.custom_headers,
        proxy_url: request.proxy_url,
        doh_url: request.doh_url,
        duration: None,
        rating: None,
        quality: None,
        language: None,
        audio_languages: None,
        epg_source_id: None,
        epg_channel_id: None,
        epg_offset_minutes: None,
        active: request.active,
    };

    let content = content_service
        .create_content_manual(service_request)
        .await?;
    Ok((StatusCode::CREATED, Json(content.into())))
}

// POST /api/admin/content/tmdb - Create content from TMDB (admin only)

pub async fn update_content(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(content_id): Path<i64>,
    Json(request): Json<UpdateContentRequest>,
) -> Result<Json<ContentResponse>, AppError> {
    // Only admins can update content
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Validate DRM keys if provided and not empty
    if let Some(ref drm_keys) = request.drm_keys {
        if !drm_keys.trim().is_empty() {
            DrmService::validate_hex_keys(drm_keys)?;
        }
    }

    let service_request = crate::services::content::UpdateContentRequest {
        title: request.title,
        description: request.description,
        image_url: request.image_url,
        backdrop_url: request.backdrop_url,
        stream_url: request.stream_url,
        provider: request.provider,
        country: request.country,
        format: request.format,
        channel_number: request.channel_number,
        is_live: request.is_live,
        drm_keys: request.drm_keys,
        drm_type: request.drm_type,
        license_server_url: request.license_server_url,
        drm_headers: request.drm_headers,
        active: request.active,
        // LiveTV specific headers
        origin: request.origin,
        user_agent: request.user_agent,
        referer: request.referer,
        custom_headers: request.custom_headers,
        proxy_url: request.proxy_url,
        doh_url: request.doh_url,
    };

    let content = content_service
        .update_content(content_id, service_request)
        .await?;
    Ok(Json(content.into()))
}

// GET /api/movies - Get movies with pagination

pub async fn search_content(
    State(app_state): State<crate::AppState>,
    Query(params): Query<SearchQuery>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<ContentResponse>>, AppError> {
    let content_service = &app_state.content_service;
    // Verify user access
    verify_user_access(content_service, &claims, None, None).await?;

    let content = content_service
        .search_content(&params.q, params.category.as_deref())
        .await?;
    let config_base = crate::config::Config::from_env()
        .ok()
        .map(|c| c.public_base_url)
        .unwrap_or_else(|| "http://localhost:3000".to_string());
    let response: Vec<ContentResponse> = content
        .into_iter()
        .map(Into::into)
        .map(|item| absolutize_content_response(item, &config_base))
        .collect();
    Ok(Json(response))
}

// GET /api/content/by-genre - Get content filtered by genre

