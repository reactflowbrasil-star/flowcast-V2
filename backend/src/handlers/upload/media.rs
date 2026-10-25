use axum::{
    extract::{Multipart, State},
    http::HeaderMap,
    response::Json,
    Extension,
};
use std::path::PathBuf;

use crate::{error::AppError, models::UserRole, services::Claims, AppState};

use super::{
    helpers::{ensure_directory_exists, get_upload_dir, save_video_file_unique},
    MediaUploadResponse,
};

/// POST /api/admin/media/upload - Upload a media file before creating content
pub async fn upload_media_file(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<MediaUploadResponse>, AppError> {
    // Only admins can upload
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let upload_dir = get_upload_dir(&app_state.config);
    ensure_directory_exists(&upload_dir).await?;

    let mut title: Option<String> = None;
    let mut uploaded: Option<(PathBuf, String, u64)> = None;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "title" => {
                let t = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Invalid title: {}", e)))?;
                if !t.trim().is_empty() {
                    title = Some(t);
                }
            }
            "file" => {
                let (file_path, original_name, total_bytes) = save_video_file_unique(
                    &mut field,
                    &upload_dir,
                    title.as_deref(),
                    app_state.config.video_upload_max_bytes,
                )
                .await?;
                uploaded = Some((file_path, original_name, total_bytes));
            }
            _ => {
                // Ignore other fields like category, tmdb_id, etc.
            }
        }
    }

    let (file_path, original_name, total_bytes) =
        uploaded.ok_or_else(|| AppError::BadRequest("No file uploaded".to_string()))?;

    let absolute_path = file_path.to_string_lossy().to_string();
    let stored_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload.bin");
    let base_url = crate::handlers::content::resolve_backend_base(&headers, &app_state.config);
    let public_url = format!(
        "{}/api/content/uploads/{}",
        base_url.trim_end_matches('/'),
        stored_name
    );

    Ok(Json(MediaUploadResponse {
        success: true,
        url: public_url,
        path: absolute_path,
        filename: original_name,
        size: total_bytes,
        message: "Media uploaded successfully".to_string(),
    }))
}
