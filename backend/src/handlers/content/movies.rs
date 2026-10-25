use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    Extension,
};

use crate::{
    error::AppError,
    handlers::content::{
        absolutize_content_response, verify_user_access, AdminContentListResponse, ContentResponse,
        CreateMovieRequest, GenreQuery, PaginationQuery,
    },
    models::UserRole,
    services::{Claims, ContentService},
    AppState,
};

// POST /api/admin/movies - Create movie (admin only)
pub async fn create_movie(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateMovieRequest>,
) -> Result<(StatusCode, Json<ContentResponse>), AppError> {
    // Only admins can create movies
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateMovieRequest {
        title: request.title,
        description: request.description,
        image_url: request.image_url,
        stream_url: request.stream_url,
        tmdb_id: request.tmdb_id,
        year: request.year,
        runtime: request.runtime,
    };

    let content = content_service.create_movie(service_request).await?;
    Ok((StatusCode::CREATED, Json(content.into())))
}

// GET /api/movies - Get movies with pagination (alias for content filtering)
pub async fn get_movies(
    State(content_service): State<ContentService>,
    Query(params): Query<PaginationQuery>,
    Extension(_claims): Extension<Claims>,
    headers: HeaderMap,
) -> Result<Json<Vec<ContentResponse>>, AppError> {
    let movies = content_service
        .get_movies(params.page, params.limit)
        .await?;

    // Build base URL from incoming headers
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

    let response: Vec<ContentResponse> = movies
        .into_iter()
        .map(Into::into)
        .map(|item| absolutize_content_response(item, &base))
        .collect();
    Ok(Json(response))
}

// GET /api/content/by-genre - Get content filtered by genre
pub async fn get_content_by_genre(
    State(app_state): State<AppState>,
    Query(params): Query<GenreQuery>,
    Extension(claims): Extension<Claims>,
    headers: HeaderMap,
) -> Result<Json<AdminContentListResponse>, AppError> {
    let content_service = &app_state.content_service;
    // Verify user access
    verify_user_access(content_service, &claims, None, None).await?;

    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(20).clamp(1, 100);

    let content = content_service
        .get_content_by_genre(&params.genre, Some(page), Some(limit))
        .await?;
    let total = content_service
        .count_content_by_genre(&params.genre)
        .await?;

    let base = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .map(|scheme| {
            let host = headers
                .get("x-forwarded-host")
                .and_then(|v| v.to_str().ok())
                .or_else(|| headers.get("host").and_then(|v| v.to_str().ok()))
                .unwrap_or("localhost:3000");
            format!("{}://{}", scheme, host)
        })
        .unwrap_or_else(|| "http://localhost:3000".to_string());

    let response_content: Vec<ContentResponse> = content
        .into_iter()
        .map(Into::into)
        .map(|item| absolutize_content_response(item, &base))
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

// GET /api/content/genres - Get all available genres
pub async fn get_all_genres(
    State(app_state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<Vec<String>>, AppError> {
    let content_service = &app_state.content_service;
    let genres = content_service.get_all_genres().await?;
    Ok(Json(genres))
}
