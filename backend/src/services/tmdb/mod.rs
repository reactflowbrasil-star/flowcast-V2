mod cache;
mod image_mod; // Can't use image as it clashes with the external crate

use crate::error::AppError;
use crate::models::{
    SystemConfig, TmdbCastMember, TmdbCredits, TmdbGenre, TmdbMovieDetails, TmdbSearchResponse,
    TmdbSearchResult, TmdbSeasonDetails, TmdbTvDetails, TmdbVideo, TmdbVideosResponse,
};
use image;
use reqwest::{Client, Url};
use serde::Deserialize;
use sqlx::PgPool;
use std::path::PathBuf;
use tokio::fs;
use tracing::warn;

#[derive(Clone)]
pub struct TmdbService {
    client: Client,
    db: PgPool,
    base_url: String,
    public_base_url: String,
}

#[derive(Deserialize)]
struct GenreListResponse {
    genres: Vec<TmdbGenre>,
}

impl TmdbService {
    pub fn new(db: PgPool, public_base_url: String) -> Self {
        // Create HTTP client with extended timeout for long scanning operations
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 minutes timeout for TMDB calls
            .build()
            .unwrap_or_else(|_| Client::new()); // Fallback to default if builder fails

        Self {
            client,
            db,
            base_url: "https://api.themoviedb.org/3".to_string(),
            public_base_url,
        }
    }

    async fn get_config_value(&self, key: &str) -> Result<Option<String>, AppError> {
        let config =
            sqlx::query_as::<_, SystemConfig>("SELECT key, value FROM core.config WHERE key = $1")
                .bind(key)
                .fetch_optional(&self.db)
                .await?;

        Ok(config.map(|cfg| cfg.value))
    }

    async fn get_mode(&self) -> Result<String, AppError> {
        Ok(self
            .get_config_value("tmdb_mode")
            .await?
            .filter(|mode| !mode.is_empty())
            .unwrap_or_else(|| "tmdb".to_string()))
    }

    pub async fn is_local_mode(&self) -> Result<bool, AppError> {
        Ok(self.get_mode().await? == "local")
    }

    async fn get_metadata_path(&self) -> Result<PathBuf, AppError> {
        let root = self
            .get_config_value("tmdb_metadata_path")
            .await?
            .filter(|path| !path.is_empty())
            .unwrap_or_else(|| "metadata".to_string());
        Ok(PathBuf::from(root))
    }

    pub async fn get_preferred_format(&self) -> Result<String, AppError> {
        Ok(self
            .get_config_value("tmdb_preferred_format")
            .await?
            .map(|value| value.to_lowercase())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "original".to_string()))
    }

    async fn ensure_metadata_dirs(&self) -> Result<PathBuf, AppError> {
        let root = self.get_metadata_path().await?;

        if !root.exists() {
            fs::create_dir_all(&root).await?;
        }

        let subdirs = [
            root.join("movies"),
            root.join("series"),
            root.join("images"),
            root.join("images/posters"),
            root.join("images/backdrops"),
            root.join("images/seasons"),
            root.join("images/stills"),
        ];

        for dir in subdirs {
            if !dir.exists() {
                fs::create_dir_all(&dir).await?;
            }
        }

        Ok(root)
    }

    pub async fn metadata_root_path(&self) -> Result<PathBuf, AppError> {
        self.ensure_metadata_dirs().await
    }

    async fn effective_language(&self, language: Option<&str>) -> Result<String, AppError> {
        if let Some(lang) = language {
            if !lang.trim().is_empty() {
                return Ok(lang.trim().to_string());
            }
        }
        self.get_language().await
    }

    async fn fetch_media_list(
        &self,
        endpoint: &str,
        language: Option<&str>,
        params: &[(&str, String)],
        default_media_type: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        if self.is_local_mode().await? {
            return Ok(Vec::new());
        }

        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.effective_language(language).await?;

        let mut url = Url::parse(&format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            endpoint.trim_start_matches('/'),
        ))
        .map_err(|e| AppError::ExternalServiceError(format!("Failed to build TMDB URL: {}", e)))?;

        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("api_key", &api_key);
            pairs.append_pair("language", &language);
            pairs.append_pair("page", "1");
            for (key, value) in params {
                pairs.append_pair(key, value);
            }
        }

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let mut search_response: TmdbSearchResponse = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        if let Some(media_type) = default_media_type {
            for item in &mut search_response.results {
                if item.media_type.is_none() {
                    item.media_type = Some(media_type.to_string());
                }
            }
        }

        Ok(search_response.results)
    }

    async fn fetch_genre_list(
        &self,
        endpoint: &str,
        language: Option<&str>,
    ) -> Result<Vec<TmdbGenre>, AppError> {
        if self.is_local_mode().await? {
            return Ok(Vec::new());
        }

        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.effective_language(language).await?;

        let mut url = Url::parse(&format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            endpoint.trim_start_matches('/'),
        ))
        .map_err(|e| AppError::ExternalServiceError(format!("Failed to build TMDB URL: {}", e)))?;

        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("api_key", &api_key);
            pairs.append_pair("language", &language);
        }

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let genre_response: GenreListResponse = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(genre_response.genres)
    }

    // Get TMDB API key from database configuration
    async fn get_api_key(&self) -> Result<Option<String>, AppError> {
        Ok(self
            .get_config_value("tmdb_api_key")
            .await?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()))
    }

    // Get TMDB language from database configuration
    async fn get_language(&self) -> Result<String, AppError> {
        Ok(self
            .get_config_value("tmdb_language")
            .await?
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "es-ES".to_string()))
    }

    /// Get all configured TMDB languages (from `tmdb_languages` config, falling back to single `tmdb_language`)
    pub async fn get_all_languages(&self) -> Result<Vec<String>, AppError> {
        // Try the multi-language key first
        if let Some(raw) = self.get_config_value("tmdb_languages").await? {
            if !raw.is_empty() {
                let languages: Vec<String> = raw
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                if !languages.is_empty() {
                    return Ok(languages);
                }
            }
        }
        // Fallback to single tmdb_language
        let primary = self.get_language().await?;
        Ok(vec![primary])
    }

    /// Fetch title+description from TMDB in a specific language for a movie
    pub async fn fetch_movie_metadata_in_language(
        &self,
        tmdb_id: i64,
        language: &str,
    ) -> Result<(String, Option<String>), AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;

        let url = format!("{}/movie/{}", self.base_url, tmdb_id);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key), ("language", &language.to_string())])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let details: TmdbMovieDetails = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok((details.title, details.overview))
    }

    /// Fetch title+description from TMDB in a specific language for a TV show
    pub async fn fetch_tv_metadata_in_language(
        &self,
        tmdb_id: i64,
        language: &str,
    ) -> Result<(String, Option<String>), AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;

        let url = format!("{}/tv/{}", self.base_url, tmdb_id);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key), ("language", &language.to_string())])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let details: TmdbTvDetails = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok((details.name, details.overview))
    }

    /// Store translations for a media_content_id in all configured TMDB languages.
    /// `media_type` should be "movie" or "tv".
    /// Skips if tmdb_id is 0 or no additional languages are configured.
    pub async fn store_translations(
        &self,
        media_content_id: i64,
        tmdb_id: i64,
        media_type: &str,
    ) -> Result<(), AppError> {
        if tmdb_id == 0 {
            return Ok(());
        }
        if self.is_local_mode().await? {
            return Ok(());
        }

        let languages = self.get_all_languages().await?;
        if languages.len() <= 1 {
            // Only one language configured; no extra translations needed
            return Ok(());
        }

        for lang in &languages {
            let result = match media_type {
                "movie" => self.fetch_movie_metadata_in_language(tmdb_id, lang).await,
                "tv" | "series" | "anime" => self.fetch_tv_metadata_in_language(tmdb_id, lang).await,
                _ => continue,
            };

            match result {
                Ok((title, description)) => {
                    let _ = sqlx::query(
                        r#"INSERT INTO content.media_content_translations (media_content_id, language, title, description)
                           VALUES ($1, $2, $3, $4)
                           ON CONFLICT (media_content_id, language)
                           DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description"#
                    )
                    .bind(media_content_id)
                    .bind(lang)
                    .bind(&title)
                    .bind(&description)
                    .execute(&self.db)
                    .await;
                }
                Err(e) => {
                    warn!("Failed to fetch TMDB translation for lang={}, tmdb_id={}: {}", lang, tmdb_id, e);
                }
            }
        }

        Ok(())
    }

    // Check if TMDB API is configured and available
    pub async fn is_available(&self) -> Result<bool, AppError> {
        if self.is_local_mode().await? {
            let root = self.get_metadata_path().await?;
            return Ok(root.exists());
        }

        Ok(self.get_api_key().await?.is_some())
    }

    // Search for movies and TV shows by query
    pub async fn search_multi(&self, query: &str) -> Result<Vec<TmdbSearchResult>, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.get_language().await?;

        let url = format!("{}/search/multi", self.base_url);
        let response = self
            .client
            .get(&url)
            .query(&[
                ("api_key", &api_key),
                ("query", &query.to_string()),
                ("language", &language),
            ])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let search_response: TmdbSearchResponse = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(search_response.results)
    }

    // Search for TV shows only
    pub async fn search_tv(&self, query: &str) -> Result<Vec<TmdbSearchResult>, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.get_language().await?;

        let url = format!("{}/search/tv", self.base_url);
        let response = self
            .client
            .get(&url)
            .query(&[
                ("api_key", &api_key),
                ("query", &query.to_string()),
                ("language", &language),
            ])
            .send()
            .await
            .map_err(|e| {
                AppError::ExternalServiceError(format!("TMDB API request failed: {}", e))
            })?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let search_response: TmdbSearchResponse = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(search_response.results)
    }

    pub async fn get_popular_movies(
        &self,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        self.fetch_media_list("movie/popular", language, &[], Some("movie"))
            .await
    }

    pub async fn get_top_rated_movies(
        &self,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        self.fetch_media_list("movie/top_rated", language, &[], Some("movie"))
            .await
    }

    pub async fn get_upcoming_movies(
        &self,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        self.fetch_media_list("movie/upcoming", language, &[], Some("movie"))
            .await
    }

    pub async fn get_now_playing_movies(
        &self,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        self.fetch_media_list("movie/now_playing", language, &[], Some("movie"))
            .await
    }

    pub async fn get_popular_tv(
        &self,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        self.fetch_media_list("tv/popular", language, &[], Some("tv"))
            .await
    }

    pub async fn get_top_rated_tv(
        &self,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        self.fetch_media_list("tv/top_rated", language, &[], Some("tv"))
            .await
    }

    pub async fn discover_movies_by_genre(
        &self,
        genre_id: i32,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        self.fetch_media_list(
            "discover/movie",
            language,
            &[("with_genres", genre_id.to_string())],
            Some("movie"),
        )
        .await
    }

    pub async fn discover_tv_by_genre(
        &self,
        genre_id: i32,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        self.fetch_media_list(
            "discover/tv",
            language,
            &[("with_genres", genre_id.to_string())],
            Some("tv"),
        )
        .await
    }

    pub async fn get_trending(
        &self,
        media_type: &str,
        window: &str,
        language: Option<&str>,
    ) -> Result<Vec<TmdbSearchResult>, AppError> {
        let default_media_type = if media_type.eq_ignore_ascii_case("all") {
            None
        } else {
            Some(media_type)
        };

        self.fetch_media_list(
            &format!("trending/{}/{}", media_type, window),
            language,
            &[],
            default_media_type,
        )
        .await
    }

    pub async fn get_movie_genres(
        &self,
        language: Option<&str>,
    ) -> Result<Vec<TmdbGenre>, AppError> {
        self.fetch_genre_list("genre/movie/list", language).await
    }

    pub async fn get_tv_genres(&self, language: Option<&str>) -> Result<Vec<TmdbGenre>, AppError> {
        self.fetch_genre_list("genre/tv/list", language).await
    }

    // Search for movies only
    pub async fn search_movie(&self, query: &str) -> Result<Vec<TmdbSearchResult>, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.get_language().await?;

        let url = format!("{}/search/movie", self.base_url);
        let response = self
            .client
            .get(&url)
            .query(&[
                ("api_key", &api_key),
                ("query", &query.to_string()),
                ("language", &language),
            ])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let search_response: TmdbSearchResponse = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(search_response.results)
    }

    // Fetch movie details from TMDB regardless of mode
    async fn fetch_movie_details_remote(&self, tmdb_id: i64) -> Result<TmdbMovieDetails, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.get_language().await?;

        let url = format!("{}/movie/{}", self.base_url, tmdb_id);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key), ("language", &language)])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let movie_details: TmdbMovieDetails = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(movie_details)
    }

    // Fetch TV show details from TMDB regardless of mode
    async fn fetch_tv_details_remote(&self, tmdb_id: i64) -> Result<TmdbTvDetails, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.get_language().await?;

        let url = format!("{}/tv/{}", self.base_url, tmdb_id);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key), ("language", &language)])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let tv_details: TmdbTvDetails = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(tv_details)
    }

    // Fetch season details for a TV show from TMDB regardless of mode
    async fn fetch_season_details_remote(
        &self,
        tmdb_id: i64,
        season_number: i32,
    ) -> Result<TmdbSeasonDetails, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.get_language().await?;

        let url = format!("{}/tv/{}/season/{}", self.base_url, tmdb_id, season_number);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key), ("language", &language)])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let season_details: TmdbSeasonDetails = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(season_details)
    }

    // Public API helpers -------------------------------------------------

    pub async fn get_movie_details(&self, tmdb_id: i64) -> Result<TmdbMovieDetails, AppError> {
        if self.is_local_mode().await? {
            if let Some(cached) = self.read_cached_movie_details(tmdb_id).await? {
                return Ok(cached);
            }
        }

        let movie = self.fetch_movie_details_remote(tmdb_id).await?;

        if self.is_local_mode().await? {
            match self.cache_movie_details(movie.clone()).await {
                Ok(cached) => return Ok(cached),
                Err(err) => {
                    warn!("Failed to cache TMDB movie {} locally: {}", tmdb_id, err);
                }
            }
        }

        Ok(movie)
    }

    pub async fn get_tv_details(&self, tmdb_id: i64) -> Result<TmdbTvDetails, AppError> {
        if self.is_local_mode().await? {
            if let Some(cached) = self.read_cached_tv_details(tmdb_id).await? {
                return Ok(cached);
            }
        }

        let tv = self.fetch_tv_details_remote(tmdb_id).await?;

        if self.is_local_mode().await? {
            match self.cache_tv_details(tv.clone()).await {
                Ok(cached) => return Ok(cached),
                Err(err) => {
                    warn!("Failed to cache TMDB series {} locally: {}", tmdb_id, err);
                }
            }
        }

        Ok(tv)
    }

    pub async fn get_season_details(
        &self,
        tmdb_id: i64,
        season_number: i32,
    ) -> Result<TmdbSeasonDetails, AppError> {
        if self.is_local_mode().await? {
            if let Some(cached) = self
                .read_cached_season_details(tmdb_id, season_number)
                .await?
            {
                return Ok(cached);
            }
        }

        let season = self
            .fetch_season_details_remote(tmdb_id, season_number)
            .await?;

        if self.is_local_mode().await? {
            match self.cache_season_details(tmdb_id, season.clone()).await {
                Ok(cached) => return Ok(cached),
                Err(err) => {
                    warn!(
                        "Failed to cache TMDB season {} for series {}: {}",
                        season_number, tmdb_id, err
                    );
                }
            }
        }

        Ok(season)
    }

    /// Get movie credits (cast) from TMDB
    /// Returns the top 10 cast members
    pub async fn get_movie_credits(&self, tmdb_id: i64) -> Result<Vec<TmdbCastMember>, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;

        let url = format!("{}/movie/{}/credits", self.base_url, tmdb_id);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key)])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let credits: TmdbCredits = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB credits response: {}", e))
        })?;

        // Return top 10 cast members, add full image URLs
        let cast: Vec<TmdbCastMember> = credits
            .cast
            .into_iter()
            .take(10)
            .map(|mut member| {
                if let Some(ref path) = member.profile_path {
                    member.profile_path = Some(format!("https://image.tmdb.org/t/p/w185{}", path));
                }
                member
            })
            .collect();

        Ok(cast)
    }

    /// Get TV show credits (cast) from TMDB
    /// Returns the top 10 cast members
    pub async fn get_tv_credits(&self, tmdb_id: i64) -> Result<Vec<TmdbCastMember>, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;

        let url = format!("{}/tv/{}/credits", self.base_url, tmdb_id);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key)])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let credits: TmdbCredits = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB credits response: {}", e))
        })?;

        // Return top 10 cast members, add full image URLs
        let cast: Vec<TmdbCastMember> = credits
            .cast
            .into_iter()
            .take(10)
            .map(|mut member| {
                if let Some(ref path) = member.profile_path {
                    member.profile_path = Some(format!("https://image.tmdb.org/t/p/w185{}", path));
                }
                member
            })
            .collect();

        Ok(cast)
    }


    // Extract year from date string
    pub fn extract_year(date_str: &str) -> Option<i64> {
        date_str.split('-').next()?.parse().ok()
    }

    // Get videos/trailers for a movie
    pub async fn get_movie_videos(&self, tmdb_id: i64) -> Result<Vec<TmdbVideo>, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.get_language().await?;

        let url = format!("{}/movie/{}/videos", self.base_url, tmdb_id);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key), ("language", &language)])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let videos_response: TmdbVideosResponse = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(videos_response.results)
    }

    // Get videos/trailers for a TV show
    pub async fn get_tv_videos(&self, tmdb_id: i64) -> Result<Vec<TmdbVideo>, AppError> {
        let api_key = self
            .get_api_key()
            .await?
            .ok_or_else(|| AppError::BadRequest("TMDB API key not configured".to_string()))?;
        let language = self.get_language().await?;

        let url = format!("{}/tv/{}/videos", self.base_url, tmdb_id);
        let response = self
            .client
            .get(&url)
            .query(&[("api_key", &api_key), ("language", &language)])
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("TMDB API error: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "TMDB API returned status: {}",
                response.status()
            )));
        }

        let videos_response: TmdbVideosResponse = response.json().await.map_err(|e| {
            AppError::ExternalServiceError(format!("Failed to parse TMDB response: {}", e))
        })?;

        Ok(videos_response.results)
    }
}
