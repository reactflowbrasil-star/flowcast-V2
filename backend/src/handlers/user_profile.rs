use axum::{extract::State, http::StatusCode, response::Json, Extension, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;

use crate::models::user::{User, UserRole};
use crate::services::Claims;
use crate::AppState;

/// User profile response
#[derive(Debug, Serialize)]
pub struct UserProfileResponse {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub role: UserRole,
    pub max_devices: i32,
    pub expires_at: Option<String>,
    pub active: bool,
    pub created_at: String,
    pub device_count: i32,
    pub subscribed_categories: Option<Vec<i64>>,
}

/// Subscription status response
#[derive(Debug, Serialize)]
pub struct SubscriptionStatusResponse {
    pub is_active: bool,
    pub expires_at: Option<String>,
    pub days_remaining: Option<i64>,
    pub status: String, // "active", "expired", "never_expires"
    pub server_time: String,
}

/// Change password request
#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

/// Update profile request
#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub email: Option<String>,
}

/// Get current user profile
pub async fn get_user_profile(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<Json<UserProfileResponse>, (StatusCode, Json<Value>)> {
    // Get device count for the user
    let device_count = match app_state.device_service.get_active_devices(user.id).await {
        Ok(devices) => devices.len() as i32,
        Err(_) => 0, // If error, default to 0
    };

    let profile = UserProfileResponse {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        max_devices: user.max_devices,
        expires_at: user.expires_at.map(|dt| dt.to_rfc3339()),
        active: user.active,
        created_at: user.created_at.to_rfc3339(),
        device_count,
        subscribed_categories: user.subscribed_categories,
    };

    Ok(Json(profile))
}

/// Change user password
pub async fn change_password(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Json(request): Json<ChangePasswordRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Validate current password
    if !app_state
        .auth_service
        .verify_password(&request.current_password, &user.password_hash)
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to verify password"
                })),
            )
        })?
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "invalid_password",
                "message": "Current password is incorrect"
            })),
        ));
    }

    // Validate new password
    if request.new_password.len() < 6 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "invalid_password",
                "message": "New password must be at least 6 characters long"
            })),
        ));
    }

    // Hash new password
    let new_password_hash = app_state
        .auth_service
        .hash_password(&request.new_password)
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to hash password"
                })),
            )
        })?;

    // Update password in database
    sqlx::query("UPDATE auth.users SET password_hash = $1 WHERE id = $2")
        .bind(&new_password_hash)
        .bind(user.id)
        .execute(&app_state.database.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update password for user {}: {}", user.id, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to update password"
                })),
            )
        })?;

    Ok(Json(json!({
        "success": true,
        "message": "Password updated successfully"
    })))
}

/// Update user profile
pub async fn update_profile(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Json(request): Json<UpdateProfileRequest>,
) -> Result<Json<UserProfileResponse>, (StatusCode, Json<Value>)> {
    // Update email if provided
    if let Some(email) = &request.email {
        sqlx::query("UPDATE auth.users SET email = $1 WHERE id = $2")
            .bind(email)
            .bind(user.id)
            .execute(&app_state.database.pool)
            .await
            .map_err(|e| {
                tracing::error!("Failed to update email for user {}: {}", user.id, e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "error": "internal_error",
                        "message": "Failed to update profile"
                    })),
                )
            })?;
    }

    // Get updated user data
    let updated_user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, password_hash, email, role,
               credits, active, created_by, max_devices, expires_at, created_at,
               daily_demo_limit, demos_created_today, last_demo_reset_date,
               is_demo, demo_expires_at
        FROM auth.users
        WHERE id = $1
        "#,
    )
    .bind(user.id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch updated user {}: {}", user.id, e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": "internal_error",
                "message": "Failed to fetch updated profile"
            })),
        )
    })?;

    // Get device count
    let device_count = match app_state.device_service.get_active_devices(user.id).await {
        Ok(devices) => devices.len() as i32,
        Err(_) => 0,
    };

    let profile = UserProfileResponse {
        id: updated_user.id,
        username: updated_user.username,
        email: updated_user.email,
        role: updated_user.role,
        max_devices: updated_user.max_devices,
        expires_at: updated_user.expires_at.map(|dt| dt.to_rfc3339()),
        active: updated_user.active,
        created_at: updated_user.created_at.to_rfc3339(),
        device_count,
        subscribed_categories: updated_user.subscribed_categories,
    };

    Ok(Json(profile))
}

async fn get_user_devices(
    Extension(claims): Extension<Claims>,
    State(app_state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let user_id = claims.sub.parse::<i64>().map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid user ID"})),
        )
    })?;
    let devices = app_state
        .device_service
        .get_active_devices(user_id)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to get devices"})),
            )
        })?;

    Ok(Json(json!({"devices": devices})))
}

/// Sentinel security overview based on recent successful login telemetry.
async fn get_sentinel_activity(
    Extension(claims): Extension<Claims>,
    State(app_state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let user_id = claims.sub.parse::<i64>().map_err(|_| (
        StatusCode::BAD_REQUEST,
        Json(json!({"error": "Invalid user ID"})),
    ))?;
    let rows = sqlx::query(
        r#"
        SELECT ip_address, MAX(device_info) AS device_info, MAX(user_agent) AS user_agent,
               MAX(login_timestamp) AS last_seen,
               COUNT(DISTINCT COALESCE(device_info, user_agent, 'unknown')) AS distinct_devices,
               COUNT(*) AS login_count
        FROM activity.user_login_history
        WHERE user_id = $1 AND success = true
          AND login_timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY ip_address
        ORDER BY last_seen DESC
        LIMIT 100
        "#,
    )
    .bind(user_id)
    .fetch_all(&app_state.database.pool)
    .await
    .map_err(|error| {
        tracing::error!(user_id, "Sentinel login activity query failed: {error}");
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Could not load security activity"})))
    })?;

    let mut ip_counts = std::collections::HashMap::<String, usize>::new();
    let mut devices_by_ip = std::collections::HashMap::<String, i64>::new();
    let mut sessions = Vec::with_capacity(rows.len());
    for row in rows {
        let ip: Option<String> = row.try_get("ip_address").unwrap_or(None);
        let device: Option<String> = row.try_get("device_info").unwrap_or(None);
        let agent: Option<String> = row.try_get("user_agent").unwrap_or(None);
        let last_seen: Option<chrono::DateTime<chrono::Utc>> = row.try_get("last_seen").unwrap_or(None);
        let distinct_devices: i64 = row.try_get("distinct_devices").unwrap_or(1);
        let login_count: i64 = row.try_get("login_count").unwrap_or(1);
        if let Some(value) = ip.as_ref().filter(|value| !value.is_empty()) {
            ip_counts.insert(value.clone(), login_count.max(0) as usize);
            devices_by_ip.insert(value.clone(), distinct_devices);
        }
        sessions.push(json!({
            "ip_address": ip,
            "device": device,
            "user_agent": agent,
            "last_seen": last_seen.map(|value| value.to_rfc3339()),
            "distinct_devices": distinct_devices,
        }));
    }
    let unique_ips = ip_counts.len();
    let concurrent_device_risk = devices_by_ip.values().any(|count| *count >= 4);
    let risk_level = if unique_ips >= 5 || concurrent_device_risk { "elevated" } else if unique_ips >= 3 { "review" } else { "normal" };
    let mut ip_summary: Vec<_> = ip_counts.into_iter().map(|(ip, count)| json!({"ip_address": ip, "login_count": count})).collect();
    ip_summary.sort_by(|a, b| b["login_count"].as_u64().cmp(&a["login_count"].as_u64()));

    Ok(Json(json!({
        "sentinel": {"status": "active", "risk_level": risk_level, "unique_ips_30d": unique_ips},
        "ips": ip_summary,
        "sessions": sessions,
        "policy": "IP changes are monitored; shared and mobile networks can change addresses legitimately."
    })))
}

/// Get device status for the authenticated user (Android app endpoint)
pub async fn get_device_status(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match app_state.device_service.get_active_devices(user.id).await {
        Ok(devices) => {
            let current_devices = devices.len() as i32;
            let max_devices = user.max_devices;
            let has_space = current_devices < max_devices;
            let current_token_device_id = claims.device_id;

            // Convert backend devices to the format expected by Android app
            let device_list: Vec<Value> = devices
                .into_iter()
                .map(|device| {
                    let is_current_device = current_token_device_id
                        .as_deref()
                        .is_some_and(|device_id| device_id == device.device_id);
                    json!({
                        "id": device.id.to_string(),
                        "name": device.device_name,
                        "type": "android", // Default type
                        "registered_at": device.created_at.to_rfc3339(),
                        "last_used": device.last_active.to_rfc3339(),
                        "is_current_device": is_current_device,
                        "device_id": device.device_id,
                        "app_version": serde_json::Value::Null,
                        "os_version": serde_json::Value::Null
                    })
                })
                .collect();

            Ok(Json(json!({
                "success": true,
                "data": {
                    "current_devices": current_devices,
                    "max_devices": max_devices,
                    "has_space": has_space,
                    "devices": device_list
                }
            })))
        }
        Err(e) => {
            tracing::error!("Failed to get device status for user {}: {}", user.id, e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to retrieve device status"
                })),
            ))
        }
    }
}

async fn get_user_subscriptions(
    Extension(claims): Extension<Claims>,
    State(app_state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let subscriptions =
        sqlx::query("SELECT category_id FROM billing.user_subscriptions WHERE user_id = $1")
            .bind(claims.sub)
            .fetch_all(&app_state.database.pool)
            .await
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "Failed to get subscriptions"})),
                )
            })?;

    let category_ids: Vec<i64> = subscriptions
        .iter()
        .map(|row| row.get("category_id"))
        .collect();

    Ok(Json(json!({"subscriptions": category_ids})))
}

/// Check subscription status (server-side validation)
pub async fn check_subscription_status(
    State(_app_state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<Json<SubscriptionStatusResponse>, (StatusCode, Json<Value>)> {
    let server_time = Utc::now();

    // Check if user has an expiration date
    let (is_active, status, days_remaining) = match user.expires_at {
        Some(expires_at) => {
            // Compare server time with expiration date
            let is_expired = expires_at <= server_time;

            if is_expired {
                (false, "expired".to_string(), Some(0))
            } else {
                // Calculate days remaining
                let duration = expires_at.signed_duration_since(server_time);
                let days_remaining = duration.num_days();
                (user.active, "active".to_string(), Some(days_remaining))
            }
        }
        None => {
            // No expiration date means subscription never expires (if active)
            if user.active {
                (true, "never_expires".to_string(), None)
            } else {
                (false, "inactive".to_string(), None)
            }
        }
    };

    let response = SubscriptionStatusResponse {
        is_active,
        expires_at: user.expires_at.map(|dt| dt.to_rfc3339()),
        days_remaining,
        status,
        server_time: server_time.to_rfc3339(),
    };

    Ok(Json(response))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/profile", axum::routing::get(get_user_profile))
        .route("/profile", axum::routing::put(update_profile))
        .route("/profile/password", axum::routing::put(change_password))
        .route("/devices", axum::routing::get(get_user_devices))
        .route("/sentinel/activity", axum::routing::get(get_sentinel_activity))
        .route("/device-status", axum::routing::get(get_device_status))
        .route("/subscriptions", axum::routing::get(get_user_subscriptions))
        .route(
            "/subscription-status",
            axum::routing::get(check_subscription_status),
        )
}
