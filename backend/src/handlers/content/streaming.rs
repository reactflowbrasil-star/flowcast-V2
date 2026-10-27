use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::Response,
    routing::get,
    Extension, Router,
};
use mime_guess;
use std::path::Path as StdPath;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_util::io::ReaderStream;

use crate::{error::AppError, models::UserRole, services::Claims, AppState};

use super::subtitles::{list_content_subtitles, serve_content_subtitle};
use super::{get_content_for_delivery, verify_user_access};

/// Separate router for content streaming with activity tracking
/// Implements HTTP Range requests for efficient video streaming (206 Partial Content)
async fn serve_local_file(
    State(app_state): State<AppState>,
    Path(path): Path<String>,
    Extension(claims): Extension<Claims>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let start_time = std::time::Instant::now();

    // Extract ID from path (e.g., "123", "123.mp4", "123.mkv")
    // Remove any extension to get the ID
    let id_str = path.split('.').next().unwrap_or(&path);
    let id: i64 = id_str
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid content ID".to_string()))?;

    tracing::info!(
        "🎬 [VIDEO-STREAM] Starting serve_local_file for content_id={} (path: {})",
        id,
        path
    );

    let content_service = &app_state.content_service;

    // Get content and category to verify access
    let content = content_service
        .get_content_for_delivery(id)
        .await?
        .ok_or(AppError::NotFound)?;

    let category = content_service
        .get_category_by_id(content.category_id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Verify user access
    verify_user_access(
        content_service,
        &claims,
        Some(&category.category_type),
        Some(category.id),
    )
    .await?;

    // Expect local filesystem path
    let path_str = content.stream_url;
    let file_path = StdPath::new(&path_str);

    if !file_path.is_absolute() || !file_path.exists() {
        return Err(AppError::BadRequest(
            "Content is not a local file or path does not exist".to_string(),
        ));
    }

    tracing::info!("🎬 [VIDEO-STREAM] Serving file: {}", path_str);

    stream_file_response(
        file_path,
        &headers,
        "public, max-age=31536000, immutable",
        "VIDEO-STREAM",
        start_time,
    )
    .await
}

// Serve uploaded media files from /media/uploads via /api/content/uploads/*
async fn serve_upload_file(
    State(app_state): State<AppState>,
    Path(path): Path<String>,
    Extension(claims): Extension<Claims>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let start_time = std::time::Instant::now();

    // Only admins can access raw uploads
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let requested = path.trim_start_matches('/');
    if requested.contains("..") || requested.contains('/') || requested.contains('\\') {
        return Err(AppError::BadRequest("Invalid file path".to_string()));
    }

    let upload_dir = std::path::PathBuf::from(&app_state.config.media_storage_path).join("uploads");
    let file_path = upload_dir.join(requested);

    if !file_path.exists() || !file_path.is_file() {
        return Err(AppError::NotFound);
    }

    tracing::info!(
        "📦 [UPLOAD-STREAM] Serving upload file: {}",
        file_path.to_string_lossy()
    );

    stream_file_response(
        &file_path,
        &headers,
        "public, max-age=31536000, immutable",
        "UPLOAD-STREAM",
        start_time,
    )
    .await
}

async fn serve_content_hls_file(
    State(app_state): State<AppState>,
    Path((id, relative_path)): Path<(i64, String)>,
    Extension(claims): Extension<Claims>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if relative_path.is_empty() || relative_path.contains("..") || relative_path.contains('\\') {
        return Err(AppError::BadRequest("Invalid HLS path".to_string()));
    }
    let content = app_state.content_service.get_content_for_delivery(id).await?.ok_or(AppError::NotFound)?;
    let category = app_state.content_service.get_category_by_id(content.category_id).await?.ok_or(AppError::NotFound)?;
    verify_user_access(&app_state.content_service, &claims, Some(&category.category_type), Some(category.id)).await?;
    let master_path = StdPath::new(&content.stream_url);
    if master_path.file_name().and_then(|name| name.to_str()) != Some("master.m3u8") {
        return Err(AppError::NotFound);
    }
    let hls_root = master_path
        .parent()
        .and_then(|path| path.canonicalize().ok())
        .ok_or(AppError::NotFound)?;
    let file_path = hls_root.join(relative_path);
    let canonical_file = file_path.canonicalize().map_err(|_| AppError::NotFound)?;
    if !canonical_file.starts_with(&hls_root) || !canonical_file.is_file() {
        return Err(AppError::NotFound);
    }
    stream_file_response(
        &canonical_file,
        &headers,
        "private, max-age=3600",
        "HLS",
        std::time::Instant::now(),
    )
    .await
}

/// Serve a local file by stream ID (for multi-stream quality selection)
/// Looks up stream_url from media_streams table by stream ID
async fn serve_stream_file(
    State(app_state): State<AppState>,
    Path(path): Path<String>,
    Extension(claims): Extension<Claims>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let start_time = std::time::Instant::now();

    // Extract stream ID from path (e.g., "42", "42.mp4")
    let id_str = path.split('.').next().unwrap_or(&path);
    let stream_id: i64 = id_str
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid stream ID".to_string()))?;

    tracing::info!(
        "🎬 [STREAM-FILE] Serving stream_id={} (path: {})",
        stream_id,
        path
    );

    // Look up stream_url from media_streams
    let row = sqlx::query_as::<sqlx::Postgres, (String, Option<i64>, Option<i64>)>(
        "SELECT stream_url, media_content_id, episode_id FROM content.media_streams WHERE id = $1",
    )
    .bind(stream_id)
    .fetch_optional(&app_state.database.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let (stream_url, content_id, _episode_id) = row;

    // Verify user has access to this content
    if let Some(cid) = content_id {
        let content_service = &app_state.content_service;
        let content = content_service
            .get_content_for_delivery(cid)
            .await?
            .ok_or(AppError::NotFound)?;
        let category = content_service
            .get_category_by_id(content.category_id)
            .await?
            .ok_or(AppError::NotFound)?;
        verify_user_access(content_service, &claims, Some(&category.category_type), Some(category.id)).await?;
    }

    let file_path = StdPath::new(&stream_url);
    if !file_path.is_absolute() || !file_path.exists() {
        return Err(AppError::BadRequest(
            "Stream is not a local file or path does not exist".to_string(),
        ));
    }

    tracing::info!("🎬 [STREAM-FILE] Serving file: {}", stream_url);

    stream_file_response(
        file_path,
        &headers,
        "public, max-age=31536000, immutable",
        "STREAM-FILE",
        start_time,
    )
    .await
}

pub fn content_streaming_routes() -> Router<AppState> {
    Router::new()
        .route("/:id/stream", get(get_content_for_delivery))
        .route("/uploads/*path", get(serve_upload_file))
        .route("/:id/hls/*path", get(serve_content_hls_file))
        // Accept /file/123, /file/123.mp4, /file/123.mkv, etc.
        .route("/file/*path", get(serve_local_file))
        // Serve files by stream ID (for multi-stream selection)
        .route("/stream-file/*path", get(serve_stream_file))
        .route("/:id/subtitles", get(list_content_subtitles))
        .route("/:id/subtitle/:subtitle_id", get(serve_content_subtitle))
}

pub(crate) async fn stream_file_response(
    file_path: &StdPath,
    headers: &HeaderMap,
    cache_control: &str,
    log_label: &str,
    start_time: std::time::Instant,
) -> Result<Response, AppError> {
    // Debug: Log all headers to see what's arriving
    tracing::info!("🔍 [{}] Headers received:", log_label);
    for (name, value) in headers.iter() {
        if let Ok(val_str) = value.to_str() {
            tracing::info!("  {}: {}", name, val_str);
        }
    }

    // Get file metadata
    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|_| AppError::InternalServerError)?;
    let file_size = metadata.len();

    // Determine MIME type with explicit HLS extension handling
    let ext = file_path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default();
    let mime_type = match ext.as_str() {
        "m3u8" | "m3u" => "application/x-mpegURL".to_string(),
        "ts" => "video/mp2t".to_string(),
        "m4s" => "video/iso.segment".to_string(),
        "mp4" => "video/mp4".to_string(),
        "webm" => "video/webm".to_string(),
        "mkv" => "video/x-matroska".to_string(),
        _ => mime_guess::from_path(file_path)
            .first_or_octet_stream()
            .to_string(),
    };

    // Handle range requests for video streaming (critical for seek functionality)
    let range_header = headers.get(header::RANGE);

    if let Some(range) = range_header {
        // Parse range header (e.g., "bytes=710934528-")
        let range_str = range
            .to_str()
            .map_err(|_| AppError::BadRequest("Invalid range header".to_string()))?;

        tracing::info!("📦 [{}] Range request: {}", log_label, range_str);

        if let Some(range_spec) = range_str.strip_prefix("bytes=") {
            let parts: Vec<&str> = range_spec.split('-').collect();
            if parts.len() == 2 {
                let start = if parts[0].is_empty() {
                    0
                } else {
                    parts[0]
                        .parse::<u64>()
                        .map_err(|_| AppError::BadRequest("Invalid range start".to_string()))?
                };

                let end = if parts[1].is_empty() {
                    file_size - 1
                } else {
                    parts[1]
                        .parse::<u64>()
                        .map_err(|_| AppError::BadRequest("Invalid range end".to_string()))?
                        .min(file_size - 1)
                };

                if start <= end && start < file_size {
                    // Open file and seek to start position
                    let mut file = File::open(file_path)
                        .await
                        .map_err(|_| AppError::InternalServerError)?;

                    file.seek(SeekFrom::Start(start))
                        .await
                        .map_err(|_| AppError::InternalServerError)?;

                    let content_length = end - start + 1;
                    // Use 4MB buffer for video streaming optimization (larger than music's 512KB)
                    let stream =
                        ReaderStream::with_capacity(file.take(content_length), 4 * 1024 * 1024);

                    tracing::info!(
                        "✅ [{}] Serving range bytes {}-{}/{} ({} MB) in {}ms",
                        log_label,
                        start,
                        end,
                        file_size,
                        content_length / (1024 * 1024),
                        start_time.elapsed().as_millis()
                    );

                    return Response::builder()
                        .status(StatusCode::PARTIAL_CONTENT)
                        .header(header::CONTENT_TYPE, mime_type)
                        .header(header::CONTENT_LENGTH, content_length.to_string())
                        .header(
                            header::CONTENT_RANGE,
                            format!("bytes {}-{}/{}", start, end, file_size),
                        )
                        .header(header::ACCEPT_RANGES, "bytes")
                        .header(header::CACHE_CONTROL, cache_control)
                        .header(header::CONNECTION, "keep-alive")
                        .body(Body::from_stream(stream))
                        .map_err(|_| AppError::InternalServerError);
                }
            }
        }
    }

    // Serve entire file (no range request)
    let file = File::open(file_path)
        .await
        .map_err(|_| AppError::InternalServerError)?;

    // Use 4MB buffer for video streaming optimization
    let stream = ReaderStream::with_capacity(file, 4 * 1024 * 1024);

    tracing::info!(
        "✅ [{}] Serving full file ({} MB) in {}ms",
        log_label,
        file_size / (1024 * 1024),
        start_time.elapsed().as_millis()
    );

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_type)
        .header(header::CONTENT_LENGTH, file_size.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, cache_control)
        .header(header::CONNECTION, "keep-alive")
        .body(Body::from_stream(stream))
        .map_err(|_| AppError::InternalServerError)
}

#[cfg(test)]
mod tests {
    use super::stream_file_response;
    use crate::error::AppError;
    use axum::{
        body::to_bytes,
        http::{header, HeaderMap, HeaderValue, StatusCode},
    };
    use std::fs;
    use std::time::Instant;
    use tempfile::tempdir;

    #[tokio::test]
    async fn stream_file_response_returns_partial_content_for_valid_range() {
        let dir = tempdir().expect("tempdir should be created");
        let file_path = dir.path().join("video.bin");
        fs::write(&file_path, b"0123456789").expect("fixture file should be written");

        let mut headers = HeaderMap::new();
        headers.insert(header::RANGE, HeaderValue::from_static("bytes=2-5"));

        let response = stream_file_response(
            &file_path,
            &headers,
            "public, max-age=60",
            "TEST",
            Instant::now(),
        )
        .await
        .expect("valid range request should succeed");

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok()),
            Some("bytes 2-5/10")
        );
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok()),
            Some("4")
        );

        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        assert_eq!(&body[..], b"2345");
    }

    #[tokio::test]
    async fn stream_file_response_returns_bad_request_for_invalid_range_start() {
        let dir = tempdir().expect("tempdir should be created");
        let file_path = dir.path().join("video.bin");
        fs::write(&file_path, b"0123456789").expect("fixture file should be written");

        let mut headers = HeaderMap::new();
        headers.insert(header::RANGE, HeaderValue::from_static("bytes=abc-5"));

        let err = stream_file_response(
            &file_path,
            &headers,
            "public, max-age=60",
            "TEST",
            Instant::now(),
        )
        .await
        .expect_err("invalid range start should fail");

        assert!(matches!(err, AppError::BadRequest(msg) if msg == "Invalid range start"));
    }
}
