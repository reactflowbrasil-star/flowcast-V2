use crate::error::AppError;
use crate::models::security::*;
use crate::models::user::UserRole;
use crate::services::auth::Claims;
use axum::{
    extract::{Path, Query, State},
    response::Json,
    Extension,
};
use serde_json::Value;

/// Obtener estadísticas de seguridad (solo admin)
pub async fn get_security_stats(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<SecurityStatsResponse>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let stats = app_state.security_service.get_security_stats().await?;
    Ok(Json(stats))
}

/// Obtener incidentes de seguridad con filtros (solo admin)
pub async fn get_security_incidents(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(filters): Query<SecurityFilters>,
) -> Result<Json<SecurityIncidentsResponse>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let incidents = app_state
        .security_service
        .get_security_incidents(filters)
        .await?;
    Ok(Json(incidents))
}

/// Obtener bans de seguridad (solo admin)
pub async fn get_security_bans(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(filters): Query<SecurityFilters>,
) -> Result<Json<SecurityBansResponse>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let bans = app_state
        .security_service
        .get_security_bans(filters)
        .await?;
    Ok(Json(bans))
}

/// Crear ban manual (solo admin)
pub async fn create_security_ban(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(mut request): Json<CreateSecurityBanRequest>,
) -> Result<Json<SecurityBan>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Establecer el admin que crea el ban
    request.created_by = Some(admin_id);

    let ban = app_state
        .security_service
        .create_security_ban(request)
        .await?;
    Ok(Json(ban))
}

/// Desbanear usuario (solo admin)
pub async fn unban_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(username): Path<String>,
    Json(request): Json<UnbanUserRequest>,
) -> Result<Json<Value>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    app_state
        .security_service
        .unban_user(&username, admin_id, &request.reason)
        .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": format!("User {} has been unbanned", username)
    })))
}

/// Limpiar bans expirados (solo admin)
pub async fn cleanup_expired_bans(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let cleaned_count = app_state.security_service.cleanup_expired_bans().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "cleaned_bans": cleaned_count,
        "message": format!("Cleaned up {} expired bans", cleaned_count)
    })))
}

/// Crear incidente de seguridad manual (solo admin)
pub async fn create_security_incident(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateSecurityIncidentRequest>,
) -> Result<Json<SecurityIncident>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let incident = app_state
        .security_service
        .log_security_incident(request)
        .await?;
    Ok(Json(incident))
}

/// Eliminar incidente de seguridad (solo admin)
pub async fn delete_security_incident(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(incident_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    app_state
        .security_service
        .delete_security_incident(incident_id)
        .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Security incident deleted successfully"
    })))
}

/// Verificar estado de ban de un usuario (solo admin)
pub async fn check_user_ban_status(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(username): Path<String>,
) -> Result<Json<Value>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let ban = app_state.security_service.is_user_banned(&username).await?;

    match ban {
        Some(ban) => Ok(Json(serde_json::json!({
            "is_banned": true,
            "ban": ban
        }))),
        None => Ok(Json(serde_json::json!({
            "is_banned": false,
            "ban": null
        }))),
    }
}

/// Obtener dispositivos en blacklist (solo admin)
pub async fn get_blacklisted_devices(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(_filters): Query<SecurityFilters>,
) -> Result<Json<Value>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let devices = app_state.device_service.get_blacklisted_devices().await?;

    Ok(Json(serde_json::json!({
        "devices": devices,
        "total": devices.len(),
        "success": true
    })))
}

/// Remover dispositivo de blacklist (solo admin)
pub async fn remove_device_from_blacklist(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<Value>, AppError> {
    // Verificar que el usuario es admin
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let user_id = request
        .get("user_id")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| AppError::BadRequest("user_id is required".to_string()))?;

    let device_id = request
        .get("device_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("device_id is required".to_string()))?;

    let removed = app_state
        .device_service
        .remove_from_blacklist(user_id, device_id)
        .await?;

    Ok(Json(serde_json::json!({
        "success": removed,
        "message": if removed {
            "Device removed from blacklist successfully"
        } else {
            "Device not found in blacklist"
        }
    })))
}
