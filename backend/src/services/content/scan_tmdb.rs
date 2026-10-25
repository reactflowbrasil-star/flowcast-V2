use super::*;
use crate::models::{Season, Series};

impl ContentService {
    /// Enrich a single content item with TMDB metadata
    /// media_type: "movie" or "tv"
    /// For TV series, this also creates/updates the series structure with seasons and episodes
    pub async fn enrich_content_with_tmdb(
        &self,
        content_id: i64,
        tmdb_id: i64,
        media_type: &str,
    ) -> Result<crate::models::ContentJoined, AppError> {
        let tmdb_service = self
            .tmdb_service
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("TMDB service not configured".to_string()))?;

        if !tmdb_service.is_available().await? {
            return Err(AppError::BadRequest("TMDB API not available".to_string()));
        }

        match media_type {
            "movie" => {
                // For movies, just update metadata
                let movie = tmdb_service.get_movie_details(tmdb_id).await?;
                let year = movie
                    .release_date
                    .as_ref()
                    .and_then(|date| TmdbService::extract_year(date));
                let poster_url = movie
                    .poster_path
                    .map(|path| tmdb_service.build_image_url(&path, "w500"));
                let backdrop_url = movie
                    .backdrop_path
                    .map(|path| tmdb_service.build_image_url(&path, "w1280"));

                let mut tx = self.db.begin().await?;

                sqlx::query(
                    r#"
                    UPDATE content.media_content 
                    SET title = COALESCE($1, title),
                        description = COALESCE($2, description),
                        image_url = COALESCE($3, image_url),
                        backdrop_url = COALESCE($4, backdrop_url)
                    WHERE id = $5
                    "#,
                )
                .bind(&movie.title)
                .bind(&movie.overview)
                .bind(&poster_url)
                .bind(&backdrop_url)
                .bind(content_id)
                .execute(&mut *tx)
                .await?;

                sqlx::query(
                    r#"
                    UPDATE content.movies
                    SET tmdb_id = $1,
                        year = COALESCE($2, year)
                    WHERE media_content_id = $3
                    "#,
                )
                .bind(tmdb_id)
                .bind(year)
                .bind(content_id)
                .execute(&mut *tx)
                .await?;

                tx.commit().await?;

                // Store multi-language translations
                if let Err(e) = tmdb_service.store_translations(content_id, tmdb_id, "movie").await {
                    tracing::warn!("Failed to store TMDB translations for movie {}: {}", content_id, e);
                }

                let content = self.get_content_by_id(content_id).await?.ok_or(AppError::NotFound)?;
                Ok(content)
            }
            "tv" => {
                // For TV series, update metadata AND create series/seasons/episodes structure
                let tv = tmdb_service.get_tv_details(tmdb_id).await?;
                let _year = tv
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

                let mut tx = self.db.begin().await?;

                sqlx::query(
                    r#"
                    UPDATE content.media_content 
                    SET title = COALESCE($1, title),
                        description = COALESCE($2, description),
                        image_url = COALESCE($3, image_url),
                        backdrop_url = COALESCE($4, backdrop_url)
                    WHERE id = $5
                    "#,
                )
                .bind(&tv.name)
                .bind(&tv.overview)
                .bind(&poster_url)
                .bind(&backdrop_url)
                .bind(content_id)
                .execute(&mut *tx)
                .await?;

                // Note: Series and TV Channels don't have a direct year/tmdb_id field in their specific tables yet,
                // but we will update the associated Series table below.
                
                tx.commit().await?;

                // Check if series entry already exists for this content
                let existing_series: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM content.series WHERE content_id = $1")
                        .bind(content_id)
                        .fetch_optional(&self.db)
                        .await?;

                let series_id = if let Some(sid) = existing_series {
                    // Update existing series
                    sqlx::query("UPDATE content.series SET total_seasons = $1 WHERE id = $2")
                        .bind(tv.number_of_seasons)
                        .bind(sid)
                        .execute(&self.db)
                        .await?;
                    sid
                } else {
                    // Create new series entry
                    let series = sqlx::query_as::<_, Series>(
                        r#"
                        INSERT INTO content.series (content_id, total_seasons)
                        VALUES ($1, $2)
                        RETURNING id, content_id, total_seasons, created_at
                        "#,
                    )
                    .bind(content_id)
                    .bind(tv.number_of_seasons)
                    .fetch_one(&self.db)
                    .await?;
                    series.id
                };

                // Create seasons and episodes from TMDB
                for season_info in &tv.seasons {
                    // Skip season 0 (specials) unless it has episodes
                    if season_info.season_number == 0 && season_info.episode_count == 0 {
                        continue;
                    }

                    let season_poster = season_info
                        .poster_path
                        .as_ref()
                        .map(|path| tmdb_service.build_image_url(path, "w500"));

                    // Check if season exists
                    let existing_season: Option<i64> = sqlx::query_scalar(
                        "SELECT id FROM content.seasons WHERE series_id = $1 AND season_number = $2",
                    )
                    .bind(series_id)
                    .bind(season_info.season_number)
                    .fetch_optional(&self.db)
                    .await?;

                    let season_id = if let Some(sid) = existing_season {
                        // Update existing season
                        sqlx::query(
                            "UPDATE content.seasons SET title = $1, total_episodes = $2, poster_url = $3, image_url = $4, backdrop_url = $5, tmdb_id = $6, air_date = $7 WHERE id = $8"
                        )
                        .bind(&season_info.name)
                        .bind(season_info.episode_count)
                        .bind(&season_poster)
                        .bind(None::<String>) // image_url
                        .bind(None::<String>) // backdrop_url
                        .bind(None::<i64>)    // tmdb_id
                        .bind(None::<String>) // air_date
                        .bind(sid)
                        .execute(&self.db)
                        .await?;
                        sid
                    } else {
                        // Create new season
                        let season = sqlx::query_as::<_, Season>(
                            r#"
                            INSERT INTO content.seasons (series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date)
                            VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9)
                            RETURNING id, series_id, season_number, total_episodes, title, description, image_url, poster_url, backdrop_url, tmdb_id, air_date, created_at
                            "#,
                        )
                        .bind(series_id)
                        .bind(season_info.season_number)
                        .bind(season_info.episode_count)
                        .bind(&season_info.name)
                        .bind(None::<String>) // image_url
                        .bind(&season_poster)
                        .bind(None::<String>) // backdrop_url
                        .bind(None::<i64>)    // tmdb_id
                        .bind(None::<String>) // air_date
                        .fetch_one(&self.db)
                        .await?;
                        season.id
                    };

                    // Fetch season details from TMDB to get episode info
                    if let Ok(season_details) = tmdb_service
                        .get_season_details(tmdb_id, season_info.season_number)
                        .await
                    {
                        for episode in &season_details.episodes {
                            // Check if episode exists
                            let existing_episode: Option<i64> = sqlx::query_scalar(
                                "SELECT id FROM content.episodes WHERE season_id = $1 AND episode_number = $2"
                            )
                            .bind(season_id)
                            .bind(episode.episode_number)
                            .fetch_optional(&self.db)
                            .await?;

                            let episode_poster = episode
                                .still_path
                                .as_ref()
                                .map(|path| tmdb_service.build_image_url(path, "w500"));

                            if existing_episode.is_some() {
                                // Update existing episode metadata (but not stream_url)
                                sqlx::query(
                                    "UPDATE content.episodes SET title = $1, description = $2, image_url = COALESCE($3, image_url) WHERE season_id = $4 AND episode_number = $5"
                                )
                                .bind(&episode.name)
                                .bind(&episode.overview)
                                .bind(&episode_poster)
                                .bind(season_id)
                                .bind(episode.episode_number)
                                .execute(&self.db)
                                .await?;
                            } else {
                                // Create new episode (without stream_url - user will add later)
                                sqlx::query(
                                    r#"
                                    INSERT INTO content.episodes (season_id, episode_number, title, description, image_url, stream_url)
                                    VALUES ($1, $2, $3, $4, $5, '')
                                    "#,
                                )
                                .bind(season_id)
                                .bind(episode.episode_number)
                                .bind(&episode.name)
                                .bind(&episode.overview)
                                .bind(&episode_poster)
                                .execute(&self.db)
                                .await?;
                            }
                        }
                    }
                }

                // Store multi-language translations
                if let Err(e) = tmdb_service.store_translations(content_id, tmdb_id, "tv").await {
                    tracing::warn!("Failed to store TMDB translations for tv {}: {}", content_id, e);
                }

                let content = self.get_content_by_id(content_id).await?.ok_or(AppError::NotFound)?;
                Ok(content)
            }
            _ => Err(AppError::BadRequest(format!(
                "Invalid media_type '{}'. Must be 'movie' or 'tv'",
                media_type
            ))),
        }
    }
}
