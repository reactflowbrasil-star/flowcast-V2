use crate::error::AppError;
use crate::models::ContentJoined;
use crate::services::TmdbService;
use super::sql::CONTENT_JOIN_SELECT;
use super::types::*;

use super::ContentService;

impl ContentService {

    // Specialized content management methods (Req 7.2, 7.3, 7.4)

    // Kids content management (Req 7.4) - With TMDB integration when available
    pub async fn create_kids_content(
        &self,
        request: CreateKidsContentRequest,
    ) -> Result<ContentJoined, AppError> {
        // Get Kids category
        let kids_category = self
            .get_category_by_type("Kids")
            .await?
            .ok_or_else(|| AppError::BadRequest("Kids category not found".to_string()))?;

        // Try to use TMDB if available and tmdb_id is provided
        if let (Some(tmdb_id), Some(tmdb_service)) = (request.tmdb_id, &self.tmdb_service) {
            tracing::debug!("Kids content - TMDB ID provided: {}", tmdb_id);
            if tmdb_service.is_available().await.unwrap_or(false) {
                tracing::debug!("Kids content - TMDB service available");
                // Try to get details from TMDB
                if let Ok(movie) = tmdb_service.get_movie_details(tmdb_id).await {
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

                    tracing::debug!(
                        "Kids content - TMDB backdrop_path={:?}, backdrop_url={:?}",
                        movie.backdrop_path,
                        backdrop_url
                    );

                    let content_request = CreateContentRequest {
                        category_id: kids_category.id,
                        title: movie.title,
                        description: movie.overview,
                        image_url: poster_url,
                        backdrop_url, // Include backdrop for Kids content
                        stream_url: request.stream_url,
                        tmdb_id: Some(tmdb_id),
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

                    tracing::debug!(
                        "Kids content - About to create with backdrop_url={:?}",
                        content_request.backdrop_url
                    );
                    return self.create_content_manual(content_request).await;
                }
            }
        }

        // Fallback to manual creation
        let content_request = CreateContentRequest {
            category_id: kids_category.id,
            title: request.title,
            description: request.description,
            image_url: request.image_url,
            backdrop_url: None, // Manual entry doesn't have backdrop
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


    // Anime content management (Req 7.4) - With TMDB integration when available
    pub async fn create_anime_content(
        &self,
        request: CreateAnimeContentRequest,
    ) -> Result<ContentJoined, AppError> {
        // Get Anime category
        let anime_category = self
            .get_category_by_type("Anime")
            .await?
            .ok_or_else(|| AppError::BadRequest("Anime category not found".to_string()))?;

        // Try to use TMDB if available and tmdb_id is provided
        if let (Some(tmdb_id), Some(tmdb_service)) = (request.tmdb_id, &self.tmdb_service) {
            if tmdb_service.is_available().await.unwrap_or(false) {
                // Try to get details from TMDB (could be movie or TV show)
                if let Ok(tv) = tmdb_service.get_tv_details(tmdb_id).await {
                    let year = tv
                        .first_air_date
                        .as_ref()
                        .and_then(|date| TmdbService::extract_year(date));
                    let poster_url = tv
                        .poster_path
                        .map(|path| tmdb_service.build_image_url(&path, "w500"));

                    let content_request = CreateContentRequest {
                        category_id: anime_category.id,
                        title: tv.name,
                        description: tv.overview,
                        image_url: poster_url,
                        backdrop_url: None, // Anime content doesn't use backdrop
                        stream_url: request.stream_url,
                        tmdb_id: Some(tmdb_id),
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

                    return self.create_content_manual(content_request).await;
                } else if let Ok(movie) = tmdb_service.get_movie_details(tmdb_id).await {
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

                    let content_request = CreateContentRequest {
                        category_id: anime_category.id,
                        title: movie.title,
                        description: movie.overview,
                        image_url: poster_url,
                        backdrop_url, // Include backdrop for Anime content
                        stream_url: request.stream_url,
                        tmdb_id: Some(tmdb_id),
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

                    return self.create_content_manual(content_request).await;
                }
            }
        }

        // Fallback to manual creation
        let content_request = CreateContentRequest {
            category_id: anime_category.id,
            title: request.title,
            description: request.description,
            image_url: request.image_url,
            backdrop_url: None, // Manual entry doesn't have backdrop
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


    // Get Kids content with pagination
    pub async fn get_kids_content(
        &self,
        page: Option<i32>,
        limit: Option<i32>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        let kids_category = self
            .get_category_by_type("Kids")
            .await?
            .ok_or_else(|| AppError::BadRequest("Kids category not found".to_string()))?;

        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * limit;

        let sql = format!("{} WHERE mc.category_id = $1 ORDER BY mc.created_at DESC, mc.id DESC LIMIT $2 OFFSET $3", CONTENT_JOIN_SELECT);
        let content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(kids_category.id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        Ok(content)
    }


    // Get Anime content with pagination
    pub async fn get_anime_content(
        &self,
        page: Option<i32>,
        limit: Option<i32>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        let anime_category = self
            .get_category_by_type("Anime")
            .await?
            .ok_or_else(|| AppError::BadRequest("Anime category not found".to_string()))?;

        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * limit;

        let sql = format!("{} WHERE mc.category_id = $1 ORDER BY mc.title LIMIT $2 OFFSET $3", CONTENT_JOIN_SELECT);
        let content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(anime_category.id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        Ok(content)
    }

}
