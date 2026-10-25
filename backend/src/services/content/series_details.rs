use super::*;

impl ContentService {
    // Get series by content ID with full details
    pub async fn get_series_by_content_id(
        &self,
        content_id: i64,
    ) -> Result<Option<SeriesWithDetails>, AppError> {
        // Get series and content
        let series_data = sqlx::query_as::<_, SeriesData>(
            r#"
            SELECT s.id, s.content_id, s.total_seasons, s.created_at as series_created_at,
                   c.category_id, c.title, c.description, c.image_url, c.backdrop_url,
                   c.stream_url, c.tmdb_id, c.year, c.created_at as content_created_at
            FROM content.series s
            JOIN content.media_content c ON s.content_id = c.id
            WHERE s.content_id = $1
            "#,
        )
        .bind(content_id)
        .fetch_optional(&self.db)
        .await?;

        match series_data {
            Some(data) => {
                let content = crate::models::ContentJoined {
                    id: data.content_id.unwrap_or(0),
                    category_id: data.category_id.unwrap_or(0),
                    title: data.title,
                    description: data.description,
                    image_url: data.image_url,
                    backdrop_url: data.backdrop_url,
                    stream_url: data.stream_url,
                    tmdb_id: data.tmdb_id,
                    year: data.year,
                    genre: None,
                    created_at: data.content_created_at.unwrap_or_else(Utc::now),
                    provider: None,
                    country: None,
                    active: true,
                    format: None,
                    channel_number: None,
                    is_live: None,
                    drm_keys: None,
                    drm_type: None,
                    license_server_url: None,
                    drm_headers: None,
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
                    media_type: "series".to_string(),
                    channel_category: None,
                    epg_source_id: None,
                    epg_channel_id: None,
                    epg_offset_minutes: None,
                    stream_id: None,
                    stream_type: None,
                    category_type: None,
                };

                // Get seasons with episodes (apply filter based on config)
                let series_id = data.id;
                let filter_empty = self.should_hide_empty_episodes().await;
                let seasons = self
                    .get_seasons_with_episodes_filtered(series_id, filter_empty)
                    .await?;

                Ok(Some(SeriesWithDetails {
                    id: series_id,
                    content,
                    total_seasons: data.total_seasons,
                    seasons,
                    created_at: data.series_created_at.unwrap_or_else(Utc::now),
                }))
            }
            None => Ok(None),
        }
    }

    // Get series by ID with full details
    pub async fn get_series_by_id(&self, id: i64) -> Result<Option<SeriesWithDetails>, AppError> {
        // Get series and content
        let series_data = sqlx::query_as::<_, SeriesData>(
            r#"
            SELECT s.id, s.content_id, s.total_seasons, s.created_at as series_created_at,
                   c.category_id, c.title, c.description, c.image_url, c.backdrop_url,
                   c.stream_url, c.tmdb_id, c.year, c.created_at as content_created_at
            FROM content.series s
            JOIN content.media_content c ON s.content_id = c.id
            WHERE s.id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        match series_data {
            Some(data) => {
                let content = crate::models::ContentJoined {
                    id: data.content_id.unwrap_or(0),
                    category_id: data.category_id.unwrap_or(0),
                    title: data.title,
                    description: data.description,
                    image_url: data.image_url,
                    backdrop_url: data.backdrop_url,
                    stream_url: data.stream_url,
                    tmdb_id: data.tmdb_id,
                    year: data.year,
                    genre: None,
                    created_at: data.content_created_at.unwrap_or_else(Utc::now),
                    provider: None,
                    country: None,
                    active: true,
                    format: None,
                    channel_number: None,
                    is_live: None,
                    drm_keys: None,
                    drm_type: None,
                    license_server_url: None,
                    drm_headers: None,
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
                    media_type: "series".to_string(),
                    channel_category: None,
                    epg_source_id: None,
                    epg_channel_id: None,
                    epg_offset_minutes: None,
                    stream_id: None,
                    stream_type: None,
                    category_type: None,
                };

                // Get seasons with episodes (apply filter based on config)
                let filter_empty = self.should_hide_empty_episodes().await;
                let seasons = self
                    .get_seasons_with_episodes_filtered(id, filter_empty)
                    .await?;

                Ok(Some(SeriesWithDetails {
                    id: data.id,
                    content,
                    total_seasons: data.total_seasons,
                    seasons,
                    created_at: data.series_created_at.unwrap_or_else(Utc::now),
                }))
            }
            None => Ok(None),
        }
    }

    // Get seasons with episodes for a series
    // If filter_empty is true, only returns episodes that have a video URL
    async fn get_seasons_with_episodes(
        &self,
        series_id: i64,
    ) -> Result<Vec<SeasonWithEpisodes>, AppError> {
        self.get_seasons_with_episodes_filtered(series_id, false)
            .await
    }

    // Get seasons with episodes, optionally filtering out empty episodes
    async fn get_seasons_with_episodes_filtered(
        &self,
        series_id: i64,
        filter_empty: bool,
    ) -> Result<Vec<SeasonWithEpisodes>, AppError> {
        let seasons = sqlx::query_as::<_, Season>(
            "SELECT id, series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date, created_at FROM content.seasons WHERE series_id = $1 ORDER BY season_number"
        )
        .bind(series_id)
        .fetch_all(&self.db)
        .await?;

        if seasons.is_empty() {
            return Ok(Vec::new());
        }

        // Batch load ALL episodes for ALL seasons in a single query (eliminates N+1)
        let season_ids: Vec<i64> = seasons.iter().map(|s| s.id).collect();

        // Build dynamic placeholders for IN clause
        let placeholders = season_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");

        let sql = if filter_empty {
            format!(
                "SELECT id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at FROM content.episodes WHERE season_id IN ({}) AND stream_url IS NOT NULL AND stream_url != '' ORDER BY season_id, episode_number",
                placeholders
            )
        } else {
            format!(
                "SELECT id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at FROM content.episodes WHERE season_id IN ({}) ORDER BY season_id, episode_number",
                placeholders
            )
        };

        let mut query = sqlx::query_as::<_, Episode>(&sql);
        for id in &season_ids {
            query = query.bind(id);
        }
        let all_episodes = query.fetch_all(&self.db).await?;

        // Group episodes by season_id in memory
        let mut episodes_by_season: std::collections::HashMap<i64, Vec<Episode>> =
            std::collections::HashMap::new();
        for episode in all_episodes {
            episodes_by_season
                .entry(episode.season_id)
                .or_default()
                .push(episode);
        }

        // Build result with pre-loaded episodes
        let mut seasons_with_episodes = Vec::new();
        for season in seasons {
            let episodes = episodes_by_season.remove(&season.id).unwrap_or_default();

            // Only include season if it has episodes (when filtering)
            if !filter_empty || !episodes.is_empty() {
                seasons_with_episodes.push(SeasonWithEpisodes {
                    id: season.id,
                    series_id: season.series_id,
                    season_number: season.season_number,
                    total_episodes: if filter_empty {
                        episodes.len() as i32
                    } else {
                        season.total_episodes
                    },
                    title: season.title,
                    description: season.description,
                    image_url: season.image_url,
                    poster_url: season.poster_url,
                    backdrop_url: season.backdrop_url,
                    tmdb_id: season.tmdb_id,
                    air_date: season.air_date,
                    episodes,
                    created_at: season.created_at,
                });
            }
        }

        Ok(seasons_with_episodes)
    }

    // Search series by title or TMDB ID (Req 6.1)
    pub async fn search_series(&self, query: &str) -> Result<Vec<SeriesWithDetails>, AppError> {
        let search_pattern = format!("%{}%", query);
        let tmdb_id = query.parse::<i64>().unwrap_or(-1);

        // Search by title or TMDB ID
        let series_data = sqlx::query_as::<_, SeriesData>(
            r#"
            SELECT s.id, s.content_id, s.total_seasons, s.created_at as series_created_at,
                   c.category_id, c.title, c.description, c.image_url, c.backdrop_url,
                   c.stream_url, c.tmdb_id, c.year, c.created_at as content_created_at
            FROM content.series s
            JOIN content.media_content c ON s.content_id = c.id
            WHERE c.title LIKE $1 OR c.description LIKE $2 OR c.tmdb_id = $3
            ORDER BY c.title
            LIMIT 20
            "#,
        )
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(tmdb_id)
        .fetch_all(&self.db)
        .await?;

        let mut results = Vec::new();
        for data in series_data {
            let content = crate::models::ContentJoined {
                id: data.content_id.unwrap_or(0),
                category_id: data.category_id.unwrap_or(0),
                title: data.title,
                description: data.description,
                image_url: data.image_url,
                backdrop_url: data.backdrop_url,
                stream_url: data.stream_url,
                tmdb_id: data.tmdb_id,
                year: data.year,
                genre: None,
                created_at: data.content_created_at.unwrap_or_else(Utc::now),
                provider: None,
                country: None,
                format: None,
                channel_number: None,
                active: true,
                is_live: None,
                drm_keys: None,
                drm_type: None,
                license_server_url: None,
                drm_headers: None,
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
                media_type: "series".to_string(),
                channel_category: None,
                epg_source_id: None,
                epg_channel_id: None,
                epg_offset_minutes: None,
                stream_id: None,
                stream_type: None,
                category_type: None,
            };

            let seasons = self.get_seasons_with_episodes(data.id).await?;

            results.push(SeriesWithDetails {
                id: data.id,
                content,
                total_seasons: data.total_seasons,
                seasons,
                created_at: data.series_created_at.unwrap_or_else(Utc::now),
            });
        }

        Ok(results)
    }

    // Get all series with pagination (excludes Anime category)
    pub async fn get_all_series(
        &self,
        page: Option<i32>,
        limit: Option<i32>,
    ) -> Result<Vec<SeriesWithDetails>, AppError> {
        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(10).clamp(1, 50);
        let offset = (page - 1) * limit;

        // Get Anime category ID to exclude it from regular series
        let anime_category_id = self
            .get_category_by_type("Anime")
            .await?
            .map(|c| c.id)
            .unwrap_or(-1); // Use -1 if Anime category doesn't exist

        let series_data = sqlx::query_as::<_, SeriesData>(
            r#"
            SELECT s.id, s.content_id, s.total_seasons, s.created_at as series_created_at,
                   c.category_id, c.title, c.description, c.image_url, c.backdrop_url,
                   c.stream_url, c.tmdb_id, c.year, c.created_at as content_created_at
            FROM content.series s
            JOIN content.media_content c ON s.content_id = c.id
            WHERE c.category_id != $1
            ORDER BY c.created_at DESC, c.id DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(anime_category_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        let mut results = Vec::new();
        for data in series_data {
            let content = crate::models::ContentJoined {
                id: data.content_id.unwrap_or(0),
                category_id: data.category_id.unwrap_or(0),
                title: data.title,
                description: data.description,
                image_url: data.image_url,
                backdrop_url: data.backdrop_url,
                stream_url: data.stream_url,
                tmdb_id: data.tmdb_id,
                year: data.year,
                genre: None,
                created_at: data.content_created_at.unwrap_or_else(Utc::now),
                provider: None,
                country: None,
                format: None,
                channel_number: None,
                is_live: None,
                active: true,
                drm_keys: None,
                drm_type: None,
                license_server_url: None,
                drm_headers: None,
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
                media_type: "series".to_string(),
                channel_category: None,
                epg_source_id: None,
                epg_channel_id: None,
                epg_offset_minutes: None,
                stream_id: None,
                stream_type: None,
                category_type: None,
            };

            let seasons = self.get_seasons_with_episodes(data.id).await?;

            results.push(SeriesWithDetails {
                id: data.id,
                content,
                total_seasons: data.total_seasons,
                seasons,
                created_at: data.series_created_at.unwrap_or_else(Utc::now),
            });
        }

        Ok(results)
    }
}
