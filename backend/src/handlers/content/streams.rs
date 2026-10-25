use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::Postgres;
use std::path::Path as StdPath;
use crate::{
    error::AppError,
    models::UserRole,
    services::Claims,
    AppState,
};

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct StreamResponse {
    pub id: i64,
    pub media_content_id: Option<i64>,
    pub episode_id: Option<i64>,
    pub stream_url: String,
    pub stream_type: String,
    pub is_default: bool,
    pub quality: Option<String>,
    pub language: Option<String>,
    pub audio_languages: Option<String>,
    pub format: Option<String>,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<String>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateStreamRequest {
    pub stream_url: String,
    #[serde(default = "default_stream_type")]
    pub stream_type: String,
    #[serde(default)]
    pub is_default: bool,
    pub quality: Option<String>,
    pub language: Option<String>,
    pub audio_languages: Option<String>,
    pub format: Option<String>,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<String>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
}

fn default_stream_type() -> String {
    "main".to_string()
}

#[derive(Debug, Deserialize)]
pub struct UpdateStreamRequest {
    pub stream_url: Option<String>,
    pub stream_type: Option<String>,
    pub is_default: Option<bool>,
    pub quality: Option<String>,
    pub language: Option<String>,
    pub audio_languages: Option<String>,
    pub format: Option<String>,
    pub drm_keys: Option<String>,
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<String>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
}

// ── Row mapping ──────────────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow)]
struct StreamRow {
    id: i64,
    media_content_id: Option<i64>,
    episode_id: Option<i64>,
    stream_url: String,
    stream_type: String,
    is_default: bool,
    quality: Option<String>,
    language: Option<String>,
    audio_languages: Option<String>,
    format: Option<String>,
    drm_keys: Option<String>,
    drm_type: Option<String>,
    license_server_url: Option<String>,
    drm_headers: Option<String>,
    proxy_url: Option<String>,
    doh_url: Option<String>,
    origin: Option<String>,
    user_agent: Option<String>,
    referer: Option<String>,
    custom_headers: Option<String>,
}

impl From<StreamRow> for StreamResponse {
    fn from(r: StreamRow) -> Self {
        Self {
            id: r.id,
            media_content_id: r.media_content_id,
            episode_id: r.episode_id,
            stream_url: r.stream_url,
            stream_type: r.stream_type,
            is_default: r.is_default,
            quality: r.quality,
            language: r.language,
            audio_languages: r.audio_languages,
            format: r.format,
            drm_keys: r.drm_keys,
            drm_type: r.drm_type,
            license_server_url: r.license_server_url,
            drm_headers: r.drm_headers,
            proxy_url: r.proxy_url,
            doh_url: r.doh_url,
            origin: r.origin,
            user_agent: r.user_agent,
            referer: r.referer,
            custom_headers: r.custom_headers,
        }
    }
}

async fn sync_episode_legacy_stream_url(pool: &sqlx::PgPool, episode_id: i64) -> Result<(), AppError> {
    let default_stream_url = sqlx::query_scalar::<_, String>(
        r#"
        SELECT stream_url
        FROM content.media_streams
        WHERE episode_id = $1 AND is_default = true
        ORDER BY id ASC
        LIMIT 1
        "#,
    )
    .bind(episode_id)
    .fetch_optional(pool)
    .await?;

    // Keep legacy /api/episodes/:id/stream consistent with episode streams by mirroring
    // the default episode stream URL when it exists.
    if let Some(stream_url) = default_stream_url {
        sqlx::query("UPDATE content.episodes SET stream_url = $1 WHERE id = $2")
            .bind(stream_url)
            .bind(episode_id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// GET /api/admin/content/:id/streams — list all streams for a content item
pub async fn list_content_streams(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(content_id): Path<i64>,
) -> Result<Json<Vec<StreamResponse>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let rows = sqlx::query_as::<Postgres, StreamRow>(
        r#"
        SELECT id, media_content_id, episode_id, stream_url, stream_type, is_default,
               quality, language, audio_languages, format,
               drm_keys, drm_type, license_server_url, drm_headers,
               proxy_url, doh_url, origin, user_agent, referer, custom_headers
        FROM content.media_streams
        WHERE media_content_id = $1
        ORDER BY is_default DESC, id ASC
        "#,
    )
    .bind(content_id)
    .fetch_all(&app_state.database.pool)
    .await?;

    Ok(Json(rows.into_iter().map(StreamResponse::from).collect()))
}

/// POST /api/admin/content/:id/streams — add a new stream
pub async fn create_content_stream(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(content_id): Path<i64>,
    Json(req): Json<CreateStreamRequest>,
) -> Result<(StatusCode, Json<StreamResponse>), AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    if req.stream_url.trim().is_empty() {
        return Err(AppError::BadRequest("stream_url is required".into()));
    }

    // If this stream is being set as default, unset other defaults first
    if req.is_default {
        sqlx::query("UPDATE content.media_streams SET is_default = false WHERE media_content_id = $1")
            .bind(content_id)
            .execute(&app_state.database.pool)
            .await?;
    }

    // Check if this is the first stream — auto-set as default
    let count: i64 = sqlx::query_scalar::<Postgres, i64>(
        "SELECT COUNT(*) FROM content.media_streams WHERE media_content_id = $1",
    )
    .bind(content_id)
    .fetch_one(&app_state.database.pool)
    .await?;

    let is_default = if count == 0 { true } else { req.is_default };

    let row = sqlx::query_as::<Postgres, StreamRow>(
        r#"
        INSERT INTO content.media_streams (
            media_content_id, stream_url, stream_type, is_default,
            quality, language, audio_languages, format,
            drm_keys, drm_type, license_server_url, drm_headers,
            proxy_url, doh_url, origin, user_agent, referer, custom_headers
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id, media_content_id, episode_id, stream_url, stream_type, is_default,
                  quality, language, audio_languages, format,
                  drm_keys, drm_type, license_server_url, drm_headers,
                  proxy_url, doh_url, origin, user_agent, referer, custom_headers
        "#,
    )
    .bind(content_id)
    .bind(&req.stream_url)
    .bind(&req.stream_type)
    .bind(is_default)
    .bind(&req.quality)
    .bind(&req.language)
    .bind(&req.audio_languages)
    .bind(&req.format)
    .bind(&req.drm_keys)
    .bind(&req.drm_type)
    .bind(&req.license_server_url)
    .bind(&req.drm_headers)
    .bind(&req.proxy_url)
    .bind(&req.doh_url)
    .bind(&req.origin)
    .bind(&req.user_agent)
    .bind(&req.referer)
    .bind(&req.custom_headers)
    .fetch_one(&app_state.database.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row.into())))
}

/// PUT /api/admin/content/:id/streams/:stream_id — update a stream
pub async fn update_content_stream(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((content_id, stream_id)): Path<(i64, i64)>,
    Json(req): Json<UpdateStreamRequest>,
) -> Result<Json<StreamResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // If setting this as default, unset others first
    if req.is_default == Some(true) {
        sqlx::query("UPDATE content.media_streams SET is_default = false WHERE media_content_id = $1 AND id != $2")
            .bind(content_id)
            .bind(stream_id)
            .execute(&app_state.database.pool)
            .await?;
    }

    let row = sqlx::query_as::<Postgres, StreamRow>(
        r#"
        UPDATE content.media_streams SET
            stream_url = COALESCE($3, stream_url),
            stream_type = COALESCE($4, stream_type),
            is_default = COALESCE($5, is_default),
            quality = COALESCE($6, quality),
            language = COALESCE($7, language),
            audio_languages = COALESCE($8, audio_languages),
            format = COALESCE($9, format),
            drm_keys = COALESCE($10, drm_keys),
            drm_type = COALESCE($11, drm_type),
            license_server_url = COALESCE($12, license_server_url),
            drm_headers = COALESCE($13, drm_headers),
            proxy_url = COALESCE($14, proxy_url),
            doh_url = COALESCE($15, doh_url),
            origin = COALESCE($16, origin),
            user_agent = COALESCE($17, user_agent),
            referer = COALESCE($18, referer),
            custom_headers = COALESCE($19, custom_headers)
        WHERE id = $1 AND media_content_id = $2
        RETURNING id, media_content_id, episode_id, stream_url, stream_type, is_default,
                  quality, language, audio_languages, format,
                  drm_keys, drm_type, license_server_url, drm_headers,
                  proxy_url, doh_url, origin, user_agent, referer, custom_headers
        "#,
    )
    .bind(stream_id)
    .bind(content_id)
    .bind(&req.stream_url)
    .bind(&req.stream_type)
    .bind(req.is_default)
    .bind(&req.quality)
    .bind(&req.language)
    .bind(&req.audio_languages)
    .bind(&req.format)
    .bind(&req.drm_keys)
    .bind(&req.drm_type)
    .bind(&req.license_server_url)
    .bind(&req.drm_headers)
    .bind(&req.proxy_url)
    .bind(&req.doh_url)
    .bind(&req.origin)
    .bind(&req.user_agent)
    .bind(&req.referer)
    .bind(&req.custom_headers)
    .fetch_optional(&app_state.database.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row.into()))
}

/// DELETE /api/admin/content/:id/streams/:stream_id — delete a stream
pub async fn delete_content_stream(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((content_id, stream_id)): Path<(i64, i64)>,
) -> Result<StatusCode, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query(
        "DELETE FROM content.media_streams WHERE id = $1 AND media_content_id = $2",
    )
    .bind(stream_id)
    .bind(content_id)
    .execute(&app_state.database.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    // If we deleted the default stream, promote the next one
    let has_default: bool = sqlx::query_scalar::<Postgres, bool>(
        "SELECT EXISTS(SELECT 1 FROM content.media_streams WHERE media_content_id = $1 AND is_default = true)",
    )
    .bind(content_id)
    .fetch_one(&app_state.database.pool)
    .await?;

    if !has_default {
        sqlx::query(
            "UPDATE content.media_streams SET is_default = true WHERE id = (SELECT id FROM content.media_streams WHERE media_content_id = $1 ORDER BY id ASC LIMIT 1)",
        )
        .bind(content_id)
        .execute(&app_state.database.pool)
        .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/content/:id/streams — public: list streams for playback selection
pub async fn list_content_streams_public(
    State(app_state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    Path(content_id): Path<i64>,
) -> Result<Json<Vec<StreamPublicResponse>>, AppError> {
    let rows = sqlx::query_as::<Postgres, StreamRow>(
        r#"
        SELECT id, media_content_id, episode_id, stream_url, stream_type, is_default,
               quality, language, audio_languages, format,
               drm_keys, drm_type, license_server_url, drm_headers,
               proxy_url, doh_url, origin, user_agent, referer, custom_headers
        FROM content.media_streams
        WHERE media_content_id = $1
        ORDER BY is_default DESC, id ASC
        "#,
    )
    .bind(content_id)
    .fetch_all(&app_state.database.pool)
    .await?;

    let streams: Vec<StreamPublicResponse> = rows
        .into_iter()
        .map(|r| {
            // Convert DRM keys to ClearKey JSON if applicable
            let drm_keys_json = if let Some(ref hex_keys) = r.drm_keys {
                if !hex_keys.trim().is_empty() {
                    crate::services::DrmService::convert_hex_keys_to_clearkey_json(hex_keys).ok()
                } else {
                    None
                }
            } else {
                None
            };

            // Determine effective DRM type
            let effective_drm_type = if r.drm_type.is_some() {
                r.drm_type.clone()
            } else if r.license_server_url.is_some() {
                Some("widevine".to_string())
            } else if r.drm_keys.is_some() {
                Some("clearkey".to_string())
            } else {
                None
            };

            // Parse drm_headers JSON
            let drm_headers_parsed: Option<serde_json::Value> = r
                .drm_headers
                .as_ref()
                .and_then(|h| serde_json::from_str(h).ok());

            // Convert local file paths to API file URLs
            let delivery_url = if StdPath::new(&r.stream_url).is_absolute()
                && StdPath::new(&r.stream_url).exists()
            {
                let ext = StdPath::new(&r.stream_url)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("mp4");
                format!("/api/content/stream-file/{}.{}", r.id, ext)
            } else {
                r.stream_url
            };

            StreamPublicResponse {
                id: r.id,
                is_default: r.is_default,
                quality: r.quality,
                language: r.language,
                audio_languages: r.audio_languages,
                format: r.format,
                stream_url: delivery_url,
                drm_keys: r.drm_keys,
                drm_keys_json,
                drm_type: effective_drm_type,
                license_server_url: r.license_server_url,
                drm_headers: drm_headers_parsed,
                proxy_url: r.proxy_url,
                doh_url: r.doh_url,
                origin: r.origin,
                user_agent: r.user_agent,
                referer: r.referer,
                custom_headers: r.custom_headers,
            }
        })
        .collect();

    Ok(Json(streams))
}

/// Public stream response — includes DRM conversion for playback
#[derive(Debug, Serialize, Clone)]
pub struct StreamPublicResponse {
    pub id: i64,
    pub is_default: bool,
    pub quality: Option<String>,
    pub language: Option<String>,
    pub audio_languages: Option<String>,
    pub format: Option<String>,
    pub stream_url: String,
    pub drm_keys: Option<String>,
    pub drm_keys_json: Option<String>,
    pub drm_type: Option<String>,
    pub license_server_url: Option<String>,
    pub drm_headers: Option<serde_json::Value>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
}

// ── Episode Stream Handlers ──────────────────────────────────────────────────

/// GET /api/admin/episodes/:id/streams — list all streams for an episode
pub async fn list_episode_streams(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(episode_id): Path<i64>,
) -> Result<Json<Vec<StreamResponse>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let rows = sqlx::query_as::<Postgres, StreamRow>(
        r#"
        SELECT id, media_content_id, episode_id, stream_url, stream_type, is_default,
               quality, language, audio_languages, format,
               drm_keys, drm_type, license_server_url, drm_headers,
               proxy_url, doh_url, origin, user_agent, referer, custom_headers
        FROM content.media_streams
        WHERE episode_id = $1
        ORDER BY is_default DESC, id ASC
        "#,
    )
    .bind(episode_id)
    .fetch_all(&app_state.database.pool)
    .await?;

    Ok(Json(rows.into_iter().map(StreamResponse::from).collect()))
}

/// POST /api/admin/episodes/:id/streams — add a stream to an episode
pub async fn create_episode_stream(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(episode_id): Path<i64>,
    Json(body): Json<CreateStreamRequest>,
) -> Result<(StatusCode, Json<StreamResponse>), AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // If this should be default, clear existing defaults for this episode
    if body.is_default {
        sqlx::query("UPDATE content.media_streams SET is_default = false WHERE episode_id = $1")
            .bind(episode_id)
            .execute(&app_state.database.pool)
            .await?;
    }

    // Auto-set as default if it's the first stream for this episode
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM content.media_streams WHERE episode_id = $1",
    )
    .bind(episode_id)
    .fetch_one(&app_state.database.pool)
    .await?;
    let is_default = body.is_default || count == 0;

    let row = sqlx::query_as::<Postgres, StreamRow>(
        r#"
        INSERT INTO content.media_streams (
            episode_id, stream_url, stream_type, is_default,
            quality, language, audio_languages, format,
            drm_keys, drm_type, license_server_url, drm_headers,
            proxy_url, doh_url, origin, user_agent, referer, custom_headers
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id, media_content_id, episode_id, stream_url, stream_type, is_default,
                  quality, language, audio_languages, format,
                  drm_keys, drm_type, license_server_url, drm_headers,
                  proxy_url, doh_url, origin, user_agent, referer, custom_headers
        "#,
    )
    .bind(episode_id)
    .bind(&body.stream_url)
    .bind(&body.stream_type)
    .bind(is_default)
    .bind(&body.quality)
    .bind(&body.language)
    .bind(&body.audio_languages)
    .bind(&body.format)
    .bind(&body.drm_keys)
    .bind(&body.drm_type)
    .bind(&body.license_server_url)
    .bind(&body.drm_headers)
    .bind(&body.proxy_url)
    .bind(&body.doh_url)
    .bind(&body.origin)
    .bind(&body.user_agent)
    .bind(&body.referer)
    .bind(&body.custom_headers)
    .fetch_one(&app_state.database.pool)
    .await?;

    sync_episode_legacy_stream_url(&app_state.database.pool, episode_id).await?;

    Ok((StatusCode::CREATED, Json(StreamResponse::from(row))))
}

/// PUT /api/admin/episodes/:episode_id/streams/:stream_id — update an episode stream
pub async fn update_episode_stream(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((episode_id, stream_id)): Path<(i64, i64)>,
    Json(body): Json<UpdateStreamRequest>,
) -> Result<Json<StreamResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Handle default flag
    if body.is_default == Some(true) {
        sqlx::query("UPDATE content.media_streams SET is_default = false WHERE episode_id = $1 AND id != $2")
            .bind(episode_id)
            .bind(stream_id)
            .execute(&app_state.database.pool)
            .await?;
    }

    let row = sqlx::query_as::<Postgres, StreamRow>(
        r#"
        UPDATE content.media_streams SET
            stream_url = COALESCE($3, stream_url),
            stream_type = COALESCE($4, stream_type),
            is_default = COALESCE($5, is_default),
            quality = COALESCE($6, quality),
            language = COALESCE($7, language),
            audio_languages = COALESCE($8, audio_languages),
            format = COALESCE($9, format),
            drm_keys = COALESCE($10, drm_keys),
            drm_type = COALESCE($11, drm_type),
            license_server_url = COALESCE($12, license_server_url),
            drm_headers = COALESCE($13, drm_headers),
            proxy_url = COALESCE($14, proxy_url),
            doh_url = COALESCE($15, doh_url),
            origin = COALESCE($16, origin),
            user_agent = COALESCE($17, user_agent),
            referer = COALESCE($18, referer),
            custom_headers = COALESCE($19, custom_headers)
        WHERE id = $1 AND episode_id = $2
        RETURNING id, media_content_id, episode_id, stream_url, stream_type, is_default,
                  quality, language, audio_languages, format,
                  drm_keys, drm_type, license_server_url, drm_headers,
                  proxy_url, doh_url, origin, user_agent, referer, custom_headers
        "#,
    )
    .bind(stream_id)
    .bind(episode_id)
    .bind(&body.stream_url)
    .bind(&body.stream_type)
    .bind(body.is_default)
    .bind(&body.quality)
    .bind(&body.language)
    .bind(&body.audio_languages)
    .bind(&body.format)
    .bind(&body.drm_keys)
    .bind(&body.drm_type)
    .bind(&body.license_server_url)
    .bind(&body.drm_headers)
    .bind(&body.proxy_url)
    .bind(&body.doh_url)
    .bind(&body.origin)
    .bind(&body.user_agent)
    .bind(&body.referer)
    .bind(&body.custom_headers)
    .fetch_optional(&app_state.database.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    sync_episode_legacy_stream_url(&app_state.database.pool, episode_id).await?;

    Ok(Json(StreamResponse::from(row)))
}

/// DELETE /api/admin/episodes/:episode_id/streams/:stream_id — delete an episode stream
pub async fn delete_episode_stream(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((episode_id, stream_id)): Path<(i64, i64)>,
) -> Result<StatusCode, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    sqlx::query(
        "DELETE FROM content.media_streams WHERE id = $1 AND episode_id = $2",
    )
    .bind(stream_id)
    .bind(episode_id)
    .execute(&app_state.database.pool)
    .await?;

    // Auto-promote a new default if none exist
    let has_default = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM content.media_streams WHERE episode_id = $1 AND is_default = true)",
    )
    .bind(episode_id)
    .fetch_one(&app_state.database.pool)
    .await?;

    if !has_default {
        sqlx::query(
            "UPDATE content.media_streams SET is_default = true WHERE id = (SELECT id FROM content.media_streams WHERE episode_id = $1 ORDER BY id ASC LIMIT 1)",
        )
        .bind(episode_id)
        .execute(&app_state.database.pool)
        .await
        .ok();
    }

    sync_episode_legacy_stream_url(&app_state.database.pool, episode_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/episodes/:id/streams — public: list streams for episode playback selection
pub async fn list_episode_streams_public(
    State(app_state): State<crate::AppState>,
    Extension(_claims): Extension<Claims>,
    Path(episode_id): Path<i64>,
) -> Result<Json<Vec<StreamPublicResponse>>, AppError> {
    let rows = sqlx::query_as::<Postgres, StreamRow>(
        r#"
        SELECT id, media_content_id, episode_id, stream_url, stream_type, is_default,
               quality, language, audio_languages, format,
               drm_keys, drm_type, license_server_url, drm_headers,
               proxy_url, doh_url, origin, user_agent, referer, custom_headers
        FROM content.media_streams
        WHERE episode_id = $1
        ORDER BY is_default DESC, id ASC
        "#,
    )
    .bind(episode_id)
    .fetch_all(&app_state.database.pool)
    .await?;

    let streams: Vec<StreamPublicResponse> = rows
        .into_iter()
        .map(|r| {
            let drm_keys_json = if let Some(ref hex_keys) = r.drm_keys {
                if !hex_keys.trim().is_empty() {
                    crate::services::DrmService::convert_hex_keys_to_clearkey_json(hex_keys).ok()
                } else {
                    None
                }
            } else {
                None
            };

            let effective_drm_type = if r.drm_type.is_some() {
                r.drm_type.clone()
            } else if r.license_server_url.is_some() {
                Some("widevine".to_string())
            } else if r.drm_keys.is_some() {
                Some("clearkey".to_string())
            } else {
                None
            };

            let drm_headers_parsed: Option<serde_json::Value> = r
                .drm_headers
                .as_ref()
                .and_then(|h| serde_json::from_str(h).ok());

            // Convert local file paths to API file URLs
            let delivery_url = if StdPath::new(&r.stream_url).is_absolute()
                && StdPath::new(&r.stream_url).exists()
            {
                let ext = StdPath::new(&r.stream_url)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("mp4");
                format!("/api/content/stream-file/{}.{}", r.id, ext)
            } else {
                r.stream_url
            };

            StreamPublicResponse {
                id: r.id,
                is_default: r.is_default,
                quality: r.quality,
                language: r.language,
                audio_languages: r.audio_languages,
                format: r.format,
                stream_url: delivery_url,
                drm_keys: r.drm_keys,
                drm_keys_json,
                drm_type: effective_drm_type,
                license_server_url: r.license_server_url,
                drm_headers: drm_headers_parsed,
                proxy_url: r.proxy_url,
                doh_url: r.doh_url,
                origin: r.origin,
                user_agent: r.user_agent,
                referer: r.referer,
                custom_headers: r.custom_headers,
            }
        })
        .collect();

    Ok(Json(streams))
}
