use super::*;

// ====== Scan Folder Ingestion (movies/series + external SRT) ======
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Deserialize, Clone)]
pub struct ScanFolderIngestRequest {
    pub root_path: String,                // absolute or relative path on disk
    pub media: Option<String>,            // "movies" | "series" | "mixed"
    pub duplicate_policy: Option<String>, // "omit" | "replace" | "allow"
    pub add_subs: Option<bool>,           // include external .srt subtitles
    // If provided, these type strings take effect when IDs are not supplied
    pub movie_category: Option<String>, // override movie category by type (e.g. "VOD")
    pub series_category: Option<String>, // override series category by type (e.g. "Series")
    // Prefer IDs when available (sent by admin UI)
    pub movie_category_id: Option<i64>, // override movie category by numeric ID
    pub series_category_id: Option<i64>, // override series category by numeric ID
}

#[derive(Debug, Serialize, Clone)]
pub struct ScanFolderIngestResult {
    pub movies_created: i32,
    pub series_created: i32,
    pub episodes_created: i32,
    pub subtitles_added: i32,
    pub skipped: i32,
    pub replaced: i32,
    pub logs: Vec<String>,
}

impl ContentService {
    pub async fn scan_folder_ingest(
        &self,
        req: ScanFolderIngestRequest,
    ) -> Result<ScanFolderIngestResult, AppError> {
        self.scan_folder_ingest_with_progress(req, None).await
    }

    async fn update_scan_progress(
        scan_id: &str,
        result: &ScanFolderIngestResult,
        current_file: Option<String>,
    ) {
        // Import the SCAN_TASKS from handlers::scanner
        use crate::handlers::scanner::SCAN_TASKS;

        let mut tasks = SCAN_TASKS.write().await;
        if let Some(task) = tasks.get_mut(scan_id) {
            task.movies_created = result.movies_created;
            task.series_created = result.series_created;
            task.episodes_created = result.episodes_created;
            task.subtitles_added = result.subtitles_added;
            task.skipped = result.skipped;
            task.replaced = result.replaced;
            task.current_file = current_file;
        }
    }

    pub async fn scan_folder_ingest_with_progress(
        &self,
        req: ScanFolderIngestRequest,
        scan_id: Option<String>,
    ) -> Result<ScanFolderIngestResult, AppError> {
        let root_path = req.root_path.trim().to_string();
        if root_path.is_empty() {
            return Err(AppError::BadRequest(
                "Root path cannot be empty".to_string(),
            ));
        }
        if !Path::new(&root_path).is_dir() {
            return Err(AppError::BadRequest(format!(
                "Root path '{}' does not exist or is not a directory",
                root_path
            )));
        }

        let media = req
            .media
            .unwrap_or_else(|| "mixed".to_string())
            .to_lowercase();
        let duplicate_policy = req
            .duplicate_policy
            .unwrap_or_else(|| "omit".to_string())
            .to_lowercase();
        let add_subs = req.add_subs.unwrap_or(true);

        // Resolve target categories (prefer explicit numeric IDs from client, fallback to type strings)
        let movie_category: Category = if let Some(id) = req.movie_category_id {
            self.get_category_by_id(id).await?.ok_or_else(|| {
                AppError::BadRequest(format!("Category id '{}' not found for movies", id))
            })?
        } else {
            let movie_category_type = req
                .movie_category
                .clone()
                .unwrap_or_else(|| "VOD".to_string());
            self.get_category_by_type(&movie_category_type)
                .await?
                .ok_or_else(|| {
                    AppError::BadRequest(format!(
                        "Category type '{}' not found for movies",
                        movie_category_type
                    ))
                })?
        };

        let series_category: Category = if let Some(id) = req.series_category_id {
            self.get_category_by_id(id).await?.ok_or_else(|| {
                AppError::BadRequest(format!("Category id '{}' not found for series", id))
            })?
        } else {
            let series_category_type = req
                .series_category
                .clone()
                .unwrap_or_else(|| "Series".to_string());
            self.get_category_by_type(&series_category_type)
                .await?
                .ok_or_else(|| {
                    AppError::BadRequest(format!(
                        "Category type '{}' not found for series",
                        series_category_type
                    ))
                })?
        };

        let tmdb_service = match &self.tmdb_service {
            Some(service) => {
                if service.is_available().await? {
                    Some(service.clone())
                } else {
                    None
                }
            }
            None => None,
        };

        let mut series_tmdb_cache: HashMap<String, Option<i64>> = HashMap::new();

        let mut result = ScanFolderIngestResult {
            movies_created: 0,
            series_created: 0,
            episodes_created: 0,
            subtitles_added: 0,
            skipped: 0,
            replaced: 0,
            logs: Vec::new(),
        };

        result.logs.push(format!(
            "Movies -> category '{}' ({})",
            movie_category.name, movie_category.category_type
        ));
        result.logs.push(format!(
            "Series -> category '{}' ({})",
            series_category.name, series_category.category_type
        ));
        if tmdb_service.is_none() {
            result
                .logs
                .push("TMDB metadata lookup disabled (service not configured)".to_string());
        }

        // Stream video files from a blocking walker to avoid stalling async runtime
        let root_path_for_walk = root_path.clone();
        let (tx, mut rx) = tokio::sync::mpsc::channel::<PathBuf>(256);
        let walker = tokio::task::spawn_blocking(move || -> Result<(), String> {
            for entry in WalkDir::new(&root_path_for_walk).into_iter() {
                let entry = entry.map_err(|e| e.to_string())?;
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path().to_path_buf();
                let is_video = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| {
                        let ext = s.to_ascii_lowercase();
                        matches!(ext.as_str(),
                            "mp4" | "mkv" | "m4v" | "avi" | "mov" |
                            "ts" | "m2ts" | "mts" | "wmv" | "flv" | "webm" |
                            "mpg" | "mpeg" | "vob" | "ogv" | "divx" |
                            "3gp" | "asf" | "rmvb" | "f4v"
                        )
                    })
                    .unwrap_or(false);
                if is_video
                    && tx.blocking_send(path).is_err() {
                        break;
                    }
            }
            Ok(())
        });

        // Use pre-compiled regex patterns from lazy_static for better performance

        while let Some(path) = rx.recv().await {
            tracing::info!("📁 SCAN: Processing file: {}", path.display());
            // Decide type: movie or series episode
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            let parent_dir = path.parent().unwrap_or(Path::new(""));

            // Extract TMDB if present anywhere in path
            let full_path_str = path.to_string_lossy().to_string();
            let mut tmdb_id = RE_TMDB
                .captures(&full_path_str)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<i64>().ok());

            // Detect series markers — broad detection for mixed mode
            let fname_lower = file_name.to_lowercase();
            let parent_str = parent_dir.to_string_lossy();
            let grandparent_str = parent_dir.parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let is_series_by_name = RE_SE.is_match(file_name)              // S01E03
                || RE_SE_X.is_match(file_name)                             // 1x03
                || RE_SE.is_match(&parent_str)                             // parent S01E03 folder
                || RE_SEASON_DIR.is_match(&parent_str)                     // Season_01
                || RE_SEASON_DIR.is_match(&grandparent_str)                // grandparent Season
                || RE_SEASON_WORD.is_match(&parent_str)                    // Temporada, Saison, Staffel
                || RE_SEASON_WORD.is_match(&grandparent_str)               // grandparent Temporada
                || RE_SEASON_S_DIR.is_match(
                    parent_dir.file_name().and_then(|s| s.to_str()).unwrap_or("")) // S01 folder
                || RE_EP_ONLY.is_match(&fname_lower)                       // EP03
                || RE_EP_ONLY.is_match(&parent_str)                        // EP03 folder
                || RE_EPISODE_WORD.is_match(&fname_lower)                  // Episode 1, Capitulo 2
                || RE_ANIME_EP.is_match(file_name);                        // [Sub] Title - 03 [1080p]

            // Determine how to treat the content based on media type
            // - movies, kids: always treat as movies (standalone content)
            // - series, anime: always treat as series (episodes with seasons)
            // - mixed/other: auto-detect based on filename patterns
            let treat_as_series = match media.as_str() {
                "movies" | "kids" => false,
                "series" | "anime" => true,
                _ => is_series_by_name,
            };

            tracing::info!("📁 SCAN: treat_as_series={} for {}", treat_as_series, path.display());

            if treat_as_series {
                // SERIES EPISODE INGEST
                let (season_no, episode_no) = self.detect_season_episode(&path);
                let series_title = self.derive_series_title_from_path(&path);
                tracing::info!("📁 SCAN: Series title='{}' S{:02}E{:02}", series_title, season_no, episode_no);
                let cache_key = series_title.to_lowercase();

                if tmdb_id.is_none() {
                    if let Some(cached) = series_tmdb_cache.get(&cache_key) {
                        tmdb_id = *cached;
                    }
                } else {
                    series_tmdb_cache.insert(cache_key.clone(), tmdb_id);
                }

                if tmdb_id.is_none() {
                    if let Some(tmdb) = tmdb_service.as_ref() {
                        match tmdb.search_tv(&series_title).await {
                            Ok(results) => {
                                if let Some(found_id) =
                                    Self::pick_best_tv_match(&series_title, &results)
                                {
                                    tmdb_id = Some(found_id);
                                    result.logs.push(format!(
                                        "Matched series '{}' -> TMDB {}",
                                        series_title, found_id
                                    ));
                                }
                            }
                            Err(err) => {
                                result.logs.push(format!(
                                    "TMDB lookup failed for series '{}': {}",
                                    series_title, err
                                ));
                            }
                        }
                    }
                    series_tmdb_cache.insert(cache_key.clone(), tmdb_id);
                }

                let (series_id, _content_id, effective_tmdb_id, created) = match self
                    .ensure_series(&series_title, tmdb_id, &series_category)
                    .await
                {
                    Ok(value) => value,
                    Err(e) => {
                        result.skipped += 1;
                        tracing::warn!("⚠️ SCAN: Skip series '{}': failed ensure/create: {}", series_title, e);
                        result.logs.push(format!(
                            "Skip series '{}': failed ensure/create: {}",
                            series_title, e
                        ));
                        continue;
                    }
                };

                let final_tmdb_id = effective_tmdb_id.or(tmdb_id);
                series_tmdb_cache.insert(cache_key, final_tmdb_id);

                if created {
                    result.series_created += 1;
                    result.logs.push(format!(
                        "Created series: '{}' (tmdb={:?})",
                        series_title, final_tmdb_id
                    ));

                    // Update progress if scan_id is provided
                    if let Some(ref scan_id) = scan_id {
                        Self::update_scan_progress(
                            scan_id,
                            &result,
                            Some(path.to_string_lossy().to_string()),
                        )
                        .await;
                    }
                }

                // Ensure season exists
                let season_id = match self.ensure_season(series_id, season_no).await {
                    Ok(season) => season.id,
                    Err(e) => {
                        result.skipped += 1;
                        tracing::warn!("⚠️ SCAN: Skip season {} for series '{}': {}", season_no, series_title, e);
                        result.logs.push(format!(
                            "Skip season {} for series '{}': {}",
                            season_no, series_title, e
                        ));
                        continue;
                    }
                };

                // Insert or update episode
                match self
                    .upsert_episode(season_id, episode_no, &path, &duplicate_policy)
                    .await
                {
                    Ok((ep_id, action)) => {
                        match action.as_str() {
                            "created" => {
                                result.episodes_created += 1;
                                result.logs.push(format!(
                                    "Episode created: {} S{:02}E{:02} -> {}",
                                    series_title,
                                    season_no,
                                    episode_no,
                                    path.to_string_lossy()
                                ));

                                // Update progress if scan_id is provided
                                if let Some(ref scan_id) = scan_id {
                                    Self::update_scan_progress(
                                        scan_id,
                                        &result,
                                        Some(path.to_string_lossy().to_string()),
                                    )
                                    .await;
                                }

                                // Add subtitles only for newly created episodes
                                if add_subs {
                                    if let Ok(count) =
                                        self.add_episode_subtitles_from_dir(ep_id, &path).await
                                    {
                                        if count > 0 {
                                            result.subtitles_added += count;
                                            result.logs.push(format!(
                                                "Added {} external subtitles for ep S{:02}E{:02}",
                                                count, season_no, episode_no
                                            ));
                                        }
                                    }
                                }
                            }
                            "replaced" => {
                                result.replaced += 1;
                                result.logs.push(format!(
                                    "Episode replaced: {} S{:02}E{:02} -> {}",
                                    series_title,
                                    season_no,
                                    episode_no,
                                    path.to_string_lossy()
                                ));

                                // Add subtitles for replaced episodes (refresh subtitles)
                                if add_subs {
                                    if let Ok(count) =
                                        self.add_episode_subtitles_from_dir(ep_id, &path).await
                                    {
                                        if count > 0 {
                                            result.subtitles_added += count;
                                            result.logs.push(format!(
                                                "Added {} external subtitles for ep S{:02}E{:02}",
                                                count, season_no, episode_no
                                            ));
                                        }
                                    }
                                }
                            }
                            "skipped" => {
                                result.skipped += 1;
                                result.logs.push(format!(
                                    "Episode skipped (duplicate policy): {} S{:02}E{:02}",
                                    series_title, season_no, episode_no
                                ));
                                // DO NOT add subtitles for skipped episodes
                            }
                            _ => {}
                        }
                    }
                    Err(e) => {
                        result.skipped += 1;
                        tracing::warn!("⚠️ SCAN: Failed to upsert episode {} S{:02}E{:02}: {}", series_title, season_no, episode_no, e);
                        result.logs.push(format!(
                            "Failed to upsert episode {} S{:02}E{:02}: {}",
                            series_title, season_no, episode_no, e
                        ));
                    }
                }
            } else {
                // MOVIE INGEST
                let (title, year_guess) = self.derive_movie_title_year(&path);

                if tmdb_id.is_none() {
                    if let Some(tmdb) = tmdb_service.as_ref() {
                        match tmdb.search_movie(&title).await {
                            Ok(results) => {
                                if let Some(found_id) =
                                    Self::pick_best_movie_match(&title, year_guess, &results)
                                {
                                    tmdb_id = Some(found_id);
                                    result.logs.push(format!(
                                        "Matched movie '{}' -> TMDB {}",
                                        title, found_id
                                    ));
                                }
                            }
                            Err(err) => {
                                result.logs.push(format!(
                                    "TMDB lookup failed for movie '{}': {}",
                                    title, err
                                ));
                            }
                        }
                    }
                }

                match self
                    .upsert_movie(
                        &movie_category,
                        &title,
                        year_guess,
                        tmdb_id,
                        &path,
                        &duplicate_policy,
                    )
                    .await
                {
                    Ok((content_id, action)) => {
                        let ref_id = tmdb_id.or(year_guess);
                        match action.as_str() {
                            "created" => {
                                result.movies_created += 1;
                                result.logs.push(format!(
                                    "Movie created: {} ({:?}) -> {}",
                                    title,
                                    ref_id,
                                    path.to_string_lossy()
                                ));

                                // Update progress if scan_id is provided
                                if let Some(ref scan_id) = scan_id {
                                    Self::update_scan_progress(
                                        scan_id,
                                        &result,
                                        Some(path.to_string_lossy().to_string()),
                                    )
                                    .await;
                                }

                                // Add subtitles only for newly created movies
                                if add_subs {
                                    if let Ok(count) =
                                        self.add_movie_subtitles_from_dir(content_id, &path).await
                                    {
                                        if count > 0 {
                                            result.subtitles_added += count;
                                            result.logs.push(format!(
                                                "Added {} external subtitles for movie '{}'",
                                                count, title
                                            ));
                                        }
                                    }
                                }
                            }
                            "replaced" => {
                                result.replaced += 1;
                                result.logs.push(format!(
                                    "Movie replaced: {} ({:?}) -> {}",
                                    title,
                                    ref_id,
                                    path.to_string_lossy()
                                ));

                                // Add subtitles for replaced movies (refresh subtitles)
                                if add_subs {
                                    if let Ok(count) =
                                        self.add_movie_subtitles_from_dir(content_id, &path).await
                                    {
                                        if count > 0 {
                                            result.subtitles_added += count;
                                            result.logs.push(format!(
                                                "Added {} external subtitles for movie '{}'",
                                                count, title
                                            ));
                                        }
                                    }
                                }
                            }
                            "skipped" => {
                                result.skipped += 1;
                                result.logs.push(format!(
                                    "Movie skipped (duplicate policy): {} ({:?})",
                                    title, ref_id
                                ));
                                // DO NOT add subtitles for skipped movies
                            }
                            _ => {}
                        }
                    }
                    Err(e) => {
                        result.skipped += 1;
                        result
                            .logs
                            .push(format!("Failed to upsert movie '{}': {}", title, e));
                    }
                }
            }
        }

        match walker.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                return Err(AppError::BadRequest(format!(
                    "Error scanning directory '{}': {}",
                    root_path, e
                )));
            }
            Err(e) => {
                return Err(AppError::InternalError(format!(
                    "Scan task join error: {}",
                    e
                )));
            }
        }

        Ok(result)
    }


    async fn ensure_series(
        &self,
        title: &str,
        tmdb_id: Option<i64>,
        category: &Category,
    ) -> Result<(i64, i64, Option<i64>, bool), AppError> {
        if let Some(tid) = tmdb_id {
            if let Some((sid, cid, existing_tmdb)) = self.find_series_by_tmdb_id(tid).await? {
                self.set_content_category_if_needed(cid, category.id)
                    .await?;
                return Ok((sid, cid, existing_tmdb.or(Some(tid)), false));
            }
        }

        if let Some((sid, cid, existing_tmdb)) = self.find_series_by_title(title).await? {
            self.set_content_category_if_needed(cid, category.id)
                .await?;
            if existing_tmdb.is_none() && tmdb_id.is_some() {
                self.set_content_tmdb_id(cid, tmdb_id).await?;
            }
            return Ok((sid, cid, tmdb_id.or(existing_tmdb), false));
        }

        if let Some(tid) = tmdb_id {
            let created = self
                .create_series_from_tmdb(CreateSeriesFromTmdbRequest {
                    tmdb_id: tid,
                    episode_urls: None,
                })
                .await?;
            if created.content.category_id != category.id {
                self.set_content_category_if_needed(created.content.id, category.id)
                    .await?;
            }
            return Ok((created.id, created.content.id, Some(tid), true));
        }

        let created = self
            .create_series_manual(CreateSeriesRequest {
                title: title.to_string(),
                description: None,
                image_url: None,
                tmdb_id: None,
                year: None,
                total_seasons: 1,
                category_type: None,
                episodes_by_season: None,
            })
            .await?;
        if created.content.category_id != category.id {
            self.set_content_category_if_needed(created.content.id, category.id)
                .await?;
        }
        Ok((
            created.id,
            created.content.id,
            created.content.tmdb_id,
            true,
        ))
    }

    async fn set_content_category_if_needed(
        &self,
        content_id: i64,
        desired_category_id: i64,
    ) -> Result<(), AppError> {
        let current: i64 = sqlx::query_scalar("SELECT category_id FROM content.media_content WHERE id = $1")
            .bind(content_id)
            .fetch_one(&self.db)
            .await?;
        if current != desired_category_id {
            sqlx::query("UPDATE content.media_content SET category_id = $1 WHERE id = $2")
                .bind(desired_category_id)
                .bind(content_id)
                .execute(&self.db)
                .await?;
        }
        Ok(())
    }

    async fn set_content_tmdb_id(
        &self,
        content_id: i64,
        tmdb_id: Option<i64>,
    ) -> Result<(), AppError> {
        if let Some(tid) = tmdb_id {
            let current: Option<i64> =
                sqlx::query_scalar("SELECT tmdb_id FROM content.media_content WHERE id = $1")
                    .bind(content_id)
                    .fetch_one(&self.db)
                    .await?;
            if current.is_none() {
                sqlx::query("UPDATE content.media_content SET tmdb_id = $1 WHERE id = $2")
                    .bind(tid)
                    .bind(content_id)
                    .execute(&self.db)
                    .await?;
            }
        }
        Ok(())
    }


    async fn ensure_season(&self, series_id: i64, season_number: i32) -> Result<Season, AppError> {
        // Lookup season by series_id + season_number
        if let Some(season) = sqlx::query_as::<_, Season>(
            "SELECT id, series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date, created_at FROM content.seasons WHERE series_id = $1 AND season_number = $2"
        )
        .bind(series_id)
        .bind(season_number)
        .fetch_optional(&self.db)
        .await? {
            return Ok(season);
        }
        // Create season if not exists
        self.create_season(CreateSeasonRequest {
            series_id,
            season_number,
        })
        .await
    }

    async fn upsert_episode(
        &self,
        season_id: i64,
        episode_number: i32,
        file_path: &Path,
        duplicate_policy: &str,
    ) -> Result<(i64, String), AppError> {
        // Find existing episode
        let existing = sqlx::query_as::<_, Episode>(
            "SELECT id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at FROM content.episodes WHERE season_id = $1 AND episode_number = $2"
        )
        .bind(season_id)
        .bind(episode_number)
        .fetch_optional(&self.db)
        .await?;

        let file_path_str = file_path.to_string_lossy().to_string();
        match existing {
            Some(ep) => {
                if ep.stream_url.trim().is_empty() || ep.stream_url.trim() == "[No URL]" {
                    // Placeholder episodes created from TMDB need a stream path the first time we ingest media
                    let updated = sqlx::query_as::<_, Episode>(
                        r#"
                        UPDATE content.episodes
                        SET stream_url = $1
                        WHERE id = $2
                        RETURNING id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at
                        "#
                    )
                    .bind(&file_path_str)
                    .bind(ep.id)
                    .fetch_one(&self.db)
                    .await?;
                    return Ok((updated.id, "created".to_string()));
                }

                match duplicate_policy {
                    "replace" => {
                        // Update URL
                        let updated = sqlx::query_as::<_, Episode>(
                            r#"
                            UPDATE content.episodes
                            SET stream_url = $1
                            WHERE id = $2
                            RETURNING id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at
                            "#
                        )
                        .bind(&file_path_str)
                        .bind(ep.id)
                        .fetch_one(&self.db)
                        .await?;
                        Ok((updated.id, "replaced".to_string()))
                    }
                    "allow" => {
                        // Not allowed for episodes because of logical uniqueness. Keep existing, mark as skipped.
                        Ok((ep.id, "skipped".to_string()))
                    }
                    _ => Ok((ep.id, "skipped".to_string())),
                }
            }
            None => {
                // Create
                let title = format!("Episode {}", episode_number);
                let created = self
                    .create_episode(CreateEpisodeRequest {
                        season_id,
                        episode_number,
                        title,
                        description: None,
                        stream_url: file_path_str,
                        image_url: None,
                        duration: None,
                        tmdb_id: None,
                        air_date: None,
                    })
                    .await?;
                Ok((created.id, "created".to_string()))
            }
        }
    }
}
