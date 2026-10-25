use axum::{
    extract::{Extension, Path, State},
    response::Json as ResponseJson,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::info;

use crate::{error::AppError, services::Claims, AppState};

// ============================================================================
// Helper Functions
// ============================================================================

/// Convert episode_id from database (where 0 = movie) back to Option (where None = movie).
/// This keeps the watch progress key deterministic for non-episode content.
fn episode_id_from_db(id: i64) -> Option<i64> {
    if id == 0 {
        None
    } else {
        Some(id)
    }
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct SaveWatchProgressRequest {
    #[serde(rename = "contentId")]
    pub content_id: i64,
    #[serde(rename = "contentType")]
    pub content_type: Option<String>,
    #[serde(rename = "episodeId")]
    pub episode_id: Option<i64>,
    #[serde(rename = "positionSeconds")]
    pub position_seconds: i64,
    #[serde(rename = "durationSeconds")]
    pub duration_seconds: i64,
}

#[derive(Debug, Serialize)]
pub struct SaveWatchProgressResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct WatchProgressItem {
    pub content_id: i64,
    pub content_type: String,
    pub episode_id: Option<i64>,
    pub position_seconds: i64,
    pub duration_seconds: i64,
    pub progress_percent: f64,
    pub completed: bool,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct GetWatchProgressResponse {
    pub success: bool,
    pub progress: Option<WatchProgressItem>,
}

#[derive(Debug, Serialize)]
pub struct ContinueWatchingItem {
    pub content_id: i64,
    pub content_type: String,
    pub episode_id: Option<i64>,
    pub position_seconds: i64,
    pub duration_seconds: i64,
    pub progress_percent: f64,
    pub updated_at: String,
    // Content info joined from content table
    pub title: String,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GetContinueWatchingResponse {
    pub success: bool,
    pub items: Vec<ContinueWatchingItem>,
}

#[derive(Debug, Deserialize)]
pub struct GetWatchHistoryQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct WatchHistoryItem {
    pub id: i64,
    pub content_id: Option<i64>,
    pub content_title: String,
    pub content_type: String,
    pub episode_title: Option<String>,
    pub season_number: Option<i32>,
    pub episode_number: Option<i32>,
    pub start_timestamp: String,
    pub series_title: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GetWatchHistoryResponse {
    pub success: bool,
    pub history: Vec<WatchHistoryItem>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

// ============================================================================
// Handlers
// ============================================================================

/// Save user watch progress - persists to database for resume functionality
pub async fn save_watch_progress(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<SaveWatchProgressRequest>,
) -> Result<ResponseJson<SaveWatchProgressResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let pool = &app_state.database.pool;

    // Calculate progress percentage
    let progress_percent = if request.duration_seconds > 0 {
        (request.position_seconds as f64 / request.duration_seconds as f64) * 100.0
    } else {
        0.0
    };

    // Mark as completed if progress > 90%
    let completed = progress_percent > 90.0;

    let content_type = request.content_type.unwrap_or_else(|| "movie".to_string());

    // Skip saving meaningless 0-progress entries (e.g. player sent save before playback started)
    if request.position_seconds == 0 && request.duration_seconds == 0 {
        info!(
            "Skipping watch progress for user {}: content_id={} - both position and duration are 0",
            user_id, request.content_id
        );
        return Ok(ResponseJson(SaveWatchProgressResponse {
            success: true,
            message: "Progress not saved - no playback data".to_string(),
        }));
    }

    // Skip saving progress for live TV and events - they don't make sense to resume
    let content_type_lower = content_type.to_lowercase();
    if matches!(
        content_type_lower.as_str(),
        "tv" | "live" | "live_tv" | "event" | "events"
    ) {
        return Ok(ResponseJson(SaveWatchProgressResponse {
            success: true,
            message: "Progress not saved for live content".to_string(),
        }));
    }

    // Use 0 for movies instead of NULL - SQLite UNIQUE constraint doesn't work with NULL values
    let episode_id = request.episode_id.unwrap_or(0);

    info!(
        "Saving watch progress for user {}: content_id={}, episode_id={}, position={}s, progress={:.1}%",
        user_id, request.content_id, episode_id, request.position_seconds, progress_percent
    );

    // Upsert progress (insert or update on conflict)
    sqlx::query(
        r#"
        INSERT INTO activity.user_watch_progress 
            (user_id, content_id, content_type, episode_id, position_seconds, duration_seconds, progress_percent, completed, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, content_id, episode_id) DO UPDATE SET
            position_seconds = excluded.position_seconds,
            duration_seconds = excluded.duration_seconds,
            progress_percent = excluded.progress_percent,
            completed = excluded.completed,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(user_id)
    .bind(request.content_id)
    .bind(&content_type)
    .bind(episode_id)
    .bind(request.position_seconds)
    .bind(request.duration_seconds)
    .bind(progress_percent)
    .bind(completed)
    .execute(pool)
    .await?;

    Ok(ResponseJson(SaveWatchProgressResponse {
        success: true,
        message: "Progress saved".to_string(),
    }))
}

/// Get watch progress for a specific content item
pub async fn get_watch_progress(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((content_id, episode_id)): Path<(i64, Option<i64>)>,
) -> Result<ResponseJson<GetWatchProgressResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let pool = &app_state.database.pool;

    // Use 0 for movies instead of NULL - SQLite UNIQUE constraint doesn't work with NULL values
    let ep_id = episode_id.unwrap_or(0);

    let progress = sqlx::query(
        r#"
        SELECT content_id, content_type, episode_id, position_seconds, duration_seconds,
               progress_percent, completed, updated_at::text as updated_at
        FROM activity.user_watch_progress
        WHERE user_id = $1 AND content_id = $2 AND episode_id = $3
        "#,
    )
    .bind(user_id)
    .bind(content_id)
    .bind(ep_id)
    .fetch_optional(pool)
    .await?;

    let progress = progress.map(|row| WatchProgressItem {
        content_id: row.get("content_id"),
        content_type: row.get("content_type"),
        episode_id: episode_id_from_db(row.get("episode_id")),
        position_seconds: row.get("position_seconds"),
        duration_seconds: row.get("duration_seconds"),
        progress_percent: row.get("progress_percent"),
        completed: row.get("completed"),
        updated_at: row.get("updated_at"),
    });

    Ok(ResponseJson(GetWatchProgressResponse {
        success: true,
        progress,
    }))
}

/// Get progress for a content item (simpler path without episode)
pub async fn get_content_progress(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(content_id): Path<i64>,
) -> Result<ResponseJson<GetWatchProgressResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let pool = &app_state.database.pool;

    let progress = sqlx::query(
        r#"
        SELECT content_id, content_type, episode_id::bigint as episode_id,
               position_seconds::bigint as position_seconds,
               duration_seconds::bigint as duration_seconds,
               progress_percent::double precision as progress_percent,
               completed, updated_at::text as updated_at
        FROM activity.user_watch_progress
        WHERE user_id = $1 AND content_id = $2
          AND ($3::bigint IS NULL OR episode_id = $3)
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(content_id)
    .bind(None::<i64>) // No specific episode — return latest progress across all episodes
    .fetch_optional(pool)
    .await?;

    let progress = progress.map(|row| WatchProgressItem {
        content_id: row.get("content_id"),
        content_type: row.get("content_type"),
        episode_id: episode_id_from_db(row.get("episode_id")),
        position_seconds: row.get("position_seconds"),
        duration_seconds: row.get("duration_seconds"),
        progress_percent: row.get("progress_percent"),
        completed: row.get("completed"),
        updated_at: row.get("updated_at"),
    });

    Ok(ResponseJson(GetWatchProgressResponse {
        success: true,
        progress,
    }))
}

/// Get continue watching list - items with progress < 90% sorted by most recent
pub async fn get_continue_watching(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<ResponseJson<GetContinueWatchingResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let pool = &app_state.database.pool;

    // Get recent progress items that aren't completed, joined with content metadata.
    // Deduplicate rows to one entry per logical content item by selecting the latest updated row.
    // Exclude live TV and events because they don't make sense to resume.
    let items = sqlx::query(
        r#"
        WITH resolved AS (
            SELECT
                p.content_id,
                COALESCE(NULLIF(p.content_type, ''), 'movie') AS content_type,
                COALESCE(p.episode_id, 0)::bigint AS episode_id,
                COALESCE(p.position_seconds, 0)::bigint AS position_seconds,
                COALESCE(p.duration_seconds, 0)::bigint AS duration_seconds,
                COALESCE(p.progress_percent, 0)::double precision AS progress_percent,
                COALESCE(p.updated_at, CURRENT_TIMESTAMP) AS updated_at_ts,
                COALESCE(p.updated_at::text, CURRENT_TIMESTAMP::text) AS updated_at,
                COALESCE(
                    CASE
                        WHEN ep.id IS NOT NULL THEN
                            COALESCE(series_c.title, ep.title) || ' S' || COALESCE(sea.season_number, 1) || ' - E' || COALESCE(ep.episode_number, 1)
                        ELSE c.title
                    END,
                    'Unknown'
                ) AS title,
                COALESCE(c.image_url, series_c.image_url, ep.image_url) AS poster_url,
                COALESCE(m.backdrop_url, series_m.backdrop_url) AS backdrop_url,
                COALESCE(series_c.id, c.id, p.content_id) AS resume_key
            FROM activity.user_watch_progress p
            LEFT JOIN content.media_content c ON p.content_id = c.id
            LEFT JOIN content.movies m ON c.id = m.media_content_id
            LEFT JOIN content.categories cat ON c.category_id = cat.id
            LEFT JOIN content.episodes ep ON p.episode_id = ep.id AND p.episode_id > 0
            LEFT JOIN content.seasons sea ON ep.season_id = sea.id
            LEFT JOIN content.series ser ON sea.series_id = ser.id
            LEFT JOIN content.media_content series_c ON ser.content_id = series_c.id
            LEFT JOIN content.movies series_m ON series_c.id = series_m.media_content_id
            WHERE p.user_id = $1
              AND p.completed = false
              AND p.progress_percent > 1
              AND p.progress_percent < 90
              AND (cat.category_type IS NULL OR cat.category_type NOT IN ('TV', 'Eventos'))
              AND (p.content_type IS NULL OR LOWER(p.content_type) NOT IN ('tv', 'live', 'live_tv', 'event', 'events'))
        ),
        ranked AS (
            SELECT
                content_id,
                content_type,
                episode_id,
                position_seconds,
                duration_seconds,
                progress_percent,
                updated_at,
                updated_at_ts,
                title,
                poster_url,
                backdrop_url,
                ROW_NUMBER() OVER (PARTITION BY resume_key ORDER BY updated_at_ts DESC) AS rn
            FROM resolved
        )
        SELECT
            content_id,
            content_type,
            episode_id,
            position_seconds,
            duration_seconds,
            progress_percent,
            updated_at,
            title,
            poster_url,
            backdrop_url
        FROM ranked
        WHERE rn = 1
        ORDER BY updated_at_ts DESC
        LIMIT 20
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let items: Vec<ContinueWatchingItem> = items
        .into_iter()
        .map(|row| ContinueWatchingItem {
            content_id: row.try_get("content_id").unwrap_or_default(),
            content_type: row
                .try_get("content_type")
                .unwrap_or_else(|_| "movie".to_string()),
            episode_id: episode_id_from_db(row.try_get("episode_id").unwrap_or(0)),
            position_seconds: row.try_get("position_seconds").unwrap_or(0),
            duration_seconds: row.try_get("duration_seconds").unwrap_or(0),
            progress_percent: row.try_get("progress_percent").unwrap_or(0.0),
            updated_at: row
                .try_get("updated_at")
                .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339()),
            title: row
                .try_get("title")
                .unwrap_or_else(|_| "Unknown".to_string()),
            poster_url: row.try_get("poster_url").unwrap_or(None),
            backdrop_url: row.try_get("backdrop_url").unwrap_or(None),
        })
        .collect();

    info!(
        "Retrieved {} continue watching items for user {}",
        items.len(),
        user_id
    );

    Ok(ResponseJson(GetContinueWatchingResponse {
        success: true,
        items,
    }))
}

/// Get user watch history (viewing history log)
pub async fn get_watch_history(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    axum::extract::Query(query): axum::extract::Query<GetWatchHistoryQuery>,
) -> Result<ResponseJson<GetWatchHistoryResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(50);
    let offset = (page - 1) * limit;

    let pool = &app_state.database.pool;

    let total: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM activity.user_viewing_history WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(pool)
            .await?;

    let history_records = sqlx::query(
        "SELECT id, content_id, content_title, content_type, episode_title, season_number, episode_number, start_timestamp::text as start_timestamp, series_title
         FROM activity.user_viewing_history
         WHERE user_id = $1
         ORDER BY start_timestamp DESC
         LIMIT $2 OFFSET $3",
    )
    .bind(user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let history: Vec<WatchHistoryItem> = history_records
        .into_iter()
        .map(|record| WatchHistoryItem {
            id: record.get("id"),
            content_id: record.get("content_id"),
            content_title: record.get("content_title"),
            content_type: record.get("content_type"),
            episode_title: record.get("episode_title"),
            season_number: record.get("season_number"),
            episode_number: record.get("episode_number"),
            start_timestamp: record.get("start_timestamp"),
            series_title: record.get("series_title"),
        })
        .collect();

    let total_pages = (total + limit - 1) / limit;

    Ok(ResponseJson(GetWatchHistoryResponse {
        success: true,
        history,
        total,
        page,
        limit,
        total_pages,
    }))
}

/// Clear user watch history
pub async fn clear_watch_history(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<ResponseJson<SaveWatchProgressResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let pool = &app_state.database.pool;

    // Clear both viewing history and watch progress
    let history_result = sqlx::query("DELETE FROM activity.user_viewing_history WHERE user_id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;

    let progress_result = sqlx::query("DELETE FROM activity.user_watch_progress WHERE user_id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;

    info!(
        "Cleared {} history + {} progress records for user {}",
        history_result.rows_affected(),
        progress_result.rows_affected(),
        user_id
    );

    Ok(ResponseJson(SaveWatchProgressResponse {
        success: true,
        message: format!(
            "Cleared {} history and {} progress records",
            history_result.rows_affected(),
            progress_result.rows_affected()
        ),
    }))
}
