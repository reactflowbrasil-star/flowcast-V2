pub mod sql;
use sql::CONTENT_JOIN_SELECT;
use crate::error::AppError;
use crate::models::{
    Category, ContentJoined, ContentSubtitle, Episode, Event,
    EventSchedule, EventWithSchedules, ScheduleWithDecryptedUrl, Season, SeasonWithEpisodes,
    Series, SeriesWithDetails, TmdbSearchResult,
};
use crate::services::TmdbService;
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Row};

// Pre-compiled regex patterns for media file parsing (performance optimization)
lazy_static::lazy_static! {
    static ref RE_TMDB: Regex = Regex::new(r"(?i)\[tmdbid-(\d+)\]").unwrap();
    static ref RE_YEAR: Regex = Regex::new(r"\((\d{4})\)").unwrap();
    static ref RE_SE: Regex = Regex::new(r"(?i)S(\d{1,2})E(\d{1,3})").unwrap(); // S01E17
    static ref RE_SE_X: Regex = Regex::new(r"(?i)\b(\d{1,2})x(\d{1,3})\b").unwrap(); // 1x03, 01x12
    static ref RE_SEASON_DIR: Regex = Regex::new(r"(?i)season[_\s-]?(\d{1,2})").unwrap(); // Season_01
    static ref RE_SEASON_WORD: Regex = Regex::new(r"(?i)(?:temporada|saison|staffel|stagione)[_\s-]?(\d{1,2})").unwrap(); // Temporada 1, Saison 02
    static ref RE_SEASON_S_DIR: Regex = Regex::new(r"(?i)^S(\d{1,2})$").unwrap(); // S01, S1 (standalone folder)
    static ref RE_EP_ONLY: Regex = Regex::new(r"(?i)\bEP(\d{1,3})\b").unwrap(); // EP17
    static ref RE_EPISODE_WORD: Regex = Regex::new(r"(?i)\b(?:episode|episodio|capitulo|cap|folge|puntata)[\s._-]*(\d{1,3})\b").unwrap(); // Episode 1, Capitulo_02, Folge 3
    static ref RE_LEADING_NUM: Regex = Regex::new(r"^(\d{1,3})(?:\b|[.\s_-])").unwrap(); // 01 - Title, 01.mkv
    static ref RE_ANIME_EP: Regex = Regex::new(r"(?:^|\]\s*|\)\s*)\s*-\s*(\d{1,4})\s*(?:\[|\(|$|\s)").unwrap(); // [SubGroup] Title - 03 [1080p]
    static ref RE_TRAILING_NUM: Regex = Regex::new(r"[_\s.-](\d{1,3})$").unwrap(); // Title_03, Title.03, Title - 03 (in stem)
    static ref RE_LAST_NUM: Regex = Regex::new(r"(\d{1,3})[^\d]*$").unwrap(); // last number group in string (ultimate fallback)
    static ref RE_SE_FOLDER: Regex = Regex::new(r"(?i)^S\d{1,2}E\d{1,3}$").unwrap();
    static ref RE_TMDB_TAG: Regex = Regex::new(r"(?i)\[tmdbid-\d+\]").unwrap();
    static ref RE_YEAR_CLEAN: Regex = Regex::new(r"\s*\((\d{4})\)\s*$").unwrap();
    // Title cleaning patterns (strip noise for better TMDB matching)
    static ref RE_RESOLUTION: Regex = Regex::new(r"(?i)\b(?:720p|1080[pi]|2160p|4K|UHD|SD|HD|FHD)\b").unwrap();
    static ref RE_CODEC: Regex = Regex::new(r"(?i)\b(?:x264|x265|[hH]\.?264|[hH]\.?265|HEVC|AVC|VP9|AV1|MPEG[24]?|DivX|XviD|10bit)\b").unwrap();
    static ref RE_RELEASE_NOISE: Regex = Regex::new(r"(?i)\b(?:BluRay|Blu-Ray|BDRip|BRRip|WEB-DL|WEBRip|WEB|HDRip|DVDRip|DVDScr|HDTV|PDTV|SDTV|REMUX|PROPER|REPACK|RETAIL|EXTENDED|UNRATED|DIRECTORS\.?CUT|DC|IMAX|3D|HDR|HDR10|DV|DoVi|Dolby\.?Vision)\b").unwrap();
    static ref RE_AUDIO_TAGS: Regex = Regex::new(r"(?i)\b(?:AAC|AC3|EAC3|E-AC-3|DTS|DTS-HD|DTS-X|FLAC|TrueHD|Atmos|DD[P+]?\d*\.?\d*|LPCM|MP3|OGG|OPUS|[257]\.1(?:ch)?)\b").unwrap();
    static ref RE_BRACKETED: Regex = Regex::new(r"\[([^\]]*)\]").unwrap();
}

// All DTO / Request / Response types live in the `types` submodule.
pub mod types;
pub mod categories;
pub mod tv_channels;
pub mod series;
pub mod events;
pub mod kids_anime;
pub mod search;
pub use types::*;
use types::SeriesData;

#[derive(Clone)]
pub struct ContentService {
    pub(crate) db: PgPool,
    tmdb_service: Option<TmdbService>,
}

impl ContentService {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            tmdb_service: None,
        }
    }

    pub fn with_tmdb_service(mut self, tmdb_service: TmdbService) -> Self {
        self.tmdb_service = Some(tmdb_service);
        self
    }

    /// Expose the database pool for direct queries in handlers
    pub fn get_db(&self) -> &PgPool {
        &self.db
    }

    /// Check if empty episodes should be hidden (from core.config)
    pub async fn should_hide_empty_episodes(&self) -> bool {
        let result = sqlx::query_scalar::<_, String>(
            "SELECT value FROM core.config WHERE key = 'hide_empty_episodes'",
        )
        .fetch_optional(&self.db)
        .await;

        match result {
            Ok(Some(value)) => value.to_lowercase() == "true" || value == "1",
            _ => false, // Default: show all episodes
        }
    }

    /// Convert a relative /metadata/ path to an absolute URL using PUBLIC_BASE_URL
    fn absolutize_metadata_path(path: &str) -> String {
        let trimmed = path.trim();
        // Already absolute or special protocol
        if trimmed.starts_with("http://")
            || trimmed.starts_with("https://")
            || trimmed.starts_with("data:")
            || trimmed.starts_with("blob:")
        {
            return path.to_string();
        }

        // Convert relative /metadata/ paths to absolute URLs
        if trimmed.starts_with("/metadata/") || trimmed.starts_with("metadata/") {
            let base = crate::config::Config::from_env()
                .ok()
                .map(|c| c.public_base_url)
                .unwrap_or_else(|| "http://localhost:3000".to_string());
            let base_trimmed = base.trim_end_matches('/');
            let p = if trimmed.starts_with('/') {
                trimmed.to_string()
            } else {
                format!("/{}", trimmed)
            };
            return format!("{}{}", base_trimmed, p);
        }

        path.to_string()
    }

    async fn cache_live_tv_logo(
        &self,
        logo_url: Option<String>,
        _channel_name: &str,
    ) -> Result<Option<String>, AppError> {
        // Simply return the logo URL as-is without attempting to cache
        // This avoids issues where failed downloads would create broken internal paths
        let Some(raw_logo) = logo_url else {
            return Ok(None);
        };

        let trimmed = raw_logo.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }

        // If it's a metadata path, convert to absolute URL
        if trimmed.starts_with("/metadata/") || trimmed.starts_with("metadata/") {
            return Ok(Some(Self::absolutize_metadata_path(trimmed)));
        }

        // Return URL as-is (external URLs, data: URLs, etc.)
        Ok(Some(raw_logo))
    }

    // Content management methods
    pub async fn get_content_by_category(
        &self,
        category_id: i64,
        page: Option<i32>,
        limit: Option<i32>,
        search: Option<&str>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        let mut base_sql = format!("{} WHERE mc.category_id = $1", CONTENT_JOIN_SELECT);

        if search.is_some() {
            base_sql.push_str(" AND LOWER(mc.title) LIKE $2 ");
        }

        base_sql.push_str(" ORDER BY mc.title ");

        let search_pattern = search.map(|term| format!("%{}%", term.to_lowercase()));

        if let (Some(page), Some(limit)) = (page, limit) {
            let page = page.max(1);
            let limit = limit.clamp(1, 100);
            let offset = (page - 1) * limit;

            let mut paginated_sql = base_sql.clone();
            if search.is_some() {
                paginated_sql.push_str(" LIMIT $3 OFFSET $4");
            } else {
                paginated_sql.push_str(" LIMIT $2 OFFSET $3");
            }

            let mut query = sqlx::query_as::<_, ContentJoined>(&paginated_sql).bind(category_id);
            if let Some(ref pattern) = search_pattern {
                query = query.bind(pattern);
            }
            query = query.bind(limit).bind(offset);

            let content = query.fetch_all(&self.db).await?;
            Ok(content)
        } else {
            let mut query = sqlx::query_as::<_, ContentJoined>(&base_sql).bind(category_id);
            if let Some(ref pattern) = search_pattern {
                query = query.bind(pattern);
            }

            let content = query.fetch_all(&self.db).await?;
            Ok(content)
        }
    }

    /// Get content from MULTIPLE categories in a single query (eliminates N+1 in discovery)
    /// Returns a HashMap where key is category_id and value is list of content
    pub async fn get_content_by_categories_batch(
        &self,
        category_ids: &[i64],
        limit_per_category: i32,
        active_only: bool,
    ) -> Result<std::collections::HashMap<i64, Vec<ContentJoined>>, AppError> {
        use std::collections::HashMap;

        if category_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Build dynamic placeholders for IN clause
        let placeholders = category_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");

        // Use ROW_NUMBER to limit results per category
        let sql = format!(
            r#"
            WITH ranked AS (
                SELECT 
                    mc.id, mc.category_id, mc.title, mc.description, mc.image_url, mc.backdrop_url, mc.media_type, mc.active, mc.created_at,
                    m.tmdb_id, m.year, m.duration, m.rating, m.genre,
                    t.channel_number, t.is_live, t.provider, t.country, t.epg_source_id, t.epg_channel_id, t.epg_offset_minutes, t.channel_category,
                    s.id as stream_id, s.stream_url, s.stream_type, s.quality, s.language, s.format, s.drm_keys, s.drm_type, s.license_server_url, 
                    s.drm_headers, s.origin, s.user_agent, s.referer, s.custom_headers, s.proxy_url, s.doh_url,
                    ROW_NUMBER() OVER (PARTITION BY mc.category_id ORDER BY mc.title) as rn
                FROM content.media_content mc
                LEFT JOIN content.movies m ON mc.id = m.media_content_id
                LEFT JOIN content.tv_channels t ON mc.id = t.media_content_id
                LEFT JOIN content.media_streams s ON mc.id = s.media_content_id AND s.is_default = true
                WHERE mc.category_id IN ({})
                {}
            )
            SELECT *
            FROM ranked
            WHERE rn <= {}
            ORDER BY category_id, title
            "#,
            placeholders,
            if active_only { "AND mc.active = true" } else { "" },
            limit_per_category
        );

        let mut query = sqlx::query_as::<_, ContentJoined>(&sql);
        for id in category_ids {
            query = query.bind(id);
        }
        let all_content = query.fetch_all(&self.db).await?;

        // Group by category_id
        let mut result: HashMap<i64, Vec<ContentJoined>> = HashMap::new();
        for content in all_content {
            result.entry(content.category_id).or_default().push(content);
        }

        Ok(result)
    }

    // Count content by category
    pub async fn count_content_by_category(
        &self,
        category_id: i64,
        search: Option<&str>,
    ) -> Result<i64, AppError> {
        let mut sql = String::from("SELECT COUNT(*) FROM content.media_content WHERE category_id = $1");
        if search.is_some() {
            sql.push_str(" AND LOWER(title) LIKE $2");
        }

        let search_pattern = search.map(|term| format!("%{}%", term.to_lowercase()));

        let mut query = sqlx::query_scalar::<_, i64>(&sql).bind(category_id);
        if let Some(ref pattern) = search_pattern {
            query = query.bind(pattern);
        }

        let count = query.fetch_one(&self.db).await?;
        Ok(count)
    }

    pub async fn get_content_by_id(&self, id: i64) -> Result<Option<ContentJoined>, AppError> {
        let sql = format!("{} WHERE mc.id = $1", CONTENT_JOIN_SELECT);
        let content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        Ok(content)
    }

    pub async fn get_all_content(
        &self,
        page: Option<i32>,
        limit: Option<i32>,
        search: Option<&str>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        let mut base_sql = String::from(CONTENT_JOIN_SELECT);

        if search.is_some() {
            base_sql.push_str(" WHERE LOWER(mc.title) LIKE $1");
        }

        base_sql.push_str(" ORDER BY mc.created_at DESC");

        let search_pattern = search.map(|term| format!("%{}%", term.to_lowercase()));

        if let (Some(page), Some(limit)) = (page, limit) {
            let page = page.max(1);
            let limit = limit.clamp(1, 100);
            let offset = (page - 1) * limit;

            let mut paginated_sql = base_sql.clone();
            if search.is_some() {
                paginated_sql.push_str(" LIMIT $2 OFFSET $3");
            } else {
                paginated_sql.push_str(" LIMIT $1 OFFSET $2");
            }

            let mut query = sqlx::query_as::<_, ContentJoined>(&paginated_sql);
            if let Some(ref pattern) = search_pattern {
                query = query.bind(pattern);
            }
            query = query.bind(limit).bind(offset);

            let content = query.fetch_all(&self.db).await?;
            Ok(content)
        } else {
            let mut query = sqlx::query_as::<_, ContentJoined>(&base_sql);
            if let Some(ref pattern) = search_pattern {
                query = query.bind(pattern);
            }

            let content = query.fetch_all(&self.db).await?;
            Ok(content)
        }
    }

    pub async fn count_all_content(&self, search: Option<&str>) -> Result<i64, AppError> {
        let mut sql = String::from("SELECT COUNT(*) FROM content.media_content");
        if search.is_some() {
            sql.push_str(" WHERE LOWER(title) LIKE $1");
        }

        let search_pattern = search.map(|term| format!("%{}%", term.to_lowercase()));

        let mut query = sqlx::query_scalar::<_, i64>(&sql);
        if let Some(ref pattern) = search_pattern {
            query = query.bind(pattern);
        }

        let count = query.fetch_one(&self.db).await?;
        Ok(count)
    }

    pub async fn assign_content_to_category(
        &self,
        content_id: i64,
        category_id: i64,
    ) -> Result<(), AppError> {
        // First verify the category exists
        let category = self.get_category_by_id(category_id).await?;
        if category.is_none() {
            return Err(AppError::NotFound);
        }

        // Update the content's category assignment
        let result = sqlx::query("UPDATE content.media_content SET category_id = $1 WHERE id = $2")
            .bind(category_id)
            .bind(content_id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }

        Ok(())
    }

    pub async fn toggle_content_status(&self, id: i64) -> Result<ContentJoined, AppError> {
        // First get the current status
        let sql = format!("{} WHERE mc.id = $1", CONTENT_JOIN_SELECT);
        let current_content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(id)
        .fetch_optional(&self.db)
        .await?
        .ok_or(AppError::NotFound)?;

        // Toggle the status
        let new_status = !current_content.active;

        sqlx::query("UPDATE content.media_content SET active = $1 WHERE id = $2")
            .bind(new_status)
            .bind(id)
            .execute(&self.db)
            .await?;

        // Return the updated content
        let updated_content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(id)
        .fetch_one(&self.db)
        .await?;

        Ok(updated_content)
    }

    // Update content (Req 4.1, 4.2)
    pub async fn update_content(
        &self,
        id: i64,
        request: UpdateContentRequest,
    ) -> Result<ContentJoined, AppError> {
        // Check if content exists
        let sql = format!("{} WHERE mc.id = $1", CONTENT_JOIN_SELECT);
        let existing_content = sqlx::query_as::<_, ContentJoined>(&sql)
            .bind(id)
            .fetch_optional(&self.db)
            .await?;

        let content = existing_content.ok_or(AppError::NotFound)?;

        // Prepare update fields
        let title = request.title.unwrap_or(content.title.clone());
        let description = request.description.or(content.description);
        let image_url = request.image_url.or(content.image_url);
        let backdrop_url = request.backdrop_url.or(content.backdrop_url);
        let provider = request.provider.or(content.provider);
        let country = request.country.or(content.country);
        let format = request.format.or(content.format);
        let channel_number = request.channel_number.or(content.channel_number);
        let is_live = request.is_live.or(content.is_live);
        let drm_keys = request.drm_keys.or(content.drm_keys);
        let active = request.active.unwrap_or(content.active);

        // Handle stream URL directly
        let stream_url = request.stream_url.unwrap_or_else(|| content.stream_url.unwrap_or_default());

        // Start transaction
        let mut tx = self.db.begin().await?;

        // Update content.media_content
        sqlx::query(
            r#"
            UPDATE content.media_content
            SET title = $1, description = $2, image_url = $3, active = $4
            WHERE id = $5
            "#
        )
        .bind(&title)
        .bind(&description)
        .bind(&image_url)
        .bind(active)
        .bind(id)
        .execute(&mut *tx)
        .await?;

        // Update content.media_streams (default stream)
        let stream_update = sqlx::query(
            r#"
            UPDATE content.media_streams
            SET stream_url = $1, proxy_url = COALESCE($2, proxy_url), doh_url = COALESCE($3, doh_url), 
                format = COALESCE($4, format), drm_keys = COALESCE($5, drm_keys)
            WHERE media_content_id = $6 AND is_default = true
            "#
        )
        .bind(&stream_url)
        .bind(&request.proxy_url)
        .bind(&request.doh_url)
        .bind(&format)
        .bind(&drm_keys)
        .bind(id)
        .execute(&mut *tx)
        .await?;

        if stream_update.rows_affected() == 0 && !stream_url.is_empty() {
            sqlx::query("INSERT INTO content.media_streams (media_content_id, stream_url, stream_type, is_default, format, drm_keys) VALUES ($1, $2, 'main', true, $3, $4)")
                .bind(id)
                .bind(&stream_url)
                .bind(&format)
                .bind(&drm_keys)
                .execute(&mut *tx)
                .await?;
        }

        // Run both updates. Only the one targeting the existing child table row will affect 1 row.
        sqlx::query(
            r#"
            UPDATE content.movies
            SET backdrop_url = $1
            WHERE media_content_id = $2
            "#
        )
        .bind(&backdrop_url)
        .bind(id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            UPDATE content.tv_channels
            SET channel_number = $1, is_live = $2, provider = $3, country = $4
            WHERE media_content_id = $5
            "#
        )
        .bind(channel_number)
        .bind(is_live)
        .bind(&provider)
        .bind(&country)
        .bind(id)
        .execute(&mut *tx)
        .await?;

        // Commit transaction
        tx.commit().await?;

        // Return the updated content
        let updated_content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(id)
        .fetch_one(&self.db)
        .await?;

        Ok(updated_content)
    }

    pub async fn delete_content(&self, id: i64) -> Result<(), AppError> {
        // First check if content exists
        let sql = format!("{} WHERE mc.id = $1", CONTENT_JOIN_SELECT);
        let content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        let content = content.ok_or(AppError::NotFound)?;

        // Get category to determine content type
        let category = self
            .get_category_by_id(content.category_id)
            .await?
            .ok_or(AppError::NotFound)?;

        // Delete related records based on content type
        match category.category_type.as_str() {
            "Series" | "Anime" => {
                // All episodic content uses series/seasons/episodes structure
                // Delete episodes first, then seasons, then series
                if let Ok(Some(series)) = sqlx::query_as::<_, Series>(
                    "SELECT id, content_id, total_seasons, created_at FROM content.series WHERE content_id = $1"
                )
                .bind(id)
                .fetch_optional(&self.db)
                .await {
                    // Delete episodes
                    sqlx::query("DELETE FROM content.episodes WHERE season_id IN (SELECT id FROM content.seasons WHERE series_id = $1)")
                        .bind(series.id)
                        .execute(&self.db)
                        .await?;

                    // Delete seasons
                    sqlx::query("DELETE FROM content.seasons WHERE series_id = $1")
                        .bind(series.id)
                        .execute(&self.db)
                        .await?;

                    // Delete series
                    sqlx::query("DELETE FROM content.series WHERE content_id = $1")
                        .bind(id)
                        .execute(&self.db)
                        .await?;
                }
            }
            "Eventos" => {
                // Delete event schedules first, then event
                if let Ok(Some(event)) = sqlx::query_as::<_, Event>(
                    "SELECT id, content_id, event_type, created_at FROM activity.events WHERE content_id = $1"
                )
                .bind(id)
                .fetch_optional(&self.db)
                .await {
                    // Delete event schedules
                    sqlx::query("DELETE FROM activity.event_schedules WHERE event_id = $1")
                        .bind(event.id)
                        .execute(&self.db)
                        .await?;

                    // Delete event
                    sqlx::query("DELETE FROM activity.events WHERE content_id = $1")
                        .bind(id)
                        .execute(&self.db)
                        .await?;
                }
            }
            _ => {
                // For other content types, no special handling needed
            }
        }

        // Finally delete the content
        let result = sqlx::query("DELETE FROM content.media_content WHERE id = $1")
            .bind(id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }

        Ok(())
    }

    // Content creation methods with TMDB integration
    pub async fn create_content_manual(
        &self,
        request: CreateContentRequest,
    ) -> Result<ContentJoined, AppError> {
        // Verify the category exists
        let category = self.get_category_by_id(request.category_id).await?;
        if category.is_none() {
            return Err(AppError::NotFound);
        }

        // Determine media_type from category_type
        let category_type = category.as_ref().unwrap().category_type.as_str();
        let media_type = match category_type {
            "VOD" => "movie",
            "Series" => "series",
            "TV" => "tv_channel",
            "Eventos" => "event",
            "Anime" => "anime",
            "Kids" => "kids",
            _ => "movie",
        };

        // Start transaction
        let mut tx = self.db.begin().await?;

        // 1. Insert into content.media_content
        let content_id: i64 = sqlx::query_scalar(
            r#"
            INSERT INTO content.media_content (category_id, title, description, image_url, backdrop_url, stream_url, tmdb_id, year, media_type, active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
            "#
        )
        .bind(request.category_id)
        .bind(&request.title)
        .bind(&request.description)
        .bind(&request.image_url)
        .bind(&request.backdrop_url)
        .bind(&request.stream_url)
        .bind(request.tmdb_id)
        .bind(request.year)
        .bind(media_type)
        .bind(request.active.unwrap_or(true))
        .fetch_one(&mut *tx)
        .await?;

        // 2. Insert into specific tables
        if media_type == "tv_channel" || media_type == "event" {
            sqlx::query(
                r#"
                INSERT INTO content.tv_channels (media_content_id, channel_number, is_live, provider, country, epg_source_id, epg_channel_id, epg_offset_minutes, channel_category)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                "#
            )
            .bind(content_id)
            .bind(request.channel_number)
            .bind(request.is_live.unwrap_or(media_type == "tv_channel"))
            .bind(&request.provider)
            .bind(&request.country)
            .bind(request.epg_source_id)
            .bind(&request.epg_channel_id)
            .bind(request.epg_offset_minutes.unwrap_or(0))
            .bind(&request.genre) // channel_category maps from genre field
            .execute(&mut *tx)
            .await?;
        } else {
            // Treat as movie/series/anime/kids VOD content
            sqlx::query(
                r#"
                INSERT INTO content.movies (media_content_id, backdrop_url, year, duration, rating, genre, tmdb_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                "#
            )
            .bind(content_id)
            .bind(&request.backdrop_url)
            .bind(request.year)
            .bind(request.duration)
            .bind(request.rating)
            .bind(&request.genre)
            .bind(request.tmdb_id)
            .execute(&mut *tx)
            .await?;
        }

        // 3. Insert into content.media_streams
        if !request.stream_url.is_empty() {
            sqlx::query(
                r#"
                INSERT INTO content.media_streams (
                    media_content_id, stream_url, stream_type, is_default, quality, language, audio_languages,
                    format, drm_keys, drm_type, license_server_url, drm_headers, proxy_url, doh_url,
                    origin, user_agent, referer, custom_headers
                )
                VALUES ($1, $2, 'main', true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                "#
            )
            .bind(content_id)
            .bind(&request.stream_url)
            .bind(&request.quality)
            .bind(&request.language)
            .bind(&request.audio_languages)
            .bind(&request.format)
            .bind(&request.drm_keys)
            .bind(&request.drm_type)
            .bind(&request.license_server_url)
            .bind(&request.drm_headers)
            .bind(&request.proxy_url)
            .bind(&request.doh_url)
            .bind(&request.origin)
            .bind(&request.user_agent)
            .bind(&request.referer)
            .bind(&request.custom_headers)
            .execute(&mut *tx)
            .await?;
        }

        // Commit transaction
        tx.commit().await?;

        // 4. Fetch the fully joined content struct
        let content = self.get_content_by_id(content_id).await?
            .ok_or_else(|| AppError::InternalError("Failed to fetch created content".to_string()))?;

        Ok(content)
    }

    pub async fn create_content_from_tmdb(
        &self,
        request: CreateContentFromTmdbRequest,
    ) -> Result<ContentJoined, AppError> {
        // Verify the category exists
        let category = self.get_category_by_id(request.category_id).await?;
        if category.is_none() {
            return Err(AppError::NotFound);
        }

        // Get TMDB service or return error
        let tmdb_service = self
            .tmdb_service
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("TMDB service not available".to_string()))?;

        // Check if TMDB is available
        if !tmdb_service.is_available().await? {
            return Err(AppError::BadRequest("TMDB API not configured".to_string()));
        }

        // Fetch details from TMDB based on media type (also persist genres into content.genre)
        let (title, description, image_url, backdrop_url, year, genres_str) =
            match request.media_type.as_str() {
                "movie" => {
                    let movie = tmdb_service.get_movie_details(request.tmdb_id).await?;
                    let year = movie
                        .release_date
                        .as_ref()
                        .and_then(|date| TmdbService::extract_year(date));
                    let poster_url = movie
                        .poster_path
                        .as_ref()
                        .map(|path| tmdb_service.build_image_url(path, "w500"));
                    let backdrop_url = movie
                        .backdrop_path
                        .as_ref()
                        .map(|path| tmdb_service.build_image_url(path, "w1280"));
                    let genres_str = if movie.genres.is_empty() {
                        None
                    } else {
                        Some(
                            movie
                                .genres
                                .iter()
                                .map(|g| g.name.clone())
                                .collect::<Vec<_>>()
                                .join(", "),
                        )
                    };

                    tracing::debug!(
                        "TMDB movie backdrop_path={:?}, backdrop_url={:?}",
                        movie.backdrop_path,
                        backdrop_url
                    );

                    (
                        movie.title,
                        movie.overview,
                        poster_url,
                        backdrop_url,
                        year,
                        genres_str,
                    )
                }
                "tv" => {
                    let tv = tmdb_service.get_tv_details(request.tmdb_id).await?;
                    let year = tv
                        .first_air_date
                        .as_ref()
                        .and_then(|date| TmdbService::extract_year(date));
                    let poster_url = tv
                        .poster_path
                        .as_ref()
                        .map(|path| tmdb_service.build_image_url(path, "w500"));
                    let backdrop_url = tv
                        .backdrop_path
                        .as_ref()
                        .map(|path| tmdb_service.build_image_url(path, "w1280"));
                    let genres_str = if tv.genres.is_empty() {
                        None
                    } else {
                        Some(
                            tv.genres
                                .iter()
                                .map(|g| g.name.clone())
                                .collect::<Vec<_>>()
                                .join(", "),
                        )
                    };
                    (
                        tv.name,
                        tv.overview,
                        poster_url,
                        backdrop_url,
                        year,
                        genres_str,
                    )
                }
                _ => {
                    return Err(AppError::BadRequest(
                        "Invalid media type. Must be 'movie' or 'tv'".to_string(),
                    ))
                }
            };

        // Determine media_type from category_type
        let category_type = category.as_ref().unwrap().category_type.as_str();
        let media_type = match category_type {
            "VOD" => "movie",
            "Series" => "series",
            "TV" => "tv_channel",
            "Eventos" => "event",
            "Anime" => "anime",
            "Kids" => "kids",
            _ => "movie",
        };

        // Start transaction
        let mut tx = self.db.begin().await?;

        // 1. Insert into content.media_content
        let content_id: i64 = sqlx::query_scalar(
            r#"
            INSERT INTO content.media_content (category_id, title, description, image_url, media_type, active)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            "#
        )
        .bind(request.category_id)
        .bind(&title)
        .bind(&description)
        .bind(&image_url)
        .bind(media_type)
        .bind(request.active.unwrap_or(true))
        .fetch_one(&mut *tx)
        .await?;

        // 2. Insert into specific tables
        if media_type == "tv_channel" || media_type == "event" {
            sqlx::query(
                r#"
                INSERT INTO content.tv_channels (media_content_id, channel_number, is_live, provider, country, epg_source_id, epg_channel_id, epg_offset_minutes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                "#
            )
            .bind(content_id)
            .bind(None::<i64>)
            .bind(media_type == "tv_channel")
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<i64>)
            .bind(None::<String>)
            .bind(0)
            .execute(&mut *tx)
            .await?;
        } else {
            // Treat as movie/series/anime/kids VOD content
            sqlx::query(
                r#"
                INSERT INTO content.movies (media_content_id, backdrop_url, year, duration, rating, genre, tmdb_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                "#
            )
            .bind(content_id)
            .bind(&backdrop_url)
            .bind(year)
            .bind(None::<i32>)
            .bind(None::<f32>)
            .bind(&genres_str)
            .bind(request.tmdb_id)
            .execute(&mut *tx)
            .await?;
        }

        // 3. Insert into content.media_streams
        if !request.stream_url.is_empty() {
            sqlx::query(
                r#"
                INSERT INTO content.media_streams (
                    media_content_id, stream_url, stream_type, is_default, quality, language, audio_languages,
                    format, drm_keys, drm_type, license_server_url, drm_headers, proxy_url, doh_url,
                    origin, user_agent, referer, custom_headers
                )
                VALUES ($1, $2, 'main', true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                "#
            )
            .bind(content_id)
            .bind(&request.stream_url)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .bind(None::<String>)
            .execute(&mut *tx)
            .await?;
        }

        // Commit transaction
        tx.commit().await?;

        // Store multi-language translations (non-blocking — best-effort)
        if let Some(tmdb_svc) = &self.tmdb_service {
            if let Err(e) = tmdb_svc.store_translations(content_id, request.tmdb_id, &request.media_type).await {
                tracing::warn!("Failed to store TMDB translations for content {}: {}", content_id, e);
            }
        }

        // 4. Fetch the fully joined content struct
        let content = self.get_content_by_id(content_id).await?
            .ok_or_else(|| AppError::InternalError("Failed to fetch created content".to_string()))?;

        Ok(content)
    }

    // Movie-specific content creation (Req 4.2, 7.1)
    pub async fn create_movie(&self, request: CreateMovieRequest) -> Result<ContentJoined, AppError> {
        // Get VOD category
        let vod_category = self
            .get_category_by_type("VOD")
            .await?
            .ok_or_else(|| AppError::BadRequest("VOD category not found".to_string()))?;

        // Create content request
        let content_request = CreateContentRequest {
            category_id: vod_category.id,
            title: request.title,
            description: request.description,
            image_url: request.image_url,
            backdrop_url: None, // Movies can have backdrop_url but not provided in this request
            stream_url: request.stream_url,
            tmdb_id: request.tmdb_id,
            year: request.year,
            genre: None,
            provider: None,
            country: None,
            format: None,
            channel_number: None,
            is_live: None,
            drm_keys: None,
            drm_type: None,
            license_server_url: None,
            drm_headers: None,
            // LiveTV specific headers
            origin: None,
            user_agent: None,
            referer: None,
            custom_headers: None,
            proxy_url: None,
            doh_url: None,
            duration: None,
            rating: None,
            quality: None,
            language: None,
            audio_languages: None,
            epg_source_id: None,
            epg_channel_id: None,
            epg_offset_minutes: None,
            active: None,
        };

        self.create_content_manual(content_request).await
    }

    /// Get the next available TV channel number (max + 1)
    pub async fn get_next_tv_channel_number(&self) -> Result<i64, AppError> {
        // Get TV category id
        let tv_category = self
            .get_category_by_type("TV")
            .await?
            .ok_or_else(|| AppError::BadRequest("TV category not found".to_string()))?;

        let row = sqlx::query(
            r#"
            SELECT MAX(tc.channel_number) as max_cn
            FROM content.tv_channels tc
            JOIN content.media_content mc ON tc.media_content_id = mc.id
            WHERE mc.category_id = $1
            "#,
        )
        .bind(tv_category.id)
        .fetch_one(&self.db)
        .await?;

        let max_cn: Option<i64> = row.try_get("max_cn").ok();
        Ok(max_cn.unwrap_or(0i64) + 1)
    }

    // Get content with decrypted URLs for delivery (Req 8.2)
    pub async fn get_content_for_delivery(
        &self,
        content_id: i64,
    ) -> Result<Option<ContentWithDecryptedUrl>, AppError> {
        let content = self.get_content_by_id(content_id).await?;

        match content {
            Some(content) => {
                // URLs are now direct (no decryption needed)
                let stream_url = content.stream_url.clone();

                // Keep DRM keys in original hexadecimal format
                let drm_keys_hex = content.drm_keys.clone();

                // Attempt to cache TMDB-hosted images locally when TMDB is configured in local mode.
                // This converts image URLs like "https://image.tmdb.org/t/p/w500/xxx.jpg"
                // into "/metadata/images/posters/content_<id>.<ext>" and stores the file under the metadata folder.
                let mut image_url = content.image_url.clone();
                if let Some(tmdb_service) = &self.tmdb_service {
                    if tmdb_service.is_local_mode().await? {
                        if let Some(img) = content.image_url.clone() {
                            if (img.starts_with("http://") || img.starts_with("https://"))
                                && img.contains("image.tmdb.org/t/p/")
                            {
                                // Extract the TMDB remote path (the part after size): e.g. "w500/abc.jpg" -> "/abc.jpg"
                                if let Some(after) = img.split("/t/p/").nth(1) {
                                    if let Some((_, rest)) = after.split_once('/') {
                                        let remote_path = format!("/{}", rest);
                                        // Ensure metadata directories exist and download image
                                        let root = tmdb_service.metadata_root_path().await?;
                                        let preferred_format =
                                            tmdb_service.get_preferred_format().await?;
                                        match tmdb_service
                                            .download_and_store_image(
                                                &remote_path,
                                                &root,
                                                "posters",
                                                &format!("content_{}", content.id),
                                                &preferred_format,
                                            )
                                            .await
                                        {
                                            Ok(Some(local_path)) => {
                                                image_url = Some(local_path);
                                            }
                                            Ok(None) => {
                                                // Download failed; leave original URL
                                            }
                                            Err(e) => {
                                                tracing::warn!(
                                                    "Failed to cache TMDB image for content {}: {}",
                                                    content.id,
                                                    e
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Determine effective DRM type: if license_server_url is set but drm_type is not, assume Widevine
                let effective_drm_type = if content.drm_type.is_some() {
                    content.drm_type.clone()
                } else if content.license_server_url.is_some() {
                    Some("widevine".to_string())
                } else if drm_keys_hex.is_some() {
                    Some("clearkey".to_string())
                } else {
                    None
                };

                let decrypted_content = ContentWithDecryptedUrl {
                    id: content.id,
                    category_id: content.category_id,
                    title: content.title,
                    description: content.description,
                    image_url,
                    stream_url: stream_url.unwrap_or_default(),
                    tmdb_id: content.tmdb_id,
                    year: content.year,
                    channel_number: content.channel_number,
                    created_at: content.created_at.to_rfc3339(),
                    drm_keys: drm_keys_hex,
                    drm_type: effective_drm_type,
                    license_server_url: content.license_server_url,
                    drm_headers: content.drm_headers,
                    proxy_url: content.proxy_url,
                    doh_url: content.doh_url,
                    // Stream request headers (CRITICAL for DRM on Android TV)
                    user_agent: content.user_agent,
                    origin: content.origin,
                    referer: content.referer,
                    custom_headers: content.custom_headers,
                };

                Ok(Some(decrypted_content))
            }
            None => Ok(None),
        }
    }

    /// Resolve translated title/description for a content item based on requested language.
    /// Returns (title, description) — using translations if available, otherwise the base values.
    pub async fn get_content_translation(
        &self,
        content_id: i64,
        language: &str,
    ) -> Result<Option<(String, Option<String>)>, AppError> {
        // Try exact match first (e.g. "en-US")
        let row = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT title, description FROM content.media_content_translations WHERE media_content_id = $1 AND language = $2 LIMIT 1"
        )
        .bind(content_id)
        .bind(language)
        .fetch_optional(&self.db)
        .await?;

        if row.is_some() {
            return Ok(row);
        }

        // Try prefix match (e.g. "en" matches "en-US")
        let lang_prefix = language.split('-').next().unwrap_or(language);
        let row = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT title, description FROM content.media_content_translations WHERE media_content_id = $1 AND language LIKE $2 LIMIT 1"
        )
        .bind(content_id)
        .bind(format!("{}%", lang_prefix))
        .fetch_optional(&self.db)
        .await?;

        Ok(row)
    }

    pub async fn get_content_subtitles(
        &self,
        content_id: i64,
    ) -> Result<Vec<ContentSubtitle>, AppError> {
        let subtitles = sqlx::query_as::<_, ContentSubtitle>(
            r#"
            SELECT id, media_content_id, language, file_path, created_at
            FROM content.media_content_subtitles
            WHERE media_content_id = $1
            ORDER BY created_at ASC
            "#,
        )
        .bind(content_id)
        .fetch_all(&self.db)
        .await?;

        Ok(subtitles)
    }

    pub async fn get_content_subtitle_by_id(
        &self,
        subtitle_id: i64,
    ) -> Result<Option<ContentSubtitle>, AppError> {
        let subtitle = sqlx::query_as::<_, ContentSubtitle>(
            r#"
            SELECT id, media_content_id, language, file_path, created_at
            FROM content.media_content_subtitles
            WHERE id = $1
            LIMIT 1
            "#,
        )
        .bind(subtitle_id)
        .fetch_optional(&self.db)
        .await?;

        Ok(subtitle)
    }

    /// Get content for editing (returns direct URL - no encryption)
    pub async fn get_content_for_edit(&self, id: i64) -> Result<ContentJoined, AppError> {
        // Get the content - URLs are now direct, no decryption needed
        let content = self
            .get_content_by_id(id)
            .await?
            .ok_or(AppError::NotFound)?;

        Ok(content)
    }

    /// Get content with total_seasons for editing (specifically for series)
    pub async fn get_content_with_seasons_for_edit(
        &self,
        id: i64,
    ) -> Result<serde_json::Value, AppError> {
        // Get the content - URLs are now direct
        let content = self.get_content_for_edit(id).await?;

        // Create base content response
        let mut content_json = serde_json::json!({
            "id": content.id,
            "category_id": content.category_id,
            "title": content.title,
            "description": content.description,
            "image_url": content.image_url,
            "backdrop_url": content.backdrop_url,
            "stream_url": content.stream_url, // Direct URL now
            "tmdb_id": content.tmdb_id,
            "year": content.year,
            "active": content.active,
            "created_at": content.created_at,
            "provider": content.provider,
            "country": content.country,
            "format": content.format,
            "channel_number": content.channel_number,
            "is_live": content.is_live,
            "drm_keys": content.drm_keys,
            "drm_type": content.drm_type,
            "license_server_url": content.license_server_url,
            "drm_headers": content.drm_headers.as_ref().and_then(|h| {
                if h.trim().is_empty() { None } else { serde_json::from_str::<serde_json::Value>(h).ok() }
            })
        });

        // For anime and series, add total_seasons count
        // Look up actual category IDs for Series and Anime types dynamically
        let episodic_category_ids: Vec<i64> = sqlx::query_scalar(
            "SELECT id FROM content.categories WHERE category_type IN ('Series', 'Anime')"
        )
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        if episodic_category_ids.contains(&content.category_id) {
            let series = sqlx::query_as::<_, Series>(
                "SELECT id, content_id, total_seasons, created_at FROM content.series WHERE content_id = $1",
            )
            .bind(id)
            .fetch_optional(&self.db)
            .await?;

            if let Some(series) = series {
                content_json["total_seasons"] =
                    serde_json::Value::Number(serde_json::Number::from(series.total_seasons));
            }
        }

        Ok(content_json)
    }

    // Get movies (VOD content) with pagination
    pub async fn get_movies(
        &self,
        page: Option<i32>,
        limit: Option<i32>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        let vod_category = self
            .get_category_by_type("VOD")
            .await?
            .ok_or_else(|| AppError::BadRequest("VOD category not found".to_string()))?;

        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(50).clamp(1, 500); // Increased for large movie collections
        let offset = (page - 1) * limit;

        let sql = format!("{} WHERE mc.category_id = $1 ORDER BY mc.created_at DESC, mc.id DESC LIMIT $2 OFFSET $3", CONTENT_JOIN_SELECT);
        let content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(vod_category.id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        Ok(content)
    }

    // Search content by title
    pub async fn search_content(
        &self,
        query: &str,
        category_type: Option<&str>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        let trimmed_query = query.trim();
        if trimmed_query.is_empty() {
            return Ok(Vec::new());
        }
        let search_pattern = format!("%{}%", trimmed_query);

        let content = if let Some(cat_type) = category_type {
            let normalized_category = Self::normalize_category_type(cat_type)
                .ok_or_else(|| AppError::BadRequest("Invalid category type".to_string()))?;

            let category = self
                .get_category_by_type(normalized_category)
                .await?
                .ok_or_else(|| AppError::BadRequest("Category not found".to_string()))?;

            let sql = format!("{} WHERE mc.category_id = $1 AND (mc.title ILIKE $2 OR mc.description ILIKE $3) ORDER BY mc.title", CONTENT_JOIN_SELECT);
            sqlx::query_as::<_, ContentJoined>(&sql)
            .bind(category.id)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .fetch_all(&self.db)
            .await?
        } else {
            let sql = format!("{} WHERE mc.title ILIKE $1 OR mc.description ILIKE $2 ORDER BY mc.title", CONTENT_JOIN_SELECT);
            sqlx::query_as::<_, ContentJoined>(&sql)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .fetch_all(&self.db)
            .await?
        };

        Ok(content)
    }

    // Get user by ID for access control (Req 1.3, 1.4)
    pub async fn get_user_by_id(&self, user_id: i64) -> Result<crate::models::User, AppError> {
        let mut user = sqlx::query_as::<_, crate::models::User>(
            r#"SELECT id, username, password_hash, email, role, active, credits, created_by, max_devices,
                      expires_at, created_at, daily_demo_limit, demos_created_today,
                      last_demo_reset_date, is_demo, demo_expires_at
               FROM auth.users WHERE id = $1"#
        )
        .bind(user_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or(AppError::NotFound)?;

        // Load subscribed categories (CRITICAL for access verification)
        let category_ids: Vec<i64> =
            sqlx::query_scalar("SELECT category_id FROM billing.user_subscriptions WHERE user_id = $1")
                .bind(user_id)
                .fetch_all(&self.db)
                .await?;

        user.subscribed_categories = if category_ids.is_empty() {
            None
        } else {
            Some(category_ids)
        };

        Ok(user)
    }

    // Get event schedule with decrypted URL for delivery
    pub async fn get_schedule_for_delivery(
        &self,
        schedule_id: i64,
    ) -> Result<Option<ScheduleWithDecryptedUrl>, AppError> {
        let schedule = sqlx::query_as::<_, EventSchedule>(
            "SELECT id, event_id, schedule_date, start_time, end_time, stream_url, title, description, image_url, created_at FROM activity.event_schedules WHERE id = $1"
        )
        .bind(schedule_id)
        .fetch_optional(&self.db)
        .await?;

        match schedule {
            Some(schedule) => {
                // URLs are now direct (no decryption needed)
                let decrypted_url = schedule.stream_url.clone();

                Ok(Some(ScheduleWithDecryptedUrl {
                    id: schedule.id,
                    event_id: schedule.event_id,
                    schedule_date: schedule.schedule_date,
                    start_time: schedule.start_time,
                    end_time: schedule.end_time,
                    stream_url: decrypted_url,
                    title: schedule.title,
                    description: schedule.description,
                    image_url: schedule.image_url,
                    created_at: schedule.created_at,
                }))
            }
            None => Ok(None),
        }
    }

    // Get events scheduled for a specific date
    pub async fn get_events_by_date(
        &self,
        date: chrono::NaiveDate,
    ) -> Result<Vec<EventSchedule>, AppError> {
        let schedules = sqlx::query_as::<_, EventSchedule>(
            "SELECT id, event_id, schedule_date, start_time, end_time, stream_url, title, description, image_url, created_at FROM activity.event_schedules WHERE schedule_date = $1 ORDER BY start_time"
        )
        .bind(date)
        .fetch_all(&self.db)
        .await?;

        Ok(schedules)
    }

    // Get all events with pagination
    pub async fn get_all_events(
        &self,
        page: Option<i32>,
        limit: Option<i32>,
    ) -> Result<Vec<EventWithSchedules>, AppError> {
        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(10).clamp(1, 50);
        let offset = (page - 1) * limit;

        // Get events with pagination
        let events = sqlx::query_as::<_, Event>(
            "SELECT id, content_id, event_type, created_at FROM activity.events ORDER BY id LIMIT $1 OFFSET $2"
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        let mut results = Vec::new();
        for event in events {
            // Get content for this event
            let sql = format!("{} WHERE mc.id = $1", CONTENT_JOIN_SELECT);
            let content = sqlx::query_as::<_, ContentJoined>(&sql)
            .bind(event.content_id)
            .fetch_one(&self.db)
            .await?;

            // Get schedules for this event
            let schedules = sqlx::query_as::<_, EventSchedule>(
                "SELECT id, event_id, schedule_date, start_time, end_time, stream_url, title, description, image_url, created_at FROM activity.event_schedules WHERE event_id = $1 ORDER BY schedule_date, start_time"
            )
            .bind(event.id)
            .fetch_all(&self.db)
            .await?;

            results.push(EventWithSchedules {
                id: event.id,
                content,
                event_type: event.event_type,
                schedules,
                created_at: event.created_at,
            });
        }

        Ok(results)
    }

    // Get seasons for a series
    pub async fn get_series_seasons(&self, series_id: i64) -> Result<Vec<Season>, AppError> {
        let seasons = sqlx::query_as::<_, Season>(
            "SELECT id, series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date, created_at FROM content.seasons WHERE series_id = $1 ORDER BY season_number"
        )
        .bind(series_id)
        .fetch_all(&self.db)
        .await?;

        Ok(seasons)
    }

    // Get episodes for a season
    pub async fn get_season_episodes(&self, season_id: i64) -> Result<Vec<Episode>, AppError> {
        let episodes = sqlx::query_as::<_, Episode>(
            "SELECT id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at FROM content.episodes WHERE season_id = $1 ORDER BY episode_number"
        )
        .bind(season_id)
        .fetch_all(&self.db)
        .await?;

        Ok(episodes)
    }

    // Validation helper methods

    pub fn is_valid_category_type(category_type: &str) -> bool {
        matches!(
            category_type,
            "VOD" | "TV" | "Eventos" | "Kids" | "Anime" | "Series"
        )
    }

    fn normalize_category_type(category_type: &str) -> Option<&'static str> {
        let normalized = category_type.trim().to_lowercase();
        match normalized.as_str() {
            "vod" | "movie" | "movies" | "peliculas" | "películas" => Some("VOD"),
            "tv" | "live" | "channel" | "channels" | "livetv" => Some("TV"),
            "eventos" | "eventos deportivos" | "events" | "event" => Some("Eventos"),
            "kids" | "kid" | "children" | "infantil" => Some("Kids"),
            "anime" => Some("Anime"),
            "series" | "shows" | "show" | "tvshows" | "tvshow" => Some("Series"),
            _ => None,
        }
    }
}

mod epg;
mod scan;
mod scan_parsers;
mod scan_tmdb;
mod series_details;
mod subtitles;
mod tmdb;
mod tv_channel_categories;
mod tv_providers;

pub use scan::{ScanFolderIngestRequest, ScanFolderIngestResult};
pub use tv_providers::{CreateTvProviderRequest, TvProviderRecord};
