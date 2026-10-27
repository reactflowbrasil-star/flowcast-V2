use axum::{
    extract::{Multipart, Path, State},
    response::Json,
    Extension,
};
use std::path::PathBuf;
use std::process::Stdio;
use once_cell::sync::Lazy;
use tokio::sync::Semaphore;
use tokio::process::Command;

use crate::{error::AppError, models::UserRole, services::Claims, AppState};

use super::{
    helpers::{
        ensure_directory_exists, media_storage_root_for_category, sanitize_name,
        save_video_file, save_video_file_with_name,
    },
    UploadResponse,
};

const HLS_RENDITIONS: &[(u32, u32, &str, &str, &str)] = &[
    (426, 240, "450k", "600k", "700k"),
    (640, 360, "800k", "1000k", "1100k"),
    (854, 480, "1400k", "1750k", "1925k"),
    (1280, 720, "2800k", "3500k", "3850k"),
    (1920, 1080, "5000k", "6250k", "6875k"),
];
static HLS_TRANSCODE_SEMAPHORE: Lazy<Semaphore> = Lazy::new(|| Semaphore::new(1));

/// Create a broad-compatibility HLS ladder (H.264/AVC + AAC-LC) next to the
/// untouched upload. Returning `None` keeps the original as the safe fallback.
async fn transcode_to_hls(source: PathBuf) -> Option<PathBuf> {
    let output_dir = source.parent()?.join(format!(
        "{}_hls_{}",
        source.file_stem()?.to_string_lossy(),
        uuid::Uuid::new_v4()
    ));
    tokio::fs::create_dir_all(&output_dir).await.ok()?;
    let master_tmp = output_dir.join("master.m3u8.tmp");
    let mut master = tokio::fs::File::create(&master_tmp).await.ok()?;
    use tokio::io::AsyncWriteExt;
    master.write_all(b"#EXTM3U\n#EXT-X-VERSION:3\n").await.ok()?;

    let mut generated = 0usize;
    for &(width, height, video_bitrate, maxrate, bufsize) in HLS_RENDITIONS {
        let playlist_name = format!("{height}p.m3u8");
        let segment_pattern = output_dir.join(format!("{height}p_%05d.ts"));
        let scale = format!(
            "scale='min({},iw)':-2:force_original_aspect_ratio=decrease:force_divisible_by=2",
            width
        );
        let result = Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error", "-y", "-i"])
            .arg(&source)
            .args(["-map", "0:v:0", "-map", "0:a:0?", "-vf"])
            .arg(scale)
            .args(["-c:v", "libx264", "-preset", "medium", "-threads", "2", "-profile:v", "main", "-pix_fmt", "yuv420p", "-b:v"])
            .arg(video_bitrate)
            .args(["-maxrate"])
            .arg(maxrate)
            .args(["-bufsize"])
            .arg(bufsize)
            .args(["-sc_threshold", "0", "-force_key_frames", "expr:gte(t,n_forced*6)", "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k", "-ac", "2", "-ar", "48000", "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments", "-hls_segment_filename"])
            .arg(&segment_pattern)
            .arg(output_dir.join(&playlist_name))
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
            .await;
        if result.map(|output| output.status.success()).unwrap_or(false) {
            let bandwidth = maxrate.trim_end_matches('k').parse::<u32>().unwrap_or(1000) * 1000 + 128_000;
            let entry = format!("#EXT-X-STREAM-INF:BANDWIDTH={bandwidth}\n{playlist_name}\n");
            if master.write_all(entry.as_bytes()).await.is_ok() {
                generated += 1;
            }
        } else {
            tracing::warn!("HLS rendition {height}p could not be generated for {}", source.display());
        }
    }
    master.flush().await.ok()?;
    drop(master);
    if generated == 0 {
        let _ = tokio::fs::remove_dir_all(&output_dir).await;
        return None;
    }
    let master_path = output_dir.join("master.m3u8");
    tokio::fs::rename(master_tmp, &master_path).await.ok()?;
    Some(master_path)
}

async fn start_hls_transcode(
    source: PathBuf,
    on_complete: impl FnOnce(String) -> futures::future::BoxFuture<'static, ()> + Send + 'static,
) {
    tokio::spawn(async move {
        let _permit = match HLS_TRANSCODE_SEMAPHORE.acquire().await {
            Ok(permit) => permit,
            Err(error) => {
                tracing::error!("Could not acquire HLS transcoding slot: {error}");
                return;
            }
        };
        match transcode_to_hls(source.clone()).await {
            Some(hls_path) => on_complete(hls_path.to_string_lossy().into_owned()).await,
            None => tracing::warn!("Keeping original upload as playback source: {}", source.display()),
        }
    });
}

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

    let pool = app_state.database.pool.clone();
    start_hls_transcode(file_path.clone(), move |hls_path| Box::pin(async move {
        if let Err(error) = sqlx::query("UPDATE content.media_streams SET stream_url = $1 WHERE media_content_id = $2 AND is_default = true")
            .bind(hls_path).bind(content_id).execute(&pool).await {
            tracing::error!("Failed to set HLS playback path for content {content_id}: {error}");
        }
    })).await;

    tracing::info!(
        "📤 Uploaded video for content {}: {} -> {}",
        content_id,
        original_name,
        relative_path
    );

    Ok(Json(UploadResponse {
        success: true,
        path: relative_path,
        message: format!("Video '{}' uploaded; adaptive playback is being optimized in the background", original_name),
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

    let pool = app_state.database.pool.clone();
    start_hls_transcode(file_path.clone(), move |hls_path| Box::pin(async move {
        if let Err(error) = sqlx::query("UPDATE content.episodes SET stream_url = $1 WHERE id = $2")
            .bind(hls_path).bind(episode_id).execute(&pool).await {
            tracing::error!("Failed to set HLS playback path for episode {episode_id}: {error}");
        }
    })).await;

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
            "Video uploaded for {} Season {} Episode {}; adaptive playback is being optimized in the background",
            series_title, season_number, episode_number
        ),
    }))
}
