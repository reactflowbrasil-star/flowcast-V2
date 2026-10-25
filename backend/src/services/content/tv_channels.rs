use crate::error::AppError;
use crate::models::ContentJoined;
use super::sql::CONTENT_JOIN_SELECT;
use super::types::*;

use super::ContentService;

impl ContentService {

    // TV Channel creation (Req 4.2, 7.1)
    pub async fn create_tv_channel(
        &self,
        request: CreateTvChannelRequest,
    ) -> Result<ContentJoined, AppError> {
        // Get TV category
        let tv_category = self
            .get_category_by_type("TV")
            .await?
            .ok_or_else(|| AppError::BadRequest("TV category not found".to_string()))?;

        let CreateTvChannelRequest {
            name,
            description,
            logo_url,
            stream_url,
            channel_number,
            is_live,
            channel_category,
            provider,
            country,
            format,
            drm_keys,
            drm_type,
            license_server_url,
            drm_headers,
            origin,
            user_agent,
            referer,
            custom_headers,
            proxy_url,
            doh_url,
        } = request;

        let processed_logo = self.cache_live_tv_logo(logo_url.clone(), &name).await?;
        let image_url = processed_logo.or(logo_url);

        // Create content request for TV channel
        let content_request = CreateContentRequest {
            category_id: tv_category.id,
            title: name,
            description,
            image_url,
            backdrop_url: None, // TV channels don't use backdrop
            stream_url,
            tmdb_id: None, // TV channels don't have TMDB IDs
            year: None,
            genre: channel_category,
            provider,
            country,
            format,
            channel_number,
            is_live: Some(is_live),
            drm_keys,
            drm_type,
            license_server_url,
            drm_headers,
            origin,
            user_agent,
            referer,
            custom_headers,
            proxy_url,
            doh_url,
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


    /// Update TV channel
    pub async fn update_tv_channel(
        &self,
        channel_id: i64,
        request: UpdateTvChannelRequest,
    ) -> Result<ContentJoined, AppError> {
        // Check if content exists and is a TV channel
        let existing_content = self
            .get_content_by_id(channel_id)
            .await?
            .ok_or(AppError::NotFound)?;

        // Get TV category to verify this is a TV channel
        let tv_category = self
            .get_category_by_type("TV")
            .await?
            .ok_or_else(|| AppError::BadRequest("TV category not found".to_string()))?;

        if existing_content.category_id != tv_category.id {
            return Err(AppError::BadRequest(
                "Content is not a TV channel".to_string(),
            ));
        }

        let UpdateTvChannelRequest {
            name,
            description,
            logo_url,
            stream_url,
            channel_number,
            is_live,
            channel_category,
            provider,
            country,
            format,
            drm_keys,
            drm_type,
            license_server_url,
            drm_headers,
            active,
            origin,
            user_agent,
            referer,
            custom_headers,
            proxy_url,
            doh_url,
        } = request;

        let processed_logo = self.cache_live_tv_logo(logo_url.clone(), &name).await?;
        let image_url = processed_logo.or(logo_url);

        // Store stream URL directly (no encryption)
        let stream_url = stream_url.clone();

        // Use a transaction to update across multiple tables atomically
        let mut tx = self.db.begin().await?;

        // 1. Update base content metadata in content.media_content
        sqlx::query(
            r#"
            UPDATE content.media_content
            SET title = $1, description = $2, image_url = $3, active = COALESCE($4, active)
            WHERE id = $5
            "#
        )
        .bind(&name)
        .bind(&description)
        .bind(&image_url)
        .bind(active)
        .bind(channel_id)
        .execute(&mut *tx)
        .await?;

        // 2. Update TV-specific fields in content.tv_channels
        sqlx::query(
            r#"
            UPDATE content.tv_channels
            SET channel_number = $1, is_live = $2, provider = $3, country = $4, channel_category = $5
            WHERE media_content_id = $6
            "#
        )
        .bind(channel_number)
        .bind(is_live)
        .bind(&provider)
        .bind(&country)
        .bind(&channel_category)
        .bind(channel_id)
        .execute(&mut *tx)
        .await?;

        // 3. Upsert stream/DRM fields in content.media_streams
        sqlx::query(
            r#"
            INSERT INTO content.media_streams (media_content_id, stream_url, format, drm_keys, drm_type, license_server_url, drm_headers,
                                                origin, user_agent, referer, custom_headers, proxy_url, doh_url, is_default)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
            ON CONFLICT (media_content_id, is_default) WHERE is_default = true DO UPDATE SET
                stream_url = excluded.stream_url, format = excluded.format,
                drm_keys = excluded.drm_keys, drm_type = excluded.drm_type,
                license_server_url = excluded.license_server_url, drm_headers = excluded.drm_headers,
                origin = excluded.origin, user_agent = excluded.user_agent,
                referer = excluded.referer, custom_headers = excluded.custom_headers,
                proxy_url = excluded.proxy_url, doh_url = excluded.doh_url
            "#
        )
        .bind(channel_id)
        .bind(&stream_url)
        .bind(&format)
        .bind(&drm_keys)
        .bind(&drm_type)
        .bind(&license_server_url)
        .bind(&drm_headers)
        .bind(&origin)
        .bind(&user_agent)
        .bind(&referer)
        .bind(&custom_headers)
        .bind(&proxy_url)
        .bind(&doh_url)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        // Fetch the updated content using the standard join query
        let updated_content = sqlx::query_as::<_, ContentJoined>(
            &format!("{} WHERE mc.id = $1", crate::services::content::sql::CONTENT_JOIN_SELECT)
        )
        .bind(channel_id)
        .fetch_one(&self.db)
        .await?;

        Ok(updated_content)
    }


    // Get TV channels with pagination
    pub async fn get_tv_channels(
        &self,
        page: Option<i32>,
        limit: Option<i32>,
    ) -> Result<Vec<ContentJoined>, AppError> {
        let tv_category = self
            .get_category_by_type("TV")
            .await?
            .ok_or_else(|| AppError::BadRequest("TV category not found".to_string()))?;

        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(200).clamp(1, 500); // Increased default to 200, max to 500
        let offset = (page - 1) * limit;

        let sql = format!("{} WHERE mc.category_id = $1 ORDER BY mc.title LIMIT $2 OFFSET $3", CONTENT_JOIN_SELECT);
        let content = sqlx::query_as::<_, ContentJoined>(&sql)
        .bind(tv_category.id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db)
        .await?;

        Ok(content)
    }

}
