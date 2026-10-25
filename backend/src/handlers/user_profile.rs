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
        .route("/device-status", axum::routing::get(get_device_status))
        .route("/subscriptions", axum::routing::get(get_user_subscriptions))
        .route(
            "/subscription-status",
            axum::routing::get(check_subscription_status),
        )
}
