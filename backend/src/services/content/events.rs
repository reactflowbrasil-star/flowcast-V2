use crate::error::AppError;
use crate::models::{
    ContentJoined, Event, EventSchedule, EventWithSchedules,
};
use super::sql::CONTENT_JOIN_SELECT;
use super::types::*;

use super::ContentService;

impl ContentService {

    // Events management with daily scheduling (Req 7.3)
    pub async fn create_event(
        &self,
        request: CreateEventRequest,
    ) -> Result<EventWithSchedules, AppError> {
        // Get Eventos category
        let eventos_category = self
            .get_category_by_type("Eventos")
            .await?
            .ok_or_else(|| AppError::BadRequest("Eventos category not found".to_string()))?;

        // event_type already validated by handler (validate_event_type)

        // Create content entry for the event
        let content_request = CreateContentRequest {
            category_id: eventos_category.id,
            title: request.title,
            description: request.description,
            image_url: request.image_url,
            backdrop_url: None, // Events don't use backdrop
            stream_url: request.stream_url,
            tmdb_id: None, // Events don't use TMDB
            year: None,
            genre: None,
            provider: request.provider,
            country: request.country,
            format: request.format,
            channel_number: None,
            is_live: None,
            drm_keys: request.drm_keys,
            drm_type: None, // Events don't use Widevine by default
            license_server_url: None,
            drm_headers: None,
            // LiveTV specific headers
            origin: request.origin,
            user_agent: request.user_agent,
            referer: request.referer,
            custom_headers: request.custom_headers,
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

        // Create event entry
        let event = sqlx::query_as::<_, Event>(
            r#"
            INSERT INTO activity.events (content_id, event_type)
            VALUES ($1, $2)
            RETURNING id, content_id, event_type, created_at
            "#,
        )
        .bind(content.id)
        .bind(&request.event_type)
        .fetch_one(&self.db)
        .await?;

        Ok(EventWithSchedules {
            id: event.id,
            content,
            event_type: event.event_type,
            schedules: Vec::new(),
            created_at: event.created_at,
        })
    }


    // Create event schedule for daily programming
    pub async fn create_event_schedule(
        &self,
        request: CreateEventScheduleRequest,
    ) -> Result<EventSchedule, AppError> {
        // Verify event exists
        let _event = sqlx::query_as::<_, Event>(
            "SELECT id, content_id, event_type, created_at FROM activity.events WHERE id = $1",
        )
        .bind(request.event_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| AppError::NotFound)?;

        // Check if schedule already exists for this date and time
        let existing = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM activity.event_schedules WHERE event_id = $1 AND schedule_date = $2 AND start_time = $3"
        )
        .bind(request.event_id)
        .bind(request.schedule_date)
        .bind(request.start_time)
        .fetch_one(&self.db)
        .await?;

        if existing > 0 {
            return Err(AppError::BadRequest(
                "Schedule already exists for this date and time".to_string(),
            ));
        }

        // Store stream URL directly (no encryption)
        let stream_url = request.stream_url;

        // Create schedule
        let schedule = sqlx::query_as::<_, EventSchedule>(
            r#"
            INSERT INTO activity.event_schedules (event_id, schedule_date, start_time, end_time, stream_url, title, description, image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, event_id, schedule_date, start_time, end_time, stream_url, title, description, image_url, created_at
            "#
        )
        .bind(request.event_id)
        .bind(request.schedule_date)
        .bind(request.start_time)
        .bind(request.end_time)
        .bind(&stream_url)
        .bind(&request.title)
        .bind(&request.description)
        .bind(&request.image_url)
        .fetch_one(&self.db)
        .await?;

        Ok(schedule)
    }


    // Get event by ID with all schedules
    pub async fn get_event_by_id(&self, id: i64) -> Result<Option<EventWithSchedules>, AppError> {
        // Get event first
        let event = sqlx::query_as::<_, Event>(
            "SELECT id, content_id, event_type, created_at FROM activity.events WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        if let Some(event) = event {
            // Get content
            let sql = format!("{} WHERE mc.id = $1", CONTENT_JOIN_SELECT);
            let content = sqlx::query_as::<_, ContentJoined>(&sql)
            .bind(event.content_id)
            .fetch_one(&self.db)
            .await?;

            // Get schedules
            let schedules = sqlx::query_as::<_, EventSchedule>(
                "SELECT id, event_id, schedule_date, start_time, end_time, stream_url, title, description, image_url, created_at FROM activity.event_schedules WHERE event_id = $1 ORDER BY schedule_date, start_time"
            )
            .bind(id)
            .fetch_all(&self.db)
            .await?;

            Ok(Some(EventWithSchedules {
                id: event.id,
                content,
                event_type: event.event_type,
                schedules,
                created_at: event.created_at,
            }))
        } else {
            Ok(None)
        }
    }

}
