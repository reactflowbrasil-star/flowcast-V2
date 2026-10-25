use super::*;

#[derive(Debug, FromRow)]
struct TmdbMetadataCandidate {
    id: i64,
    #[allow(dead_code)]
    category_id: i64,
    title: String,
    description: Option<String>,
    image_url: Option<String>,
    backdrop_url: Option<String>,
    year: Option<i64>,
}

#[derive(Debug, Clone, Copy)]
enum TmdbMediaKind {
    Movie,
    Tv,
}

impl ContentService {
    fn tmdb_search_order_for_category(category_type: &str) -> Vec<TmdbMediaKind> {
        match category_type {
            "Series" => vec![TmdbMediaKind::Tv],
            "Anime" => vec![TmdbMediaKind::Tv, TmdbMediaKind::Movie],
            "Kids" => vec![TmdbMediaKind::Movie, TmdbMediaKind::Tv],
            _ => vec![TmdbMediaKind::Movie],
        }
    }

    fn has_non_empty_text(value: &Option<String>) -> bool {
        value
            .as_ref()
            .map(|text| !text.trim().is_empty())
            .unwrap_or(false)
    }

    pub async fn refresh_tmdb_metadata(
        &self,
        req: TmdbMetadataRefreshRequest,
    ) -> Result<TmdbMetadataRefreshResult, AppError> {
        let normalized_type = match req.category_type.trim().to_lowercase().as_str() {
            "vod" => "VOD",
            "series" => "Series",
            "kids" => "Kids",
            "anime" => "Anime",
            other => {
                return Err(AppError::BadRequest(format!(
                    "TMDB metadata refresh not supported for category type '{}'",
                    other
                )))
            }
        };

        let tmdb_service = self
            .tmdb_service
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("TMDB service not available".to_string()))?
            .clone();

        if !tmdb_service.is_available().await? {
            return Err(AppError::BadRequest("TMDB API not configured".to_string()));
        }

        let categories = sqlx::query_as::<_, Category>(
            "SELECT id, name, category_type, created_at FROM content.categories WHERE category_type = $1",
        )
        .bind(normalized_type)
        .fetch_all(&self.db)
        .await?;

        if categories.is_empty() {
            return Err(AppError::BadRequest(format!(
                "No categories found for type '{}'",
                normalized_type
            )));
        }

        let mut candidates: Vec<TmdbMetadataCandidate> = Vec::new();
        let mut remaining = req.limit.unwrap_or(0);
        let limit_enabled = req.limit.unwrap_or(0) > 0;

        for category in &categories {
            if limit_enabled && remaining <= 0 {
                break;
            }

            let rows = if limit_enabled {
                let fetch_limit = remaining.max(0);
                if fetch_limit == 0 {
                    Vec::new()
                } else {
                    sqlx::query_as::<_, TmdbMetadataCandidate>(
                        "SELECT id, category_id, title, description, image_url, backdrop_url, year \
                         FROM content.media_content \
                         WHERE category_id = $1 AND (tmdb_id IS NULL OR tmdb_id = 0) \
                         ORDER BY title \
                         LIMIT $2",
                    )
                    .bind(category.id)
                    .bind(fetch_limit)
                    .fetch_all(&self.db)
                    .await?
                }
            } else {
                sqlx::query_as::<_, TmdbMetadataCandidate>(
                    "SELECT id, category_id, title, description, image_url, backdrop_url, year \
                     FROM content.media_content \
                     WHERE category_id = $1 AND (tmdb_id IS NULL OR tmdb_id = 0) \
                     ORDER BY title",
                )
                .bind(category.id)
                .fetch_all(&self.db)
                .await?
            };

            if limit_enabled {
                remaining -= rows.len() as i64;
            }

            candidates.extend(rows);
        }

        let mut result = TmdbMetadataRefreshResult {
            total_candidates: candidates.len() as i64,
            updated: 0,
            skipped: 0,
            errors: Vec::new(),
            logs: Vec::new(),
        };

        if candidates.is_empty() {
            return Ok(result);
        }

        let search_order = Self::tmdb_search_order_for_category(normalized_type);

        for candidate in candidates {
            match self
                .match_tmdb_candidate(&tmdb_service, &candidate, &search_order)
                .await
            {
                Ok(Some((media_kind, tmdb_id))) => {
                    match self
                        .apply_tmdb_metadata(
                            &tmdb_service,
                            &candidate,
                            media_kind,
                            tmdb_id,
                            normalized_type,
                        )
                        .await
                    {
                        Ok(log_message) => {
                            result.updated += 1;
                            if let Some(message) = log_message {
                                result.logs.push(message);
                            }
                        }
                        Err(error) => {
                            result.skipped += 1;
                            result
                                .errors
                                .push(format!("{}: {}", candidate.title, error));
                        }
                    }
                }
                Ok(None) => {
                    result.skipped += 1;
                }
                Err(error) => {
                    result.skipped += 1;
                    result
                        .errors
                        .push(format!("{}: {}", candidate.title, error));
                }
            }
        }

        Ok(result)
    }

    async fn match_tmdb_candidate(
        &self,
        tmdb_service: &TmdbService,
        candidate: &TmdbMetadataCandidate,
        order: &[TmdbMediaKind],
    ) -> Result<Option<(TmdbMediaKind, i64)>, AppError> {
        let year_hint = candidate
            .year
            .or_else(|| Self::extract_year_hint(&candidate.title));

        for media_kind in order {
            match media_kind {
                TmdbMediaKind::Movie => {
                    let results = tmdb_service.search_movie(&candidate.title).await?;
                    if let Some(id) =
                        Self::pick_best_movie_match(&candidate.title, year_hint, &results)
                    {
                        return Ok(Some((TmdbMediaKind::Movie, id)));
                    }
                }
                TmdbMediaKind::Tv => {
                    let results = tmdb_service.search_tv(&candidate.title).await?;
                    if let Some(id) = Self::pick_best_tv_match(&candidate.title, &results) {
                        return Ok(Some((TmdbMediaKind::Tv, id)));
                    }
                }
            }
        }

        let multi_results = tmdb_service.search_multi(&candidate.title).await?;
        for media_kind in order {
            let filtered: Vec<TmdbSearchResult> = multi_results
                .iter()
                .filter(|item| match media_kind {
                    TmdbMediaKind::Movie => item.media_type.as_deref() == Some("movie"),
                    TmdbMediaKind::Tv => item.media_type.as_deref() == Some("tv"),
                })
                .cloned()
                .collect();

            if filtered.is_empty() {
                continue;
            }

            let matched = match media_kind {
                TmdbMediaKind::Movie => {
                    Self::pick_best_movie_match(&candidate.title, year_hint, &filtered)
                }
                TmdbMediaKind::Tv => Self::pick_best_tv_match(&candidate.title, &filtered),
            };

            if let Some(id) = matched {
                return Ok(Some((*media_kind, id)));
            }
        }

        Ok(None)
    }

    async fn apply_tmdb_metadata(
        &self,
        tmdb_service: &TmdbService,
        candidate: &TmdbMetadataCandidate,
        media_kind: TmdbMediaKind,
        tmdb_id: i64,
        _category_type: &str,
    ) -> Result<Option<String>, AppError> {
        let mut description = candidate.description.clone();
        let mut image_url = candidate.image_url.clone();
        let mut backdrop_url = candidate.backdrop_url.clone();
        let mut year = candidate.year;

        match media_kind {
            TmdbMediaKind::Movie => {
                let details = tmdb_service.get_movie_details(tmdb_id).await?;
                let tmdb_description = details
                    .overview
                    .clone()
                    .filter(|value| !value.trim().is_empty());
                let tmdb_poster = details
                    .poster_path
                    .as_ref()
                    .map(|path| tmdb_service.build_image_url(path, "w500"));
                let tmdb_backdrop = details
                    .backdrop_path
                    .as_ref()
                    .map(|path| tmdb_service.build_image_url(path, "w1280"));
                let tmdb_year = details
                    .release_date
                    .as_ref()
                    .and_then(|date| TmdbService::extract_year(date));

                if !Self::has_non_empty_text(&description) {
                    description = tmdb_description;
                }
                if !Self::has_non_empty_text(&image_url) {
                    image_url = tmdb_poster;
                }
                if !Self::has_non_empty_text(&backdrop_url) {
                    backdrop_url = tmdb_backdrop;
                }
                if year.is_none() {
                    year = tmdb_year;
                }
            }
            TmdbMediaKind::Tv => {
                let details = tmdb_service.get_tv_details(tmdb_id).await?;
                let tmdb_description = details
                    .overview
                    .clone()
                    .filter(|value| !value.trim().is_empty());
                let tmdb_poster = details
                    .poster_path
                    .as_ref()
                    .map(|path| tmdb_service.build_image_url(path, "w500"));
                let tmdb_backdrop = details
                    .backdrop_path
                    .as_ref()
                    .map(|path| tmdb_service.build_image_url(path, "w1280"));
                let tmdb_year = details
                    .first_air_date
                    .as_ref()
                    .and_then(|date| TmdbService::extract_year(date));

                if !Self::has_non_empty_text(&description) {
                    description = tmdb_description;
                }
                if !Self::has_non_empty_text(&image_url) {
                    image_url = tmdb_poster;
                }
                if !Self::has_non_empty_text(&backdrop_url) {
                    backdrop_url = tmdb_backdrop;
                }
                if year.is_none() {
                    year = tmdb_year;
                }

                sqlx::query("UPDATE content.series SET total_seasons = $1 WHERE content_id = $2")
                    .bind(details.number_of_seasons)
                    .bind(candidate.id)
                    .execute(&self.db)
                    .await
                    .ok();
            }
        }

        // Compute genres string from TMDB details (movie or tv)
        let genres_str: Option<String> = match media_kind {
            TmdbMediaKind::Movie => {
                let details = tmdb_service.get_movie_details(tmdb_id).await?;
                if details.genres.is_empty() {
                    None
                } else {
                    Some(
                        details
                            .genres
                            .iter()
                            .map(|g| g.name.clone())
                            .collect::<Vec<_>>()
                            .join(", "),
                    )
                }
            }
            TmdbMediaKind::Tv => {
                let details = tmdb_service.get_tv_details(tmdb_id).await?;
                if details.genres.is_empty() {
                    None
                } else {
                    Some(
                        details
                            .genres
                            .iter()
                            .map(|g| g.name.clone())
                            .collect::<Vec<_>>()
                            .join(", "),
                    )
                }
            }
        };

        sqlx::query(
            "UPDATE content.media_content \
             SET tmdb_id = $1, description = $2, image_url = $3, backdrop_url = $4, year = $5, genre = COALESCE($6, genre) \
             WHERE id = $7",
        )
        .bind(tmdb_id)
        .bind(description.as_ref())
        .bind(image_url.as_ref())
        .bind(backdrop_url.as_ref())
        .bind(year)
        .bind(&genres_str)
        .bind(candidate.id)
        .execute(&self.db)
        .await?;

        let media_label = match media_kind {
            TmdbMediaKind::Movie => "movie",
            TmdbMediaKind::Tv => "tv",
        };

        Ok(Some(format!(
            "Updated '{}' with TMDB {} ({})",
            candidate.title, tmdb_id, media_label
        )))
    }
}
