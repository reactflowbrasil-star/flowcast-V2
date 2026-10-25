use crate::error::AppError;
use crate::models::{
    Episode, EpisodeSubtitle, EpisodeWithDecryptedUrl, Season, SeasonWithEpisodes,
    Series, SeriesWithDetails,
};
use crate::services::TmdbService;
use super::types::*;


use super::ContentService;

impl ContentService {

    /// Public wrapper around create_season_internal for bulk import
    pub async fn create_season_for_bulk(
        &self,
        series_id: i64,
        season_number: i32,
    ) -> Result<Season, AppError> {
        self.create_season_internal(series_id, season_number).await
    }


    // Series management methods (Req 6.1, 6.2, 6.3, 6.4, 6.5, 6.6)

    // Create series manually (Req 6.4, 6.5)
    pub async fn create_series_manual(
        &self,
        request: CreateSeriesRequest,
    ) -> Result<SeriesWithDetails, AppError> {
        // Get category — use requested category_type or default to Series
        let cat_type = request.category_type.as_deref().unwrap_or("Series");
        let series_category = self
            .get_category_by_type(cat_type)
            .await?
            .ok_or_else(|| AppError::BadRequest(format!("{} category not found", cat_type)))?;

        // Create content entry for the series
        let content_request = CreateContentRequest {
            category_id: series_category.id,
            title: request.title,
            description: request.description,
            image_url: request.image_url,
            backdrop_url: None, // Series can have backdrop but not provided in this request
            stream_url: "".to_string(), // Series don't have direct stream URLs
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

        let content = self.create_content_manual(content_request).await?;

        // Create series entry
        let series = sqlx::query_as::<_, Series>(
            r#"
            INSERT INTO content.series (content_id, total_seasons)
            VALUES ($1, $2)
            RETURNING id, content_id, total_seasons, created_at
            "#,
        )
        .bind(content.id)
        .bind(request.total_seasons)
        .fetch_one(&self.db)
        .await?;

        // Create seasons for the series
        let mut seasons = Vec::new();
        for season_num in 1..=request.total_seasons {
            let season = self.create_season_internal(series.id, season_num).await?;

            // Insert episodes for this season if provided by frontend
            let mut episode_list = Vec::new();
            if let Some(ref season_inputs) = request.episodes_by_season {
                if let Some(season_input) = season_inputs.iter().find(|s| s.season_number == season_num) {
                    for ep in &season_input.episodes {
                        if ep.video_url.trim().is_empty() {
                            continue;
                        }
                        let episode = sqlx::query_as::<_, Episode>(
                            r#"INSERT INTO content.episodes (season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date)
                            VALUES ($1, $2, $3, NULL, $4, NULL, NULL, NULL, NULL)
                            RETURNING id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at"#
                        )
                        .bind(season.id)
                        .bind(ep.episode_number)
                        .bind(&ep.title)
                        .bind(&ep.video_url)
                        .fetch_one(&self.db)
                        .await?;
                        episode_list.push(episode);
                    }
                }
            }

            seasons.push(SeasonWithEpisodes {
                id: season.id,
                series_id: season.series_id,
                season_number: season.season_number,
                total_episodes: season.total_episodes,
                title: season.title,
                description: season.description,
                image_url: season.image_url,
                poster_url: season.poster_url,
                backdrop_url: season.backdrop_url,
                tmdb_id: season.tmdb_id,
                air_date: season.air_date,
                episodes: episode_list,
                created_at: season.created_at,
            });
        }

        Ok(SeriesWithDetails {
            id: series.id,
            content,
            total_seasons: series.total_seasons,
            seasons,
            created_at: series.created_at,
        })
    }


    // Create series from TMDB (Req 6.1, 6.2)
    pub async fn create_series_from_tmdb(
        &self,
        request: CreateSeriesFromTmdbRequest,
    ) -> Result<SeriesWithDetails, AppError> {
        // Get TMDB service or return error
        let tmdb_service = self
            .tmdb_service
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("TMDB service not available".to_string()))?;

        // Check if TMDB is available
        if !tmdb_service.is_available().await? {
            return Err(AppError::BadRequest("TMDB API not configured".to_string()));
        }

        // Fetch TV show details from TMDB
        let tv_details = tmdb_service.get_tv_details(request.tmdb_id).await?;
        let year = tv_details
            .first_air_date
            .as_ref()
            .and_then(|date| TmdbService::extract_year(date));
        let poster_url = tv_details
            .poster_path
            .map(|path| tmdb_service.build_image_url(&path, "w500"));
        let backdrop_url = tv_details
            .backdrop_path
            .map(|path| tmdb_service.build_image_url(&path, "w1280"));

        // Get series category
        let series_category = self
            .get_category_by_type("Series")
            .await?
            .ok_or_else(|| AppError::BadRequest("Series category not found".to_string()))?;

        // Create content entry for the series
        let content_request = CreateContentRequest {
            category_id: series_category.id,
            title: tv_details.name.clone(),
            description: tv_details.overview.clone(),
            image_url: poster_url.clone(),
            backdrop_url: backdrop_url.clone(),
            stream_url: "".to_string(), // Series don't have direct stream URLs
            tmdb_id: Some(request.tmdb_id),
            year,
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

        let content = self.create_content_manual(content_request).await?;

        // Create series entry
        let series = sqlx::query_as::<_, Series>(
            r#"
            INSERT INTO content.series (content_id, total_seasons)
            VALUES ($1, $2)
            RETURNING id, content_id, total_seasons, created_at
            "#,
        )
        .bind(content.id)
        .bind(tv_details.number_of_seasons)
        .fetch_one(&self.db)
        .await?;

        // Create seasons with episodes from TMDB
        let mut seasons_with_episodes = Vec::new();
        for season_num in 1..=tv_details.number_of_seasons {
            // Get season details from TMDB first
            let season_details = tmdb_service
                .get_season_details(request.tmdb_id, season_num)
                .await?;

            // Prepare season data from TMDB
            let season_title = season_details.name.clone();
            let season_description = season_details.overview.clone();
            let season_poster = season_details
                .poster_path
                .as_ref()
                .map(|path| tmdb_service.build_image_url(path, "w500"));

            // Create season with TMDB data
            let season = self
                .create_season_with_tmdb_data(
                    series.id,
                    season_num,
                    season_title,
                    season_description,
                    season_poster,
                )
                .await?;

            // Create episodes for this season
            let mut episodes = Vec::new();
            for episode_data in season_details.episodes {
                let episode_poster = episode_data
                    .still_path
                    .map(|path| tmdb_service.build_image_url(&path, "w500"));

                // Check if we have a URL for this episode
                let episode_key = format!("{}-{}", season_num, episode_data.episode_number);
                let episode_url = request
                    .episode_urls
                    .as_ref()
                    .and_then(|urls| urls.get(&episode_key))
                    .cloned()
                    .unwrap_or_default(); // Empty string — upsert_episode will fill the real path later

                // Create episode with URL if provided
                let episode = sqlx::query_as::<_, Episode>(
                    r#"
                    INSERT INTO content.episodes (season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at
                    "#
                )
                .bind(season.id)
                .bind(episode_data.episode_number)
                .bind(episode_data.name)
                .bind(episode_data.overview)
                .bind(episode_url) // Use provided URL or empty string
                .bind(episode_poster)
                .bind(episode_data.runtime) // duration from TMDB
                .bind(episode_data.id) // tmdb_id
                .bind(episode_data.air_date.clone()) // air_date from TMDB
                .fetch_one(&self.db)
                .await?;

                episodes.push(episode);
            }

            // Update season total_episodes count
            let episode_count = episodes.len() as i32;
            sqlx::query("UPDATE content.seasons SET total_episodes = $1 WHERE id = $2")
                .bind(episode_count)
                .bind(season.id)
                .execute(&self.db)
                .await?;

            seasons_with_episodes.push(SeasonWithEpisodes {
                id: season.id,
                series_id: season.series_id,
                season_number: season.season_number,
                total_episodes: episodes.len() as i32,
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

        Ok(SeriesWithDetails {
            id: series.id,
            content,
            total_seasons: series.total_seasons,
            seasons: seasons_with_episodes,
            created_at: series.created_at,
        })
    }


    // Create anime series from TMDB (similar to regular series but in anime category)
    pub async fn create_anime_series_from_tmdb(
        &self,
        request: CreateAnimeSeriesFromTmdbRequest,
    ) -> Result<SeriesWithDetails, AppError> {
        // Get TMDB service or return error
        let tmdb_service = self
            .tmdb_service
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("TMDB service not available".to_string()))?;

        // Check if TMDB is available
        if !tmdb_service.is_available().await? {
            return Err(AppError::BadRequest(
                "TMDB service is not available".to_string(),
            ));
        }

        // Get anime category
        let anime_category = self
            .get_category_by_type("Anime")
            .await?
            .ok_or_else(|| AppError::BadRequest("Anime category not found".to_string()))?;

        // Get TV show details from TMDB
        let tv_details = tmdb_service.get_tv_details(request.tmdb_id).await?;

        // Extract year from first air date
        let year = tv_details
            .first_air_date
            .as_ref()
            .and_then(|date| TmdbService::extract_year(date));

        // Build poster URL
        let poster_url = tv_details
            .poster_path
            .map(|path| tmdb_service.build_image_url(&path, "w500"));
        let backdrop_url = tv_details
            .backdrop_path
            .map(|path| tmdb_service.build_image_url(&path, "w1280"));

        // Create content entry for anime series using the standard method
        let content_request = CreateContentRequest {
            category_id: anime_category.id,
            title: tv_details.name.clone(),
            description: tv_details.overview.clone(),
            image_url: poster_url,
            backdrop_url,
            stream_url: "".to_string(),
            tmdb_id: Some(request.tmdb_id),
            year,
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

        let content = self.create_content_manual(content_request).await?;

        // Create series entry
        let series = sqlx::query_as::<_, Series>(
            r#"
            INSERT INTO content.series (content_id, total_seasons)
            VALUES ($1, $2)
            RETURNING id, content_id, total_seasons, created_at
            "#,
        )
        .bind(content.id)
        .bind(tv_details.number_of_seasons)
        .fetch_one(&self.db)
        .await?;

        // Create seasons and episodes with URLs if provided
        let mut seasons_with_episodes = Vec::new();
        for season_number in 1..=tv_details.number_of_seasons {
            // Get season details from TMDB
            let season_details = tmdb_service
                .get_season_details(request.tmdb_id, season_number)
                .await?;

            // Prepare season data from TMDB
            let season_title = season_details.name.clone();
            let season_description = season_details.overview.clone();
            let season_poster = season_details
                .poster_path
                .as_ref()
                .map(|path| tmdb_service.build_image_url(path, "w500"));

            // Create season with TMDB data
            let season = self
                .create_season_with_tmdb_data(
                    series.id,
                    season_number,
                    season_title,
                    season_description,
                    season_poster,
                )
                .await?;

            // Create episodes for this season
            let mut episodes = Vec::new();
            for episode in season_details.episodes {
                let episode_key = format!("{}-{}", season_number, episode.episode_number);
                let episode_url = request
                    .episode_urls
                    .as_ref()
                    .and_then(|urls| urls.get(&episode_key))
                    .cloned()
                    .unwrap_or_default();

                // Create episode (with or without URL)
                let episode_request = CreateEpisodeRequest {
                    season_id: season.id,
                    episode_number: episode.episode_number,
                    title: episode.name.clone(),
                    description: episode.overview.clone(),
                    stream_url: episode_url, // Can be empty string if no URL provided
                    image_url: episode
                        .still_path
                        .as_ref()
                        .map(|path| tmdb_service.build_image_url(path, "w300")),
                    duration: episode.runtime,
                    tmdb_id: Some(episode.id),
                    air_date: episode.air_date.clone(),
                };
                let created_episode = self.create_episode(episode_request).await?;
                episodes.push(created_episode);
            }

            seasons_with_episodes.push(SeasonWithEpisodes {
                id: season.id,
                series_id: season.series_id,
                season_number: season.season_number,
                total_episodes: episodes.len() as i32,
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

        Ok(SeriesWithDetails {
            id: series.id,
            content,
            total_seasons: series.total_seasons,
            seasons: seasons_with_episodes,
            created_at: series.created_at,
        })
    }


    // Internal method to create a season
    async fn create_season_internal(
        &self,
        series_id: i64,
        season_number: i32,
    ) -> Result<Season, AppError> {
        let season = sqlx::query_as::<_, Season>(
            r#"
            INSERT INTO content.seasons (series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date)
            VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date, created_at
            "#
        )
        .bind(series_id)
        .bind(season_number)
        .bind(format!("Season {}", season_number))
        .bind(None::<String>) // description
        .bind(None::<String>) // image_url
        .bind(None::<String>) // poster_url
        .bind(None::<String>) // backdrop_url
        .bind(None::<i64>)    // tmdb_id
        .bind(None::<String>) // air_date
        .fetch_one(&self.db)
        .await?;

        Ok(season)
    }


    // Internal method to create a season with TMDB data
    async fn create_season_with_tmdb_data(
        &self,
        series_id: i64,
        season_number: i32,
        title: String,
        description: Option<String>,
        poster_url: Option<String>,
    ) -> Result<Season, AppError> {
        let season = sqlx::query_as::<_, Season>(
            r#"
            INSERT INTO content.seasons (series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date)
            VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date, created_at
            "#
        )
        .bind(series_id)
        .bind(season_number)
        .bind(title)
        .bind(description)
        .bind(None::<String>) // image_url
        .bind(poster_url)
        .bind(None::<String>) // backdrop_url
        .bind(None::<i64>)    // tmdb_id
        .bind(None::<String>) // air_date
        .fetch_one(&self.db)
        .await?;

        Ok(season)
    }


    // Create season manually
    pub async fn create_season(&self, request: CreateSeasonRequest) -> Result<Season, AppError> {
        // Verify series exists
        let _series = self
            .get_series_by_id(request.series_id)
            .await?
            .ok_or_else(|| AppError::NotFound)?;

        // Check if season already exists
        let existing = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM content.seasons WHERE series_id = $1 AND season_number = $2",
        )
        .bind(request.series_id)
        .bind(request.season_number)
        .fetch_one(&self.db)
        .await?;

        if existing > 0 {
            return Err(AppError::BadRequest("Season already exists".to_string()));
        }

        self.create_season_internal(request.series_id, request.season_number)
            .await
    }


    // Episode management methods (Req 6.3, 6.5, 6.6)

    // Create single episode (Req 6.3)
    pub async fn create_episode(&self, request: CreateEpisodeRequest) -> Result<Episode, AppError> {
        // Verify season exists
        let _season = sqlx::query_as::<_, Season>(
            "SELECT id, series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date, created_at FROM content.seasons WHERE id = $1"
        )
        .bind(request.season_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| AppError::NotFound)?;

        // Check if episode already exists
        let existing = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM content.episodes WHERE season_id = $1 AND episode_number = $2",
        )
        .bind(request.season_id)
        .bind(request.episode_number)
        .fetch_one(&self.db)
        .await?;

        if existing > 0 {
            return Err(AppError::BadRequest("Episode already exists".to_string()));
        }

        // Store stream URL directly (no encryption)
        let stream_url = request.stream_url;

        // Create episode
        let episode = sqlx::query_as::<_, Episode>(
            r#"
            INSERT INTO content.episodes (season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at
            "#
        )
        .bind(request.season_id)
        .bind(request.episode_number)
        .bind(&request.title)
        .bind(&request.description)
        .bind(&stream_url)
        .bind(&request.image_url)
        .bind(request.duration)
        .bind(request.tmdb_id)
        .bind(&request.air_date)
        .fetch_one(&self.db)
        .await?;

        // Update season's total episodes count
        sqlx::query(
            "UPDATE content.seasons SET total_episodes = (SELECT COUNT(*) FROM content.episodes WHERE season_id = $1) WHERE id = $2"
        )
        .bind(request.season_id)
        .bind(request.season_id)
        .execute(&self.db)
        .await?;

        Ok(episode)
    }


    // Create multiple episodes for rapid insertion (Req 6.6)
    pub async fn create_multiple_episodes(
        &self,
        request: CreateMultipleEpisodesRequest,
    ) -> Result<Vec<Episode>, AppError> {
        // Verify season exists
        let _season = sqlx::query_as::<_, Season>(
            "SELECT id, series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date, created_at FROM content.seasons WHERE id = $1"
        )
        .bind(request.season_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| AppError::NotFound)?;

        let mut created_episodes = Vec::new();

        // Create episodes in a transaction for consistency
        let mut tx = self.db.begin().await?;

        for episode_data in request.episodes {
            // Check if episode already exists
            let existing = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM content.episodes WHERE season_id = $1 AND episode_number = $2",
            )
            .bind(request.season_id)
            .bind(episode_data.episode_number)
            .fetch_one(&mut *tx)
            .await?;

            if existing > 0 {
                return Err(AppError::BadRequest(format!(
                    "Episode {} already exists",
                    episode_data.episode_number
                )));
            }

            // Store stream URL directly
            let stream_url = episode_data.stream_url;

            // Create episode
            let episode = sqlx::query_as::<_, Episode>(
                r#"
                INSERT INTO content.episodes (season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at
                "#
            )
            .bind(request.season_id)
            .bind(episode_data.episode_number)
            .bind(&episode_data.title)
            .bind(&episode_data.description)
            .bind(&stream_url)
            .bind(&episode_data.image_url)
            .bind(episode_data.duration)
            .bind(episode_data.tmdb_id)
            .bind(&episode_data.air_date)
            .fetch_one(&mut *tx)
            .await?;

            created_episodes.push(episode);
        }

        // Update season's total episodes count
        sqlx::query(
            "UPDATE content.seasons SET total_episodes = (SELECT COUNT(*) FROM content.episodes WHERE season_id = $1) WHERE id = $2"
        )
        .bind(request.season_id)
        .bind(request.season_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(created_episodes)
    }


    // Update episode
    pub async fn update_episode(
        &self,
        episode_id: i64,
        request: UpdateEpisodeRequest,
    ) -> Result<Episode, AppError> {
        // Get current episode to preserve existing values
        let current_episode = sqlx::query_as::<_, Episode>(
            "SELECT id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at FROM content.episodes WHERE id = $1"
        )
        .bind(episode_id)
        .fetch_one(&self.db)
        .await?;

        // Use provided values or keep existing ones
        let title = request.title.unwrap_or(current_episode.title);
        let description = request.description.or(current_episode.description);
        let image_url = request.image_url.or(current_episode.image_url);

        // Handle stream URL directly
        let stream_url = if let Some(stream_url) = request.stream_url {
            stream_url
        } else {
            current_episode.stream_url
        };

        // Use provided values or keep existing ones for optional metadata
        let duration = request.duration.or(current_episode.duration);
        let tmdb_id = request.tmdb_id.or(current_episode.tmdb_id);
        let air_date = request.air_date.or(current_episode.air_date);

        // Update the episode
        let updated_episode = sqlx::query_as::<_, Episode>(
            r#"
            UPDATE content.episodes
            SET title = $1, description = $2, stream_url = $3, image_url = $4, duration = $5, tmdb_id = $6, air_date = $7
            WHERE id = $8
            RETURNING id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at
            "#
        )
        .bind(&title)
        .bind(&description)
        .bind(&stream_url)
        .bind(&image_url)
        .bind(duration)
        .bind(tmdb_id)
        .bind(&air_date)
        .bind(episode_id)
        .fetch_one(&self.db)
        .await?;

        Ok(updated_episode)
    }

    /// Delete an episode by ID and update the parent season's total_episodes count.
    pub async fn delete_episode(&self, episode_id: i64) -> Result<(), AppError> {
        // Get the season_id before deleting so we can update the count
        let season_id: Option<i64> = sqlx::query_scalar(
            "SELECT season_id FROM content.episodes WHERE id = $1"
        )
        .bind(episode_id)
        .fetch_optional(&self.db)
        .await?;

        // Delete the episode
        let result = sqlx::query("DELETE FROM content.episodes WHERE id = $1")
            .bind(episode_id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }

        // Update the season's total_episodes count
        if let Some(sid) = season_id {
            sqlx::query(
                "UPDATE content.seasons SET total_episodes = (SELECT COUNT(*) FROM content.episodes WHERE season_id = $1) WHERE id = $1"
            )
            .bind(sid)
            .execute(&self.db)
            .await?;
        }

        Ok(())
    }

    /// Delete a season by ID: removes all its episodes first (no CASCADE FK),
    /// then the season row, and finally updates the parent series' total_seasons.
    pub async fn delete_season(&self, season_id: i64) -> Result<(), AppError> {
        // Get the series_id before deleting so we can update the count
        let series_id: Option<i64> = sqlx::query_scalar(
            "SELECT series_id FROM content.seasons WHERE id = $1"
        )
        .bind(season_id)
        .fetch_optional(&self.db)
        .await?;

        // Delete all episodes in this season first (FK has no CASCADE)
        sqlx::query("DELETE FROM content.episodes WHERE season_id = $1")
            .bind(season_id)
            .execute(&self.db)
            .await?;

        // Delete the season itself
        let result = sqlx::query("DELETE FROM content.seasons WHERE id = $1")
            .bind(season_id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }

        // Update the series' total_seasons count
        if let Some(sid) = series_id {
            sqlx::query(
                "UPDATE content.series SET total_seasons = (SELECT COUNT(*) FROM content.seasons WHERE series_id = $1) WHERE id = $1"
            )
            .bind(sid)
            .execute(&self.db)
            .await?;
        }

        Ok(())
    }

    // Get episode with decrypted URL for delivery
    pub async fn get_episode_for_delivery(
        &self,
        episode_id: i64,
    ) -> Result<Option<EpisodeWithDecryptedUrl>, AppError> {
        let episode = sqlx::query_as::<_, Episode>(
            "SELECT id, season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date, created_at FROM content.episodes WHERE id = $1"
        )
        .bind(episode_id)
        .fetch_optional(&self.db)
        .await?;

        match episode {
            Some(episode) => {
                // URLs are now direct (no decryption needed)
                let decrypted_url = episode.stream_url.clone();

                Ok(Some(EpisodeWithDecryptedUrl {
                    id: episode.id,
                    season_id: episode.season_id,
                    episode_number: episode.episode_number,
                    title: episode.title,
                    description: episode.description,
                    stream_url: decrypted_url,
                    image_url: episode.image_url,
                    created_at: episode.created_at,
                }))
            }
            None => Ok(None),
        }
    }


    pub async fn get_episode_subtitles(
        &self,
        episode_id: i64,
    ) -> Result<Vec<EpisodeSubtitle>, AppError> {
        let subtitles = sqlx::query_as::<_, EpisodeSubtitle>(
            r#"
            SELECT id, episode_id, language, file_path, created_at
            FROM content.episode_subtitles
            WHERE episode_id = $1
            ORDER BY created_at ASC
            "#,
        )
        .bind(episode_id)
        .fetch_all(&self.db)
        .await?;

        Ok(subtitles)
    }


    pub async fn get_episode_subtitle_by_id(
        &self,
        subtitle_id: i64,
    ) -> Result<Option<EpisodeSubtitle>, AppError> {
        let subtitle = sqlx::query_as::<_, EpisodeSubtitle>(
            r#"
            SELECT id, episode_id, language, file_path, created_at
            FROM content.episode_subtitles
            WHERE id = $1
            LIMIT 1
            "#,
        )
        .bind(subtitle_id)
        .fetch_optional(&self.db)
        .await?;

        Ok(subtitle)
    }

}
