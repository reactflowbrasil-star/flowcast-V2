use crate::database::Database;
use crate::error::AppError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{debug, info};

#[derive(Clone)]
pub struct FavoritesService {
    db: Database,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Favorite {
    pub id: i64,
    pub user_id: i64,
    pub content_type: String,
    pub content_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct FavoriteWithContent {
    pub favorite: Favorite,
    pub content: Option<FavoriteContentDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FavoriteContentDto {
    pub id: i64,
    pub category_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub poster_url: Option<String>,
    pub image_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub stream_url: Option<String>,
    pub tmdb_id: Option<i64>,
    pub year: Option<i64>,
    pub active: bool,
    pub created_at: String,
    pub channel_number: Option<i64>,
    pub channel_category: Option<String>,
    pub is_live: Option<bool>,
    pub drm_keys: Option<String>,
    pub content_type: Option<String>,
    pub origin: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub custom_headers: Option<String>,
    pub proxy_url: Option<String>,
    pub doh_url: Option<String>,
}

#[derive(Debug, Serialize, Default)]
pub struct FavoritesContentData {
    pub movies: Vec<FavoriteContentDto>,
    pub series: Vec<FavoriteContentDto>,
    pub channels: Vec<FavoriteContentDto>,
    pub music_tracks: Vec<FavoriteContentDto>,
    pub music_albums: Vec<FavoriteContentDto>,
    pub music_artists: Vec<FavoriteContentDto>,
}

#[derive(Debug, Deserialize)]
pub struct AddFavoriteRequest {
    pub content_type: String,
    pub content_id: String,
}

impl FavoritesService {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Add a favorite for a user
    pub async fn add_favorite(
        &self,
        user_id: i64,
        content_type: &str,
        content_id: &str,
    ) -> Result<Favorite, AppError> {
        info!(
            "Adding favorite for user {}: {} {}",
            user_id, content_type, content_id
        );

        // Validate content type
        let valid_types = ["movie", "series", "channel"];
        if !valid_types.contains(&content_type) {
            return Err(AppError::BadRequest(format!(
                "Invalid content type: {}. Must be one of: {}",
                content_type,
                valid_types.join(", ")
            )));
        }

        let result = sqlx::query(
            "INSERT INTO activity.user_favorites (user_id, content_type, content_id) 
             VALUES ($1, $2, $3)
             ON CONFLICT(user_id, content_type, content_id) DO NOTHING
             RETURNING id, user_id, content_type, content_id, created_at",
        )
        .bind(user_id)
        .bind(content_type)
        .bind(content_id)
        .fetch_optional(&self.db.pool)
        .await?;

        match result {
            Some(row) => {
                let favorite = Favorite {
                    id: row.get("id"),
                    user_id: row.get("user_id"),
                    content_type: row.get("content_type"),
                    content_id: row.get("content_id"),
                    created_at: row.get("created_at"),
                };
                info!("Favorite added successfully: {:?}", favorite);
                Ok(favorite)
            }
            None => {
                // Already exists, fetch it
                let row = sqlx::query(
                    "SELECT id, user_id, content_type, content_id, created_at 
                     FROM activity.user_favorites 
                     WHERE user_id = $1 AND content_type = $2 AND content_id = $3",
                )
                .bind(user_id)
                .bind(content_type)
                .bind(content_id)
                .fetch_one(&self.db.pool)
                .await?;

                Ok(Favorite {
                    id: row.get("id"),
                    user_id: row.get("user_id"),
                    content_type: row.get("content_type"),
                    content_id: row.get("content_id"),
                    created_at: row.get("created_at"),
                })
            }
        }
    }

    /// Remove a favorite
    pub async fn remove_favorite(
        &self,
        user_id: i64,
        content_type: &str,
        content_id: &str,
    ) -> Result<bool, AppError> {
        debug!(
            "Removing favorite for user {}: {} {}",
            user_id, content_type, content_id
        );

        let result = sqlx::query(
            "DELETE FROM activity.user_favorites 
             WHERE user_id = $1 AND content_type = $2 AND content_id = $3",
        )
        .bind(user_id)
        .bind(content_type)
        .bind(content_id)
        .execute(&self.db.pool)
        .await?;

        let removed = result.rows_affected() > 0;
        if removed {
            info!("Favorite removed successfully");
        } else {
            debug!("Favorite not found");
        }

        Ok(removed)
    }

    /// Check if content is favorited
    pub async fn is_favorite(
        &self,
        user_id: i64,
        content_type: &str,
        content_id: &str,
    ) -> Result<bool, AppError> {
        let result = sqlx::query(
            "SELECT COUNT(*) as count FROM activity.user_favorites 
             WHERE user_id = $1 AND content_type = $2 AND content_id = $3",
        )
        .bind(user_id)
        .bind(content_type)
        .bind(content_id)
        .fetch_one(&self.db.pool)
        .await?;

        let count: i64 = result.get("count");
        Ok(count > 0)
    }

    /// Get all favorites for a user
    pub async fn get_user_favorites(&self, user_id: i64) -> Result<Vec<Favorite>, AppError> {
        debug!("Getting all favorites for user {}", user_id);

        let favorites_with_content = self.get_user_favorites_with_content(user_id).await?;
        let favorites = favorites_with_content
            .into_iter()
            .map(|entry| entry.favorite)
            .collect::<Vec<_>>();

        info!("Found {} favorites for user {}", favorites.len(), user_id);
        Ok(favorites)
    }

    pub async fn get_user_favorites_with_content(
        &self,
        user_id: i64,
    ) -> Result<Vec<FavoriteWithContent>, AppError> {
        debug!("Getting favorites with content for user {}", user_id);

        // 1. Fetch favorites from Activity schema
        let favorites_rows = sqlx::query(
            r#"
            SELECT
                id AS fav_id,
                user_id AS fav_user_id,
                content_type AS fav_content_type,
                content_id AS fav_content_id,
                created_at AS fav_created_at
            FROM activity.user_favorites
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.db.pool)
        .await?;

        if favorites_rows.is_empty() {
            return Ok(vec![]);
        }

        // Collect Content IDs
        let mut content_ids: Vec<i64> = Vec::new();
        let mut favorites_map: std::collections::HashMap<i64, Favorite> = std::collections::HashMap::new();

        for row in favorites_rows {
            let fav_id: i64 = row.get("fav_id");
            let fav_user_id: i64 = row.get("fav_user_id");
            let fav_content_type: String = row.get("fav_content_type");
            let fav_content_id_str: String = row.get("fav_content_id");
            let fav_created_at: DateTime<Utc> = row.get("fav_created_at");

            let favorite = Favorite {
                id: fav_id,
                user_id: fav_user_id,
                content_type: fav_content_type,
                content_id: fav_content_id_str.clone(),
                created_at: fav_created_at,
            };

            if let Ok(c_id) = fav_content_id_str.parse::<i64>() {
                content_ids.push(c_id);
                favorites_map.insert(c_id, favorite);
            }
        }

        // 2. Fetch related content from Content Schema (API Composition Simulation)
        let mut content_dtos_map: std::collections::HashMap<i64, FavoriteContentDto> = std::collections::HashMap::new();
        
        if !content_ids.is_empty() {
            let content_rows = sqlx::query(
                r#"
                SELECT
                    c.id AS content_id,
                    c.category_id AS content_category_id,
                    c.title AS content_title,
                    c.description AS content_description,
                    c.image_url AS content_image_url,
                    m.backdrop_url AS content_backdrop_url,
                    s.stream_url AS content_stream_url,
                    m.tmdb_id AS content_tmdb_id,
                    m.year AS content_year,
                    c.active AS content_active,
                    c.created_at AS content_created_at,
                    t.channel_number AS content_channel_number,
                    COALESCE(t.channel_category, m.genre) AS content_channel_category,
                    t.is_live AS content_is_live,
                    s.drm_keys AS content_drm_keys,
                    s.origin AS content_origin,
                    s.user_agent AS content_user_agent,
                    s.referer AS content_referer,
                    s.custom_headers AS content_custom_headers,
                    s.proxy_url AS content_proxy_url,
                    s.doh_url AS content_doh_url,
                    cat.category_type AS content_category_type
                FROM content.media_content c
                LEFT JOIN content.movies m ON c.id = m.media_content_id
                LEFT JOIN content.tv_channels t ON c.id = t.media_content_id
                LEFT JOIN content.media_streams s ON c.id = s.media_content_id AND s.is_default = true
                LEFT JOIN content.categories cat ON cat.id = c.category_id
                WHERE c.id = ANY($1)
                "#,
            )
            .bind(&content_ids)
            .fetch_all(&self.db.pool)
            .await?;

            for row in content_rows {
                let content_id: i64 = row.get("content_id");
                
                let favorite_fallback_type = favorites_map.get(&content_id).map(|f| f.content_type.clone());
                
                let category_type: Option<String> = row.try_get("content_category_type").unwrap_or(None);
                let content_type = category_type
                    .as_deref()
                    .and_then(Self::map_category_type)
                    .or(favorite_fallback_type);

                let created_at = row
                    .try_get::<Option<DateTime<Utc>>, _>("content_created_at")
                    .unwrap_or(None)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

                let dto = FavoriteContentDto {
                    id: content_id,
                    category_id: row.try_get::<Option<i64>, _>("content_category_id").unwrap_or(None).unwrap_or(0),
                    title: row.get("content_title"),
                    description: row.try_get("content_description").unwrap_or(None),
                    poster_url: row.try_get("content_image_url").unwrap_or(None),
                    image_url: row.try_get("content_image_url").unwrap_or(None),
                    backdrop_url: row.try_get("content_backdrop_url").unwrap_or(None),
                    stream_url: row.try_get("content_stream_url").unwrap_or(None),
                    tmdb_id: row.try_get("content_tmdb_id").unwrap_or(None),
                    year: row.try_get("content_year").unwrap_or(None),
                    active: row.get("content_active"),
                    created_at,
                    channel_number: row.try_get("content_channel_number").unwrap_or(None),
                    channel_category: row.try_get("content_channel_category").unwrap_or(None),
                    is_live: row.try_get("content_is_live").unwrap_or(None),
                    drm_keys: row.try_get("content_drm_keys").unwrap_or(None),
                    content_type,
                    origin: row.try_get("content_origin").unwrap_or(None),
                    user_agent: row.try_get("content_user_agent").unwrap_or(None),
                    referer: row.try_get("content_referer").unwrap_or(None),
                    custom_headers: row.try_get("content_custom_headers").unwrap_or(None),
                    proxy_url: row.try_get("content_proxy_url").unwrap_or(None),
                    doh_url: row.try_get("content_doh_url").unwrap_or(None),
                };
                content_dtos_map.insert(content_id, dto);
            }
        }

        // 3. Assemble results 
        let mut results = Vec::new();
        // Since we want to order by created_at DESC as originally logic did
        let mut sorted_favorites: Vec<&Favorite> = favorites_map.values().collect();
        sorted_favorites.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        for fav in sorted_favorites {
            if let Ok(c_id) = fav.content_id.parse::<i64>() {
                results.push(FavoriteWithContent {
                    favorite: fav.clone(),
                    content: content_dtos_map.get(&c_id).cloned(),
                });
            } else {
                results.push(FavoriteWithContent {
                    favorite: fav.clone(),
                    content: None,
                });
            }
        }

        info!(
            "Found {} favorites with content for user {}",
            results.len(),
            user_id
        );

        Ok(results)
    }

    pub async fn get_favorites_by_type(
        &self,
        user_id: i64,
        content_type: &str,
    ) -> Result<Vec<Favorite>, AppError> {
        debug!("Getting {} favorites for user {}", content_type, user_id);

        let rows = sqlx::query(
            "SELECT id, user_id, content_type, content_id, created_at 
             FROM activity.user_favorites 
             WHERE user_id = $1 AND content_type = $2 
             ORDER BY created_at DESC",
        )
        .bind(user_id)
        .bind(content_type)
        .fetch_all(&self.db.pool)
        .await?;

        let favorites: Vec<Favorite> = rows
            .iter()
            .map(|row| Favorite {
                id: row.get("id"),
                user_id: row.get("user_id"),
                content_type: row.get("content_type"),
                content_id: row.get("content_id"),
                created_at: row.get("created_at"),
            })
            .collect();

        info!(
            "Found {} {} favorites for user {}",
            favorites.len(),
            content_type,
            user_id
        );
        Ok(favorites)
    }

    /// Get favorite count by type
    pub async fn get_favorites_count_by_type(
        &self,
        user_id: i64,
    ) -> Result<std::collections::HashMap<String, i64>, AppError> {
        debug!("Getting favorites count by type for user {}", user_id);

        let rows = sqlx::query(
            "SELECT content_type, COUNT(*) as count 
             FROM activity.user_favorites 
             WHERE user_id = $1 
             GROUP BY content_type",
        )
        .bind(user_id)
        .fetch_all(&self.db.pool)
        .await?;

        let mut counts = std::collections::HashMap::new();
        for row in rows {
            let content_type: String = row.get("content_type");
            let count: i64 = row.get("count");
            counts.insert(content_type, count);
        }

        Ok(counts)
    }



    fn map_category_type(category_type: &str) -> Option<String> {
        let normalized = category_type.to_lowercase();
        let mapped = match normalized.as_str() {
            "vod" => "movie",
            "movie" | "movies" => "movie",
            "tv" | "live_tv" | "livetv" | "channel" | "channels" => "channel",
            "series" | "anime" | "tv_series" | "tvshows" | "show" => "series",
            "events" | "eventos" => "movie",
            "kids" | "kid" | "children" | "infantil" => "movie",
            other => other,
        };
        Some(mapped.to_string())
    }
}
