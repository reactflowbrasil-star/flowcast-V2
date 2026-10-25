use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    models::UserRole,
    services::{Claims, ContentService, DrmService},
};
use super::m3u::parse_m3u_bulk;

// ----- Bulk content import from M3U/M3U8 -----

#[derive(Debug, Deserialize)]
pub struct BulkMovieImportRequest {
    pub text: String,
    /// Category type to import into (defaults to "vod")
    pub category_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BulkMovieImportResponseItem {
    pub id: i64,
    pub title: String,
    pub error: Option<String>,
}

/// Sanitise an M3U channel name: strip resolution tags, quality markers,
/// geo-block indicators, and other noise so the stored title is clean.
fn sanitize_m3u_name(raw: &str) -> String {
    use regex::Regex;
    // Lazy-init would be ideal, but for clarity we compile inline.
    // Patterns: (720p), (1080p), (2160p), (504p), (480p), (576p), (360p), (226p), (712p), (406p) etc.
    let re_resolution = Regex::new(r"\s*\(\d+p\)").expect("resolution regex must compile");
    // Patterns: [Geo-blocked], [Not 24/7]
    let re_brackets = Regex::new(r"\s*\[([^\]]+)\]").expect("brackets regex must compile");

    let name = re_resolution.replace_all(raw, "");
    let name = re_brackets.replace_all(&name, "");
    name.trim().to_string()
}

/// Take only the first semicolon-separated value from group-title.
/// e.g. "Movies;Series" → "Movies", "Kids;Movies" → "Kids"
fn clean_group_title(raw: &str) -> String {
    raw.split(';').next().unwrap_or(raw).trim().to_string()
}

pub async fn bulk_import_movies(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkMovieImportRequest>,
) -> Result<(StatusCode, Json<Vec<BulkMovieImportResponseItem>>), AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    tracing::info!(user_id = %claims.sub, "bulk_import_content invoked");
    tracing::debug!(
        category_type = ?req.category_type,
        text_length = req.text.len(),
        "bulk_import_content request summary"
    );

    // Resolve category_id from category_type (default "vod")
    // Frontend sends lowercase ContentType values; DB stores mixed-case CategoryType values
    let raw_type = req.category_type.as_deref().unwrap_or("vod");
    let category_type = match raw_type {
        "vod" => "VOD",
        "tv" => "TV",
        "series" => "Series",
        "kids" => "Kids",
        "anime" => "Anime",
        "events" => "Eventos",
        other => other, // pass-through for already-correct values
    };
    let category = content_service
        .get_category_by_type(category_type)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("Category type '{}' not found", category_type))
        })?;
    let category_id = category.id;

    // Parse M3U text
    let entries = match parse_m3u_bulk(&req.text) {
        Ok(e) => e,
        Err(err) => {
            tracing::error!(error = %err, user = %claims.sub, "bulk_import_content: failed to parse M3U");
            return Err(err);
        }
    };

    tracing::info!(
        entry_count = entries.len(),
        "bulk_import_content: parsed entries"
    );

    // ---------- Sanitisation pass ----------
    let mut seen_urls = std::collections::HashSet::new();
    let mut results: Vec<BulkMovieImportResponseItem> = Vec::new();

    // Determine if this is a series-type import (Series or Anime)
    let is_series_import = category_type == "Series" || category_type == "Anime";

    // S01E01 detection regex — matches patterns like:
    //   "Breaking Bad S01E01 - Pilot"
    //   "Friends S02 E05 The One With Five Steaks"
    //   "Naruto S1E1"
    //   "Show Name - S01E01 - Episode Title"
    let series_re = regex::Regex::new(
        r"(?i)^(.+?)\s*[-–]?\s*[Ss](\d{1,2})\s*[Ee](\d{1,3})(?:\s*[-–]\s*(.+))?$",
    )
    .expect("series regex must compile");

    // Track already-created series → (series_id_in_series_table, content_id)
    // and seasons → season_id  (keyed by (series_db_id, season_number))
    let mut series_map: std::collections::HashMap<String, (i64, i64)> =
        std::collections::HashMap::new();
    let mut season_map: std::collections::HashMap<(i64, i32), i64> =
        std::collections::HashMap::new();

    for e in entries {
        // 1) Trim & sanitize name
        let clean_name = sanitize_m3u_name(&e.name);
        if clean_name.is_empty() {
            tracing::debug!(raw_name = %e.name, "bulk_import_content: skipping entry with empty name after sanitize");
            continue;
        }

        // 2) Trim & validate stream URL
        let clean_url = e.stream_url.trim().to_string();
        if clean_url.is_empty() {
            tracing::debug!(name = %clean_name, "bulk_import_content: skipping entry with empty stream URL");
            continue;
        }

        // 3) Deduplicate by stream URL
        if !seen_urls.insert(clean_url.clone()) {
            tracing::debug!(name = %clean_name, url = %clean_url, "bulk_import_content: skipping duplicate stream URL");
            results.push(BulkMovieImportResponseItem {
                id: 0,
                title: clean_name,
                error: Some("Duplicate stream URL – skipped".to_string()),
            });
            continue;
        }

        // 4) Clean group title
        let genre = e.group_title.as_deref().map(clean_group_title);
        let logo_url = e
            .logo_url
            .as_ref()
            .map(|u| u.trim().to_string())
            .filter(|u| !u.is_empty());

        // ---------- Series detection branch ----------
        if is_series_import {
            if let Some(caps) = series_re.captures(&clean_name) {
                let series_name = caps
                    .get(1)
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_default();
                let season_num: i32 = caps
                    .get(2)
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or(1);
                let episode_num: i32 = caps
                    .get(3)
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or(1);
                let episode_title = caps
                    .get(4)
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_else(|| format!("Episode {}", episode_num));

                if series_name.is_empty() {
                    // Can't detect series name — fall through to flat content
                } else {
                    let series_name_lower = series_name.to_lowercase();
                    tracing::debug!(
                        series = %series_name, season = season_num, episode = episode_num,
                        ep_title = %episode_title,
                        "bulk_import_content: detected series entry"
                    );

                    // --- Get or create the series ---
                    let (series_db_id, _content_id) = if let Some(ids) =
                        series_map.get(&series_name_lower)
                    {
                        *ids
                    } else {
                        // Try to find existing series by title in this category
                        let existing = sqlx::query_as::<_, (i64, i64)>(
                            "SELECT s.id, s.content_id FROM content.series s \
                             INNER JOIN content.media_content c ON c.id = s.content_id \
                             WHERE LOWER(c.title) = $1 AND c.category_id = $2 \
                             LIMIT 1",
                        )
                        .bind(&series_name_lower)
                        .bind(category_id)
                        .fetch_optional(content_service.get_db())
                        .await;

                        match existing {
                            Ok(Some((sid, cid))) => {
                                tracing::debug!(series = %series_name, series_id = sid, "found existing series");
                                series_map.insert(series_name_lower.clone(), (sid, cid));
                                (sid, cid)
                            }
                            _ => {
                                // Create new series
                                let create_req = crate::services::content::CreateSeriesRequest {
                                    title: series_name.clone(),
                                    description: genre.clone(),
                                    image_url: logo_url.clone(),
                                    tmdb_id: None,
                                    year: None,
                                    total_seasons: season_num, // at least this many
                                    category_type: Some(category_type.to_string()),
                                    episodes_by_season: None,
                                };
                                match content_service.create_series_manual(create_req).await {
                                    Ok(series_detail) => {
                                        let sid = series_detail.id;
                                        let cid = series_detail.content.id;
                                        tracing::info!(series = %series_name, series_id = sid, "created new series");
                                        series_map.insert(series_name_lower.clone(), (sid, cid));
                                        // Pre-populate season_map with auto-created seasons
                                        for s in &series_detail.seasons {
                                            season_map.insert((sid, s.season_number), s.id);
                                        }
                                        (sid, cid)
                                    }
                                    Err(err) => {
                                        tracing::warn!(series = %series_name, error = ?err, "failed to create series");
                                        results.push(BulkMovieImportResponseItem {
                                            id: 0,
                                            title: clean_name,
                                            error: Some(format!(
                                                "Failed to create series '{}': {}",
                                                series_name, err
                                            )),
                                        });
                                        continue;
                                    }
                                }
                            }
                        }
                    };

                    // --- Get or create the season ---
                    let season_id = if let Some(&sid) = season_map.get(&(series_db_id, season_num))
                    {
                        sid
                    } else {
                        // Check if season exists in DB
                        let existing_season = sqlx::query_scalar::<_, i64>(
                            "SELECT id FROM content.seasons WHERE series_id = $1 AND season_number = $2",
                        )
                        .bind(series_db_id)
                        .bind(season_num)
                        .fetch_optional(content_service.get_db())
                        .await;

                        match existing_season {
                            Ok(Some(sid)) => {
                                season_map.insert((series_db_id, season_num), sid);
                                sid
                            }
                            _ => {
                                // Create the season
                                match content_service
                                    .create_season_for_bulk(series_db_id, season_num)
                                    .await
                                {
                                    Ok(season) => {
                                        let sid = season.id;
                                        season_map.insert((series_db_id, season_num), sid);
                                        // Update total_seasons on the series if needed
                                        let _ = sqlx::query(
                                            "UPDATE content.series SET total_seasons = GREATEST(total_seasons, $1) WHERE id = $2"
                                        )
                                        .bind(season_num)
                                        .bind(series_db_id)
                                        .execute(content_service.get_db())
                                        .await;
                                        sid
                                    }
                                    Err(err) => {
                                        tracing::warn!(season = season_num, error = ?err, "failed to create season");
                                        results.push(BulkMovieImportResponseItem {
                                            id: 0,
                                            title: clean_name,
                                            error: Some(format!(
                                                "Failed to create season {}: {}",
                                                season_num, err
                                            )),
                                        });
                                        continue;
                                    }
                                }
                            }
                        }
                    };

                    // --- Create the episode ---
                    // Check for duplicate episode number first
                    let ep_exists = sqlx::query_scalar::<_, i64>(
                        "SELECT COUNT(*) FROM content.episodes WHERE season_id = $1 AND episode_number = $2"
                    )
                    .bind(season_id)
                    .bind(episode_num)
                    .fetch_one(content_service.get_db())
                    .await
                    .unwrap_or(0);

                    if ep_exists > 0 {
                        tracing::debug!(
                            episode = episode_num,
                            season_id,
                            "episode already exists, skipping"
                        );
                        results.push(BulkMovieImportResponseItem {
                            id: 0,
                            title: clean_name,
                            error: Some(format!(
                                "Episode S{:02}E{:02} already exists",
                                season_num, episode_num
                            )),
                        });
                        continue;
                    }

                    let ep_result = sqlx::query_scalar::<_, i64>(
                        r#"INSERT INTO content.episodes (season_id, episode_number, title, description, stream_url, image_url, duration, tmdb_id, air_date)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                           RETURNING id"#
                    )
                    .bind(season_id)
                    .bind(episode_num)
                    .bind(&episode_title)
                    .bind::<Option<&str>>(None)
                    .bind(&clean_url)
                    .bind(&logo_url)
                    .bind::<Option<i32>>(None)   // duration
                    .bind::<Option<i64>>(None)   // tmdb_id
                    .bind::<Option<&str>>(None)  // air_date
                    .fetch_one(content_service.get_db())
                    .await;

                    match ep_result {
                        Ok(ep_id) => {
                            // Update season episode count
                            let _ = sqlx::query(
                                "UPDATE content.seasons SET total_episodes = (SELECT COUNT(*) FROM content.episodes WHERE season_id = $1) WHERE id = $1"
                            )
                            .bind(season_id)
                            .execute(content_service.get_db())
                            .await;

                            results.push(BulkMovieImportResponseItem {
                                id: ep_id,
                                title: format!(
                                    "{} S{:02}E{:02} - {}",
                                    series_name, season_num, episode_num, episode_title
                                ),
                                error: None,
                            });
                        }
                        Err(err) => {
                            tracing::warn!(name = %clean_name, error = ?err, "failed to create episode");
                            results.push(BulkMovieImportResponseItem {
                                id: 0,
                                title: clean_name,
                                error: Some(format!("{}", err)),
                            });
                        }
                    }
                    continue;
                }
            }
            // If we get here, the entry didn't match series pattern — fall through to flat content below
        }

        // ---------- Flat content creation (VOD, Kids, or non-matching series entries) ----------
        let service_request = crate::services::content::CreateContentRequest {
            category_id,
            title: clean_name.clone(),
            description: genre.clone(),
            image_url: logo_url,
            backdrop_url: None,
            stream_url: clean_url,
            tmdb_id: None,
            year: None,
            genre,
            provider: e.provider.clone(),
            country: None,
            format: None,
            channel_number: None,
            is_live: Some(false),
            drm_keys: e.drm_keys_hex.clone(),
            drm_type: if e.drm_keys_hex.is_some() {
                Some("clearkey".to_string())
            } else {
                None
            },
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

        match content_service.create_content_manual(service_request).await {
            Ok(content) => {
                results.push(BulkMovieImportResponseItem {
                    id: content.id,
                    title: clean_name,
                    error: None,
                });
            }
            Err(err) => {
                tracing::warn!(name = %clean_name, error = ?err, "bulk_import_content: failed to create entry, continuing");
                results.push(BulkMovieImportResponseItem {
                    id: 0,
                    title: clean_name,
                    error: Some(format!("{}", err)),
                });
            }
        }
    }

    Ok((StatusCode::CREATED, Json(results)))
}

// ----- Bulk TV channel import -----

#[derive(Debug, Deserialize)]
pub struct BulkTvImportRequest {
    pub text: String,
    pub provider: Option<String>,
    pub description: Option<String>,
    pub format: Option<String>, // "DRM" or "M3U8"
    pub country: Option<String>,
    pub start_channel_number: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct BulkTvImportResponseItem {
    pub id: i64,
    pub name: String,
    pub channel_number: Option<i64>,
    // Optional per-entry error message when a channel failed to import
    pub error: Option<String>,
}

pub async fn bulk_import_tv_channels(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkTvImportRequest>,
) -> Result<(StatusCode, Json<Vec<BulkTvImportResponseItem>>), AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // --- Debug logging for bulk import ---
    tracing::info!(user_id = %claims.sub, "bulk_import_tv_channels invoked");
    tracing::debug!(
        provider = ?req.provider,
        format = ?req.format,
        start_channel_number = ?req.start_channel_number,
        text_length = req.text.len(),
        "bulk_import_tv_channels request summary"
    );
    let snippet: String = req.text.chars().take(1000).collect();
    tracing::debug!(snippet = %snippet, "bulk_import_tv_channels text (truncated, first 1000 chars)");

    let mut next_channel = if let Some(n) = req.start_channel_number {
        n
    } else {
        content_service.get_next_tv_channel_number().await?
    };

    // Parse input text to owned entries first (no await inside parsing)
    let entries = match parse_m3u_bulk(&req.text) {
        Ok(e) => e,
        Err(err) => {
            tracing::error!(error = %err, user = %claims.sub, "bulk_import_tv_channels: failed to parse M3U/KODIPROP");
            let snippet: String = req.text.chars().take(2000).collect();
            tracing::error!(snippet = %snippet, "bulk_import_tv_channels: input (truncated)");
            return Err(err);
        }
    };

    // Create channels sequentially
    let mut results: Vec<BulkTvImportResponseItem> = Vec::new();
    for e in entries {
        let inferred_format = match req.format.clone() {
            Some(f) => {
                if f.eq_ignore_ascii_case("DRM") {
                    if e.drm_keys_hex.is_some() {
                        Some("DRM".into())
                    } else {
                        tracing::warn!("bulk_import: global format=DRM but no DRM keys for channel '{}', falling back to M3U8", e.name);
                        Some("M3U8".into())
                    }
                } else {
                    Some(f)
                }
            }
            None => {
                if e.drm_keys_hex.is_some() {
                    Some("DRM".into())
                } else {
                    Some("M3U8".into())
                }
            }
        };

        let mut create_req = crate::services::content::CreateTvChannelRequest {
            name: e.name.clone(),
            description: req.description.clone(),
            logo_url: e.logo_url.clone(),
            stream_url: e.stream_url.clone(),
            channel_number: Some(next_channel),
            is_live: true,
            channel_category: e.group_title.clone(),
            provider: e.provider.clone().or(req.provider.clone()),
            country: req.country.clone(),
            format: inferred_format.clone(),
            drm_keys: e.drm_keys_hex.clone(),
            drm_type: None,
            license_server_url: None,
            drm_headers: None,
            origin: None,
            user_agent: None,
            referer: None,
            custom_headers: None,
            proxy_url: None,
            doh_url: None,
        };

        // Validate DRM keys only if present
        if let Some(ref keys) = create_req.drm_keys {
            if !keys.trim().is_empty() {
                DrmService::validate_hex_keys(keys)?;
            } else {
                tracing::warn!(
                    "bulk_import: empty drm_keys for channel '{}', ignoring drm_keys",
                    create_req.name
                );
                create_req.drm_keys = None;
            }
        }

        // Try to create the channel with fallback on DRM errors
        let created = match content_service
            .create_tv_channel(crate::services::content::CreateTvChannelRequest {
                name: e.name.clone(),
                description: req.description.clone(),
                logo_url: e.logo_url.clone(),
                stream_url: e.stream_url.clone(),
                channel_number: Some(next_channel),
                is_live: true,
                channel_category: e.group_title.clone(),
                provider: e.provider.clone().or(req.provider.clone()),
                country: req.country.clone(),
                format: inferred_format.clone(),
                drm_keys: e.drm_keys_hex.clone(),
                drm_type: None,
                license_server_url: None,
                drm_headers: None,
                origin: None,
                user_agent: None,
                referer: None,
                custom_headers: None,
                proxy_url: None,
                doh_url: None,
            })
            .await
        {
            Ok(c) => c,
            Err(AppError::BadRequest(msg)) => {
                tracing::warn!(channel = %e.name, reason = %msg, "create_tv_channel returned BadRequest; attempting fallback without drm_keys");
                // Fallback: strip drm keys and force M3U8 for this entry
                match content_service
                    .create_tv_channel(crate::services::content::CreateTvChannelRequest {
                        name: e.name.clone(),
                        description: req.description.clone(),
                        logo_url: e.logo_url.clone(),
                        stream_url: e.stream_url.clone(),
                        channel_number: Some(next_channel),
                        is_live: true,
                        channel_category: e.group_title.clone(),
                        provider: e.provider.clone().or(req.provider.clone()),
                        country: req.country.clone(),
                        format: Some("M3U8".into()),
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
                    })
                    .await
                {
                    Ok(c2) => {
                        tracing::info!(channel = %e.name, "create_tv_channel succeeded on fallback without drm_keys");
                        c2
                    }
                    Err(err2) => {
                        tracing::error!(channel = %e.name, error = ?err2, "Fallback create_tv_channel also failed");
                        return Err(err2);
                    }
                }
            }
            Err(err) => {
                tracing::error!(channel = %e.name, error = ?err, "Failed creating channel during bulk import");
                return Err(err);
            }
        };

        results.push(BulkTvImportResponseItem {
            id: created.id,
            name: e.name.clone(),
            channel_number: created.channel_number,
            error: None,
        });
        next_channel += 1;
    }

    Ok((StatusCode::CREATED, Json(results)))
}

// POST /api/admin/content/bulk-delete - Bulk delete content items (admin only)
#[derive(Debug, Deserialize)]
pub struct BulkDeleteRequest {
    pub ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
pub struct BulkDeleteResponseItem {
    pub id: i64,
    pub success: bool,
    pub error: Option<String>,
}

pub async fn bulk_delete_content(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkDeleteRequest>,
) -> Result<Json<Vec<BulkDeleteResponseItem>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    tracing::info!(
        user_id = %claims.sub,
        delete_count = req.ids.len(),
        "bulk_delete_content invoked"
    );

    let mut results: Vec<BulkDeleteResponseItem> = Vec::with_capacity(req.ids.len());
    for id in req.ids {
        match content_service.delete_content(id).await {
            Ok(_) => {
                tracing::info!(content_id = id, "Deleted content id via bulk delete");
                results.push(BulkDeleteResponseItem {
                    id,
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                tracing::warn!(content_id = id, error = ?e, "Failed to delete content id in bulk delete");
                // Return per-item error but continue processing others
                results.push(BulkDeleteResponseItem {
                    id,
                    success: false,
                    error: Some(format!("{}", e)),
                });
            }
        }
    }

    Ok(Json(results))
}
