use crate::error::AppError;
use crate::models::gift_code::*;
use crate::services::gift_codes::GiftCodesService;
use crate::validation::ValidationUtils;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};

/// Admin: create single gift code
pub async fn create_gift_code(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<crate::services::Claims>,
    axum::Json(payload): axum::Json<CreateGiftCodeRequest>,
) -> Result<Json<GiftCodeResponse>, AppError> {
    let svc = GiftCodesService::new(
        app_state.database.pool.clone(),
        app_state.user_service.clone(),
        app_state.content_service.clone(),
    );

    let admin_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;
    let res = svc.create_code(payload, admin_id).await?;
    Ok(Json(res))
}

/// Admin: bulk create gift codes
pub async fn bulk_create_gift_codes(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<crate::services::Claims>,
    axum::Json(payload): axum::Json<BulkCreateGiftCodesRequest>,
) -> Result<Json<Vec<GiftCodeResponse>>, AppError> {
    let svc = GiftCodesService::new(
        app_state.database.pool.clone(),
        app_state.user_service.clone(),
        app_state.content_service.clone(),
    );
    let admin_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;
    let res = svc.bulk_create(payload, admin_id).await?;
    Ok(Json(res))
}

/// Admin: list all gift codes
pub async fn list_gift_codes(
    State(app_state): State<crate::AppState>,
) -> Result<Json<Vec<GiftCode>>, AppError> {
    let svc = GiftCodesService::new(
        app_state.database.pool.clone(),
        app_state.user_service.clone(),
        app_state.content_service.clone(),
    );
    let rows = svc.list_all().await?;
    Ok(Json(rows))
}

/// Public redeem request (create account or extend existing)
#[derive(Debug, Deserialize)]
pub struct RedeemRequest {
    pub code: String,
    /// action: "create" (default) or "extend"
    pub action: Option<String>,
    /// For creation: username/password/email required.
    pub username: Option<String>,
    pub password: Option<String>,
    pub email: Option<String>,
    /// Optional explicit category selection from client (will be validated and intersected with allowed categories)
    pub category_ids: Option<Vec<i64>>,
}

#[derive(Debug, Serialize)]
pub struct RedeemResponse {
    pub redeemed: bool,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub message: String,
}

/// Public: validate a gift code without consuming it
#[derive(Debug, Deserialize)]
pub struct ValidateRequest {
    pub code: String,
}

pub async fn validate_code(
    State(app_state): State<crate::AppState>,
    axum::Json(payload): axum::Json<ValidateRequest>,
) -> Result<Json<crate::models::gift_code::GiftCodeValidation>, AppError> {
    // Check whether public redeem/validate is enabled (admin can toggle via config key "public_redeem_enabled")
    let public_redeem_enabled = match app_state.database.get_config("public_redeem_enabled").await {
        Ok(Some(val)) => {
            let v = val.to_lowercase();
            !(v == "false" || v == "0" || v == "off" || v == "no")
        }
        _ => false, // fail-closed: deny if config is unreachable
    };
    if !public_redeem_enabled {
        return Err(AppError::Forbidden);
    }

    let svc = GiftCodesService::new(
        app_state.database.pool.clone(),
        app_state.user_service.clone(),
        app_state.content_service.clone(),
    );
    let info = svc.validate_code(&payload.code).await?;
    Ok(Json(info))
}

/// Public: redeem code (create or extend)
pub async fn redeem_code(
    State(app_state): State<crate::AppState>,
    axum::Json(payload): axum::Json<RedeemRequest>,
) -> Result<Json<RedeemResponse>, AppError> {
    // Basic request diagnostics (avoid logging secrets)
    let action_dbg = payload
        .action
        .clone()
        .unwrap_or_else(|| "create".to_string());
    let user_dbg = payload.username.clone().unwrap_or_default();
    let cats_dbg = payload.category_ids.as_ref().map(|v| v.len()).unwrap_or(0);
    tracing::info!(
        target: "redeem",
        "redeem_code: action={}, code_len={}, username_present={}, email_present={}, category_ids_count={}",
        action_dbg,
        payload.code.len(),
        !user_dbg.is_empty(),
        payload.email.is_some(),
        cats_dbg
    );
    // Check whether public redeem is enabled
    let public_redeem_enabled = match app_state.database.get_config("public_redeem_enabled").await {
        Ok(Some(val)) => {
            let v = val.to_lowercase();
            !(v == "false" || v == "0" || v == "off" || v == "no")
        }
        _ => false, // fail-closed: deny if config is unreachable
    };
    if !public_redeem_enabled {
        return Err(AppError::Forbidden);
    }

    let svc = GiftCodesService::new(
        app_state.database.pool.clone(),
        app_state.user_service.clone(),
        app_state.content_service.clone(),
    );

    let action = payload.action.as_deref().unwrap_or("create");

    if action == "extend" {
        // extend existing user
        let username = payload.username.as_deref().ok_or_else(|| {
            AppError::BadRequest("username is required for extend action".to_string())
        })?;
        match svc.redeem_and_extend_user(&payload.code, username).await {
            Ok(redemption) => {
                let uname = redemption
                    .redeemer_username
                    .clone()
                    .unwrap_or_else(|| username.to_string());
                Ok(Json(RedeemResponse {
                    redeemed: true,
                    user_id: redemption.redeemer_user_id,
                    username: redemption.redeemer_username.clone(),
                    message: format!("All set! Extended subscription for '{}'", uname),
                }))
            }
            Err(e) => {
                tracing::error!(target: "redeem", "redeem_code/extend error: {}", e);
                Err(e)
            }
        }
    } else {
        // default: create
        let username = payload.username.as_deref().ok_or_else(|| {
            AppError::BadRequest("username is required for create action".to_string())
        })?;
        let password = payload.password.as_deref().ok_or_else(|| {
            AppError::BadRequest("password is required for create action".to_string())
        })?;
        match svc
            .redeem_and_create_user(&payload.code, username, password, payload.email.as_deref())
            .await
        {
            Ok(redemption) => {
                // If client provided explicit categories, try to apply them after creation.
                if let Some(user_id) = redemption.redeemer_user_id {
                    if let Some(mut selected_ids) = payload.category_ids.clone() {
                        if !selected_ids.is_empty() {
                            // Intersect with granted categories from the gift code, if any
                            if let Some(granted_json) = &redemption.granted_categories {
                                if let Ok(granted_ids) =
                                    serde_json::from_str::<Vec<i64>>(granted_json)
                                {
                                    selected_ids.retain(|id| granted_ids.contains(id));
                                }
                            }
                            // Validate existence in categories table
                            let placeholders = vec!["$1"; selected_ids.len()].join(",");
                            let sql =
                                format!("SELECT id FROM content.categories WHERE id IN ({})", placeholders);
                            let mut q = sqlx::query_scalar::<_, i64>(&sql);
                            for id in &selected_ids {
                                q = q.bind(id);
                            }
                            if let Ok(valid_ids) = q.fetch_all(&app_state.database.pool).await {
                                if !valid_ids.is_empty() {
                                    // Best-effort: apply; ignore errors to avoid failing the redeem
                                    let _ = app_state
                                        .user_service
                                        .set_user_subscriptions(user_id, &valid_ids)
                                        .await;
                                }
                            }
                        }
                    }
                }

                let uname = redemption
                    .redeemer_username
                    .clone()
                    .or(payload.username.clone())
                    .unwrap_or_else(|| "<unknown>".to_string());

                Ok(Json(RedeemResponse {
                    redeemed: true,
                    user_id: redemption.redeemer_user_id,
                    username: Some(uname.clone()),
                    message: format!("All set! User '{}' created and activated", uname),
                }))
            }
            Err(e) => Err(e),
        }
    }
}

/// Admin: bulk delete gift codes
pub async fn delete_gift_codes(
    State(app_state): State<crate::AppState>,
    axum::Json(payload): axum::Json<Vec<i64>>,
) -> Result<StatusCode, AppError> {
    let svc = GiftCodesService::new(
        app_state.database.pool.clone(),
        app_state.user_service.clone(),
        app_state.content_service.clone(),
    );
    let deleted = svc.delete_bulk(&payload).await?;
    tracing::info!("Deleted {} gift codes", deleted);
    Ok(StatusCode::OK)
}

/// Public: username availability check (no auth)
#[derive(Debug, Serialize)]
pub struct UsernameAvailabilityResponse {
    pub available: bool,
    pub message: String,
}

pub async fn check_username_availability_public(
    State(app_state): State<crate::AppState>,
    Path(username): Path<String>,
) -> Result<Json<UsernameAvailabilityResponse>, AppError> {
    // Normalize: trim and work with cleaned username
    let uname = username.trim().to_string();

    // Basic sanity: length requirement and allowed characters
    if uname.len() < 3 {
        return Ok(Json(UsernameAvailabilityResponse {
            available: false,
            message: "Username must be at least 3 characters".to_string(),
        }));
    }
    // Use the same validation rules as backend
    if let Err(e) = ValidationUtils::validate_username(&uname) {
        return Ok(Json(UsernameAvailabilityResponse {
            available: false,
            message: format!("{}", e),
        }));
    }

    // Check existence in DB (case-insensitive, PostgreSQL)
    let exists: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE LOWER(username) = LOWER($1))",
    )
    .bind(&uname)
    .fetch_one(&app_state.database.pool)
    .await?; // propagate DB errors instead of assuming 'available'

    if exists {
        Ok(Json(UsernameAvailabilityResponse {
            available: false,
            message: "Username is already taken".to_string(),
        }))
    } else {
        Ok(Json(UsernameAvailabilityResponse {
            available: true,
            message: "Username is available".to_string(),
        }))
    }
}
