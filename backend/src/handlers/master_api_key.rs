use crate::{
    error::AppError,
    models::{
        master_api_key::{CreateMasterApiKeyRequest, UpdateMasterApiKeyRequest},
        user::UserRole,
    },
    services::{Claims, MasterApiKeyService},
    AppState,
};
use axum::{
    extract::{Path, State},
    response::Json,
    Extension,
};
use serde_json::{json, Value};
use tracing::info;

/// Get all Master API Keys (Admin only)
pub async fn get_master_api_keys(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, AppError> {
    // Only admins can manage Master API Keys
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can manage Master API Keys".to_string(),
        ));
    }

    let service = MasterApiKeyService::new(app_state.database.pool.clone());
    let keys = service.get_master_api_keys().await?;

    Ok(Json(json!({
        "success": true,
        "data": keys
    })))
}

/// Get Master API Key by ID (Admin only)
pub async fn get_master_api_key_by_id(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    // Only admins can manage Master API Keys
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can manage Master API Keys".to_string(),
        ));
    }

    let service = MasterApiKeyService::new(app_state.database.pool.clone());
    let key = service.get_master_api_key_by_id(id).await?;

    Ok(Json(json!({
        "success": true,
        "data": key
    })))
}

/// Create new Master API Key (Admin only)
pub async fn create_master_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateMasterApiKeyRequest>,
) -> Result<Json<Value>, AppError> {
    // Only admins can manage Master API Keys
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can manage Master API Keys".to_string(),
        ));
    }

    let created_by = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("Invalid user ID".to_string()))?;

    let service = MasterApiKeyService::new(app_state.database.pool.clone());
    let key = service.create_master_api_key(request, created_by).await?;

    info!(
        "Master API Key '{}' created by admin {}",
        key.key_name, claims.username
    );

    Ok(Json(json!({
        "success": true,
        "data": key,
        "message": "Master API Key created successfully. Store this key securely - it won't be shown again!"
    })))
}

/// Update Master API Key (Admin only)
pub async fn update_master_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
    Json(request): Json<UpdateMasterApiKeyRequest>,
) -> Result<Json<Value>, AppError> {
    // Only admins can manage Master API Keys
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can manage Master API Keys".to_string(),
        ));
    }

    let service = MasterApiKeyService::new(app_state.database.pool.clone());
    let key = service.update_master_api_key(id, request).await?;

    info!(
        "Master API Key '{}' updated by admin {}",
        key.key_name, claims.username
    );

    Ok(Json(json!({
        "success": true,
        "data": key,
        "message": "Master API Key updated successfully"
    })))
}

/// Delete Master API Key (Admin only)
pub async fn delete_master_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    // Only admins can manage Master API Keys
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can manage Master API Keys".to_string(),
        ));
    }

    let service = MasterApiKeyService::new(app_state.database.pool.clone());

    // Get key info before deletion for logging
    let key = service.get_master_api_key_by_id(id).await?;

    service.delete_master_api_key(id).await?;

    info!(
        "Master API Key '{}' deleted by admin {}",
        key.key_name, claims.username
    );

    Ok(Json(json!({
        "success": true,
        "message": "Master API Key deleted successfully"
    })))
}

/// Regenerate Master API Key (Admin only)
pub async fn regenerate_master_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    // Only admins can manage Master API Keys
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can manage Master API Keys".to_string(),
        ));
    }

    let service = MasterApiKeyService::new(app_state.database.pool.clone());
    let key = service.regenerate_api_key(id).await?;

    info!(
        "Master API Key '{}' regenerated by admin {}",
        key.key_name, claims.username
    );

    Ok(Json(json!({
        "success": true,
        "data": key,
        "message": "Master API Key regenerated successfully. Store this new key securely - it won't be shown again!"
    })))
}
