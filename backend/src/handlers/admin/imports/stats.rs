use axum::{
    extract::{Path, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::QueryBuilder;

use crate::error::AppError;
use crate::models::user::{
    UpdateResellerDemoLimitRequest, User, UserRole,
};
use crate::services::Claims;
use super::users::{UserResponse};
use crate::handlers::admin::{calculate_system_uptime, SystemConfigResponse};

const PLATFORM_VERSION: &str = "1.1.2";


// GET /api/admin/stats - Get system statistics
#[derive(Debug, Serialize)]
pub struct SystemStats {
    pub total_users: i64,
    pub total_resellers: i64,
    pub total_content: i64,
    pub total_content_raw: i64,
    pub total_music_tracks: i64,
    pub content_multiplier: f64,
    pub total_active_devices: i64,
    pub total_credits_used: f64,
    pub system_uptime: String,
}

pub async fn get_system_stats(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<SystemStats>, AppError> {
    // Only admins can access system stats
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Get total users count
    let total_users =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM auth.users WHERE role = 'end_user'")
            .fetch_one(&app_state.database.pool)
            .await
            .unwrap_or(0);

    // Get total resellers count
    let total_resellers =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM auth.users WHERE role = 'reseller'")
            .fetch_one(&app_state.database.pool)
            .await
            .unwrap_or(0);

    // Get total content count
    let content_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM content.media_content")
        .fetch_one(&app_state.database.pool)
        .await
        .unwrap_or(0);

    // Include music tracks in the overview total (unscaled)
    let music_tracks_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM music_tracks")
        .fetch_one(&app_state.database.pool)
        .await
        .unwrap_or(0);

    let total_content_raw = content_count.saturating_add(music_tracks_count);

    let multiplier = app_state.config.content_items_multiplier;
    let scaled_total = ((total_content_raw as f64) * multiplier).round();
    let total_content = if scaled_total > i64::MAX as f64 {
        i64::MAX
    } else {
        scaled_total as i64
    };

    // Get total active devices count (devices active in the last 24 hours)
    let total_active_devices = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM auth.user_devices WHERE last_active > NOW() - INTERVAL '1 day'",
    )
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    // Get total credits used (sum of all user credits)
    let total_credits_used = sqlx::query_scalar::<_, Option<f64>>(
        "SELECT SUM(credits) FROM auth.users WHERE credits IS NOT NULL",
    )
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(None)
    .unwrap_or(0.0);

    // System uptime - calculate actual system uptime
    let system_uptime = calculate_system_uptime();

    let stats = SystemStats {
        total_users,
        total_resellers,
        total_content,
        total_content_raw,
        total_music_tracks: music_tracks_count,
        content_multiplier: multiplier,
        total_active_devices,
        total_credits_used,
        system_uptime,
    };

    Ok(Json(stats))
}

// GET /api/admin/users/{id}/stats - Get user statistics
#[derive(Debug, Serialize)]
pub struct UserStats {
    pub total_streams: i64,
    pub active_devices: i64,
    pub last_login: Option<String>,
    pub total_watch_time: i64, // in minutes
    pub favorite_content: Vec<FavoriteContent>,
}

#[derive(Debug, Serialize)]
pub struct FavoriteContent {
    pub id: i64,
    pub title: String,
    pub watch_count: i64,
}

pub async fn get_user_stats(
    State(app_state): State<crate::AppState>,
    Path(user_id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<UserStats>, AppError> {
    // Only admins can access user stats
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Verify user exists
    let _user = sqlx::query_as::<_, User>("SELECT * FROM auth.users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&app_state.database.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    // Get active devices count for this user (devices active in the last 24 hours)
    let active_devices = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM auth.user_devices WHERE user_id = $1 AND last_active > NOW() - INTERVAL '1 day'",
    )
    .bind(user_id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    // Get last login from activity.user_login_history table
    let last_login = sqlx::query_scalar::<_, Option<String>>(
        "SELECT login_timestamp::text FROM activity.user_login_history WHERE user_id = $1 AND success = true ORDER BY login_timestamp DESC LIMIT 1",
    )
    .bind(user_id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(None);

    // Get streaming statistics from user activity logs
    let total_streams = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM activity.user_viewing_history WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    // Calculate total watch time from activity.user_watch_progress table
    let total_watch_time: i64 = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT COALESCE(SUM(position_seconds), 0) FROM activity.user_watch_progress WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);

    // Get favorite content (most watched) from viewing history
    #[derive(sqlx::FromRow)]
    struct FavoriteRow {
        content_title: String,
        watch_count: i64,
    }
    let favorite_rows: Vec<FavoriteRow> = sqlx::query_as(
        r#"
        SELECT content_title, COUNT(*) as watch_count
        FROM activity.user_viewing_history 
        WHERE user_id = $1 
        GROUP BY content_title 
        ORDER BY watch_count DESC 
        LIMIT 5
        "#,
    )
    .bind(user_id)
    .fetch_all(&app_state.database.pool)
    .await
    .unwrap_or_default();

    let favorite_content: Vec<FavoriteContent> = favorite_rows
        .into_iter()
        .enumerate()
        .map(|(i, row)| FavoriteContent {
            id: i as i64,
            title: row.content_title,
            watch_count: row.watch_count,
        })
        .collect();

    let stats = UserStats {
        total_streams,
        active_devices,
        last_login,
        total_watch_time,
        favorite_content,
    };

    Ok(Json(stats))
}

// GET /api/admin/users/check-username/:username - Check username availability
#[derive(Debug, Serialize)]
pub struct UsernameAvailabilityResponse {
    pub available: bool,
    pub message: String,
}

pub async fn check_username_availability(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(username): Path<String>,
) -> Result<Json<UsernameAvailabilityResponse>, AppError> {
    // Only admins can check username availability
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Normalize + validate
    let uname = username.trim().to_string();
    if uname.is_empty() {
        return Ok(Json(UsernameAvailabilityResponse {
            available: false,
            message: "Username cannot be empty".to_string(),
        }));
    }
    if uname.len() < 3 {
        return Ok(Json(UsernameAvailabilityResponse {
            available: false,
            message: "Username must be at least 3 characters".to_string(),
        }));
    }

    // Case-insensitive existence check (PostgreSQL)
    let exists: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE LOWER(username) = LOWER($1))",
    )
    .bind(&uname)
    .fetch_one(&app_state.database.pool)
    .await?;

    if exists {
        Ok(Json(UsernameAvailabilityResponse {
            available: false,
            message: "Username already exists".to_string(),
        }))
    } else {
        Ok(Json(UsernameAvailabilityResponse {
            available: true,
            message: "Username is available".to_string(),
        }))
    }
}

// PUT /api/admin/users/bulk - Bulk update auth.users
#[derive(Debug, Deserialize)]
pub struct BulkUpdateRequest {
    pub user_ids: Vec<i64>,
    pub updates: BulkUpdateData,
}

#[derive(Debug, Deserialize)]
pub struct BulkUpdateData {
    pub active: Option<bool>,
    pub max_devices: Option<i32>,
    pub credits: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct BulkUpdateResponse {
    pub updated: i64,
    pub failed: i64,
    pub errors: Vec<String>,
}

pub async fn bulk_update_users(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<BulkUpdateRequest>,
) -> Result<Json<BulkUpdateResponse>, AppError> {
    // Only admins can perform bulk updates
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    if request.user_ids.is_empty() {
        return Err(AppError::BadRequest("No user IDs provided".to_string()));
    }

    if request.updates.active.is_none()
        && request.updates.max_devices.is_none()
        && request.updates.credits.is_none()
    {
        return Err(AppError::BadRequest(
            "No valid updates specified".to_string(),
        ));
    }

    let mut updated = 0i64;
    let mut failed = 0i64;
    let mut errors = Vec::new();

    for user_id in request.user_ids {
        let mut qb = QueryBuilder::new("UPDATE auth.users SET ");
        let mut separated = qb.separated(", ");
        let mut has_fields = false;

        if let Some(active) = request.updates.active {
            has_fields = true;
            separated.push("active = ").push_bind(active);
        }

        if let Some(max_devices) = request.updates.max_devices {
            has_fields = true;
            separated.push("max_devices = ").push_bind(max_devices);
        }

        if let Some(credits) = request.updates.credits {
            has_fields = true;
            separated.push("credits = ").push_bind(credits);
        }

        if !has_fields {
            failed += 1;
            errors.push(format!("No fields to update for user {}", user_id));
            continue;
        }

        qb.push(" WHERE id = ").push_bind(user_id);
        qb.push(" AND role != 'admin'");

        let result = qb.build().execute(&app_state.database.pool).await;

        match result {
            Ok(res) if res.rows_affected() > 0 => {
                updated += 1;
            }
            Ok(_) => {
                failed += 1;
                errors.push(format!("User {} not found or is admin", user_id));
            }
            Err(e) => {
                failed += 1;
                errors.push(format!("Failed to update user {}: {}", user_id, e));
            }
        }
    }

    let response = BulkUpdateResponse {
        updated,
        failed,
        errors,
    };

    Ok(Json(response))
}

// PUT /api/admin/config/credits - Update credit configuration
#[derive(Debug, Deserialize)]
pub struct CreditConfigUpdate {
    pub default_devices: Option<i32>,
    pub credit_per_user_3_devices: Option<f64>,
    pub credit_per_user_5_devices: Option<f64>,
    pub credit_per_extra_device: Option<f64>,
}

pub async fn update_credit_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreditConfigUpdate>,
) -> Result<Json<SystemConfigResponse>, AppError> {
    // Only admins can update credit configuration
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Update keys if provided
    if let Some(v) = request.default_devices {
        app_state
            .user_service
            .update_config(admin_id, "default_devices", &v.to_string())
            .await?;
    }
    if let Some(v) = request.credit_per_user_3_devices {
        app_state
            .user_service
            .update_config(admin_id, "credit_per_user_3_devices", &v.to_string())
            .await?;
    }
    if let Some(v) = request.credit_per_user_5_devices {
        app_state
            .user_service
            .update_config(admin_id, "credit_per_user_5_devices", &v.to_string())
            .await?;
    }
    if let Some(v) = request.credit_per_extra_device {
        app_state
            .user_service
            .update_config(admin_id, "credit_per_extra_device", &v.to_string())
            .await?;
    }

    // Fetch current stored values with fallbacks
    let default_devices = app_state
        .user_service
        .get_config_value("default_devices")
        .await?
        .unwrap_or_else(|| "3".to_string())
        .parse()
        .unwrap_or(3);
    let credit_per_user_3_devices = app_state
        .user_service
        .get_config_value("credit_per_user_3_devices")
        .await?
        .unwrap_or_else(|| "10".to_string())
        .parse()
        .unwrap_or(10.0);
    let credit_per_user_5_devices = app_state
        .user_service
        .get_config_value("credit_per_user_5_devices")
        .await?
        .unwrap_or_else(|| "15".to_string())
        .parse()
        .unwrap_or(15.0);
    let credit_per_extra_device = app_state
        .user_service
        .get_config_value("credit_per_extra_device")
        .await?
        .unwrap_or_else(|| "3".to_string())
        .parse()
        .unwrap_or(3.0);

    let config = SystemConfigResponse {
        default_devices,
        credit_per_user_3_devices,
        credit_per_user_5_devices,
        credit_per_extra_device,
        tmdb_api_key: None,
        tmdb_enabled: false,
        tmdb_language: Some("es-ES".to_string()),
        version: PLATFORM_VERSION.to_string(),
        last_updated: chrono::Utc::now().to_rfc3339(),
    };

    Ok(Json(config))
}

/// Update reseller demo limit (admin only)
pub async fn update_reseller_demo_limit(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(reseller_id): Path<i64>,
    Json(request): Json<UpdateResellerDemoLimitRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .update_reseller_demo_limit(admin_id, reseller_id, request)
        .await?;
    Ok(Json(user.into()))
}
