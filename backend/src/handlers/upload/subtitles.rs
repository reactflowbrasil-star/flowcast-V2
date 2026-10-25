use axum::{
    extract::{Multipart, Path, State},
    response::Json,
    Extension,
};
use serde::Deserialize;
use std::path::PathBuf;

use crate::{error::AppError, models::UserRole, services::Claims, AppState};

use super::{
    helpers::{
        ensure_directory_exists, media_storage_root_for_category, sanitize_language_code,
        sanitize_name, save_subtitle_file_unique, subtitle_storage_root_for_category,
        MAX_SUBTITLE_UPLOAD_BYTES,
    },
    UploadResponse,
};

/// POST /api/admin/content/:id/subtitles/upload - Upload manual subtitle for VOD/Series/Anime/Kids
pub async fn upload_content_subtitle(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(content_id): Path<i64>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let content_info: Option<(String, String)> = sqlx::query_as(
        r#"
        SELECT c.title, cat.category_type
        FROM content.media_content c
        JOIN content.categories cat ON c.category_id = cat.id
        WHERE c.id = $1
        "#,
    )
    .bind(content_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let (content_title, category_type) = content_info.ok_or(AppError::NotFound)?;
    let storage_root = subtitle_storage_root_for_category(&category_type).ok_or_else(|| {
        AppError::BadRequest(
            "Manual subtitle upload is only supported for VOD, Series, Anime and Kids".to_string(),
        )
    })?;

    let base_path = PathBuf::from(&app_state.config.media_storage_path);
    let content_dir = base_path.join(storage_root).join(format!(
        "{}_{}",
        content_id,
        sanitize_name(&content_title)
    ));
    let pending_dir = content_dir.join("subtitles").join("_pending");
    ensure_directory_exists(&pending_dir).await?;

    let mut language: Option<String> = None;
    let mut uploaded_file: Option<(PathBuf, String, u64)> = None;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "language" | "lang" => {
                let raw = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Invalid language field: {}", e)))?;
                if !raw.trim().is_empty() {
                    language = Some(sanitize_language_code(&raw)?);
                }
            }
            "file" => {
                let saved =
                    save_subtitle_file_unique(&mut field, &pending_dir, MAX_SUBTITLE_UPLOAD_BYTES)
                        .await?;
                uploaded_file = Some(saved);
            }
            _ => {}
        }
    }

    let (temp_path, original_name, _size) = uploaded_file
        .ok_or_else(|| AppError::BadRequest("No subtitle file uploaded".to_string()))?;
    let language = language.ok_or_else(|| {
        AppError::BadRequest("Language is required (e.g. es, en, pt-br)".to_string())
    })?;

    let language_dir = content_dir.join("subtitles").join(&language);
    ensure_directory_exists(&language_dir).await?;

    let stored_name = temp_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::InternalError("Invalid temp subtitle filename".to_string()))?
        .to_string();
    let final_path = language_dir.join(&stored_name);

    tokio::fs::rename(&temp_path, &final_path)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to finalize subtitle file: {}", e)))?;

    let final_path_str = final_path.to_string_lossy().to_string();
    sqlx::query(
        r#"
        INSERT INTO content.media_content_subtitles (media_content_id, language, file_path)
        VALUES ($1, $2, $3)
        ON CONFLICT (media_content_id, language, file_path) DO NOTHING
        "#,
    )
    .bind(content_id)
    .bind(&language)
    .bind(&final_path_str)
    .execute(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    tracing::info!(
        "📝 Uploaded subtitle for content {} ({}) [{}]: {}",
        content_id,
        content_title,
        language,
        final_path_str
    );

    Ok(Json(UploadResponse {
        success: true,
        path: final_path_str,
        message: format!(
            "Subtitle '{}' uploaded successfully for {}",
            original_name, language
        ),
    }))
}

/// DELETE /api/admin/content/:id/subtitles/:subtitle_id - Remove manual subtitle track from content
pub async fn delete_content_subtitle(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((content_id, subtitle_id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let subtitle_info: Option<(i64, String, String)> = sqlx::query_as(
        r#"
        SELECT cs.media_content_id, cs.file_path, cat.category_type
        FROM content.media_content_subtitles cs
        JOIN content.media_content c ON cs.media_content_id = c.id
        JOIN content.categories cat ON c.category_id = cat.id
        WHERE cs.id = $1
        "#,
    )
    .bind(subtitle_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let (db_content_id, file_path, category_type) = subtitle_info.ok_or(AppError::NotFound)?;
    if db_content_id != content_id {
        return Err(AppError::NotFound);
    }

    if subtitle_storage_root_for_category(&category_type).is_none() {
        return Err(AppError::BadRequest(
            "Subtitle deletion is only supported for VOD, Series, Anime and Kids".to_string(),
        ));
    }

    let result = sqlx::query("DELETE FROM content.media_content_subtitles WHERE id = $1 AND media_content_id = $2")
        .bind(subtitle_id)
        .bind(content_id)
        .execute(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    let subtitle_path = PathBuf::from(&file_path);
    if subtitle_path.exists() {
        if let Err(e) = tokio::fs::remove_file(&subtitle_path).await {
            tracing::warn!(
                "Failed to remove subtitle file after DB delete (id={}): {}",
                subtitle_id,
                e
            );
        }
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Subtitle deleted"
    })))
}

/// POST /api/admin/episodes/:id/subtitles/upload - Upload manual subtitle for an episode
pub async fn upload_episode_subtitle(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(episode_id): Path<i64>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

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

    let base_path = PathBuf::from(&app_state.config.media_storage_path);
    let episode_dir = base_path
        .join(storage_root)
        .join(&safe_series_title)
        .join(format!("Season{}", season_number));
    let pending_dir = episode_dir.join("subtitles").join("_pending");
    ensure_directory_exists(&pending_dir).await?;

    let mut language: Option<String> = None;
    let mut uploaded_file: Option<(PathBuf, String, u64)> = None;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "language" | "lang" => {
                let raw = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Invalid language field: {}", e)))?;
                if !raw.trim().is_empty() {
                    language = Some(sanitize_language_code(&raw)?);
                }
            }
            "file" => {
                let saved =
                    save_subtitle_file_unique(&mut field, &pending_dir, MAX_SUBTITLE_UPLOAD_BYTES)
                        .await?;
                uploaded_file = Some(saved);
            }
            _ => {}
        }
    }

    let (temp_path, original_name, _size) = uploaded_file
        .ok_or_else(|| AppError::BadRequest("No subtitle file uploaded".to_string()))?;
    let language = language.ok_or_else(|| {
        AppError::BadRequest("Language is required (e.g. es, en, pt-br)".to_string())
    })?;

    let language_dir = episode_dir.join("subtitles").join(&language);
    ensure_directory_exists(&language_dir).await?;

    let stored_name = temp_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::InternalError("Invalid temp subtitle filename".to_string()))?
        .to_string();
    let final_path = language_dir.join(&stored_name);

    tokio::fs::rename(&temp_path, &final_path)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to finalize subtitle file: {}", e)))?;

    let final_path_str = final_path.to_string_lossy().to_string();
    sqlx::query(
        r#"
        INSERT INTO content.episode_subtitles (episode_id, language, file_path)
        VALUES ($1, $2, $3)
        ON CONFLICT (episode_id, language, file_path) DO NOTHING
        "#,
    )
    .bind(episode_id)
    .bind(&language)
    .bind(&final_path_str)
    .execute(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    tracing::info!(
        "📝 Uploaded subtitle for episode {} ({} S{}E{}) [{}]: {}",
        episode_id,
        series_title,
        season_number,
        episode_number,
        language,
        final_path_str
    );

    Ok(Json(UploadResponse {
        success: true,
        path: final_path_str,
        message: format!(
            "Subtitle '{}' uploaded successfully for {}",
            original_name, language
        ),
    }))
}

/// DELETE /api/admin/episodes/:id/subtitles/:subtitle_id - Remove manual subtitle track from episode
pub async fn delete_episode_subtitle(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((episode_id, subtitle_id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let subtitle_info: Option<(i64, String)> = sqlx::query_as(
        r#"
        SELECT episode_id, file_path
        FROM content.episode_subtitles
        WHERE id = $1
        "#,
    )
    .bind(subtitle_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let (db_episode_id, file_path) = subtitle_info.ok_or(AppError::NotFound)?;
    if db_episode_id != episode_id {
        return Err(AppError::NotFound);
    }

    let result = sqlx::query("DELETE FROM content.episode_subtitles WHERE id = $1 AND episode_id = $2")
        .bind(subtitle_id)
        .bind(episode_id)
        .execute(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    let subtitle_path = PathBuf::from(&file_path);
    if subtitle_path.exists() {
        if let Err(e) = tokio::fs::remove_file(&subtitle_path).await {
            tracing::warn!(
                "Failed to remove episode subtitle file after DB delete (id={}): {}",
                subtitle_id,
                e
            );
        }
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Subtitle deleted"
    })))
}

// ==================== URL-based subtitle registration ====================

#[derive(Deserialize)]
pub struct SubtitleUrlRequest {
    pub language: String,
    pub url: String,
}

/// POST /api/admin/content/:id/subtitles/url — Register external subtitle by URL
pub async fn add_content_subtitle_url(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(content_id): Path<i64>,
    Json(body): Json<SubtitleUrlRequest>,
) -> Result<Json<UploadResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let url = body.url.trim().to_string();
    if url.is_empty() {
        return Err(AppError::BadRequest("URL is required".to_string()));
    }
    let language = sanitize_language_code(&body.language)?;

    // Verify content exists
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM content.media_content WHERE id = $1)",
    )
    .bind(content_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    if !exists {
        return Err(AppError::NotFound);
    }

    sqlx::query(
        r#"
        INSERT INTO content.media_content_subtitles (media_content_id, language, file_path)
        VALUES ($1, $2, $3)
        ON CONFLICT (media_content_id, language, file_path) DO NOTHING
        "#,
    )
    .bind(content_id)
    .bind(&language)
    .bind(&url)
    .execute(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    tracing::info!(
        "📝 Registered subtitle URL for content {} [{}]: {}",
        content_id,
        language,
        url
    );

    Ok(Json(UploadResponse {
        success: true,
        path: url.clone(),
        message: format!("Subtitle URL registered for language '{}'", language),
    }))
}

/// POST /api/admin/episodes/:id/subtitles/url — Register external subtitle by URL
pub async fn add_episode_subtitle_url(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(episode_id): Path<i64>,
    Json(body): Json<SubtitleUrlRequest>,
) -> Result<Json<UploadResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let url = body.url.trim().to_string();
    if url.is_empty() {
        return Err(AppError::BadRequest("URL is required".to_string()));
    }
    let language = sanitize_language_code(&body.language)?;

    // Verify episode exists
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM content.episodes WHERE id = $1)",
    )
    .bind(episode_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    if !exists {
        return Err(AppError::NotFound);
    }

    sqlx::query(
        r#"
        INSERT INTO content.episode_subtitles (episode_id, language, file_path)
        VALUES ($1, $2, $3)
        ON CONFLICT (episode_id, language, file_path) DO NOTHING
        "#,
    )
    .bind(episode_id)
    .bind(&language)
    .bind(&url)
    .execute(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    tracing::info!(
        "📝 Registered subtitle URL for episode {} [{}]: {}",
        episode_id,
        language,
        url
    );

    Ok(Json(UploadResponse {
        success: true,
        path: url.clone(),
        message: format!("Subtitle URL registered for language '{}'", language),
    }))
}
