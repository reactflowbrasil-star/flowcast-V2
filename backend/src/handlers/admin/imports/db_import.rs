use axum::{
    extract::{Multipart, Path, Query, State},
    response::Json,
    Extension,
};
use reqwest::{Client, Url};
use serde_json::json;
use std::collections::HashMap;
use std::env;
use std::path::Path as StdPath;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;
use tokio::task;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::user::UserRole;
use crate::services::sqlite_import::{
    import_sqlite_database, import_sqlite_database_with_progress, SqliteImportProgress,
    SqliteImportProgressCallback, SqliteImportSummary,
};
use crate::services::Claims;

use super::types::*;

// Import task state management
lazy_static::lazy_static! {
    static ref IMPORT_TASKS: Arc<RwLock<HashMap<String, ImportTask>>> =
        Arc::new(RwLock::new(HashMap::new()));
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn validate_webhook_url(webhook_url: Option<String>) -> Result<Option<String>, AppError> {
    let Some(url) = webhook_url else {
        return Ok(None);
    };
    let parsed =
        Url::parse(&url).map_err(|_| AppError::BadRequest("Invalid webhook_url".to_string()))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(AppError::BadRequest(
            "webhook_url must use http or https".to_string(),
        ));
    }
    Ok(Some(url))
}

async fn ensure_no_active_imports() -> Result<(), AppError> {
    let tasks = IMPORT_TASKS.read().await;
    if tasks.values().any(|task| task.status == "running") {
        return Err(AppError::Conflict(
            "Another import task is already running".to_string(),
        ));
    }
    Ok(())
}

async fn update_import_task_progress(task_id: &str, progress: &SqliteImportProgress) {
    let mut tasks = IMPORT_TASKS.write().await;
    if let Some(task) = tasks.get_mut(task_id) {
        task.status = "running".to_string();
        task.stage = Some("importing".to_string());
        task.current_table = progress.current_table.clone();
        task.current_table_index = progress.current_table_index as i32;
        task.total_tables = progress.total_tables as i32;
        task.rows_seen = progress.total_rows_seen;
        task.rows_inserted = progress.total_rows_inserted;
    }
}

async fn update_import_task_stage(task_id: &str, stage: &str) {
    let mut tasks = IMPORT_TASKS.write().await;
    if let Some(task) = tasks.get_mut(task_id) {
        task.status = "running".to_string();
        task.stage = Some(stage.to_string());
    }
}

async fn finalize_import_task_success(
    task_id: &str,
    summary: Option<SqliteImportSummary>,
) -> Option<ImportTask> {
    let mut tasks = IMPORT_TASKS.write().await;
    let task = tasks.get_mut(task_id)?;
    task.status = "completed".to_string();
    task.stage = Some("completed".to_string());
    task.end_time = Some(unix_timestamp());
    if summary.is_some() {
        task.summary = summary;
    }
    Some(task.clone())
}

async fn finalize_import_task_failure(task_id: &str, error: String) -> Option<ImportTask> {
    let mut tasks = IMPORT_TASKS.write().await;
    let task = tasks.get_mut(task_id)?;
    task.status = "failed".to_string();
    task.stage = Some("failed".to_string());
    task.end_time = Some(unix_timestamp());
    task.error_message = Some(error);
    Some(task.clone())
}

async fn send_import_webhook(client: &Client, task: &ImportTask, event: &str) {
    let Some(url) = task.webhook_url.as_ref() else {
        return;
    };

    let payload = json!({
        "event": event,
        "task": task,
    });

    if let Err(err) = client.post(url).json(&payload).send().await {
        tracing::warn!(task_id = %task.id, error = %err, "Import webhook failed");
    }
}


/// POST /api/admin/import/sqlite - Import a legacy SQLite database into Postgres
pub async fn import_sqlite(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ImportTaskQuery>,
    Json(request): Json<ImportSqliteRequest>,
) -> Result<Json<ImportSqliteResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let sqlite_path = resolve_sqlite_path(request.path)?;
    if query.async_.unwrap_or(false) {
        ensure_no_active_imports().await?;
        let webhook_url = validate_webhook_url(query.webhook_url)?;
        let task_id = Uuid::new_v4().to_string();
        let task = ImportTask {
            id: task_id.clone(),
            status: "running".to_string(),
            kind: "sqlite".to_string(),
            mode: None,
            source: sqlite_path.display().to_string(),
            start_time: unix_timestamp(),
            end_time: None,
            stage: Some("starting".to_string()),
            current_table: None,
            current_table_index: 0,
            total_tables: 0,
            rows_seen: 0,
            rows_inserted: 0,
            error_message: None,
            summary: None,
            webhook_url,
        };

        {
            let mut tasks = IMPORT_TASKS.write().await;
            tasks.insert(task_id.clone(), task);
        }

        let pool = app_state.database.pool.clone();
        let sqlite_path_clone = sqlite_path.clone();
        let task_id_clone = task_id.clone();
        let client = Client::new();

        task::spawn(async move {
            if let Some(task) = {
                let tasks = IMPORT_TASKS.read().await;
                tasks.get(&task_id_clone).cloned()
            } {
                send_import_webhook(&client, &task, "started").await;
            }

            let progress_task_id = task_id_clone.clone();
            let progress_callback: SqliteImportProgressCallback = Box::new(move |progress| {
                let task_id = progress_task_id.clone();
                Box::pin(async move {
                    update_import_task_progress(&task_id, &progress).await;
                })
            });

            tracing::info!(
                "Starting SQLite import from {}",
                sqlite_path_clone.display()
            );

            match import_sqlite_database_with_progress(
                &pool,
                &sqlite_path_clone,
                Some(progress_callback),
            )
            .await
            {
                Ok(summary) => {
                    // Re-run schema normalization after import
                    if let Err(e) = crate::db_structure::run_runtime_migrations(&pool).await {
                        tracing::warn!("⚠️ Post-import migration warning: {}", e);
                    }
                    if let Some(task) =
                        finalize_import_task_success(&task_id_clone, Some(summary)).await
                    {
                        send_import_webhook(&client, &task, "completed").await;
                    }
                }
                Err(err) => {
                    if let Some(task) =
                        finalize_import_task_failure(&task_id_clone, err.to_string()).await
                    {
                        send_import_webhook(&client, &task, "failed").await;
                    }
                }
            }
        });

        return Ok(Json(ImportSqliteResponse::Started(
            ImportTaskStartResponse {
                task_id,
                status: "started".to_string(),
                message: "SQLite import started in background".to_string(),
            },
        )));
    }

    ensure_no_active_imports().await?;
    tracing::info!("Starting SQLite import from {}", sqlite_path.display());

    let summary = import_sqlite_database(&app_state.database.pool, &sqlite_path).await?;

    Ok(Json(ImportSqliteResponse::Completed { summary }))
}

/// POST /api/admin/import/sqlite/upload - Import a legacy SQLite DB via file upload
pub async fn import_sqlite_upload(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ImportTaskQuery>,
    mut multipart: Multipart,
) -> Result<Json<ImportSqliteResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let upload_path = save_uploaded_file(&mut multipart, "db").await?;
    if query.async_.unwrap_or(false) {
        if let Err(err) = ensure_no_active_imports().await {
            let _ = tokio::fs::remove_file(&upload_path).await;
            return Err(err);
        }
        let webhook_url = match validate_webhook_url(query.webhook_url) {
            Ok(url) => url,
            Err(err) => {
                let _ = tokio::fs::remove_file(&upload_path).await;
                return Err(err);
            }
        };
        let task_id = Uuid::new_v4().to_string();
        let source = upload_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("upload.db")
            .to_string();

        let task = ImportTask {
            id: task_id.clone(),
            status: "running".to_string(),
            kind: "sqlite".to_string(),
            mode: None,
            source,
            start_time: unix_timestamp(),
            end_time: None,
            stage: Some("starting".to_string()),
            current_table: None,
            current_table_index: 0,
            total_tables: 0,
            rows_seen: 0,
            rows_inserted: 0,
            error_message: None,
            summary: None,
            webhook_url,
        };

        {
            let mut tasks = IMPORT_TASKS.write().await;
            tasks.insert(task_id.clone(), task);
        }

        let pool = app_state.database.pool.clone();
        let upload_path_clone = upload_path.clone();
        let task_id_clone = task_id.clone();
        let client = Client::new();

        task::spawn(async move {
            if let Some(task) = {
                let tasks = IMPORT_TASKS.read().await;
                tasks.get(&task_id_clone).cloned()
            } {
                send_import_webhook(&client, &task, "started").await;
            }

            let progress_task_id = task_id_clone.clone();
            let progress_callback: SqliteImportProgressCallback = Box::new(move |progress| {
                let task_id = progress_task_id.clone();
                Box::pin(async move {
                    update_import_task_progress(&task_id, &progress).await;
                })
            });

            match import_sqlite_database_with_progress(
                &pool,
                &upload_path_clone,
                Some(progress_callback),
            )
            .await
            {
                Ok(summary) => {
                    // Re-run schema normalization after import
                    if let Err(e) = crate::db_structure::run_runtime_migrations(&pool).await {
                        tracing::warn!("⚠️ Post-import migration warning: {}", e);
                    }
                    if let Some(task) =
                        finalize_import_task_success(&task_id_clone, Some(summary)).await
                    {
                        send_import_webhook(&client, &task, "completed").await;
                    }
                }
                Err(err) => {
                    if let Some(task) =
                        finalize_import_task_failure(&task_id_clone, err.to_string()).await
                    {
                        send_import_webhook(&client, &task, "failed").await;
                    }
                }
            }

            let _ = tokio::fs::remove_file(&upload_path_clone).await;
        });

        return Ok(Json(ImportSqliteResponse::Started(
            ImportTaskStartResponse {
                task_id,
                status: "started".to_string(),
                message: "SQLite import started in background".to_string(),
            },
        )));
    }

    if let Err(err) = ensure_no_active_imports().await {
        let _ = tokio::fs::remove_file(&upload_path).await;
        return Err(err);
    }
    let summary = import_sqlite_database(&app_state.database.pool, &upload_path).await?;
    let _ = tokio::fs::remove_file(&upload_path).await;

    Ok(Json(ImportSqliteResponse::Completed { summary }))
}

/// POST /api/admin/db/export - Create a PostgreSQL backup and return download metadata
pub async fn export_postgres_backup(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<ExportPostgresResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let db_url = ensure_postgres_url(&app_state.config.database_url)?;
    let backup_dir = backup_dir()?;
    tokio::fs::create_dir_all(&backup_dir)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to create backup dir: {}", e)))?;

    let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let file_name = format!("iptv_export_{}.sql", ts);
    let path = backup_dir.join(&file_name);

    run_pg_dump(&db_url, &path).await?;
    let meta = tokio::fs::metadata(&path)
        .await
        .map_err(|e| AppError::InternalError(format!("Backup file not found: {}", e)))?;

    Ok(Json(ExportPostgresResponse {
        file_name: file_name.clone(),
        download_url: format!("/api/admin/db/export/{}", file_name),
        size_bytes: meta.len(),
    }))
}

/// GET /api/admin/db/export/:file - Download a PostgreSQL backup file
pub async fn download_postgres_backup(
    State(_app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(file): Path<String>,
) -> Result<axum::response::Response, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    ensure_safe_filename(&file)?;
    let path = backup_dir()?.join(&file);
    let file_handle = tokio::fs::File::open(&path)
        .await
        .map_err(|_| AppError::NotFound)?;

    let stream = tokio_util::io::ReaderStream::new(file_handle);
    let body = axum::body::Body::from_stream(stream);

    let mut response = axum::response::Response::new(body);
    let headers = response.headers_mut();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/sql"),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        axum::http::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", file))
            .map_err(|_| AppError::InternalServerError)?,
    );

    Ok(response)
}

/// POST /api/admin/db/import - Import a PostgreSQL dump into the current database
pub async fn import_postgres_backup(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ImportPostgresQuery>,
    mut multipart: Multipart,
) -> Result<Json<ImportPostgresResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let db_url = ensure_postgres_url(&app_state.config.database_url)?;
    let upload_path = save_uploaded_file(&mut multipart, "sql").await?;

    if upload_path.extension().and_then(|e| e.to_str()) != Some("sql") {
        let _ = tokio::fs::remove_file(&upload_path).await;
        return Err(AppError::BadRequest(
            "Postgres import expects a .sql file".to_string(),
        ));
    }

    let mode = query.mode.unwrap_or_else(|| "append".to_string());
    if query.async_.unwrap_or(false) {
        if let Err(err) = ensure_no_active_imports().await {
            let _ = tokio::fs::remove_file(&upload_path).await;
            return Err(err);
        }
        let webhook_url = validate_webhook_url(query.webhook_url)?;
        let task_id = Uuid::new_v4().to_string();
        let source = upload_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("upload.sql")
            .to_string();

        let task = ImportTask {
            id: task_id.clone(),
            status: "running".to_string(),
            kind: "postgres".to_string(),
            mode: Some(mode.clone()),
            source,
            start_time: unix_timestamp(),
            end_time: None,
            stage: Some("starting".to_string()),
            current_table: None,
            current_table_index: 0,
            total_tables: 0,
            rows_seen: 0,
            rows_inserted: 0,
            error_message: None,
            summary: None,
            webhook_url,
        };

        {
            let mut tasks = IMPORT_TASKS.write().await;
            tasks.insert(task_id.clone(), task);
        }

        let pool = app_state.database.pool.clone();
        let db_url_clone = db_url.clone();
        let upload_path_clone = upload_path.clone();
        let task_id_clone = task_id.clone();
        let mode_clone = mode.clone();
        let client = Client::new();

        task::spawn(async move {
            if let Some(task) = {
                let tasks = IMPORT_TASKS.read().await;
                tasks.get(&task_id_clone).cloned()
            } {
                send_import_webhook(&client, &task, "started").await;
            }

            if mode_clone == "replace" {
                update_import_task_stage(&task_id_clone, "resetting_schema").await;
                if let Err(err) = run_psql_command(
                    &db_url_clone,
                    &["-c", "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS content CASCADE; DROP SCHEMA IF EXISTS billing CASCADE; DROP SCHEMA IF EXISTS activity CASCADE; DROP SCHEMA IF EXISTS core CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"],
                )
                .await
                {
                    if let Some(task) =
                        finalize_import_task_failure(&task_id_clone, err.to_string()).await
                    {
                        send_import_webhook(&client, &task, "failed").await;
                    }
                    let _ = tokio::fs::remove_file(&upload_path_clone).await;
                    return;
                }
            }

            // For append mode, preprocess SQL to avoid conflicts with existing schema
            let restore_path = if mode_clone == "append" {
                update_import_task_stage(&task_id_clone, "preprocessing").await;
                match preprocess_sql_for_append(&upload_path_clone).await {
                    Ok(preprocessed) => preprocessed,
                    Err(err) => {
                        if let Some(task) =
                            finalize_import_task_failure(&task_id_clone, err.to_string()).await
                        {
                            send_import_webhook(&client, &task, "failed").await;
                        }
                        let _ = tokio::fs::remove_file(&upload_path_clone).await;
                        return;
                    }
                }
            } else {
                update_import_task_stage(&task_id_clone, "preprocessing").await;
                match preprocess_sql_for_restore(&upload_path_clone).await {
                    Ok(preprocessed) => preprocessed,
                    Err(err) => {
                        if let Some(task) =
                            finalize_import_task_failure(&task_id_clone, err.to_string()).await
                        {
                            send_import_webhook(&client, &task, "failed").await;
                        }
                        let _ = tokio::fs::remove_file(&upload_path_clone).await;
                        return;
                    }
                }
            };

            update_import_task_stage(&task_id_clone, "restoring").await;
            // Use lenient restore for both modes — old dumps may have column/role mismatches
            // that would cause strict mode (ON_ERROR_STOP + single-transaction) to roll back everything
            let result = run_psql_restore_lenient(&db_url_clone, &restore_path).await;
            match result {
                Ok(()) => {
                    // Re-create dropped schemas and tables (if missing after restore)
                    if let Err(e) = crate::db_structure::ensure_database_schema(&pool).await {
                        tracing::warn!("⚠️ Post-import schema creation warning: {}", e);
                    }
                    // Re-run schema normalization and v1.1.2 migration
                    if let Err(e) = crate::db_structure::run_runtime_migrations(&pool).await {
                        tracing::warn!("⚠️ Post-import migration warning: {}", e);
                    }
                    if let Some(task) = finalize_import_task_success(&task_id_clone, None).await {
                        send_import_webhook(&client, &task, "completed").await;
                    }
                }
                Err(err) => {
                    if let Some(task) =
                        finalize_import_task_failure(&task_id_clone, err.to_string()).await
                    {
                        send_import_webhook(&client, &task, "failed").await;
                    }
                }
            }

            // Cleanup preprocessed file if different from original
            if restore_path != upload_path_clone {
                let _ = tokio::fs::remove_file(&restore_path).await;
            }
            let _ = tokio::fs::remove_file(&upload_path_clone).await;
        });

        return Ok(Json(ImportPostgresResponse::Started(
            ImportTaskStartResponse {
                task_id,
                status: "started".to_string(),
                message: "Postgres import started in background".to_string(),
            },
        )));
    }

    if let Err(err) = ensure_no_active_imports().await {
        let _ = tokio::fs::remove_file(&upload_path).await;
        return Err(err);
    }
    if mode == "replace" {
        run_psql_command(
            &db_url,
            &["-c", "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS content CASCADE; DROP SCHEMA IF EXISTS billing CASCADE; DROP SCHEMA IF EXISTS activity CASCADE; DROP SCHEMA IF EXISTS core CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"],
        )
        .await?;
    }

    // For append mode, preprocess SQL to avoid conflicts with existing schema
    let restore_path = if mode == "append" {
        preprocess_sql_for_append(&upload_path).await?
    } else {
        preprocess_sql_for_restore(&upload_path).await?
    };

    // Use lenient restore for both modes — old dumps may have column/role mismatches
    let result = run_psql_restore_lenient(&db_url, &restore_path).await;

    // Cleanup preprocessed file if different from original
    if restore_path != upload_path {
        let _ = tokio::fs::remove_file(&restore_path).await;
    }
    let _ = tokio::fs::remove_file(&upload_path).await;
    result?;

    if let Err(e) = crate::db_structure::ensure_database_schema(&app_state.database.pool).await {
        tracing::warn!("⚠️ Post-import schema creation warning: {}", e);
    }
    if let Err(e) = crate::db_structure::run_runtime_migrations(&app_state.database.pool).await {
        tracing::warn!("⚠️ Post-import migration warning: {}", e);
    }

    Ok(Json(ImportPostgresResponse::Completed {
        status: "ok".to_string(),
    }))
}

pub async fn get_import_tasks(
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<ImportTask>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let tasks = IMPORT_TASKS.read().await;
    let mut task_list: Vec<ImportTask> = tasks.values().cloned().collect();
    task_list.sort_by(|a, b| b.start_time.cmp(&a.start_time));
    Ok(Json(task_list))
}

pub async fn get_import_task(
    Extension(claims): Extension<Claims>,
    Path(task_id): Path<String>,
) -> Result<Json<ImportTask>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let tasks = IMPORT_TASKS.read().await;
    let task = tasks.get(&task_id).cloned().ok_or(AppError::NotFound)?;
    Ok(Json(task))
}

async fn save_uploaded_file(
    multipart: &mut Multipart,
    expected_extension: &str,
) -> Result<PathBuf, AppError> {
    let base_dir = PathBuf::from("/tmp/iptv-imports");
    tokio::fs::create_dir_all(&base_dir)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to create upload dir: {}", e)))?;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {}", e)))?
    {
        let file_name = field
            .file_name()
            .map(|f| f.to_string())
            .unwrap_or_else(|| "upload".to_string());

        if let Some(ext) = StdPath::new(&file_name)
            .extension()
            .and_then(|e| e.to_str())
        {
            if !ext.eq_ignore_ascii_case(expected_extension) {
                continue;
            }
        } else {
            continue;
        }

        let safe_name = sanitize_filename(&file_name)?;
        let path = base_dir.join(format!(
            "{}_{}",
            chrono::Utc::now().format("%Y%m%d_%H%M%S"),
            safe_name
        ));
        let mut file = tokio::fs::File::create(&path)
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to write upload: {}", e)))?;

        let mut total: u64 = 0;
        while let Some(chunk) = field
            .chunk()
            .await
            .map_err(|e| AppError::BadRequest(format!("Upload read error: {}", e)))?
        {
            total = total.saturating_add(chunk.len() as u64);
            if total > max_upload_bytes()? {
                return Err(AppError::BadRequest("File too large".to_string()));
            }
            file.write_all(&chunk)
                .await
                .map_err(|e| AppError::InternalError(format!("Failed to write upload: {}", e)))?;
        }

        return Ok(path);
    }

    Err(AppError::BadRequest("No file uploaded".to_string()))
}

fn max_upload_bytes() -> Result<u64, AppError> {
    let limit = env::var("ADMIN_IMPORT_MAX_BYTES")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1_000_000_000);
    Ok(limit)
}

fn sanitize_filename(name: &str) -> Result<String, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("Invalid file name".to_string()));
    }

    let mut clean = String::new();
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
            clean.push(ch);
        }
    }
    if clean.is_empty() {
        return Err(AppError::BadRequest("Invalid file name".to_string()));
    }
    Ok(clean)
}

fn ensure_safe_filename(name: &str) -> Result<(), AppError> {
    if name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        Ok(())
    } else {
        Err(AppError::BadRequest("Invalid file name".to_string()))
    }
}

fn backup_dir() -> Result<PathBuf, AppError> {
    let dir = env::var("BACKUP_DIR").unwrap_or_else(|_| "./backups".to_string());
    Ok(PathBuf::from(dir))
}

fn ensure_postgres_url(db_url: &str) -> Result<String, AppError> {
    if db_url.starts_with("postgres://") || db_url.starts_with("postgresql://") {
        Ok(db_url.to_string())
    } else {
        Err(AppError::BadRequest(
            "Database URL must be PostgreSQL for backups".to_string(),
        ))
    }
}

async fn run_pg_dump(db_url: &str, output_path: &StdPath) -> Result<(), AppError> {
    let output = tokio::process::Command::new("pg_dump")
        .arg(db_url)
        .arg("-f")
        .arg(output_path)
        .output()
        .await
        .map_err(|e| AppError::InternalError(format!("pg_dump failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::InternalError(format!(
            "pg_dump failed: {}",
            stderr.trim()
        )));
    }

    Ok(())
}

async fn run_psql_command(db_url: &str, args: &[&str]) -> Result<(), AppError> {
    let output = tokio::process::Command::new("psql")
        .arg(db_url)
        .args(args)
        .output()
        .await
        .map_err(|e| AppError::InternalError(format!("psql failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::InternalError(format!(
            "psql failed: {}",
            stderr.trim()
        )));
    }

    Ok(())
}

/// Lenient psql restore for append mode — continues past non-fatal errors
/// (e.g. duplicate key violations on existing rows).
async fn run_psql_restore_lenient(db_url: &str, file_path: &StdPath) -> Result<(), AppError> {
    let output = tokio::process::Command::new("psql")
        .arg(db_url)
        .arg("-f")
        .arg(file_path)
        .output()
        .await
        .map_err(|e| AppError::InternalError(format!("psql failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // In lenient mode, we only fail if psql itself crashed (exit code > 1).
        // Exit code 3 = some SQL errors occurred but psql ran fine.
        // We log warnings but don't fail the import.
        let code = output.status.code().unwrap_or(1);
        if code > 3 {
            return Err(AppError::InternalError(format!(
                "psql failed: {}",
                stderr.trim()
            )));
        }
        tracing::warn!("psql append warnings: {}", stderr.trim());
    }

    Ok(())
}

fn should_skip_sql_line(trimmed: &str) -> bool {
    trimmed.starts_with("\\RESTRICT")
        || trimmed.starts_with("\\UNRESTRICT")
        || trimmed.starts_with("CREATE EXTENSION ")
        || trimmed.starts_with("COMMENT ON EXTENSION ")
        || (trimmed.contains("OWNER TO") && trimmed.starts_with("ALTER"))
        // Strip role/user-specific commands that fail with different DB users
        || trimmed.starts_with("SET SESSION AUTHORIZATION")
        || trimmed.starts_with("RESET SESSION AUTHORIZATION")
        || trimmed.starts_with("SET ROLE")
        || trimmed.starts_with("RESET ROLE")
        || trimmed.starts_with("GRANT ")
        || trimmed.starts_with("REVOKE ")
        || trimmed.starts_with("SELECT PG_CATALOG.SET_CONFIG")
        || trimmed.starts_with("CREATE ROLE ")
        || trimmed.starts_with("ALTER ROLE ")
}

/// Preprocess a SQL dump so it can be safely imported in append mode.
///
/// Transformations:
/// - `CREATE TABLE <name>` → `CREATE TABLE IF NOT EXISTS <name>`
/// - `CREATE INDEX <name>` → `CREATE INDEX IF NOT EXISTS <name>`
/// - `CREATE UNIQUE INDEX <name>` → `CREATE UNIQUE INDEX IF NOT EXISTS <name>`
/// - `CREATE SEQUENCE <name>` → `CREATE SEQUENCE IF NOT EXISTS <name>`
/// - `DROP TABLE` / `DROP INDEX` / `DROP SEQUENCE` lines → removed
/// - `ALTER TABLE ... OWNER TO` → removed (avoid permission issues)
async fn preprocess_sql_for_append(input: &StdPath) -> Result<PathBuf, AppError> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    let file = tokio::fs::File::open(input)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to open SQL file: {}", e)))?;
    let reader = BufReader::new(file);

    let output_path = input.with_extension("append.sql");
    let mut writer = tokio::fs::File::create(&output_path).await.map_err(|e| {
        AppError::InternalError(format!("Failed to create preprocessed file: {}", e))
    })?;

    let mut lines = reader.lines();
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read SQL line: {}", e)))?
    {
        let trimmed = line.trim_start().to_uppercase();

        if should_skip_sql_line(&trimmed) {
            continue;
        }

        // Skip destructive DDL statements
        if trimmed.starts_with("DROP TABLE")
            || trimmed.starts_with("DROP INDEX")
            || trimmed.starts_with("DROP SEQUENCE")
        {
            continue;
        }

        // Transform CREATE to IF NOT EXISTS variants
        let mut output_line = line.clone();
        if trimmed.starts_with("CREATE TABLE ") && !trimmed.contains("IF NOT EXISTS") {
            output_line = line.replacen("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1);
        } else if trimmed.starts_with("CREATE INDEX ") && !trimmed.contains("IF NOT EXISTS") {
            output_line = line.replacen("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1);
        } else if trimmed.starts_with("CREATE UNIQUE INDEX ") && !trimmed.contains("IF NOT EXISTS")
        {
            output_line = line.replacen(
                "CREATE UNIQUE INDEX ",
                "CREATE UNIQUE INDEX IF NOT EXISTS ",
                1,
            );
        } else if trimmed.starts_with("CREATE SEQUENCE ") && !trimmed.contains("IF NOT EXISTS") {
            output_line = line.replacen("CREATE SEQUENCE ", "CREATE SEQUENCE IF NOT EXISTS ", 1);
        }

        writer
            .write_all(output_line.as_bytes())
            .await
            .map_err(|e| {
                AppError::InternalError(format!("Failed to write preprocessed line: {}", e))
            })?;
        writer
            .write_all(b"\n")
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to write newline: {}", e)))?;
    }

    writer.flush().await.map_err(|e| {
        AppError::InternalError(format!("Failed to flush preprocessed file: {}", e))
    })?;

    Ok(output_path)
}

/// Preprocess a SQL dump for replace mode (remove incompatible meta/owner/extension lines).
async fn preprocess_sql_for_restore(input: &StdPath) -> Result<PathBuf, AppError> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    let file = tokio::fs::File::open(input)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to open SQL file: {}", e)))?;
    let reader = BufReader::new(file);

    let output_path = input.with_extension("restore.sql");
    let mut writer = tokio::fs::File::create(&output_path).await.map_err(|e| {
        AppError::InternalError(format!("Failed to create preprocessed file: {}", e))
    })?;

    let mut lines = reader.lines();
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read SQL line: {}", e)))?
    {
        let trimmed = line.trim_start().to_uppercase();
        if should_skip_sql_line(&trimmed) {
            continue;
        }

        writer
            .write_all(line.as_bytes())
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to write preprocessed line: {}", e)))?;
        writer
            .write_all(b"\n")
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to write newline: {}", e)))?;
    }

    writer.flush().await.map_err(|e| {
        AppError::InternalError(format!("Failed to flush preprocessed file: {}", e))
    })?;

    Ok(output_path)
}

fn resolve_sqlite_path(requested: Option<String>) -> Result<PathBuf, AppError> {
    let cwd = std::env::current_dir().map_err(|e| {
        AppError::InternalError(format!("Failed to resolve working directory: {}", e))
    })?;
    let project_root = cwd.parent().unwrap_or(&cwd).to_path_buf();

    let default_path = project_root.join("iptv.db");
    let mut candidate = match requested {
        Some(path) => PathBuf::from(path),
        None => default_path,
    };

    if candidate.is_relative() {
        candidate = cwd.join(candidate);
    }

    let candidate = candidate
        .canonicalize()
        .map_err(|_| AppError::BadRequest("SQLite file not found".to_string()))?;

    let allowed_roots = [project_root, PathBuf::from("/tmp")];
    if !allowed_roots.iter().any(|root| candidate.starts_with(root)) {
        return Err(AppError::BadRequest(
            "SQLite path must be inside the project root or /tmp".to_string(),
        ));
    }

    if candidate.extension().and_then(|e| e.to_str()) != Some("db") {
        return Err(AppError::BadRequest(
            "SQLite file must have .db extension".to_string(),
        ));
    }

    Ok(candidate)
}
