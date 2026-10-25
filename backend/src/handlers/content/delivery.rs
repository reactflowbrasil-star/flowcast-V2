use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::HeaderMap,
    response::Json,
    Extension,
};
use crate::{
    error::AppError,
    models::{Category, UserRole},
    services::{Claims, DrmService},
    AppState,
};
use super::types::*;
use super::helpers::*;

use std::net::SocketAddr;
use crate::models::user_activity::ContentType;
use crate::handlers::user_activity;
use super::absolutize_metadata_url;
use super::resolve_backend_base;
use super::{absolutize_stream_url, is_internal_url, language_label};
use std::path::Path as StdPath;

pub async fn get_content_for_delivery(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Path(id): Path<i64>,
    Query(params): Query<DeliveryLangQuery>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<ContentDeliveryResponse>, AppError> {
    let content_service = &app_state.content_service;
    // First get content to check category
    let content_info = content_service
        .get_content_by_id(id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Get category to check access permissions
    let category = content_service
        .get_category_by_id(content_info.category_id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Verify user access including category-specific permissions
    verify_user_access(
        content_service,
        &claims,
        Some(&category.category_type),
        Some(category.id),
    )
    .await?;

    // Now get content with decrypted URL
    let content = content_service
        .get_content_for_delivery(id)
        .await?
        .ok_or(AppError::NotFound)?;

    let base = resolve_backend_base(&headers, &app_state.config);
    let base_trimmed = base.trim_end_matches('/');

    // If stream_url is a local filesystem path (absolute and exists), expose an API file URL instead
    let mut delivery_stream_url = content.stream_url.clone();
    if StdPath::new(&delivery_stream_url).is_absolute()
        && StdPath::new(&delivery_stream_url).exists()
    {
        // Detect file extension and add it to URL so browser knows it's a video
        let extension = StdPath::new(&delivery_stream_url)
            .extension()
            .and_then(|e: &std::ffi::OsStr| e.to_str())
            .unwrap_or("mp4"); // Default to mp4 if no extension

        delivery_stream_url = format!("/api/content/file/{}.{}", content.id, extension);
        tracing::info!(
            "Local file detected for content {} - exposing via {}",
            content.id,
            delivery_stream_url
        );
    }

    // Log content viewing activity when streaming starts
    tracing::info!(
        user_id = claims.sub,
        username = claims.username,
        content_id = content.id,
        content_title = content.title,
        category_type = category.category_type,
        "🎬 STREAMING STARTED - STREAMCORE: User started IPTV content playback"
    );

    let user_id = parse_claim_user_id(&claims)?;

    // Determine content type from category
    let content_type = match category.category_type.as_str() {
        "TV" => "live_tv",
        "VOD" => "movie",
        "Anime" => "anime",
        "Series" => "series",
        "Kids" => "kids",
        "Eventos" => "eventos",
        _ => "movie",
    };

    // Extract IP and device info using the robust helper function
    let (ip_address, device_info, _user_agent) =
        crate::middleware::extract_client_info(&headers, connect_info);

    // Log the viewing with correct data from DB
    match app_state
        .user_activity_service
        .log_simple_viewing(crate::services::user_activity::SimpleViewingEvent {
            user_id,
            username: &claims.username,
            content_id: content.id,
            content_title: &content.title,
            content_type,
            series_title: None, // series_title is None for non-episodic content
            ip_address: ip_address.as_deref(),
            device_info: device_info.as_deref(),
        })
        .await
    {
        Ok(_) => {}
        Err(e) => tracing::error!("❌ Failed to log content viewing: {}", e),
    }

    // Get original hex keys and convert to ExoPlayer format
    let (drm_keys_hex, drm_keys_exo) = if let Some(ref hex_keys) = content.drm_keys {
        if !hex_keys.trim().is_empty() {
            let exo_keys = DrmService::convert_hex_keys_to_clearkey_json(hex_keys)?;
            (Some(hex_keys.clone()), Some(exo_keys))
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    let subtitle_records = content_service.get_content_subtitles(content.id).await?;
    let content_id_for_subtitles = content.id;
    let subtitles: Vec<SubtitleTrackResponse> = subtitle_records
        .into_iter()
        .filter_map(|record| {
            let fp = &record.file_path;
            // If file_path is a URL, use it directly
            if fp.starts_with("http://") || fp.starts_with("https://") {
                return Some(SubtitleTrackResponse {
                    id: record.id,
                    language: record.language.clone(),
                    label: language_label(&record.language),
                    url: fp.clone(),
                });
            }
            // Otherwise it's a local file — check it exists
            let path = StdPath::new(fp);
            if !path.exists() {
                return None;
            }
            let url = format!(
                "{}/api/content/{}/subtitle/{}",
                base_trimmed, content_id_for_subtitles, record.id
            );
            Some(SubtitleTrackResponse {
                id: record.id,
                language: record.language.clone(),
                label: language_label(&record.language),
                url,
            })
        })
        .collect();
    let subtitle_url = subtitles.first().map(|s| s.url.clone());

    // Parse drm_headers JSON string to serde_json::Value
    let drm_headers_parsed: Option<serde_json::Value> =
        content.drm_headers.as_ref().and_then(|h| {
            if h.trim().is_empty() {
                None
            } else {
                serde_json::from_str(h).ok()
            }
        });

    // Determine if stream URL is internal (needs auth) BEFORE absolutization changes it
    let stream_is_internal = is_internal_url(&delivery_stream_url, base_trimmed);

    let mut response = ContentDeliveryResponse {
        id: content.id,
        category_id: content.category_id,
        title: content.title,
        description: content.description,
        image_url: content.image_url,
        stream_url: delivery_stream_url,
        subtitle_url,
        subtitles,
        tmdb_id: content.tmdb_id,
        year: content.year,
        channel_number: content.channel_number,
        created_at: content.created_at,
        drm_keys: drm_keys_hex,
        drm_keys_exo,
        drm_type: content.drm_type,
        license_server_url: content.license_server_url,
        drm_headers: drm_headers_parsed,
        // Only expose proxy_url and doh_url for Live TV category
        proxy_url: if category.category_type == "TV" {
            content.proxy_url
        } else {
            None
        },
        doh_url: if category.category_type == "TV" {
            content.doh_url
        } else {
            None
        },
        // Stream request headers (CRITICAL for DRM on Android TV)
        user_agent: content.user_agent,
        origin: content.origin,
        referer: content.referer,
        custom_headers: content.custom_headers,
        // Auth scope flags - CRITICAL: tells client whether to send JWT auth headers
        // Only send auth to internal URLs (served by our backend), NOT to external URLs like Google API
        requires_auth: stream_is_internal,
        is_internal_stream: stream_is_internal,
    };

    // Convert any local metadata relative path to absolute URL using host+scheme so clients can fetch it.
    response.image_url = absolutize_metadata_url(response.image_url.clone(), base_trimmed);

    // Convert relative stream URLs to absolute URLs for mobile clients (Android/iOS)
    response.stream_url = absolutize_stream_url(response.stream_url, base_trimmed);

    // Locale-aware title/description resolution
    let requested_lang = params.lang.as_deref()
        .or_else(|| headers.get("accept-language")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.split(',').next().unwrap_or(v).split(';').next().unwrap_or(v).trim())
        );
    if let Some(lang) = requested_lang {
        if let Ok(Some((translated_title, translated_desc))) = app_state.content_service.get_content_translation(response.id, lang).await {
            response.title = translated_title;
            response.description = translated_desc;
        }
    }

    Ok(Json(response))
}

// GET /api/content/:id/stream-tracked - Get content with decrypted URL for delivery with activity tracking

pub async fn get_content_for_delivery_with_tracking(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Path(id): Path<i64>,
    Query(params): Query<DeliveryLangQuery>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<ContentDeliveryResponse>, AppError> {
    let content_service = &app_state.content_service;

    // First get content to check category
    let content_info = content_service
        .get_content_by_id(id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Get category to check access permissions
    let category = content_service
        .get_category_by_id(content_info.category_id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Verify user access including category-specific permissions
    verify_user_access(
        content_service,
        &claims,
        Some(&category.category_type),
        Some(category.id),
    )
    .await?;

    // Now get content with decrypted URL
    let content = content_service
        .get_content_for_delivery(id)
        .await?
        .ok_or(AppError::NotFound)?;
    let base = resolve_backend_base(&headers, &app_state.config);
    let base_trimmed = base.trim_end_matches('/');

    // If stream_url is a local filesystem path (absolute and exists), expose an API file URL instead
    let mut delivery_stream_url = content.stream_url.clone();
    if StdPath::new(&delivery_stream_url).is_absolute()
        && StdPath::new(&delivery_stream_url).exists()
    {
        // Detect file extension and add it to URL so browser knows it's a video
        let extension = StdPath::new(&delivery_stream_url)
            .extension()
            .and_then(|e: &std::ffi::OsStr| e.to_str())
            .unwrap_or("mp4"); // Default to mp4 if no extension

        delivery_stream_url = format!("/api/content/file/{}.{}", content.id, extension);
        tracing::info!(
            "Local file detected for content {} - exposing via {}",
            content.id,
            delivery_stream_url
        );
    }

    // Get original hex keys and convert to ExoPlayer format
    let (drm_keys_hex, drm_keys_exo) = if let Some(ref hex_keys) = content.drm_keys {
        if !hex_keys.trim().is_empty() {
            let exo_keys = DrmService::convert_hex_keys_to_clearkey_json(hex_keys)?;
            (Some(hex_keys.clone()), Some(exo_keys))
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    // Log content viewing activity
    let user_id = parse_claim_user_id(&claims)?;
    let content_type = if category.category_type == "TV" {
        ContentType::LiveTv
    } else {
        ContentType::Movie
    };

    let _ = user_activity::log_content_viewing(
        &app_state,
        user_activity::ContentViewingEvent {
            user_id,
            username: &claims.username,
            content_type,
            content_id: Some(content.id),
            content_title: &content.title,
            episode_title: None,
            season_number: None,
            episode_number: None,
            headers: &headers,
            connect_info,
        },
    )
    .await;

    let subtitle_records = content_service.get_content_subtitles(content.id).await?;
    let content_id_for_subtitles = content.id;
    let subtitles: Vec<SubtitleTrackResponse> = subtitle_records
        .into_iter()
        .filter_map(|record| {
            let fp = &record.file_path;
            // If file_path is a URL, use it directly
            if fp.starts_with("http://") || fp.starts_with("https://") {
                return Some(SubtitleTrackResponse {
                    id: record.id,
                    language: record.language.clone(),
                    label: language_label(&record.language),
                    url: fp.clone(),
                });
            }
            // Otherwise it's a local file — check it exists
            let path = StdPath::new(fp);
            if !path.exists() {
                return None;
            }
            let url = format!(
                "{}/api/content/{}/subtitle/{}",
                base_trimmed, content_id_for_subtitles, record.id
            );
            Some(SubtitleTrackResponse {
                id: record.id,
                language: record.language.clone(),
                label: language_label(&record.language),
                url,
            })
        })
        .collect();
    let subtitle_url = subtitles.first().map(|s| s.url.clone());

    // Parse drm_headers JSON string to serde_json::Value
    let drm_headers_parsed: Option<serde_json::Value> =
        content.drm_headers.as_ref().and_then(|h| {
            if h.trim().is_empty() {
                None
            } else {
                serde_json::from_str(h).ok()
            }
        });

    // Determine if stream URL is internal (needs auth) BEFORE absolutization changes it
    let stream_is_internal = is_internal_url(&delivery_stream_url, base_trimmed);

    let mut response = ContentDeliveryResponse {
        id: content.id,
        category_id: content.category_id,
        title: content.title,
        description: content.description,
        image_url: content.image_url,
        stream_url: delivery_stream_url,
        subtitle_url,
        subtitles,
        tmdb_id: content.tmdb_id,
        year: content.year,
        channel_number: content.channel_number,
        created_at: content.created_at,
        drm_keys: drm_keys_hex,
        drm_keys_exo,
        drm_type: content.drm_type,
        license_server_url: content.license_server_url,
        drm_headers: drm_headers_parsed,
        proxy_url: if category.category_type == "TV" {
            content.proxy_url
        } else {
            None
        },
        doh_url: if category.category_type == "TV" {
            content.doh_url
        } else {
            None
        },
        // Stream request headers (CRITICAL for DRM on Android TV)
        user_agent: content.user_agent,
        origin: content.origin,
        referer: content.referer,
        custom_headers: content.custom_headers,
        // Auth scope flags - CRITICAL: tells client whether to send JWT auth headers
        requires_auth: stream_is_internal,
        is_internal_stream: stream_is_internal,
    };

    // Convert any local metadata relative path to absolute URL using host+scheme so clients can fetch it.
    response.image_url = absolutize_metadata_url(response.image_url.clone(), base_trimmed);

    // Convert relative stream URLs to absolute URLs for mobile clients (Android/iOS)
    response.stream_url = absolutize_stream_url(response.stream_url, base_trimmed);

    // Locale-aware title/description resolution
    let requested_lang = params.lang.as_deref()
        .or_else(|| headers.get("accept-language")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.split(',').next().unwrap_or(v).split(';').next().unwrap_or(v).trim())
        );
    if let Some(lang) = requested_lang {
        if let Ok(Some((translated_title, translated_desc))) = app_state.content_service.get_content_translation(response.id, lang).await {
            response.title = translated_title;
            response.description = translated_desc;
        }
    }

    Ok(Json(response))
}

// [handlers] get_content_for_edit now includes subtitles array for admin UI chips

pub async fn get_enhanced_content_by_category(
    State(app_state): State<AppState>,
    Path(category_id): Path<i64>,
    Query(params): Query<PaginationQuery>,
    Extension(claims): Extension<Claims>,
    Extension(user): Extension<crate::models::user::User>,
    headers: HeaderMap,
) -> Result<Json<ContentListResponse>, AppError> {
    let content_service = &app_state.content_service;
    // Check authorization
    if !matches!(claims.role, UserRole::Admin | UserRole::System)
        && claims.role != UserRole::Reseller
        && claims.role != UserRole::EndUser
    {
        return Err(AppError::Forbidden);
    }

    // Get category info first
    let category = content_service
        .get_category_by_id(category_id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Debug logging

    // Check category access for end users
    if matches!(claims.role, crate::models::user::UserRole::EndUser) {
        if let Some(subscribed_category_ids) = &user.subscribed_categories {
            if !subscribed_category_ids.contains(&category_id) {
                tracing::warn!(
                    user_id = user.id,
                    category_id = category_id,
                    subscribed_categories = ?subscribed_category_ids,
                    "get_enhanced_content_by_category: user does not have access to category"
                );
                return Err(AppError::Forbidden);
            }
        } else {
            tracing::warn!(
                user_id = user.id,
                "get_enhanced_content_by_category: user has no subscribed categories"
            );
            return Err(AppError::Forbidden);
        }
    }

    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(10).clamp(1, 50);

    let content = content_service
        .get_content_by_category(category_id, Some(page), Some(limit), None)
        .await?;
    let total_content = content_service
        .count_content_by_category(category_id, None)
        .await?;
    let base = resolve_backend_base(&headers, &app_state.config);

    let enhanced_content: Vec<EnhancedContentResponse> = content
        .into_iter()
        .map(|c| {
            let image_url = absolutize_metadata_url(c.image_url, &base);
            let backdrop_url = absolutize_metadata_url(c.backdrop_url, &base);
            EnhancedContentResponse {
                id: c.id,
                category: CategoryResponse::from(category.clone()),
                title: c.title,
                description: c.description,
                image_url,
                backdrop_url,
                tmdb_id: c.tmdb_id,
                year: c.year,
                created_at: c.created_at.to_rfc3339(),
                stream_url: c.stream_url.unwrap_or_default(), // Add stream URL for playback
            }
        })
        .collect();

    let has_more = i64::from(page * limit) < total_content;

    let response = ContentListResponse {
        content: enhanced_content,
        total: total_content,
        page,
        limit,
        has_more,
    };

    Ok(Json(response))
}

// GET /api/delivery/content/search - Enhanced search with better filtering (Req 1.3, 1.4)

pub async fn enhanced_search_content(
    State(app_state): State<AppState>,
    Query(params): Query<EnhancedSearchQuery>,
    Extension(claims): Extension<Claims>,
    headers: HeaderMap,
) -> Result<Json<ContentListResponse>, AppError> {
    let content_service = &app_state.content_service;
    // Verify user access
    verify_user_access(content_service, &claims, None, None).await?;

    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(10).clamp(1, 50);

    // Backward compatibility: accept numeric `category_id` values and map them to category_type.
    let resolved_category = if let Some(raw_category) = params.category.as_deref() {
        let trimmed = raw_category.trim();
        if trimmed.is_empty() {
            None
        } else if let Ok(category_id) = trimmed.parse::<i64>() {
            let category = content_service
                .get_category_by_id(category_id)
                .await?
                .ok_or_else(|| AppError::BadRequest("Category not found".to_string()))?;
            Some(category.category_type)
        } else {
            Some(trimmed.to_string())
        }
    } else {
        None
    };

    let content = content_service
        .enhanced_search_content(
            &params.q,
            resolved_category.as_deref(),
            params.year,
            params.tmdb_id,
        )
        .await?;
    let total_content = content.len() as i64;
    let base = resolve_backend_base(&headers, &app_state.config);

    // Apply pagination
    let start = ((page - 1) * limit) as usize;
    let end = (start + limit as usize).min(content.len());
    let paginated_content = if start >= content.len() {
        Vec::new()
    } else {
        content[start..end].to_vec()
    };

    // Preload categories for the paginated content to avoid N+1 lookups
    let mut category_cache: std::collections::HashMap<i64, Category> =
        std::collections::HashMap::new();
    let unique_ids: std::collections::HashSet<i64> =
        paginated_content.iter().map(|c| c.category_id).collect();
    for id in unique_ids {
        if let Some(cat) = content_service.get_category_by_id(id).await? {
            category_cache.insert(id, cat);
        }
    }

    let enhanced_content: Vec<EnhancedContentResponse> = paginated_content
        .into_iter()
        .map(|c| {
            // Get category info for each content
            let category = if let Some(cat) = category_cache.get(&c.category_id) {
                CategoryResponse::from(cat.clone())
            } else {
                CategoryResponse {
                    id: c.category_id,
                    name: "Unknown".to_string(),
                    category_type: "Unknown".to_string(),
                    created_at: chrono::Utc::now().to_rfc3339(),
                }
            };

            let image_url = absolutize_metadata_url(c.image_url, &base);
            let backdrop_url = absolutize_metadata_url(c.backdrop_url, &base);

            EnhancedContentResponse {
                id: c.id,
                category,
                title: c.title,
                description: c.description,
                image_url,
                backdrop_url,
                tmdb_id: c.tmdb_id,
                year: c.year,
                created_at: c.created_at.to_rfc3339(),
                stream_url: c.stream_url.unwrap_or_default(),
            }
        })
        .collect();

    let has_more = i64::from(page * limit) < total_content;

    let response = ContentListResponse {
        content: enhanced_content,
        total: total_content,
        page,
        limit,
        has_more,
    };

    Ok(Json(response))
}


