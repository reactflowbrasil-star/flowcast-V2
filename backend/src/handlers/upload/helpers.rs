use axum::extract::Multipart;
use std::path::{Path as StdPath, PathBuf};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::{error::AppError, config::Config};

/// Supported video file formats for upload
pub const SUPPORTED_VIDEO_FORMATS: &[&str] = &[
    "mp4", "mkv", "mov", "wmv", "avi", "webm", "mpeg", "flv", "vob", "m4v", "ts",
];
/// Supported subtitle file formats for manual upload
pub const SUPPORTED_SUBTITLE_FORMATS: &[&str] = &["srt", "vtt"];
pub const MAX_SUBTITLE_UPLOAD_BYTES: u64 = 20 * 1024 * 1024; // 20MB

/// Sanitize a string to be safe for use as a folder/file name
pub fn sanitize_name(name: &str) -> String {
    let mut clean = String::new();
    for ch in name.chars() {
        if ch.is_alphanumeric() || ch == ' ' || ch == '-' || ch == '_' || ch == '.' {
            clean.push(ch);
        }
    }
    // Replace multiple spaces with single space
    let clean = clean.split_whitespace().collect::<Vec<_>>().join(" ");
    // Replace spaces with underscores for filesystem safety
    clean.replace(' ', "_")
}

/// Validate that the file extension is a supported video format
pub fn validate_video_format(filename: &str) -> Result<String, AppError> {
    let extension = StdPath::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .ok_or_else(|| AppError::BadRequest("File must have an extension".to_string()))?;

    if !SUPPORTED_VIDEO_FORMATS.contains(&extension.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported video format '{}'. Supported formats: {}",
            extension,
            SUPPORTED_VIDEO_FORMATS.join(", ")
        )));
    }

    Ok(extension)
}

/// Validate that the file extension is a supported subtitle format
pub fn validate_subtitle_format(filename: &str) -> Result<String, AppError> {
    let extension = StdPath::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .ok_or_else(|| AppError::BadRequest("File must have an extension".to_string()))?;

    if !SUPPORTED_SUBTITLE_FORMATS.contains(&extension.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported subtitle format '{}'. Supported formats: {}",
            extension,
            SUPPORTED_SUBTITLE_FORMATS.join(", ")
        )));
    }

    Ok(extension)
}

pub fn sanitize_language_code(raw: &str) -> Result<String, AppError> {
    let lowered = raw.trim().to_lowercase().replace('_', "-");
    let filtered: String = lowered
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-')
        .collect();

    if filtered.len() < 2 || filtered.len() > 16 {
        return Err(AppError::BadRequest(
            "Invalid language code. Use values like 'es', 'en', 'pt-br'".to_string(),
        ));
    }

    Ok(filtered)
}

pub fn subtitle_storage_root_for_category(category_type: &str) -> Option<&'static str> {
    match category_type {
        "VOD" => Some("movies"),
        "Series" => Some("series"),
        "Anime" => Some("anime"),
        "Kids" => Some("kids"),
        _ => None,
    }
}

pub fn media_storage_root_for_category(category_type: &str) -> &'static str {
    match category_type {
        "VOD" => "movies",
        "Series" => "series",
        "Anime" => "anime",
        "Kids" => "kids",
        "TV" => "tv_channels",
        "Eventos" => "events",
        _ => "movies",
    }
}

/// Build upload directory for generic media uploads
pub fn get_upload_dir(config: &Config) -> PathBuf {
    PathBuf::from(&config.media_storage_path).join("uploads")
}

/// Ensure directory exists, creating it if necessary
pub async fn ensure_directory_exists(path: &StdPath) -> Result<(), AppError> {
    if !path.exists() {
        tokio::fs::create_dir_all(path)
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to create directory: {}", e)))?;
    }
    Ok(())
}

pub async fn write_field_to_file(
    field: &mut axum::extract::multipart::Field<'_>,
    file_path: &StdPath,
    max_bytes: u64,
    progress_label: &str,
    complete_label: &str,
) -> Result<u64, AppError> {
    // Stream file to disk in chunks to handle large files
    let mut file = tokio::fs::File::create(file_path)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to create file: {}", e)))?;

    let mut total_bytes: u64 = 0;
    while let Some(chunk) = field
        .chunk()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read chunk: {}", e)))?
    {
        total_bytes += chunk.len() as u64;
        if total_bytes > max_bytes {
            let _ = tokio::fs::remove_file(file_path).await;
            return Err(AppError::BadRequest(format!(
                "File too large. Maximum size is {} GB",
                max_bytes / 1_073_741_824
            )));
        }
        file.write_all(&chunk)
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to write chunk: {}", e)))?;

        // Log progress every 100MB
        if !progress_label.is_empty() && total_bytes % (100 * 1024 * 1024) < chunk.len() as u64 {
            tracing::info!(
                "{}: {} MB received",
                progress_label,
                total_bytes / (1024 * 1024)
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to flush: {}", e)))?;

    if !complete_label.is_empty() {
        tracing::info!("{}: {} bytes", complete_label, total_bytes);
    }

    Ok(total_bytes)
}

/// Save uploaded video file to the specified directory with a unique filename
pub async fn save_video_file_unique(
    field: &mut axum::extract::multipart::Field<'_>,
    target_dir: &StdPath,
    preferred_base: Option<&str>,
    max_bytes: u64,
) -> Result<(PathBuf, String, u64), AppError> {
    let file_name = field
        .file_name()
        .map(|f| f.to_string())
        .unwrap_or_else(|| "video.mp4".to_string());

    // Validate format
    let extension = validate_video_format(&file_name)?;

    let base_name = preferred_base
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            StdPath::new(&file_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("video")
                .to_string()
        });

    // Sanitize and build unique filename
    let safe_name = sanitize_name(&base_name);
    let unique_suffix = Uuid::new_v4().to_string();
    let final_name = format!("{}_{}.{}", safe_name, unique_suffix, extension);
    let file_path = target_dir.join(&final_name);

    let total_bytes = write_field_to_file(
        field,
        &file_path,
        max_bytes,
        "Upload progress",
        "Upload complete",
    )
    .await?;

    Ok((file_path, file_name, total_bytes))
}

pub async fn save_subtitle_file_unique(
    field: &mut axum::extract::multipart::Field<'_>,
    target_dir: &StdPath,
    max_bytes: u64,
) -> Result<(PathBuf, String, u64), AppError> {
    let file_name = field
        .file_name()
        .map(|f| f.to_string())
        .unwrap_or_else(|| "subtitle.srt".to_string());

    let extension = validate_subtitle_format(&file_name)?;
    let base_name = StdPath::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("subtitle")
        .to_string();

    let safe_name = sanitize_name(&base_name);
    let unique_suffix = Uuid::new_v4().to_string();
    let final_name = format!("{}_{}.{}", safe_name, unique_suffix, extension);
    let file_path = target_dir.join(&final_name);

    let total_bytes = write_field_to_file(
        field,
        &file_path,
        max_bytes,
        "Subtitle upload progress",
        "Subtitle upload complete",
    )
    .await?;

    Ok((file_path, file_name, total_bytes))
}

/// Save uploaded video file to the specified directory, preserving original filename
pub async fn save_video_file(
    multipart: &mut Multipart,
    target_dir: &StdPath,
    max_bytes: u64,
) -> Result<(PathBuf, String), AppError> {
    if let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {}", e)))?
    {
        let file_name = field
            .file_name()
            .map(|f| f.to_string())
            .unwrap_or_else(|| "video.mp4".to_string());

        // Validate format
        let extension = validate_video_format(&file_name)?;

        // Sanitize filename
        let safe_name = sanitize_name(
            StdPath::new(&file_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("video"),
        );
        let final_name = format!("{}.{}", safe_name, extension);
        let file_path = target_dir.join(&final_name);

        write_field_to_file(
            &mut field,
            &file_path,
            max_bytes,
            "📦 Upload progress",
            "📦 Video upload complete",
        )
        .await?;

        return Ok((file_path, file_name));
    }

    Err(AppError::BadRequest("No file uploaded".to_string()))
}

/// Save uploaded video file with a specific base name (e.g., "Episode1")
pub async fn save_video_file_with_name(
    multipart: &mut Multipart,
    target_dir: &StdPath,
    base_name: &str,
    max_bytes: u64,
) -> Result<(PathBuf, String), AppError> {
    if let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {}", e)))?
    {
        let file_name = field
            .file_name()
            .map(|f| f.to_string())
            .unwrap_or_else(|| "video.mp4".to_string());

        // Validate format
        let extension = validate_video_format(&file_name)?;

        // Use provided base name with original extension
        let final_name = format!("{}.{}", base_name, extension);
        let file_path = target_dir.join(&final_name);

        write_field_to_file(
            &mut field,
            &file_path,
            max_bytes,
            "📦 Episode upload progress",
            "📦 Episode video upload complete",
        )
        .await?;

        return Ok((file_path, file_name));
    }

    Err(AppError::BadRequest("No file uploaded".to_string()))
}
