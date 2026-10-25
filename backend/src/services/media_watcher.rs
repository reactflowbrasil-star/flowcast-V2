use crate::error::AppError;
use crate::services::content::{ContentService, ScanFolderIngestRequest};
use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres, Row};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use walkdir::WalkDir;

/// Normalize a title for comparison by removing year in parentheses,
/// TMDB tags, and converting to lowercase
fn normalize_title_for_comparison(title: &str) -> String {
    let re_year = Regex::new(r"\s*\(\d{4}\)\s*").unwrap();
    let re_tmdb = Regex::new(r"(?i)\[tmdbid-\d+\]").unwrap();
    let cleaned = re_tmdb.replace_all(title, "");
    let cleaned = re_year.replace_all(&cleaned, "");
    cleaned
        .trim()
        .trim_matches('_')
        .replace('_', " ")
        .to_lowercase()
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MediaWatchFolder {
    pub id: i64,
    pub folder_path: String,
    pub media_type: String, // "movies", "series", "kids", or "anime"
    pub category_id: i64,
    pub check_interval_minutes: i32,
    pub last_check: Option<DateTime<Utc>>,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMediaWatchFolderRequest {
    pub folder_path: String,
    pub media_type: String,
    pub category_id: i64,
    pub check_interval_minutes: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMediaWatchFolderRequest {
    pub folder_path: Option<String>,
    pub media_type: Option<String>,
    pub category_id: Option<i64>,
    pub check_interval_minutes: Option<i32>,
    pub enabled: Option<bool>,
}

#[derive(Clone)]
pub struct MediaWatcherService {
    db: Pool<Postgres>,
    content_service: Arc<ContentService>,
}

impl MediaWatcherService {
    pub fn new(db: Pool<Postgres>, content_service: Arc<ContentService>) -> Self {
        Self {
            db,
            content_service,
        }
    }

    /// Start the background watcher task
    pub fn start_background_watcher(self: Arc<Self>) {
        tokio::spawn(async move {
            tracing::info!("🔍 Media Watcher: Starting background task");
            let mut check_interval = interval(Duration::from_secs(60)); // Check every minute

            loop {
                check_interval.tick().await;

                match self.check_all_folders().await {
                    Ok(count) => {
                        if count > 0 {
                            tracing::info!("🔍 Media Watcher: Checked {} folders", count);
                        }
                    }
                    Err(e) => {
                        tracing::error!("❌ Media Watcher: Error checking folders: {}", e);
                    }
                }
            }
        });
    }

    /// Check all enabled folders that are due for a check
    async fn check_all_folders(&self) -> Result<usize, AppError> {
        let folders = self.get_folders_due_for_check().await?;
        let count = folders.len();

        for folder in folders {
            if let Err(e) = self.check_folder(&folder).await {
                tracing::error!(
                    "❌ Media Watcher: Error checking folder {}: {}",
                    folder.folder_path,
                    e
                );
            }
        }

        Ok(count)
    }

    /// Get folders that are enabled and due for a check
    async fn get_folders_due_for_check(&self) -> Result<Vec<MediaWatchFolder>, AppError> {
        let folders = sqlx::query_as::<_, MediaWatchFolder>(
            r#"
            SELECT id, folder_path, media_type, category_id, check_interval_minutes, 
                   last_check, enabled, created_at
            FROM core.media_watch_folders
            WHERE enabled = true
            AND (
                last_check IS NULL 
                OR last_check + (check_interval_minutes || ' minutes')::INTERVAL <= NOW()
            )
            "#,
        )
        .fetch_all(&self.db)
        .await?;

        Ok(folders)
    }

    /// Check a single folder for new files (optimized like 'ls' command)
    async fn check_folder(&self, folder: &MediaWatchFolder) -> Result<(), AppError> {
        tracing::debug!(
            "🔍 Media Watcher: Quick check of folder {} ({})",
            folder.folder_path,
            folder.media_type
        );

        // Verify folder exists
        let folder_path = Path::new(&folder.folder_path);
        if !folder_path.exists() {
            tracing::warn!(
                "⚠️  Media Watcher: Folder does not exist: {}",
                folder.folder_path
            );
            // Update last_check even if folder doesn't exist to avoid repeated checks
            self.update_last_check(folder.id).await?;
            return Ok(());
        }

        // Quick directory listing - like 'ls' command
        // Only get immediate subdirectories (movie/series folders)
        // PERF FIX: Use tokio::fs for non-blocking async I/O
        let mut subdirs = Vec::new();
        if let Ok(mut entries) = tokio::fs::read_dir(folder_path).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(metadata) = entry.metadata().await {
                    if metadata.is_dir() {
                        if let Some(dir_name) = entry.file_name().to_str() {
                            subdirs.push(dir_name.to_string());
                        }
                    }
                }
            }
        }

        if subdirs.is_empty() {
            tracing::debug!(
                "📂 Media Watcher: No subdirectories found in {}",
                folder.folder_path
            );
            self.update_last_check(folder.id).await?;
            return Ok(());
        }

        tracing::debug!("📂 Media Watcher: Found {} subdirectories", subdirs.len());

        // Get existing content titles from database (quick query)
        let existing_titles = self.get_existing_titles(folder).await?;

        // Normalize existing titles for comparison
        let normalized_existing: HashSet<String> = existing_titles
            .iter()
            .map(|t| normalize_title_for_comparison(t))
            .collect();

        // Find new directories (not in DB) using normalized comparison
        let new_dirs: Vec<_> = subdirs
            .iter()
            .filter(|dir| {
                let normalized_dir = normalize_title_for_comparison(dir);
                !normalized_existing.contains(&normalized_dir)
            })
            .collect();

        if new_dirs.is_empty() {
            tracing::debug!(
                "✅ Media Watcher: No new content detected in {}",
                folder.folder_path
            );
            self.update_last_check(folder.id).await?;
            return Ok(());
        }

        tracing::info!(
            "🆕 Media Watcher: Found {} new directories in {} - triggering scan",
            new_dirs.len(),
            folder.folder_path
        );

        // Only scan if new content detected
        let scan_result = self
            .content_service
            .scan_folder_ingest(ScanFolderIngestRequest {
                root_path: folder.folder_path.clone(),
                media: Some(folder.media_type.clone()),
                duplicate_policy: Some("omit".to_string()),
                add_subs: Some(true),
                movie_category: None,
                series_category: None,
                movie_category_id: Some(folder.category_id),
                series_category_id: Some(folder.category_id),
            })
            .await?;

        tracing::info!(
            "✅ Media Watcher: Scan completed - Movies: {}, Series: {}, Episodes: {}, Subtitles: {}",
            scan_result.movies_created,
            scan_result.series_created,
            scan_result.episodes_created,
            scan_result.subtitles_added
        );

        // Update last_check timestamp
        self.update_last_check(folder.id).await?;

        Ok(())
    }

    /// Get all video files in a folder recursively
    #[allow(dead_code)]
    fn get_video_files(&self, folder_path: &str) -> Result<HashSet<String>, AppError> {
        let mut files = HashSet::new();

        for entry in WalkDir::new(folder_path).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if matches!(
                    ext_str.as_str(),
                    "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "ts"
                ) {
                    files.insert(path.to_string_lossy().to_string());
                }
            }
        }

        Ok(files)
    }

    /// Get existing video files from database for a folder
    #[allow(dead_code)]
    async fn get_existing_files(
        &self,
        folder: &MediaWatchFolder,
    ) -> Result<HashSet<String>, AppError> {
        let mut files = HashSet::new();

        if folder.media_type == "movies" {
            let rows = sqlx::query_scalar::<_, String>(
                r#"
                SELECT stream_url
                FROM content.media_content
                WHERE category_id = $1
                AND stream_url LIKE $2
                "#,
            )
            .bind(folder.category_id)
            .bind(format!("{}%", folder.folder_path))
            .fetch_all(&self.db)
            .await?;

            files.extend(rows);
        } else if folder.media_type == "series" {
            let rows = sqlx::query_scalar::<_, String>(
                r#"
                SELECT e.stream_url
                FROM content.media_content.episodes e
                JOIN content.seasons s ON e.season_id = s.id
                JOIN content.series ser ON s.series_id = ser.id
                JOIN content.media_content c ON ser.content_id = c.id
                WHERE c.category_id = $1
                AND e.stream_url LIKE $2
                "#,
            )
            .bind(folder.category_id)
            .bind(format!("{}%", folder.folder_path))
            .fetch_all(&self.db)
            .await?;

            files.extend(rows);
        }

        Ok(files)
    }

    /// Get existing content titles from database for a folder (optimized for quick comparison)
    /// This is much faster than get_existing_files as it only queries titles, not full paths
    async fn get_existing_titles(
        &self,
        folder: &MediaWatchFolder,
    ) -> Result<HashSet<String>, AppError> {
        let mut titles = HashSet::new();

        match folder.media_type.as_str() {
            "movies" | "kids" | "anime" => {
                // Get titles FROM content.media_content table for simple content types
                let rows = sqlx::query_scalar::<_, String>(
                    r#"
                    SELECT title
                    FROM content.media_content
                    WHERE category_id = $1
                    "#,
                )
                .bind(folder.category_id)
                .fetch_all(&self.db)
                .await?;

                titles.extend(rows);
            }
            "series" => {
                // Get series titles FROM content.media_content table (joined with series)
                let rows = sqlx::query_scalar::<_, String>(
                    r#"
                    SELECT c.title
                    FROM content.media_content c
                    JOIN content.series s ON s.content_id = c.id
                    WHERE c.category_id = $1
                    "#,
                )
                .bind(folder.category_id)
                .fetch_all(&self.db)
                .await?;

                titles.extend(rows);
            }
            _ => {
                // Fallback: get all titles FROM content.media_content table for the category
                let rows = sqlx::query_scalar::<_, String>(
                    r#"
                    SELECT title
                    FROM content.media_content
                    WHERE category_id = $1
                    "#,
                )
                .bind(folder.category_id)
                .fetch_all(&self.db)
                .await?;

                titles.extend(rows);
            }
        }

        Ok(titles)
    }

    /// Update last_check timestamp for a folder
    async fn update_last_check(&self, folder_id: i64) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE core.media_watch_folders
            SET last_check = NOW()
            WHERE id = $1
            "#,
        )
        .bind(folder_id)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    // CRUD operations

    pub async fn list_folders(&self) -> Result<Vec<MediaWatchFolder>, AppError> {
        let folders = sqlx::query_as::<_, MediaWatchFolder>(
            r#"
            SELECT id, folder_path, media_type, category_id, check_interval_minutes,
                   last_check, enabled, created_at
            FROM core.media_watch_folders
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(&self.db)
        .await?;

        Ok(folders)
    }

    pub async fn get_folder(&self, id: i64) -> Result<Option<MediaWatchFolder>, AppError> {
        let folder = sqlx::query_as::<_, MediaWatchFolder>(
            r#"
            SELECT id, folder_path, media_type, category_id, check_interval_minutes,
                   last_check, enabled, created_at
            FROM core.media_watch_folders
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        Ok(folder)
    }

    pub async fn create_folder(
        &self,
        req: CreateMediaWatchFolderRequest,
    ) -> Result<MediaWatchFolder, AppError> {
        // Validate folder exists
        if !Path::new(&req.folder_path).exists() {
            return Err(AppError::BadRequest(format!(
                "Folder does not exist: {}",
                req.folder_path
            )));
        }

        // Validate media_type
        let valid_types = ["movies", "series", "kids", "anime"];
        if !valid_types.contains(&req.media_type.as_str()) {
            return Err(AppError::BadRequest(
                "media_type must be 'movies', 'series', 'kids', or 'anime'".to_string(),
            ));
        }

        let check_interval = req.check_interval_minutes.unwrap_or(30);

        let row = sqlx::query(
            r#"
            INSERT INTO core.media_watch_folders (folder_path, media_type, category_id, check_interval_minutes)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            "#,
        )
        .bind(&req.folder_path)
        .bind(&req.media_type)
        .bind(req.category_id)
        .bind(check_interval)
        .fetch_one(&self.db)
        .await?;

        let id: i64 = row.get("id");
        self.get_folder(id)
            .await?
            .ok_or(AppError::InternalServerError)
    }

    pub async fn update_folder(
        &self,
        id: i64,
        req: UpdateMediaWatchFolderRequest,
    ) -> Result<MediaWatchFolder, AppError> {
        // Check if folder exists
        let _existing = self.get_folder(id).await?.ok_or(AppError::NotFound)?;

        // Validate folder_path if provided
        if let Some(ref path) = req.folder_path {
            if !Path::new(path).exists() {
                return Err(AppError::BadRequest(format!(
                    "Folder does not exist: {}",
                    path
                )));
            }
        }

        // Validate media_type if provided
        if let Some(ref media_type) = req.media_type {
            let valid_types = ["movies", "series", "kids", "anime"];
            if !valid_types.contains(&media_type.as_str()) {
                return Err(AppError::BadRequest(
                    "media_type must be 'movies', 'series', 'kids', or 'anime'".to_string(),
                ));
            }
        }

        // Use individual UPDATE statements for each field
        if let Some(path) = req.folder_path {
            sqlx::query("UPDATE core.media_watch_folders SET folder_path = $1 WHERE id = $2")
                .bind(path)
                .bind(id)
                .execute(&self.db)
                .await?;
        }
        if let Some(media_type) = req.media_type {
            sqlx::query("UPDATE core.media_watch_folders SET media_type = $1 WHERE id = $2")
                .bind(media_type)
                .bind(id)
                .execute(&self.db)
                .await?;
        }
        if let Some(category_id) = req.category_id {
            sqlx::query("UPDATE core.media_watch_folders SET category_id = $1 WHERE id = $2")
                .bind(category_id)
                .bind(id)
                .execute(&self.db)
                .await?;
        }
        if let Some(interval) = req.check_interval_minutes {
            sqlx::query("UPDATE core.media_watch_folders SET check_interval_minutes = $1 WHERE id = $2")
                .bind(interval)
                .bind(id)
                .execute(&self.db)
                .await?;
        }
        if let Some(enabled) = req.enabled {
            sqlx::query("UPDATE core.media_watch_folders SET enabled = $1 WHERE id = $2")
                .bind(enabled)
                .bind(id)
                .execute(&self.db)
                .await?;
        }

        self.get_folder(id)
            .await?
            .ok_or(AppError::InternalServerError)
    }

    pub async fn delete_folder(&self, id: i64) -> Result<(), AppError> {
        sqlx::query("DELETE FROM core.media_watch_folders WHERE id = $1")
            .bind(id)
            .execute(&self.db)
            .await?;

        Ok(())
    }

    /// Force an immediate check of a specific folder
    pub async fn check_folder_now(&self, id: i64) -> Result<(), AppError> {
        let folder = self.get_folder(id).await?.ok_or(AppError::NotFound)?;

        self.check_folder(&folder).await
    }
}
