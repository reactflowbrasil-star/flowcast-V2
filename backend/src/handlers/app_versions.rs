use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    response::Json,
    routing::{delete, get, post, put},
    Extension, Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

use crate::{error::AppError, models::UserRole, services::Claims, AppState};

/// Response for version check endpoint (used by mobile apps)
#[derive(Debug, Serialize)]
pub struct VersionCheckResponse {
    pub has_update: bool,
    pub latest_version: String,
    pub latest_version_code: i32,
    pub force_update: bool,
    pub download_url: String,
    pub release_notes: Option<String>,
    pub min_required_version: Option<String>,
    pub file_size: i64,
    pub file_hash: String,
}

/// App version record from database
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AppVersion {
    pub id: i64,
    pub app_type: String,
    pub version: String,
    pub version_code: i32,
    pub apk_filename: String,
    pub file_size: i64,
    pub file_hash: String,
    pub force_update: bool,
    pub release_notes: Option<String>,
    pub min_required_version: Option<String>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// App version with download URL for API responses
#[derive(Debug, Serialize)]
pub struct AppVersionResponse {
    pub id: i64,
    pub app_type: String,
    pub version: String,
    pub version_code: i32,
    pub apk_filename: String,
    pub file_size: i64,
    pub file_hash: String,
    pub force_update: bool,
    pub release_notes: Option<String>,
    pub min_required_version: Option<String>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub download_url: String,
}

impl AppVersionResponse {
    fn from_version(version: AppVersion, base_url: &str) -> Self {
        let download_url = format!("{}/api/app/download/{}", base_url, version.apk_filename);
        Self {
            id: version.id,
            app_type: version.app_type,
            version: version.version,
            version_code: version.version_code,
            apk_filename: version.apk_filename,
            file_size: version.file_size,
            file_hash: version.file_hash,
            force_update: version.force_update,
            release_notes: version.release_notes,
            min_required_version: version.min_required_version,
            is_active: version.is_active,
            created_at: version.created_at,
            updated_at: version.updated_at,
            download_url,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct VersionCheckQuery {
    pub app_type: String,
    pub current_version_code: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ListVersionsQuery {
    pub app_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateVersionRequest {
    pub force_update: Option<bool>,
    pub release_notes: Option<String>,
    pub min_required_version: Option<String>,
    pub is_active: Option<bool>,
}

/// Get APK storage directory
fn get_apk_storage_path(config: &crate::config::Config) -> PathBuf {
    PathBuf::from(&config.media_storage_path).join("apk_releases")
}

/// Ensure APK storage directory exists
async fn ensure_apk_directory(config: &crate::config::Config) -> Result<PathBuf, AppError> {
    let apk_dir = get_apk_storage_path(config);
    if !apk_dir.exists() {
        tokio::fs::create_dir_all(&apk_dir).await.map_err(|e| {
            AppError::InternalError(format!("Failed to create APK directory: {}", e))
        })?;
    }
    Ok(apk_dir)
}

/// GET /api/app/version - Check for app updates (public endpoint for mobile apps)
pub async fn check_version(
    State(app_state): State<AppState>,
    Query(query): Query<VersionCheckQuery>,
) -> Result<Json<VersionCheckResponse>, AppError> {
    let app_type = query.app_type.to_lowercase();
    if app_type != "phone" && app_type != "tv" {
        return Err(AppError::BadRequest(
            "Invalid app_type. Must be 'phone' or 'tv'".to_string(),
        ));
    }

    // Get the latest active version for this app type
    let version: Option<AppVersion> = sqlx::query_as(
        r#"
        SELECT id, app_type, version, version_code, apk_filename, file_size, file_hash,
               force_update, release_notes, min_required_version, is_active, created_at, updated_at
        FROM core.app_versions
        WHERE app_type = $1 AND is_active = true
        ORDER BY version_code DESC
        LIMIT 1
        "#,
    )
    .bind(&app_type)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    match version {
        Some(v) => {
            let current_code = query.current_version_code.unwrap_or(0);
            let has_update = v.version_code > current_code;

            // Determine if force update is required based on min_required_version
            let force_update = if has_update && v.force_update {
                true
            } else if let Some(ref min_version) = v.min_required_version {
                // Parse min required version code if provided
                min_version
                    .parse::<i32>()
                    .map(|min| current_code < min)
                    .unwrap_or(false)
            } else {
                false
            };

            let base_url = app_state.config.public_base_url.clone();
            let download_url = format!("{}/api/app/download/{}", base_url, v.apk_filename);

            Ok(Json(VersionCheckResponse {
                has_update,
                latest_version: v.version,
                latest_version_code: v.version_code,
                force_update,
                download_url,
                release_notes: v.release_notes,
                min_required_version: v.min_required_version,
                file_size: v.file_size,
                file_hash: v.file_hash,
            }))
        }
        None => {
            // No version available
            Ok(Json(VersionCheckResponse {
                has_update: false,
                latest_version: "0.0.0".to_string(),
                latest_version_code: 0,
                force_update: false,
                download_url: String::new(),
                release_notes: None,
                min_required_version: None,
                file_size: 0,
                file_hash: String::new(),
            }))
        }
    }
}

/// GET /api/app/download/:filename - Download APK file (public)
pub async fn download_apk(
    State(app_state): State<AppState>,
    Path(filename): Path<String>,
) -> Result<axum::response::Response, AppError> {
    use axum::body::Body;
    use axum::http::{header, StatusCode};
    use tokio_util::io::ReaderStream;

    // Validate filename to prevent path traversal
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(AppError::BadRequest("Invalid filename".to_string()));
    }

    // Verify the file exists in database
    let exists: Option<i64> =
        sqlx::query_scalar("SELECT id FROM core.app_versions WHERE apk_filename = $1")
            .bind(&filename)
            .fetch_optional(&app_state.database.pool)
            .await
            .map_err(AppError::DatabaseError)?;

    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    let apk_dir = get_apk_storage_path(&app_state.config);
    let file_path = apk_dir.join(&filename);

    if !file_path.exists() {
        tracing::error!("APK file not found on disk: {:?}", file_path);
        return Err(AppError::NotFound);
    }

    let file = tokio::fs::File::open(&file_path)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to open file: {}", e)))?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let response = axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            "application/vnd.android.package-archive",
        )
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename),
        )
        .body(body)
        .map_err(|e| AppError::InternalError(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

/// GET /api/admin/app-versions - List all app versions (admin only)
pub async fn list_versions(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ListVersionsQuery>,
) -> Result<Json<Vec<AppVersionResponse>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let versions: Vec<AppVersion> = if let Some(app_type) = query.app_type {
        sqlx::query_as(
            r#"
            SELECT id, app_type, version, version_code, apk_filename, file_size, file_hash,
                   force_update, release_notes, min_required_version, is_active, created_at, updated_at
            FROM core.app_versions
            WHERE app_type = $1
            ORDER BY version_code DESC
            "#
        )
        .bind(app_type)
        .fetch_all(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?
    } else {
        sqlx::query_as(
            r#"
            SELECT id, app_type, version, version_code, apk_filename, file_size, file_hash,
                   force_update, release_notes, min_required_version, is_active, created_at, updated_at
            FROM core.app_versions
            ORDER BY app_type, version_code DESC
            "#
        )
        .fetch_all(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?
    };

    let base_url = app_state.config.public_base_url.clone();
    let responses: Vec<AppVersionResponse> = versions
        .into_iter()
        .map(|v| AppVersionResponse::from_version(v, &base_url))
        .collect();

    Ok(Json(responses))
}

/// POST /api/admin/app-versions - Upload new app version (admin only, multipart)
pub async fn create_version(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> Result<Json<AppVersionResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let apk_dir = ensure_apk_directory(&app_state.config).await?;

    let mut app_type: Option<String> = None;
    let mut version: Option<String> = None;
    let mut version_code: Option<i32> = None;
    let mut force_update = false;
    let mut release_notes: Option<String> = None;
    let mut min_required_version: Option<String> = None;
    let mut file_path: Option<PathBuf> = None;
    let mut file_size: i64 = 0;
    let mut file_hash_value: Option<String> = None;

    tracing::info!("📱 Starting APK version upload...");

    while let Some(mut field) = multipart.next_field().await.map_err(|e| {
        tracing::error!("Failed to read multipart field: {}", e);
        AppError::BadRequest(format!("Invalid multipart data: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();
        tracing::debug!("Processing field: {}", name);

        match name.as_str() {
            "app_type" => {
                app_type = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "version" => {
                version = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "version_code" => {
                let code_str = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                version_code = Some(
                    code_str
                        .parse()
                        .map_err(|_| AppError::BadRequest("Invalid version_code".to_string()))?,
                );
            }
            "force_update" => {
                let val = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                force_update = val == "true" || val == "1";
            }
            "release_notes" => {
                let notes = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                if !notes.is_empty() {
                    release_notes = Some(notes);
                }
            }
            "min_required_version" => {
                let min_ver = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                if !min_ver.is_empty() {
                    min_required_version = Some(min_ver);
                }
            }
            "apk_file" => {
                // Stream file directly to disk using chunks to avoid memory/timeout issues
                let timestamp = chrono::Utc::now().timestamp();
                let temp_filename = format!("upload_temp_{}.apk", timestamp);
                let temp_path = apk_dir.join(&temp_filename);

                tracing::info!("📦 Streaming APK to: {:?}", temp_path);

                // Create file for streaming writes
                let mut file = tokio::fs::File::create(&temp_path).await.map_err(|e| {
                    AppError::InternalError(format!("Failed to create temp file: {}", e))
                })?;

                let mut hasher = Sha256::new();
                let mut total_bytes: i64 = 0;

                // Stream chunks to disk - this avoids loading entire file into memory
                while let Some(chunk) = field.chunk().await.map_err(|e| {
                    tracing::error!("Failed to read chunk: {}", e);
                    AppError::BadRequest(format!("Failed to read file chunk: {}", e))
                })? {
                    total_bytes += chunk.len() as i64;
                    hasher.update(&chunk);
                    file.write_all(&chunk).await.map_err(|e| {
                        AppError::InternalError(format!("Failed to write chunk: {}", e))
                    })?;

                    // Log progress every 10MB
                    if total_bytes % (10 * 1024 * 1024) < chunk.len() as i64 {
                        tracing::info!(
                            "📦 Upload progress: {} MB received",
                            total_bytes / (1024 * 1024)
                        );
                    }
                }

                // Ensure all data is written
                file.flush()
                    .await
                    .map_err(|e| AppError::InternalError(format!("Failed to flush file: {}", e)))?;

                file_size = total_bytes;
                file_hash_value = Some(format!("{:x}", hasher.finalize()));
                file_path = Some(temp_path);

                tracing::info!(
                    "📦 APK upload complete: {} bytes, hash computed",
                    total_bytes
                );
            }
            _ => {
                // Skip unknown fields
            }
        }
    }

    // Validate required fields
    let app_type =
        app_type.ok_or_else(|| AppError::BadRequest("app_type is required".to_string()))?;
    let version = version.ok_or_else(|| AppError::BadRequest("version is required".to_string()))?;
    let version_code =
        version_code.ok_or_else(|| AppError::BadRequest("version_code is required".to_string()))?;
    let temp_file_path =
        file_path.ok_or_else(|| AppError::BadRequest("apk_file is required".to_string()))?;
    let file_hash = file_hash_value
        .ok_or_else(|| AppError::BadRequest("Failed to compute file hash".to_string()))?;

    if app_type != "phone" && app_type != "tv" {
        // Clean up temp file before returning error
        let _ = tokio::fs::remove_file(&temp_file_path).await;
        return Err(AppError::BadRequest(
            "app_type must be 'phone' or 'tv'".to_string(),
        ));
    }

    // Generate unique filename and rename temp file
    let timestamp = chrono::Utc::now().timestamp();
    let filename = format!(
        "{}_{}_v{}_{}.apk",
        app_type,
        version.replace('.', "_"),
        version_code,
        timestamp
    );
    let final_file_path = apk_dir.join(&filename);

    // Rename temp file to final filename
    tokio::fs::rename(&temp_file_path, &final_file_path)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to rename file: {}", e)))?;

    tracing::info!("📱 APK saved as: {} ({} bytes)", filename, file_size);

    // Insert into database
    let row: AppVersion = sqlx::query_as(
        r#"
        INSERT INTO core.app_versions (app_type, version, version_code, apk_filename, file_size, file_hash, force_update, release_notes, min_required_version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, app_type, version, version_code, apk_filename, file_size, file_hash, force_update, release_notes, min_required_version, is_active, created_at, updated_at
        "#
    )
    .bind(&app_type)
    .bind(&version)
    .bind(version_code)
    .bind(&filename)
    .bind(file_size)
    .bind(&file_hash)
    .bind(force_update)
    .bind(&release_notes)
    .bind(&min_required_version)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(|e| {
        // Clean up file on error
        let _ = std::fs::remove_file(&final_file_path);
        AppError::DatabaseError(e)
    })?;

    tracing::info!(
        "📱 Uploaded app version: {} v{} (code: {}) - {} bytes",
        app_type,
        version,
        version_code,
        file_size
    );

    let base_url = app_state.config.public_base_url.clone();
    Ok(Json(AppVersionResponse::from_version(row, &base_url)))
}

/// PUT /api/admin/app-versions/:id - Update version metadata (admin only)
pub async fn update_version(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
    Json(request): Json<UpdateVersionRequest>,
) -> Result<Json<AppVersionResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Check if version exists
    let existing: Option<i64> = sqlx::query_scalar("SELECT id FROM core.app_versions WHERE id = $1")
        .bind(id)
        .fetch_optional(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    if existing.is_none() {
        return Err(AppError::NotFound);
    }

    // Build dynamic update query
    let row: AppVersion = sqlx::query_as(
        r#"
        UPDATE core.app_versions
        SET force_update = COALESCE($1, force_update),
            release_notes = COALESCE($2, release_notes),
            min_required_version = COALESCE($3, min_required_version),
            is_active = COALESCE($4, is_active),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING id, app_type, version, version_code, apk_filename, file_size, file_hash, force_update, release_notes, min_required_version, is_active, created_at, updated_at
        "#
    )
    .bind(request.force_update)
    .bind(&request.release_notes)
    .bind(&request.min_required_version)
    .bind(request.is_active)
    .bind(id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    tracing::info!("📱 Updated app version {} metadata", id);

    let base_url = app_state.config.public_base_url.clone();
    Ok(Json(AppVersionResponse::from_version(row, &base_url)))
}

/// DELETE /api/admin/app-versions/:id - Delete an app version (admin only)
pub async fn delete_version(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Get the filename before deleting
    let filename: Option<String> =
        sqlx::query_scalar("SELECT apk_filename FROM core.app_versions WHERE id = $1")
            .bind(id)
            .fetch_optional(&app_state.database.pool)
            .await
            .map_err(AppError::DatabaseError)?;

    if filename.is_none() {
        return Err(AppError::NotFound);
    }

    let filename = filename.ok_or(AppError::NotFound)?;

    // Delete from database
    sqlx::query("DELETE FROM core.app_versions WHERE id = $1")
        .bind(id)
        .execute(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    // Delete file from disk
    let apk_dir = get_apk_storage_path(&app_state.config);
    let file_path = apk_dir.join(&filename);
    if file_path.exists() {
        if let Err(e) = tokio::fs::remove_file(&file_path).await {
            tracing::warn!("Failed to delete APK file {:?}: {}", file_path, e);
        }
    }

    tracing::info!("📱 Deleted app version {} ({})", id, filename);

    Ok(Json(
        serde_json::json!({ "success": true, "deleted_id": id }),
    ))
}

/// Create public routes for app version checking and downloading
pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/api/app/version", get(check_version))
        .route("/api/app/download/:filename", get(download_apk))
}

/// Create admin routes for managing app versions
pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/api/admin/app-versions", get(list_versions))
        .route("/api/admin/app-versions", post(create_version))
        .route("/api/admin/app-versions/:id", put(update_version))
        .route("/api/admin/app-versions/:id", delete(delete_version))
        // Allow up to 5GB uploads for APK files (matching nginx)
        .layer(DefaultBodyLimit::max(5 * 1024 * 1024 * 1024))
}
