use axum::{
    extract::{Multipart, Path, State},
    response::Json,
    Extension,
};
use std::path::PathBuf;

use crate::{error::AppError, models::UserRole, services::Claims, AppState};

use super::{
    helpers::{
        ensure_directory_exists, media_storage_root_for_category, sanitize_name,
        save_video_file, save_video_file_with_name,
    },
    UploadResponse,
};

/// POST /api/admin/content/:id/upload - Upload video for a movie/VOD content
pub async fn upload_content_video(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(content_id): Path<i64>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, AppError> {
    // Only admins can upload
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Get content title for folder naming
    let content_info: Option<(String, String)> = sqlx::query_as(
        r#"
        SELECT c.title, cat.category_type
        FROM content.media_content c
        JOIN content.categories cat ON c.category_id = cat.id
        WHERE c.id = $1
        "#
    )
    .bind(content_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let (content_title, category_type) = content_info.ok_or(AppError::NotFound)?;
    let safe_title = sanitize_name(&content_title);
    let storage_root = media_storage_root_for_category(&category_type);

    // Build storage path: /media/{storage_root}/{content_id}_{title}/
    let base_path = PathBuf::from(&app_state.config.media_storage_path);
    let storage_dir = base_path
        .join(storage_root)
        .join(format!("{}_{}", content_id, safe_title));
    ensure_directory_exists(&storage_dir).await?;

    // Process multipart upload
    let (file_path, original_name) = save_video_file(
        &mut multipart,
        &storage_dir,
        app_state.config.video_upload_max_bytes,
    )
    .await?;

    // Update content.media_streams stream_url in database (or insert if no default stream exists)
    let relative_path = file_path.to_string_lossy().to_string();
    let update_result = sqlx::query("UPDATE content.media_streams SET stream_url = $1 WHERE media_content_id = $2 AND is_default = true")
        .bind(&relative_path)
        .bind(content_id)
        .execute(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    // If no default stream row existed (content was created with empty video_url), insert one
    if update_result.rows_affected() == 0 {
        sqlx::query("INSERT INTO content.media_streams (media_content_id, stream_url, stream_type, is_default) VALUES ($1, $2, 'main', true)")
            .bind(content_id)
            .bind(&relative_path)
            .execute(&app_state.database.pool)
            .await
            .map_err(AppError::DatabaseError)?;
    }

    tracing::info!(
        "📤 Uploaded video for content {}: {} -> {}",
        content_id,
        original_name,
        relative_path
    );

    Ok(Json(UploadResponse {
        success: true,
        path: relative_path,
        message: format!("Video '{}' uploaded successfully", original_name),
    }))
}

/// POST /api/admin/episodes/:id/upload - Upload video for an episode
pub async fn upload_episode_video(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(episode_id): Path<i64>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, AppError> {
    // Only admins can upload
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Get episode info with series title, season number, episode number, and category
    let episode_info: Option<(String, i32, i32, String)> = sqlx::query_as(
        r#"
        SELECT c.title, s.season_number, e.episode_number, cat.category_type
        FROM content.episodes e
        JOIN content.seasons s ON e.season_id = s.id
        JOIN content.series ser ON s.series_id = ser.id
        JOIN content.media_content c ON ser.content_id = c.id
        JOIN content.categories cat ON c.category_id = cat.id
        WHERE e.id = $1
        "#,
    )
    .bind(episode_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let (series_title, season_number, episode_number, category_type) = episode_info.ok_or(AppError::NotFound)?;
    let safe_series_title = sanitize_name(&series_title);
    let storage_root = media_storage_root_for_category(&category_type);

    // Build storage path: /media/{storage_root}/{series_name}/Season{X}/
    let base_path = PathBuf::from(&app_state.config.media_storage_path);
    let episode_dir = base_path
        .join(storage_root)
        .join(&safe_series_title)
        .join(format!("Season{}", season_number));
    ensure_directory_exists(&episode_dir).await?;

    // Save file with episode naming
    let (file_path, original_name) = save_video_file_with_name(
        &mut multipart,
        &episode_dir,
        &format!("Episode{}", episode_number),
        app_state.config.video_upload_max_bytes,
    )
    .await?;

    // Update episode stream_url in database
    let relative_path = file_path.to_string_lossy().to_string();
    sqlx::query("UPDATE content.episodes SET stream_url = $1 WHERE id = $2")
        .bind(&relative_path)
        .bind(episode_id)
        .execute(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    tracing::info!(
        "📤 Uploaded video for episode {} ({}): {} -> {}",
        episode_id,
        format!("{} S{}E{}", series_title, season_number, episode_number),
        original_name,
        relative_path
    );

    Ok(Json(UploadResponse {
        success: true,
        path: relative_path,
        message: format!(
            "Video uploaded for {} Season {} Episode {}",
            series_title, season_number, episode_number
        ),
    }))
}
