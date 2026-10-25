use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    Extension,
};
use serde_json::{json, Value};

use crate::models::device::RegisterDeviceRequest;
use crate::models::user::User;
use crate::AppState;

/// Register a new device for the authenticated user
pub async fn register_device(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Json(request): Json<RegisterDeviceRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match app_state
        .device_service
        .register_device(user.id, request)
        .await
    {
        Ok(_) => Ok(Json(json!({
            "success": true,
            "message": "Device registered successfully"
        }))),
        Err(e) => {
            if e.to_string().contains("Device limit exceeded") {
                Err((
                    StatusCode::CONFLICT,
                    Json(json!({
                        "error": "device_limit_exceeded",
                        "message": e.to_string()
                    })),
                ))
            } else {
                tracing::error!("Failed to register device: {}", e);
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "error": "internal_error",
                        "message": "Failed to register device"
                    })),
                ))
            }
        }
    }
}

/// Get all active devices for the authenticated user
pub async fn get_user_devices(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match app_state.device_service.get_active_devices(user.id).await {
        Ok(devices) => Ok(Json(json!({
            "devices": devices,
            "max_devices": user.max_devices
        }))),
        Err(e) => {
            tracing::error!("Failed to get user devices: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to retrieve devices"
                })),
            ))
        }
    }
}

/// Remove a device for the authenticated user
pub async fn remove_device(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match app_state
        .device_service
        .remove_device(user.id, &device_id)
        .await
    {
        Ok(removed) => {
            if removed {
                Ok(Json(json!({
                    "success": true,
                    "message": "Device removed successfully"
                })))
            } else {
                Err((
                    StatusCode::NOT_FOUND,
                    Json(json!({
                        "error": "device_not_found",
                        "message": "Device not found"
                    })),
                ))
            }
        }
        Err(e) => {
            tracing::error!("Failed to remove device: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to remove device"
                })),
            ))
        }
    }
}

/// Check if a device can connect (used for device limit enforcement)
pub async fn check_device_connection(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match app_state
        .device_service
        .can_device_connect(user.id, &device_id)
        .await
    {
        Ok(can_connect) => {
            if can_connect {
                // Update device activity if it can connect
                if let Err(e) = app_state
                    .device_service
                    .update_device_activity(user.id, &device_id)
                    .await
                {
                    tracing::warn!("Failed to update device activity: {}", e);
                }

                Ok(Json(json!({
                    "can_connect": true,
                    "message": "Device can connect"
                })))
            } else {
                let devices = app_state
                    .device_service
                    .get_active_devices(user.id)
                    .await
                    .unwrap_or_default();
                Err((
                    StatusCode::CONFLICT,
                    Json(json!({
                        "can_connect": false,
                        "error": "device_limit_exceeded",
                        "message": "Device limit exceeded. Please remove a device to connect a new one.",
                        "active_devices": devices,
                        "max_devices": user.max_devices
                    })),
                ))
            }
        }
        Err(e) => {
            tracing::error!("Failed to check device connection: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to check device connection"
                })),
            ))
        }
    }
}

/// Admin endpoint to get devices for any user
pub async fn admin_get_user_devices(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Path(user_id): Path<i64>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Check if user is admin
    if !matches!(user.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "forbidden",
                "message": "Admin access required"
            })),
        ));
    }

    match app_state.device_service.get_active_devices(user_id).await {
        Ok(devices) => {
            let device_count = app_state
                .device_service
                .get_device_count(user_id)
                .await
                .unwrap_or(0);
            Ok(Json(json!({
                "user_id": user_id,
                "devices": devices,
                "device_count": device_count
            })))
        }
        Err(e) => {
            tracing::error!("Failed to get user devices for admin: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to retrieve user devices"
                })),
            ))
        }
    }
}

/// Admin endpoint to get all devices in the system
pub async fn admin_get_all_devices(
    State(app_state): State<AppState>,
    Extension(claims): Extension<crate::services::Claims>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Check if user is admin
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "forbidden",
                "message": "Admin access required"
            })),
        ));
    }

    match app_state.device_service.get_all_devices().await {
        Ok(devices) => Ok(Json(json!({
            "success": true,
            "devices": devices
        }))),
        Err(e) => {
            tracing::error!("Failed to get all devices for admin: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to retrieve devices"
                })),
            ))
        }
    }
}

/// Admin endpoint to get device statistics
pub async fn admin_get_device_stats(
    State(app_state): State<AppState>,
    Extension(claims): Extension<crate::services::Claims>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Check if user is admin
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "forbidden",
                "message": "Admin access required"
            })),
        ));
    }

    match app_state.device_service.get_device_stats().await {
        Ok(stats) => Ok(Json(json!({
            "success": true,
            "stats": stats
        }))),
        Err(e) => {
            tracing::error!("Failed to get device stats for admin: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to retrieve device statistics"
                })),
            ))
        }
    }
}

/// Reseller endpoint to get devices for their users
pub async fn reseller_get_user_devices(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Path(user_id): Path<i64>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Check if user is reseller
    if !matches!(user.role, crate::models::user::UserRole::Reseller) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "forbidden",
                "message": "Reseller access required"
            })),
        ));
    }

    // Verify that the user_id belongs to this reseller
    match app_state.user_service.get_user_by_id(user_id).await {
        Ok(target_user) => {
            // Check if the target user was created by this reseller
            if target_user.created_by != Some(user.id) {
                return Err((
                    StatusCode::FORBIDDEN,
                    Json(json!({
                        "error": "forbidden",
                        "message": "You can only view devices for users you created"
                    })),
                ));
            }
        }
        Err(_) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "error": "not_found",
                    "message": "User not found"
                })),
            ));
        }
    }

    match app_state.device_service.get_active_devices(user_id).await {
        Ok(devices) => {
            let device_count = app_state
                .device_service
                .get_device_count(user_id)
                .await
                .unwrap_or(0);
            Ok(Json(json!({
                "user_id": user_id,
                "devices": devices,
                "device_count": device_count
            })))
        }
        Err(e) => {
            tracing::error!("Failed to get user devices for reseller: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to retrieve user devices"
                })),
            ))
        }
    }
}

/// Admin endpoint to remove a user device
pub async fn admin_remove_user_device(
    State(app_state): State<AppState>,
    Extension(claims): Extension<crate::services::Claims>,
    Path((user_id, device_id)): Path<(i64, String)>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Check if user is admin
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "forbidden",
                "message": "Admin access required"
            })),
        ));
    }

    match app_state
        .device_service
        .remove_device(user_id, &device_id)
        .await
    {
        Ok(_) => Ok(Json(json!({
            "success": true,
            "message": "Device removed successfully"
        }))),
        Err(e) => {
            tracing::error!(
                "Failed to remove device {} for user {}: {}",
                device_id,
                user_id,
                e
            );
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to remove device"
                })),
            ))
        }
    }
}

/// Admin endpoint to disconnect a device (force logout)
pub async fn admin_disconnect_device(
    State(app_state): State<AppState>,
    Extension(claims): Extension<crate::services::Claims>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Check if user is admin
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "forbidden",
                "message": "Admin access required"
            })),
        ));
    }

    match app_state.device_service.disconnect_device(&device_id).await {
        Ok(_) => Ok(Json(json!({
            "success": true,
            "message": "Device disconnected successfully"
        }))),
        Err(e) => {
            tracing::error!("Failed to disconnect device {}: {}", device_id, e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to disconnect device"
                })),
            ))
        }
    }
}

/// Admin endpoint to remove and blacklist a user device
pub async fn admin_remove_and_blacklist_device(
    State(app_state): State<AppState>,
    Extension(claims): Extension<crate::services::Claims>,
    Path((user_id, device_id)): Path<(i64, String)>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Check if user is admin
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "forbidden",
                "message": "Admin access required"
            })),
        ));
    }

    match app_state
        .device_service
        .remove_and_blacklist_device(user_id, &device_id)
        .await
    {
        Ok(removed) => {
            if removed {
                Ok(Json(json!({
                    "success": true,
                    "message": "Device removed and blacklisted successfully"
                })))
            } else {
                Err((
                    StatusCode::NOT_FOUND,
                    Json(json!({
                        "error": "device_not_found",
                        "message": "Device not found"
                    })),
                ))
            }
        }
        Err(e) => {
            tracing::error!(
                "Failed to remove and blacklist device {} for user {}: {}",
                device_id,
                user_id,
                e
            );
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to remove and blacklist device"
                })),
            ))
        }
    }
}

/// Admin endpoint to blacklist a user device (without removing it)
pub async fn admin_blacklist_device(
    State(app_state): State<AppState>,
    Extension(claims): Extension<crate::services::Claims>,
    Path((user_id, device_id)): Path<(i64, String)>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Check if user is admin
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "forbidden",
                "message": "Admin access required"
            })),
        ));
    }

    match app_state
        .device_service
        .blacklist_device(user_id, &device_id)
        .await
    {
        Ok(success) => {
            if success {
                Ok(Json(json!({
                    "success": true,
                    "message": "Device blacklisted successfully"
                })))
            } else {
                Err((
                    StatusCode::NOT_FOUND,
                    Json(json!({
                        "error": "device_not_found",
                        "message": "Device not found or already blacklisted"
                    })),
                ))
            }
        }
        Err(e) => {
            tracing::error!(
                "Failed to blacklist device {} for user {}: {}",
                device_id,
                user_id,
                e
            );
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "internal_error",
                    "message": "Failed to blacklist device"
                })),
            ))
        }
    }
}
