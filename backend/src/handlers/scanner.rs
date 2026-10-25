use axum::{
    extract::{Path as AxumPath, Query, State},
    response::Json,
    routing::{delete, get, post},
    Extension, Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, sync::Arc, time::SystemTime};
use tokio::{sync::RwLock, task};
use uuid;

use crate::{
    error::AppError,
    services::{Claims, ContentService},
};

fn now_epoch_secs() -> u64 {
    match SystemTime::now().duration_since(SystemTime::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs(),
        Err(err) => {
            tracing::warn!("System time before UNIX_EPOCH: {}", err);
            0
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum CategorySelector {
    Id(i64),
    Type(String),
}

#[derive(Debug, Deserialize)]
pub struct ScanFolderRequest {
    pub root_path: String,
    // "movies" | "series" | "mixed" (default: "mixed")
    pub media: Option<String>,
    // "omit" | "replace" | "allow" (default: "omit")
    pub duplicate_policy: Option<String>,
    // include .srt external subtitles if found (default: true)
    pub add_subs: Option<bool>,
    // Optional override for the category used when ingesting movies (accepts numeric ID or type string e.g. "VOD")
    pub movie_category: Option<CategorySelector>,
    // Optional override for the category used when ingesting series (accepts numeric ID or type string e.g. "Series")
    pub series_category: Option<CategorySelector>,
}

#[derive(Debug, Serialize)]
pub struct ScanFolderResult {
    pub movies_created: i32,
    pub series_created: i32,
    pub episodes_created: i32,
    pub subtitles_added: i32,
    pub skipped: i32,
    pub replaced: i32,
    pub logs: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ScanStartResponse {
    pub scan_id: String,
    pub message: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanTask {
    pub id: String,
    pub status: String, // "running", "completed", "failed", "cancelled"
    pub category: String,
    pub path: String,
    pub start_time: u64, // Unix timestamp
    pub end_time: Option<u64>,
    pub movies_created: i32,
    pub series_created: i32,
    pub episodes_created: i32,
    pub subtitles_added: i32,
    pub skipped: i32,
    pub replaced: i32,
    pub current_file: Option<String>,
    pub error_message: Option<String>,
}

// Global task storage
lazy_static::lazy_static! {
    pub static ref SCAN_TASKS: Arc<RwLock<HashMap<String, ScanTask>>> = Arc::new(RwLock::new(HashMap::new()));
    static ref TASK_HANDLES: Arc<RwLock<HashMap<String, tokio::task::JoinHandle<()>>>> = Arc::new(RwLock::new(HashMap::new()));
}

#[derive(Debug, Deserialize)]
pub struct ListFoldersQuery {
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FolderItem {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub last_modified: Option<String>,
}

pub async fn scan_folder_ingest(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<ScanFolderRequest>,
) -> Result<Json<ScanStartResponse>, AppError> {
    // Only admins can run scans
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Generate a unique scan ID
    let scan_id = uuid::Uuid::new_v4().to_string();

    // Create initial task
    let task = ScanTask {
        id: scan_id.clone(),
        status: "running".to_string(),
        category: req.media.clone().unwrap_or_else(|| "mixed".to_string()),
        path: req.root_path.clone(),
        start_time: now_epoch_secs(),
        end_time: None,
        movies_created: 0,
        series_created: 0,
        episodes_created: 0,
        subtitles_added: 0,
        skipped: 0,
        replaced: 0,
        current_file: None,
        error_message: None,
    };

    // Store the task
    {
        let mut tasks = SCAN_TASKS.write().await;
        tasks.insert(scan_id.clone(), task);
    }

    // Clone the content service and request for the background task
    let content_service_clone = content_service.clone();

    // Auto-detect category type based on media type if not explicitly overridden
    let media_type = req.media.clone().unwrap_or_else(|| "mixed".to_string());
    let auto_category_type = match media_type.as_str() {
        "anime" => Some("Anime".to_string()),
        "kids" => Some("Kids".to_string()),
        "movies" => Some("VOD".to_string()),
        "series" => Some("Series".to_string()),
        _ => None, // "mixed" or unknown - let the scanner auto-detect
    };

    let scan_req = crate::services::content::ScanFolderIngestRequest {
        root_path: req.root_path.clone(),
        media: req.media.clone(),
        duplicate_policy: req.duplicate_policy.clone(),
        add_subs: req.add_subs,
        // When client sends a string, treat it as category type. When it sends a number, treat it as category id.
        // Fall back to auto-detected category type based on media type
        movie_category: match &req.movie_category {
            Some(CategorySelector::Type(s)) => Some(s.clone()),
            _ => auto_category_type.clone(),
        },
        series_category: match &req.series_category {
            Some(CategorySelector::Type(s)) => Some(s.clone()),
            _ => auto_category_type.clone(),
        },
        movie_category_id: match &req.movie_category {
            Some(CategorySelector::Id(id)) => Some(*id),
            _ => None,
        },
        series_category_id: match &req.series_category {
            Some(CategorySelector::Id(id)) => Some(*id),
            _ => None,
        },
    };

    // Start the scan in a background task
    let scan_id_clone = scan_id.clone();
    let handle = task::spawn(async move {
        tracing::info!(
            "🚀 Starting background scan task with ID: {}",
            scan_id_clone
        );

        match content_service_clone
            .scan_folder_ingest_with_progress(scan_req, Some(scan_id_clone.clone()))
            .await
        {
            Ok(result) => {
                tracing::info!(
                    "✅ Scan {} completed successfully: {} movies, {} series, {} episodes created",
                    scan_id_clone,
                    result.movies_created,
                    result.series_created,
                    result.episodes_created
                );

                // Update task with completion
                {
                    let mut tasks = SCAN_TASKS.write().await;
                    if let Some(task) = tasks.get_mut(&scan_id_clone) {
                        task.status = "completed".to_string();
                        task.end_time = Some(now_epoch_secs());
                        task.movies_created = result.movies_created;
                        task.series_created = result.series_created;
                        task.episodes_created = result.episodes_created;
                        task.subtitles_added = result.subtitles_added;
                        task.skipped = result.skipped;
                        task.replaced = result.replaced;
                    }
                }
            }
            Err(e) => {
                tracing::error!("❌ Scan {} failed: {}", scan_id_clone, e);

                // Update task with error
                {
                    let mut tasks = SCAN_TASKS.write().await;
                    if let Some(task) = tasks.get_mut(&scan_id_clone) {
                        task.status = "failed".to_string();
                        task.end_time = Some(now_epoch_secs());
                        task.error_message = Some(format!("{:?}", e));
                    }
                }
            }
        }

        // Remove from handles
        {
            let mut handles = TASK_HANDLES.write().await;
            handles.remove(&scan_id_clone);
        }
    });

    // Store the handle for cancellation
    {
        let mut handles = TASK_HANDLES.write().await;
        handles.insert(scan_id.clone(), handle);
    }

    // Return immediately with scan ID
    Ok(Json(ScanStartResponse {
        scan_id,
        message: "Scan started in background".to_string(),
        status: "started".to_string(),
    }))
}

pub async fn list_folders(
    Extension(claims): Extension<Claims>,
    Query(query): Query<ListFoldersQuery>,
) -> Result<Json<Vec<FolderItem>>, AppError> {
    // Only admins can list folders
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let path = query.path.unwrap_or_else(|| "/".to_string());

    // SECURITY FIX: Only allow browsing specific safe directories
    // This prevents path traversal attacks that could expose sensitive system files
    const ALLOWED_PREFIXES: &[&str] = &[
        "/media",
        "/mnt",
        "/data",
        "/home",
        "/srv",
        "/var/media",
        "/opt/media",
        "/storage",
    ];

    #[derive(Debug)]
    enum ListFoldersError {
        InvalidPath,
        NotAllowed(String),
        ReadDir,
    }

    let (_path_str, items) = tokio::task::spawn_blocking(move || {
        // Security: Prevent path traversal attacks
        let canonical_path = fs::canonicalize(&path).map_err(|_| ListFoldersError::InvalidPath)?;

        let path_str = canonical_path.to_string_lossy().to_string();
        let is_allowed = ALLOWED_PREFIXES
            .iter()
            .any(|prefix| path_str.starts_with(prefix));

        if !is_allowed {
            return Err(ListFoldersError::NotAllowed(path_str));
        }

        let mut items = Vec::new();
        let entries = fs::read_dir(&canonical_path).map_err(|_| ListFoldersError::ReadDir)?;
        for entry in entries.flatten() {
            let path = entry.path();
            let metadata = entry.metadata().ok();

            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();

            let is_directory = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let size = metadata
                .as_ref()
                .and_then(|m| if m.is_file() { Some(m.len()) } else { None });

            let last_modified = metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| {
                    let datetime =
                        chrono::DateTime::from_timestamp(d.as_secs() as i64, 0).unwrap_or_default();
                    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                });

            items.push(FolderItem {
                name,
                path: path.to_string_lossy().to_string(),
                is_directory,
                size,
                last_modified,
            });
        }

        Ok::<_, ListFoldersError>((path_str, items))
    })
    .await
    .map_err(|e| AppError::InternalError(format!("List folders join error: {}", e)))?
    .map_err(|err| match err {
        ListFoldersError::InvalidPath => AppError::BadRequest("Invalid path".to_string()),
        ListFoldersError::NotAllowed(path_str) => {
            tracing::warn!(
                "Blocked attempt to browse restricted path: {} by user {}",
                path_str,
                claims.sub
            );
            AppError::BadRequest(
                "Path not allowed. Only media directories can be browsed.".to_string(),
            )
        }
        ListFoldersError::ReadDir => AppError::BadRequest("Cannot read directory".to_string()),
    })?;

    Ok(Json(items))
}

pub async fn get_scan_tasks(
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<ScanTask>>, AppError> {
    // Only admins can view scan tasks
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let tasks = SCAN_TASKS.read().await;
    let task_list: Vec<ScanTask> = tasks.values().cloned().collect();
    Ok(Json(task_list))
}

pub async fn cancel_scan_task(
    Extension(claims): Extension<Claims>,
    AxumPath(task_id): AxumPath<String>,
    query: axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Only admins can cancel scan tasks
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let force_delete = query.get("force").map(|v| v == "true").unwrap_or(false);

    if force_delete {
        // Force delete: remove task completely from memory
        {
            let mut handles = TASK_HANDLES.write().await;
            handles.remove(&task_id);
        }

        {
            let mut tasks = SCAN_TASKS.write().await;
            tasks.remove(&task_id);
        }

        tracing::info!("🗑️ Scan task {} deleted by admin", task_id);

        Ok(Json(serde_json::json!({
            "success": true,
            "message": "Task deleted successfully"
        })))
    } else {
        // Regular cancel: abort task and mark as cancelled
        {
            let mut handles = TASK_HANDLES.write().await;
            if let Some(handle) = handles.remove(&task_id) {
                handle.abort();
            }
        }

        // Update task status
        {
            let mut tasks = SCAN_TASKS.write().await;
            if let Some(task) = tasks.get_mut(&task_id) {
                task.status = "cancelled".to_string();
                task.end_time = Some(now_epoch_secs());
            }
        }

        tracing::info!("🛑 Scan task {} cancelled by admin", task_id);

        Ok(Json(serde_json::json!({
            "success": true,
            "message": "Task cancelled successfully"
        })))
    }
}

pub fn admin_ingest_routes() -> Router<ContentService> {
    Router::new()
        .route("/scan-folder", post(scan_folder_ingest))
        .route("/scan-tasks", get(get_scan_tasks))
        .route("/scan-tasks/:task_id", delete(cancel_scan_task))
}
