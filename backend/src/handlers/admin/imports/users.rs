use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    Extension,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::AppError;
use crate::models::user::{
    CreateUserRequest, CreditRates, UpdateConfigRequest,
    UpdateUserRequest, User, UserRole,
};
use crate::services::Claims;

#[derive(Debug, Deserialize)]
pub struct CreateResellerRequest {
    pub username: String,
    pub password: String,
    pub email: String,
    pub credits: Option<f64>,
    pub daily_demo_limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEndUserRequest {
    pub username: String,
    pub password: String,
    pub email: String,
    pub max_devices: i32,
    pub reseller_id: Option<i64>,
    pub expires_at: Option<DateTime<Utc>>,
    pub category_ids: Option<Vec<i64>>, // Categories the user has access to
}

#[derive(Debug, Deserialize)]
pub struct UpdateCreditsRequest {
    pub credits: f64,
}

#[derive(Debug, Deserialize)]
pub struct TMDBConfigRequest {
    pub tmdb_api_key: Option<String>,
    pub tmdb_language: Option<String>,
    pub tmdb_languages: Option<String>,
    pub tmdb_mode: Option<String>,
    pub tmdb_metadata_path: Option<String>,
    pub tmdb_preferred_format: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TMDBTestResult {
    pub valid: bool,
    pub message: String,
    pub account_info: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct SetActiveStatusRequest {
    pub active: bool,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub role: UserRole,
    pub credits: Option<f64>,
    pub active: bool,
    pub created_by: Option<i64>,
    pub max_devices: i32,
    pub expires_at: Option<String>,
    pub created_at: String,
    // Demo fields
    pub daily_demo_limit: Option<i32>,
    pub demos_created_today: Option<i32>,
    pub is_demo: Option<bool>,
    pub demo_expires_at: Option<String>,
    // Last known registration / login IP (optional)
    pub last_login_ip: Option<String>,
    // Subscriptions
    pub subscribed_categories: Option<Vec<CategoryResponse>>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            credits: user.credits,
            active: user.active,
            created_by: user.created_by,
            max_devices: user.max_devices,
            expires_at: user.expires_at.map(|dt| dt.to_rfc3339()),
            created_at: user.created_at.to_rfc3339(),
            daily_demo_limit: user.daily_demo_limit,
            demos_created_today: user.demos_created_today,
            is_demo: user.is_demo,
            demo_expires_at: user.demo_expires_at.map(|dt| dt.to_rfc3339()),
            last_login_ip: None, // Will be populated separately when available
            subscribed_categories: None, // Will be populated separately when needed
        }
    }
}

/// Create a new admin user (admin only)
pub async fn create_admin(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .create_admin(admin_id, request)
        .await?;
    Ok((StatusCode::CREATED, Json(user.into())))
}

/// Create a new reseller (admin only)
pub async fn create_reseller(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateResellerRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    // Unlicensed soft limit: max resellers
    if let Err(msg) = app_state.license_service.check_reseller_creation_limit().await {
        return Err(AppError::LicenseRequired(msg));
    }

    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let create_request = CreateUserRequest {
        username: request.username,
        password: request.password,
        email: Some(request.email),
        role: UserRole::Reseller,
        credits: request.credits,
        max_devices: None,  // Resellers don't need device limits
        expires_at: None,   // Resellers typically don't expire
        category_ids: None, // Resellers don't need content subscriptions
        daily_demo_limit: request.daily_demo_limit,
    };

    let user = app_state
        .user_service
        .create_reseller(admin_id, create_request)
        .await?;

    tracing::info!(
        admin_id = admin_id,
        admin_username = claims.username,
        new_reseller_id = user.id,
        new_reseller_username = user.username,
        credits_assigned = user.credits.unwrap_or(0.0),
        "👤 RESELLER CREATED - STREAMCORE: Administrator created new reseller account"
    );

    // Log the reseller creation
    if let Err(e) = app_state
        .activity_log_service
        .log_reseller_created(
            admin_id,
            user.id,
            &user.username,
            user.credits.unwrap_or(0.0),
        )
        .await
    {
        tracing::warn!("Failed to log reseller creation: {}", e);
    }

    Ok((StatusCode::CREATED, Json(user.into())))
}

/// Create a new end user (admin only)
pub async fn create_end_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateEndUserRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    // Unlicensed soft limit: max end users
    if let Err(msg) = app_state.license_service.check_user_creation_limit().await {
        return Err(AppError::LicenseRequired(msg));
    }

    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let category_count = request.category_ids.as_ref().map(|c| c.len()).unwrap_or(0);

    let create_request = CreateUserRequest {
        username: request.username,
        password: request.password,
        email: Some(request.email),
        role: UserRole::EndUser,
        credits: None, // End users don't have credits
        max_devices: Some(request.max_devices),
        expires_at: request.expires_at,
        category_ids: request.category_ids, // Categories the user has access to
        daily_demo_limit: None,             // End users don't create demos
    };

    let (user, _credit_info) = app_state
        .user_service
        .create_end_user(admin_id, create_request)
        .await?;

    tracing::info!(
        admin_id = admin_id,
        admin_username = claims.username,
        new_user_id = user.id,
        new_user_username = user.username,
        max_devices = request.max_devices,
        expires_at = ?request.expires_at,
        category_count = category_count,
        "👤 END USER CREATED - STREAMCORE: Administrator created new end user account"
    );

    // Log the user creation (no credit cost for admin)
    if let Err(e) = app_state
        .activity_log_service
        .log_user_created(admin_id, user.id, &user.username)
        .await
    {
        tracing::warn!("Failed to log user creation: {}", e);
    }

    Ok((StatusCode::CREATED, Json(user.into())))
}

/// Get all resellers (admin only)
pub async fn get_resellers(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let resellers = app_state.user_service.get_all_resellers(admin_id).await?;
    let response: Vec<UserResponse> = resellers.into_iter().map(|u| u.into()).collect();
    Ok(Json(response))
}

/// Update reseller credits (admin only)
pub async fn update_reseller_credits(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(reseller_id): Path<i64>,
    Json(request): Json<UpdateCreditsRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .update_reseller_credits(admin_id, reseller_id, request.credits)
        .await?;
    Ok(Json(user.into()))
}

/// Ban/unban a user (admin only)
pub async fn set_user_active_status(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<SetActiveStatusRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .set_user_active_status(admin_id, user_id, request.active)
        .await?;
    Ok(Json(user.into()))
}

/// Get all end users (admin only)
pub async fn get_all_end_users(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let users = app_state.user_service.get_all_end_users(admin_id).await?;

    // Batch load all user categories in a single query (eliminates N+1 problem)
    let user_ids: Vec<i64> = users.iter().map(|u| u.id).collect();
    let categories_map = app_state
        .content_service
        .get_users_categories_batch(&user_ids)
        .await?;

    // Convert users to response with their pre-loaded categories
    let response: Vec<UserResponse> = users
        .into_iter()
        .map(|user| {
            let mut user_response: UserResponse = user.into();
            user_response.subscribed_categories = categories_map.get(&user_response.id).cloned();
            user_response
        })
        .collect();

    Ok(Json(response))
}

/// Get reseller's end users (admin can see any reseller's users)
pub async fn get_reseller_users(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(reseller_id): Path<i64>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let users = app_state
        .user_service
        .get_reseller_end_users(admin_id, reseller_id)
        .await?;
    let response: Vec<UserResponse> = users.into_iter().map(|u| u.into()).collect();
    Ok(Json(response))
}

/// Get system configuration (admin only)
pub async fn get_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<HashMap<String, String>>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let config = app_state.user_service.get_config(admin_id).await?;
    Ok(Json(config))
}

/// Update system configuration (admin only)
pub async fn update_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<UpdateConfigRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Encrypt sensitive values before storing
    let store_value = if crate::validation::ValidationUtils::is_sensitive_config_key(&request.key) && !request.value.is_empty() {
        crate::config::encrypt_config_value(&request.value)
    } else {
        request.value.clone()
    };

    app_state
        .user_service
        .update_config(admin_id, &request.key, &store_value)
        .await?;

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "message": "Configuration updated successfully",
            "key": request.key,
            "value": request.value
        })),
    ))
}

/// GET /api/admin/payment-config — Get payment/Stripe settings (masked secrets)
pub async fn get_payment_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let pool = &app_state.database.pool;

    // Read each payment key from DB, falling back to env var
    let stripe_secret_key = crate::config::get_dynamic_config_value(
        pool, "stripe_secret_key", &app_state.config.stripe_secret_key,
    ).await;
    let stripe_webhook_secret = crate::config::get_dynamic_config_value(
        pool, "stripe_webhook_secret", &app_state.config.stripe_webhook_secret,
    ).await;
    let stripe_sub_webhook = crate::config::get_dynamic_config_value(
        pool, "stripe_subscription_webhook_secret",
        &std::env::var("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET").unwrap_or_default(),
    ).await;
    let stripe_currency = crate::config::get_dynamic_config_value(
        pool, "stripe_currency", &app_state.config.stripe_currency,
    ).await;
    let stripe_success_url = crate::config::get_dynamic_config_value(
        pool, "stripe_success_url", &app_state.config.stripe_success_url,
    ).await;
    let stripe_cancel_url = crate::config::get_dynamic_config_value(
        pool, "stripe_cancel_url", &app_state.config.stripe_cancel_url,
    ).await;
    let public_base_url = crate::config::get_dynamic_config_value(
        pool, "public_base_url", &app_state.config.public_base_url,
    ).await;
    let content_multiplier = crate::config::get_dynamic_config_value(
        pool, "content_overview_multiplier",
        &std::env::var("CONTENT_OVERVIEW_MULTIPLIER").unwrap_or_else(|_| "x1".to_string()),
    ).await;

    Ok(Json(serde_json::json!({
        "stripe_secret_key": crate::config::mask_sensitive_value(&stripe_secret_key),
        "stripe_webhook_secret": crate::config::mask_sensitive_value(&stripe_webhook_secret),
        "stripe_subscription_webhook_secret": crate::config::mask_sensitive_value(&stripe_sub_webhook),
        "stripe_currency": stripe_currency,
        "stripe_success_url": stripe_success_url,
        "stripe_cancel_url": stripe_cancel_url,
        "public_base_url": public_base_url,
        "content_overview_multiplier": content_multiplier,
        "has_stripe_key": !stripe_secret_key.is_empty(),
        "has_webhook_secret": !stripe_webhook_secret.is_empty(),
        "has_subscription_webhook": !stripe_sub_webhook.is_empty(),
    })))
}

/// Update TMDB configuration (admin only)
pub async fn update_tmdb_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<TMDBConfigRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Update TMDB API key in config
    let api_key = request.tmdb_api_key.clone().unwrap_or_default();
    app_state
        .user_service
        .update_config(admin_id, "tmdb_api_key", &api_key)
        .await?;

    // Update TMDB language if provided
    if let Some(language) = &request.tmdb_language {
        app_state
            .user_service
            .update_config(admin_id, "tmdb_language", language)
            .await?;
    }

    if let Some(mode) = &request.tmdb_mode {
        app_state
            .user_service
            .update_config(admin_id, "tmdb_mode", mode)
            .await?;
    }

    if let Some(metadata_path) = &request.tmdb_metadata_path {
        app_state
            .user_service
            .update_config(admin_id, "tmdb_metadata_path", metadata_path)
            .await?;
    }

    if let Some(preferred_format) = &request.tmdb_preferred_format {
        app_state
            .user_service
            .update_config(admin_id, "tmdb_preferred_format", preferred_format)
            .await?;
    }

    // Update multi-language TMDB languages if provided
    if let Some(languages) = &request.tmdb_languages {
        app_state
            .user_service
            .update_config(admin_id, "tmdb_languages", languages)
            .await?;
    }

    let tmdb_enabled = match request.tmdb_mode.as_deref() {
        Some("local") => true,
        _ => !api_key.is_empty(),
    };
    let language = request
        .tmdb_language
        .clone()
        .unwrap_or_else(|| "es-ES".to_string());

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "message": "TMDB configuration updated successfully",
            "tmdb_enabled": tmdb_enabled,
            "tmdb_language": language,
            "tmdb_languages": request.tmdb_languages.clone().unwrap_or_default(),
            "tmdb_mode": request.tmdb_mode.unwrap_or_else(|| "tmdb".to_string()),
            "tmdb_metadata_path": request.tmdb_metadata_path.unwrap_or_else(|| "metadata".to_string()),
            "tmdb_preferred_format": request.tmdb_preferred_format.unwrap_or_else(|| "original".to_string())
        })),
    ))
}

/// Test TMDB API key (admin only)
pub async fn test_tmdb_key(
    State(_app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<TMDBConfigRequest>,
) -> Result<Json<TMDBTestResult>, AppError> {
    // Only admins can test TMDB
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Test the API key by making a simple request to TMDB
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| AppError::InternalServerError)?;
    let api_key = request.tmdb_api_key.clone().unwrap_or_default();
    if api_key.trim().is_empty() {
        return Ok(Json(TMDBTestResult {
            valid: false,
            message: "TMDB API key is empty".to_string(),
            account_info: None,
        }));
    }
    let test_url = format!(
        "https://api.themoviedb.org/3/configuration?api_key={}",
        api_key
    );

    match client.get(&test_url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                let account_info = response.json::<serde_json::Value>().await.ok();
                Ok(Json(TMDBTestResult {
                    valid: true,
                    message: "TMDB API key is valid and working!".to_string(),
                    account_info,
                }))
            } else {
                Ok(Json(TMDBTestResult {
                    valid: false,
                    message: "TMDB API key is invalid or has insufficient permissions".to_string(),
                    account_info: None,
                }))
            }
        }
        Err(_) => Ok(Json(TMDBTestResult {
            valid: false,
            message: "Failed to connect to TMDB API. Please check your internet connection."
                .to_string(),
            account_info: None,
        })),
    }
}

/// Get current credit rates (admin only)
pub async fn get_credit_rates(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<CreditRates>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let rates = app_state.user_service.get_credit_rates(admin_id).await?;
    Ok(Json(rates))
}

/// Get a specific user (admin only)
pub async fn get_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
) -> Result<Json<UserResponse>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .get_user_by_id_admin(admin_id, user_id)
        .await?;

    // Get user's subscribed categories
    let user_categories = app_state
        .content_service
        .get_user_categories(user_id)
        .await?;

    let mut user_response: UserResponse = user.into();
    user_response.subscribed_categories = Some(user_categories);

    Ok(Json(user_response))
}

/// Update reseller information (admin only)
pub async fn update_reseller(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(reseller_id): Path<i64>,
    Json(request): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let reseller = app_state
        .user_service
        .update_reseller(admin_id, reseller_id, request)
        .await?;
    Ok(Json(reseller.into()))
}

/// Update user information (admin only)
pub async fn update_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .update_user(admin_id, user_id, request)
        .await?;
    Ok(Json(user.into()))
}

/// Delete user (admin only)
pub async fn delete_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    app_state
        .user_service
        .delete_user(admin_id, user_id)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

/// Update user credits (admin only)
pub async fn update_user_credits(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<UpdateCreditsRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .update_user_credits(admin_id, user_id, request.credits)
        .await?;
    Ok(Json(user.into()))
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub password: String,
}

/// Reset user password (admin only)
pub async fn reset_user_password(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<ResetPasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    app_state
        .user_service
        .reset_user_password(admin_id, user_id, request.password)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Debug, Deserialize)]
pub struct TransferUserRequest {
    pub new_reseller_id: i64,
}

/// Transfer user to another reseller (admin only)
pub async fn transfer_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<TransferUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .transfer_user(admin_id, user_id, request.new_reseller_id)
        .await?;
    Ok(Json(user.into()))
}

/// Export users data (admin only) - Returns CSV format
pub async fn export_users(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Verify admin role
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Fetch all users with relevant data
    let users = sqlx::query_as::<_, crate::models::User>(
        r#"
        SELECT 
            id, username, password_hash, role, created_at, updated_at,
            daily_demo_limit, demos_created_today, last_demo_reset_date,
            is_demo, demo_expires_at, email, credits, active, created_by,
            max_devices, expires_at
        FROM auth.users
        ORDER BY id
        "#,
    )
    .fetch_all(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    // Generate CSV content
    let mut csv_content =
        String::from("id,username,email,role,active,credits,max_devices,expires_at,created_at\n");

    for user in users {
        let expires_at_str = user
            .expires_at
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default();
        let created_at_str = user.created_at.to_rfc3339();

        csv_content.push_str(&format!(
            "{},{},{},{},{},{},{},{},{}\n",
            user.id,
            user.username,
            user.email.as_deref().unwrap_or(""),
            user.role,
            user.active,
            user.credits.map(|c| c.to_string()).unwrap_or_default(),
            user.max_devices,
            expires_at_str,
            created_at_str
        ));
    }

    // Save to file - use DATA_DIR environment variable or fallback to /data
    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "/data".to_string());
    let export_dir = std::path::PathBuf::from(data_dir).join("exports");
    tokio::fs::create_dir_all(&export_dir).await.ok();

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("users_export_{}.csv", timestamp);
    let file_path = export_dir.join(&filename);

    tokio::fs::write(&file_path, csv_content)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to write export file: {}", e)))?;

    tracing::info!("Admin {} exported {} users to {}", admin_id, 0, filename);

    let download_url = format!(
        "{}/api/admin/exports/{}",
        app_state.config.public_base_url, filename
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "filename": filename,
        "download_url": download_url,
        "record_count": 0
    })))
}


/// Get all content categories
pub async fn get_categories(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<CategoryResponse>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let categories = sqlx::query_as::<_, CategoryResponse>(
        "SELECT id, name, category_type FROM content.categories ORDER BY name",
    )
    .fetch_all(&app_state.database.pool)
    .await?;

    Ok(Json(categories))
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct CategoryResponse {
    pub id: i64,
    pub name: String,
    pub category_type: String,
}

/// Update user subscriptions (admin only)
pub async fn update_user_subscriptions(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(category_ids): Json<Vec<i64>>,
) -> Result<Json<UserResponse>, AppError> {
    // Only admins can update subscriptions
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Update user subscriptions
    app_state
        .user_service
        .set_user_subscriptions(user_id, &category_ids)
        .await?;

    // Get updated user info
    let user = app_state.user_service.get_user_by_id(user_id).await?;
    Ok(Json(user.into()))
}

/// Reset daily demo counters for all resellers (admin only)
pub async fn reset_daily_demo_counters(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Verify admin permissions
    app_state
        .user_service
        .verify_admin_permissions(admin_id)
        .await?;

    let updated_count = app_state.user_service.reset_daily_demo_counters().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": format!("Reset demo counters for {} resellers", updated_count),
        "resellers_updated": updated_count
    })))
}