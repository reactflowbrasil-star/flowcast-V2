use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Json,
    Extension,
};
use crate::{
    error::AppError,
    models::UserRole,
    services::{Claims, ContentService},
};
use super::types::*;

use super::resolve_backend_base;
use super::absolutize_content_response;

pub async fn get_content_for_edit(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Only admins can edit content
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let content = content_service.get_content_for_edit(id).await?;

    // Build absolute base from core.config (prefer PUBLIC_BASE_URL)
    let config_base = crate::config::Config::from_env()
        .ok()
        .map(|c| c.public_base_url)
        .unwrap_or_else(|| "http://localhost:3000".to_string());
    let base_trimmed = config_base.trim_end_matches('/');

    // Load content-level subtitles (movies/VOD)
    let subtitle_records = content_service.get_content_subtitles(content.id).await?;
    let content_id_for_subtitles = content.id;
    let subtitles: Vec<serde_json::Value> = subtitle_records
        .into_iter()
        .filter_map(|record| {
            let fp = &record.file_path;
            // If file_path is a URL, use it directly
            if fp.starts_with("http://") || fp.starts_with("https://") {
                return Some(serde_json::json!({
                    "id": record.id,
                    "language": record.language,
                    "label": crate::handlers::content::language_label(&record.language),
                    "url": fp
                }));
            }
            let path = std::path::Path::new(fp);
            if !path.exists() {
                return None;
            }
            let url = format!(
                "{}/api/content/{}/subtitle/{}",
                base_trimmed, content_id_for_subtitles, record.id
            );
            Some(serde_json::json!({
                "id": record.id,
                "language": record.language,
                "label": crate::handlers::content::language_label(&record.language),
                "url": url
            }))
        })
        .collect();

    // Look up the category_type from the database to determine content_type
    let content_type_str = if let Ok(Some(cat_type)) = sqlx::query_scalar::<_, String>(
        "SELECT category_type FROM content.categories WHERE id = $1"
    )
    .bind(content.category_id)
    .fetch_optional(&content_service.db)
    .await {
        match cat_type.to_lowercase().as_str() {
            "vod" | "movies" => "vod",
            "tv" | "live" => "tv",
            "series" => "series",
            "events" | "eventos" => "events",
            "kids" => "kids",
            "anime" => "anime",
            _ => "vod",
        }.to_string()
    } else {
        "vod".to_string()
    };

    let payload = serde_json::json!({
        "id": content.id,
        "category_id": content.category_id,
        "title": content.title,
        "description": content.description,
        "poster_url": content.image_url,           // Android compat
        "image_url": content.image_url,            // Keep both for clients
        "backdrop_url": content.backdrop_url,
        "stream_url": content.stream_url, // direct URL (no encryption for admin edit)
        "tmdb_id": content.tmdb_id,
        "year": content.year,
        "runtime": serde_json::Value::Null,
        "channel_number": content.channel_number,
        "channel_category": content.genre,
        "is_live": content.is_live,
        "active": content.active,
        "created_at": content.created_at.to_rfc3339(),
        "content_type": content_type_str,
        // TV Channel specific fields
        "provider": content.provider,
        "country": content.country,
        "format": content.format,
        "drm_keys": content.drm_keys,
        // DRM fields for Widevine/PlayReady
        "drm_type": content.drm_type,
        "license_server_url": content.license_server_url,
        "drm_headers": content.drm_headers.as_ref().and_then(|h| {
            if h.trim().is_empty() { None } else { serde_json::from_str::<serde_json::Value>(h).ok() }
        }),
        // LiveTV specific headers
        "origin": content.origin,
        "user_agent": content.user_agent,
        "referer": content.referer,
        "custom_headers": content.custom_headers,
        // Per-channel settings
        "proxy_url": content.proxy_url,
        "doh_url": content.doh_url,
        // New: subtitle tracks for admin UI
        "subtitles": subtitles
    });

    Ok(Json(payload))
}

// GET /api/admin/content/:id/edit-with-seasons - Get content for editing with total_seasons

pub async fn get_content_with_seasons_for_edit(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Only admins can edit content
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let content_json = content_service
        .get_content_with_seasons_for_edit(id)
        .await?;
    Ok(Json(content_json))
}

// GET /api/delivery/content/category/:id - Enhanced content listing by category (Req 4.2, 4.3, 4.4)

pub async fn admin_get_content(
    State(content_service): State<ContentService>,
    Query(params): Query<ContentQuery>,
    Extension(claims): Extension<Claims>,
    Extension(config): Extension<crate::config::Config>,
    headers: HeaderMap,
) -> Result<Json<AdminContentListResponse>, AppError> {
    // Only admins can access this endpoint
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(25).clamp(1, 100);
    let search = params.search.as_deref();

    let (content, total) = if let Some(category_type) = params.category.as_deref() {
        // Get category by type
        let category = content_service
            .get_category_by_type(category_type)
            .await?
            .ok_or(AppError::NotFound)?;

        // Get content for this category
        let content = content_service
            .get_content_by_category(category.id, Some(page), Some(limit), search)
            .await?;
        let total = content_service
            .count_content_by_category(category.id, search)
            .await?;
        (content, total)
    } else {
        // If no category specified, get paginated content across all categories
        let content = content_service
            .get_all_content(Some(page), Some(limit), search)
            .await?;
        let total = content_service.count_all_content(search).await?;
        (content, total)
    };

    let base = resolve_backend_base(&headers, &config);
    let response_content: Vec<ContentResponse> = content
        .into_iter()
        .map(Into::into)
        .map(|item: ContentResponse| absolutize_content_response(item, &base))
        .collect();
    let has_more = (i64::from(page) * i64::from(limit)) < total;

    let response = AdminContentListResponse {
        content: response_content,
        total,
        page,
        limit,
        has_more,
    };

    Ok(Json(response))
}
