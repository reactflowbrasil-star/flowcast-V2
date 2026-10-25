use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};

use crate::{
    error::AppError,
    services::{
        media_watcher::{
            CreateMediaWatchFolderRequest, MediaWatchFolder, UpdateMediaWatchFolderRequest,
        },
        Claims,
    },
    AppState,
};

/// GET /api/admin/media-watcher/folders - List all watch folders
pub async fn list_folders(
    State(app_state): State<AppState>,
    axum::Extension(_claims): axum::Extension<Claims>,
) -> Result<Json<Vec<MediaWatchFolder>>, AppError> {
    let folders = app_state.media_watcher_service.list_folders().await?;
    Ok(Json(folders))
}

/// GET /api/admin/media-watcher/folders/:id - Get a specific watch folder
pub async fn get_folder(
    State(app_state): State<AppState>,
    Path(id): Path<i64>,
    axum::Extension(_claims): axum::Extension<Claims>,
) -> Result<Json<MediaWatchFolder>, AppError> {
    let folder = app_state
        .media_watcher_service
        .get_folder(id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(folder))
}

/// POST /api/admin/media-watcher/folders - Create a new watch folder
pub async fn create_folder(
    State(app_state): State<AppState>,
    axum::Extension(_claims): axum::Extension<Claims>,
    Json(req): Json<CreateMediaWatchFolderRequest>,
) -> Result<(StatusCode, Json<MediaWatchFolder>), AppError> {
    let folder = app_state.media_watcher_service.create_folder(req).await?;
    Ok((StatusCode::CREATED, Json(folder)))
}

/// PUT /api/admin/media-watcher/folders/:id - Update a watch folder
pub async fn update_folder(
    State(app_state): State<AppState>,
    Path(id): Path<i64>,
    axum::Extension(_claims): axum::Extension<Claims>,
    Json(req): Json<UpdateMediaWatchFolderRequest>,
) -> Result<Json<MediaWatchFolder>, AppError> {
    let folder = app_state
        .media_watcher_service
        .update_folder(id, req)
        .await?;
    Ok(Json(folder))
}

/// DELETE /api/admin/media-watcher/folders/:id - Delete a watch folder
pub async fn delete_folder(
    State(app_state): State<AppState>,
    Path(id): Path<i64>,
    axum::Extension(_claims): axum::Extension<Claims>,
) -> Result<StatusCode, AppError> {
    app_state.media_watcher_service.delete_folder(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/admin/media-watcher/folders/:id/check-now - Force immediate check
pub async fn check_folder_now(
    State(app_state): State<AppState>,
    Path(id): Path<i64>,
    axum::Extension(_claims): axum::Extension<Claims>,
) -> Result<StatusCode, AppError> {
    app_state.media_watcher_service.check_folder_now(id).await?;
    Ok(StatusCode::OK)
}

/// Router for media watcher endpoints
pub fn media_watcher_routes() -> Router<AppState> {
    Router::new()
        .route("/folders", get(list_folders).post(create_folder))
        .route(
            "/folders/:id",
            get(get_folder).put(update_folder).delete(delete_folder),
        )
        .route("/folders/:id/check-now", post(check_folder_now))
}
