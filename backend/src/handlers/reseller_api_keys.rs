use axum::{
    extract::{Path, State},
    response::Json,
    Extension,
};
use serde::Serialize;

use crate::error::AppError;
use crate::models::user::UserRole;
use crate::services::{
    reseller_api_keys::{
        CreateApiKeyRequest, CreateApiKeyResponse, ResellerApiKeyResponse, ResellerApiKeyService,
        UpdateApiKeyRequest,
    },
    Claims,
};
use crate::AppState;

#[derive(Serialize)]
pub struct PermissionsListResponse {
    pub permissions: Vec<PermissionInfo>,
}

#[derive(Serialize)]
pub struct PermissionInfo {
    pub id: String,
    pub name: String,
    pub description: String,
}

pub async fn list_api_keys(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<ResellerApiKeyResponse>>, AppError> {
    if !matches!(claims.role, UserRole::Reseller | UserRole::Admin) {
        return Err(AppError::Forbidden);
    }

    let reseller_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let service = ResellerApiKeyService::new(app_state.database.pool.clone());
    let keys = service.list_api_keys(reseller_id).await?;

    Ok(Json(keys))
}

pub async fn get_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(key_id): Path<i64>,
) -> Result<Json<ResellerApiKeyResponse>, AppError> {
    if !matches!(claims.role, UserRole::Reseller | UserRole::Admin) {
        return Err(AppError::Forbidden);
    }

    let reseller_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let service = ResellerApiKeyService::new(app_state.database.pool.clone());
    let key = service.get_api_key_by_id(reseller_id, key_id).await?;

    Ok(Json(key.into()))
}

pub async fn create_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateApiKeyRequest>,
) -> Result<Json<CreateApiKeyResponse>, AppError> {
    if !matches!(claims.role, UserRole::Reseller | UserRole::Admin) {
        return Err(AppError::Forbidden);
    }

    let reseller_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Validate key name
    if request.key_name.trim().is_empty() {
        return Err(AppError::BadRequest("Key name is required".to_string()));
    }
    if request.key_name.len() > 100 {
        return Err(AppError::BadRequest(
            "Key name must be 100 characters or less".to_string(),
        ));
    }

    // Validate permissions
    if request.permissions.is_empty() {
        return Err(AppError::BadRequest(
            "At least one permission is required".to_string(),
        ));
    }

    let service = ResellerApiKeyService::new(app_state.database.pool.clone());
    let response = service.create_api_key(reseller_id, request).await?;

    // Log activity
    let _ = app_state
        .activity_log_service
        .create_log(crate::models::activity_log::CreateActivityLogRequest {
            user_id: reseller_id,
            target_user_id: None,
            action_type: crate::models::activity_log::ActionType::ApiKeyCreated,
            description: format!("Created API key: {}", response.api_key.key_name),
            credits_amount: None,
            metadata: Some(serde_json::json!({
                "api_key_id": response.api_key.id,
                "key_name": response.api_key.key_name,
                "permissions": response.api_key.permissions
            })),
        })
        .await;

    Ok(Json(response))
}

pub async fn update_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(key_id): Path<i64>,
    Json(request): Json<UpdateApiKeyRequest>,
) -> Result<Json<ResellerApiKeyResponse>, AppError> {
    if !matches!(claims.role, UserRole::Reseller | UserRole::Admin) {
        return Err(AppError::Forbidden);
    }

    let reseller_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Validate key name if provided
    if let Some(ref name) = request.key_name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("Key name cannot be empty".to_string()));
        }
        if name.len() > 100 {
            return Err(AppError::BadRequest(
                "Key name must be 100 characters or less".to_string(),
            ));
        }
    }

    let service = ResellerApiKeyService::new(app_state.database.pool.clone());
    let updated = service.update_api_key(reseller_id, key_id, request).await?;

    Ok(Json(updated))
}

pub async fn delete_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(key_id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Reseller | UserRole::Admin) {
        return Err(AppError::Forbidden);
    }

    let reseller_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let service = ResellerApiKeyService::new(app_state.database.pool.clone());

    // Get key info for logging before deletion
    let key = service.get_api_key_by_id(reseller_id, key_id).await?;

    service.delete_api_key(reseller_id, key_id).await?;

    // Log activity
    let _ = app_state
        .activity_log_service
        .create_log(crate::models::activity_log::CreateActivityLogRequest {
            user_id: reseller_id,
            target_user_id: None,
            action_type: crate::models::activity_log::ActionType::ApiKeyDeleted,
            description: format!("Deleted API key: {}", key.key_name),
            credits_amount: None,
            metadata: Some(serde_json::json!({
                "api_key_id": key_id,
                "key_name": key.key_name
            })),
        })
        .await;

    Ok(Json(
        serde_json::json!({ "success": true, "message": "API key deleted" }),
    ))
}

pub async fn regenerate_api_key(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(key_id): Path<i64>,
) -> Result<Json<CreateApiKeyResponse>, AppError> {
    if !matches!(claims.role, UserRole::Reseller | UserRole::Admin) {
        return Err(AppError::Forbidden);
    }

    let reseller_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let service = ResellerApiKeyService::new(app_state.database.pool.clone());
    let response = service.regenerate_api_key(reseller_id, key_id).await?;

    // Log activity
    let _ = app_state
        .activity_log_service
        .create_log(crate::models::activity_log::CreateActivityLogRequest {
            user_id: reseller_id,
            target_user_id: None,
            action_type: crate::models::activity_log::ActionType::ApiKeyRegenerated,
            description: format!("Regenerated API key: {}", response.api_key.key_name),
            credits_amount: None,
            metadata: Some(serde_json::json!({
                "api_key_id": response.api_key.id,
                "key_name": response.api_key.key_name
            })),
        })
        .await;

    Ok(Json(response))
}

pub async fn list_available_permissions() -> Result<Json<PermissionsListResponse>, AppError> {
    use crate::services::reseller_api_keys::PermissionRegistry;

    let permissions = PermissionRegistry::all()
        .into_iter()
        .map(|p| PermissionInfo {
            id: p.id,
            name: p.name,
            description: p.description,
        })
        .collect();

    Ok(Json(PermissionsListResponse { permissions }))
}
