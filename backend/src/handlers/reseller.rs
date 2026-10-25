use crate::error::AppError;
use crate::models::user::{
    CreateDemoRequest, CreateUserRequest, UpdateUserRequest, User, UserRole,
};
use crate::validation::{Validate, ValidationUtils};
use chrono::{DateTime, Utc};

use crate::handlers::admin::{SetActiveStatusRequest, UserResponse};
use crate::services::Claims;
use axum::{
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};

/// Read the configurable credit cost per extra device from the DB (default 0.25)
async fn get_credit_per_extra_device(app_state: &crate::AppState) -> f64 {
    app_state
        .user_service
        .get_config_value("credit_per_extra_device")
        .await
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.25)
}

#[derive(Debug, Deserialize)]
pub struct CreateEndUserRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub max_devices: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
    pub category_ids: Option<Vec<i64>>, // Categories the user has access to
}

impl Validate for CreateEndUserRequest {
    fn validate(&self) -> Result<(), AppError> {
        // Validate username
        ValidationUtils::validate_username(&self.username)?;

        // Validate password
        ValidationUtils::validate_password(&self.password)?;

        // Validate email if provided
        if let Some(ref email) = self.email {
            ValidationUtils::validate_email(email)?;
        }

        // Validate max_devices if provided
        if let Some(devices) = self.max_devices {
            ValidationUtils::validate_device_count(devices)?;
        }

        Ok(())
    }
}

#[derive(Debug, Serialize)]
pub struct CreditCalculationResponse {
    pub devices: i32,
    pub credit_cost: f64,
    pub current_credits: f64,
    pub sufficient_credits: bool,
}

#[derive(Debug, Serialize)]
pub struct CreditBalance {
    pub credits: f64,
}

const DAYS_PER_MONTH: i64 = 30;

/// Create a new end user (reseller only)
pub async fn create_end_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    connect_info: Option<ConnectInfo<std::net::SocketAddr>>,
    headers: HeaderMap,
    Json(request): Json<CreateEndUserRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    // Unlicensed soft limit: max end users
    if let Err(msg) = app_state.license_service.check_user_creation_limit().await {
        return Err(AppError::LicenseRequired(msg));
    }

    // 🔍 Log the incoming request
    tracing::trace!(" create_end_user called by reseller");
    tracing::trace!(" Request data - username: {}, password_length: {}, email: {:?}, max_devices: {:?}, expires_at: {:?}, category_ids: {:?}",
                   request.username, request.password.len(), request.email, request.max_devices, request.expires_at, request.category_ids);

    // Validate input
    tracing::trace!(" Starting input validation");
    if let Err(validation_error) = request.validate() {
        tracing::warn!("❌  Validation failed: {:?}", validation_error);
        return Err(validation_error);
    }
    tracing::trace!("✅  Input validation passed");

    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;
    tracing::trace!(" Reseller ID parsed: {}", reseller_id);

    let create_request = CreateUserRequest {
        username: request.username.clone(),
        password: request.password.clone(),
        email: request.email.clone(),
        role: UserRole::EndUser,
        credits: None, // End users don't have credits
        max_devices: request.max_devices,
        expires_at: request.expires_at,
        category_ids: request.category_ids.clone(), // Categories the user has access to
        daily_demo_limit: None,                     // End users don't create demos
    };

    tracing::trace!(" Calling user_service.create_end_user");
    let (user, credit_info) = app_state
        .user_service
        .create_end_user(reseller_id, create_request)
        .await?;
    tracing::trace!("✅  user_service.create_end_user completed successfully");

    // Log the user creation by reseller with credit information
    if let Some((credit_cost, duration_months)) = credit_info {
        // Reseller creation - log with credit cost
        if let Err(e) = app_state
            .activity_log_service
            .log_user_created_with_credits(
                reseller_id,
                user.id,
                &user.username,
                credit_cost,
                user.max_devices,
                duration_months,
            )
            .await
        {
            tracing::warn!(
                "Failed to log user creation with credits by reseller: {}",
                e
            );
        }

        // Extract IP address and user agent for logging
        let ip_address = connect_info.as_ref().map(|ci| ci.0.ip().to_string());
        let user_agent = headers
            .get("user-agent")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string());

        // Log persistent credit transaction for reseller auditing
        let log_request = crate::services::CreateResellerLogRequest {
            reseller_id,
            reseller_username: claims.username.clone(),
            end_user_username: request.username.clone(),
            end_user_email: request.email.clone(),
            credits_cost: credit_cost,
            duration_months: duration_months as i32, // Convert f64 to i32
            action: "CREATE".to_string(),
            ip_address,
            user_agent,
        };

        if let Err(e) = app_state
            .reseller_logs_service
            .log_end_user_creation(log_request)
            .await
        {
            tracing::error!("❌ Failed to log persistent reseller transaction: {:?}", e);
        } else {
            tracing::debug!("✅ Persistent reseller log created successfully");
        }
    } else {
        // Fallback to regular logging (shouldn't happen for resellers)
        if let Err(e) = app_state
            .activity_log_service
            .log_user_created(reseller_id, user.id, &user.username)
            .await
        {
            tracing::warn!("Failed to log user creation by reseller: {}", e);
        }
    }

    tracing::debug!(
        "✅ End user created successfully - ID: {}, Username: {}",
        user.id,
        user.username
    );
    Ok((StatusCode::CREATED, Json(user.into())))
}

/// Get reseller's own end users
pub async fn get_my_end_users(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let users = app_state
        .user_service
        .get_reseller_end_users(reseller_id, reseller_id)
        .await?;

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

/// Update own end user (reseller only)
pub async fn update_end_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get current user info to check for max_devices changes
    let current_user = app_state.user_service.get_user_by_id(user_id).await?;

    // Verify ownership
    if current_user.created_by != Some(reseller_id) {
        return Err(AppError::Forbidden);
    }

    // Check if max_devices is being changed and calculate credit cost
    if let Some(new_max_devices) = request.max_devices {
        if new_max_devices > current_user.max_devices {
            // Calculate additional credit cost for the remaining subscription period
            let additional_devices = new_max_devices - current_user.max_devices;
            let cpd = get_credit_per_extra_device(&app_state).await;
            let additional_cost_per_month = additional_devices as f64 * cpd;

            // Calculate remaining days
            let remaining_days = if let Some(expires_at) = current_user.expires_at {
                let now = chrono::Utc::now();
                if expires_at > now {
                    (expires_at - now).num_days() as f64
                } else {
                    0.0 // Already expired
                }
            } else {
                30.0 // Default to 30 days if no expiration
            };

            // Calculate proportional cost: (cost_per_month * remaining_days) / 30
            let total_additional_cost = (additional_cost_per_month * remaining_days) / 30.0;

            if total_additional_cost > 0.0 {
                // Check if reseller has enough credits
                let reseller = app_state.user_service.get_user_by_id(reseller_id).await?;
                let current_credits = reseller.credits.unwrap_or(0.0);

                if current_credits < total_additional_cost {
                    return Err(AppError::InsufficientCredits);
                }

                // Deduct credits from reseller
                app_state
                    .user_service
                    .deduct_credits(reseller_id, total_additional_cost)
                    .await?;
            }
        }
        // Note: Reducing max_devices does NOT refund credits
    }

    // Update user categories if provided
    if let Some(category_ids) = &request.category_ids {
        app_state
            .user_service
            .set_user_subscriptions(user_id, category_ids)
            .await?;
    }

    // Update user basic info
    let user = app_state
        .user_service
        .update_user(reseller_id, user_id, request)
        .await?;

    Ok(Json(user.into()))
}

/// Ban/unban own end user (reseller only)
pub async fn set_end_user_active_status(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<SetActiveStatusRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .set_user_active_status(reseller_id, user_id, request.active)
        .await?;
    Ok(Json(user.into()))
}

/// Calculate credit cost for end user creation
pub async fn calculate_credit_cost(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(devices): Path<i32>,
) -> Result<Json<CreditCalculationResponse>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get current reseller info
    let reseller = app_state.user_service.get_user_by_id(reseller_id).await?;
    let current_credits = reseller.credits.unwrap_or(0.0);

    // Calculate credit cost based on devices
    // Base cost for 3 devices = 1 credit per month
    let mut credit_cost = 1.0;
    if devices > 3 {
        let cpd = get_credit_per_extra_device(&app_state).await;
        let extra_devices = devices - 3;
        credit_cost = 1.0 + (extra_devices as f64 * cpd);
    }

    let response = CreditCalculationResponse {
        devices,
        credit_cost,
        current_credits,
        sufficient_credits: current_credits >= credit_cost,
    };

    Ok(Json(response))
}

/// Get credit usage statistics
pub async fn get_credit_usage_stats(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get reseller info
    let reseller = app_state.user_service.get_user_by_id(reseller_id).await?;
    let current_credits = reseller.credits.unwrap_or(0.0);

    // Get all end users created by this reseller
    let users = app_state
        .user_service
        .get_reseller_end_users(reseller_id, reseller_id)
        .await?;

    // Calculate total credits used based on actual user configurations and subscription duration
    let mut total_credits_used = 0.0;
    let cpd_val = get_credit_per_extra_device(&app_state).await;
    for user in &users {
        // Calculate monthly cost based on devices
        let mut monthly_cost = 1.0; // Base cost for 3 devices
        if user.max_devices > 3 {
            let extra_devices = user.max_devices - 3;
            monthly_cost = 1.0 + (extra_devices as f64 * cpd_val);
        }

        // Calculate subscription duration in months
        let duration_months = if let Some(expires_at) = user.expires_at {
            let duration_seconds = expires_at.timestamp() - user.created_at.timestamp();
            let duration_months = duration_seconds as f64 / (30.0 * 24.0 * 3600.0); // Convert to months
            duration_months.max(1.0) // Minimum 1 month
        } else {
            1.0 // Default to 1 month if no expiration
        };

        // Calculate total cost for this user (monthly cost × duration)
        let user_total_cost = monthly_cost * duration_months;
        total_credits_used += user_total_cost;
    }

    // Calculate initial credits (current + used)
    let initial_credits = current_credits + total_credits_used;

    let stats = serde_json::json!({
        "current_credits": current_credits,
        "total_credits_used": total_credits_used,
        "initial_credits": initial_credits,
        "total_users": users.len(),
        "users_breakdown": users.iter().map(|user| {
            // Calculate monthly cost based on devices
            let mut monthly_cost = 1.0;
            if user.max_devices > 3 {
                let extra_devices = user.max_devices - 3;
                monthly_cost = 1.0 + (extra_devices as f64 * cpd_val);
            }

            // Calculate subscription duration in months
            let duration_months = if let Some(expires_at) = user.expires_at {
                let duration_seconds = expires_at.timestamp() - user.created_at.timestamp();
                let duration_months = duration_seconds as f64 / (30.0 * 24.0 * 3600.0); // Convert to months
                duration_months.max(1.0) // Minimum 1 month
            } else {
                1.0 // Default to 1 month if no expiration
            };

            // Calculate total cost for this user
            let total_cost = monthly_cost * duration_months;

            serde_json::json!({
                "id": user.id,
                "username": user.username,
                "max_devices": user.max_devices,
                "monthly_cost": monthly_cost,
                "duration_months": duration_months,
                "credit_cost": total_cost
            })
        }).collect::<Vec<_>>()
    });

    Ok(Json(stats))
}

/// Create a demo user (reseller only)
pub async fn create_demo_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateDemoRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state
        .user_service
        .create_demo_user(reseller_id, request)
        .await?;
    Ok((StatusCode::CREATED, Json(user.into())))
}

/// Get demo statistics for reseller
pub async fn get_demo_stats(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let stats = app_state.user_service.get_demo_stats(reseller_id).await?;
    Ok(Json(stats))
}

#[derive(Debug, Serialize)]
pub struct ResellerRatesResponse {
    // Legacy per-user credit rate info
    pub default_connections: i32,
    pub base_cost: f64,
    pub extra_connection_cost: f64,
    // New credit purchase pricing config for Stripe Checkout
    pub pricing: crate::services::PricingConfig,
}

/// Get current credit rates plus credit purchase pricing (reseller can view rates)
pub async fn get_credit_rates(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<ResellerRatesResponse>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Existing rates for per-user credit consumption
    let rates = app_state.user_service.get_credit_rates(reseller_id).await?;

    // Pricing config used for purchasing credits via Stripe
    let pricing_service = crate::services::PricingService::new(app_state.database.clone());
    let pricing = pricing_service.load_config().await?;

    let resp = ResellerRatesResponse {
        default_connections: rates.default_connections,
        base_cost: rates.base_cost,
        extra_connection_cost: rates.extra_connection_cost,
        pricing,
    };

    Ok(Json(resp))
}

pub async fn get_reseller_stats(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let reseller = app_state.user_service.get_user_by_id(reseller_id).await?;
    let current_credits = reseller.credits.unwrap_or(0.0);

    let total_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auth.users WHERE created_by = $1 AND role = 'end_user'",
    )
    .bind(reseller_id)
    .fetch_one(&app_state.database.pool)
    .await?;

    let active_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auth.users WHERE created_by = $1 AND role = 'end_user' AND active = true",
    )
    .bind(reseller_id)
    .fetch_one(&app_state.database.pool)
    .await?;

    let stats = serde_json::json!({
        "total_users": total_users,
        "active_users": active_users,
        "total_credits": current_credits,
        "used_credits": 0.0
    });

    Ok(Json(stats))
}

/// Get current credit balance (reseller only)
pub async fn get_credit_balance(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<CreditBalance>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let reseller = app_state.user_service.get_user_by_id(reseller_id).await?;

    // Verify this is a reseller
    if reseller.role != crate::models::user::UserRole::Reseller {
        return Err(AppError::Forbidden);
    }

    let balance = CreditBalance {
        credits: reseller.credits.unwrap_or(0.0),
    };

    Ok(Json(balance))
}

#[derive(Debug, Deserialize)]
pub struct ExtendSubscriptionRequest {
    pub extension_months: i32,
    pub category_ids: Option<Vec<i64>>,
}

/// Extend user subscription (reseller only)
pub async fn extend_user_subscription(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<ExtendSubscriptionRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Validate extension months
    if request.extension_months < 1 || request.extension_months > 12 {
        return Err(AppError::BadRequest(
            "Extension must be between 1 and 12 months".to_string(),
        ));
    }

    // Get the user to verify ownership and get current info
    let user = app_state.user_service.get_user_by_id(user_id).await?;

    // Verify that this user belongs to the reseller
    if user.created_by != Some(reseller_id) {
        return Err(AppError::Forbidden);
    }

    // Calculate extension cost
    let devices = user.max_devices;
    let mut credits_per_month = 1.0;
    if devices > 3 {
        let cpd = get_credit_per_extra_device(&app_state).await;
        let extra_devices = devices - 3;
        credits_per_month = 1.0 + (extra_devices as f64 * cpd);
    }
    let total_credits = request.extension_months as f64 * credits_per_month;

    let mut tx = app_state.database.pool.begin().await?;

    let credit_update =
        sqlx::query("UPDATE auth.users SET credits = credits - $1 WHERE id = $2 AND credits >= $3")
            .bind(total_credits)
            .bind(reseller_id)
            .bind(total_credits)
            .execute(&mut *tx)
            .await?;

    if credit_update.rows_affected() == 0 {
        tx.rollback().await.ok();
        return Err(AppError::InsufficientCredits);
    }

    let now = Utc::now();
    let base_date = match user.expires_at {
        Some(expiry) if expiry > now => expiry,
        _ => now,
    };
    let new_expiry =
        base_date + chrono::Duration::days((request.extension_months as i64) * DAYS_PER_MONTH);

    sqlx::query("UPDATE auth.users SET expires_at = $1 WHERE id = $2")
        .bind(new_expiry)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    if let Some(category_ids) = request.category_ids {
        sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        for cat_id in category_ids {
            sqlx::query(
                "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2) ON CONFLICT (user_id, category_id) DO NOTHING",
            )
            .bind(user_id)
            .bind(cat_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    let updated_user: User = sqlx::query_as("SELECT * FROM auth.users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Json(updated_user.into()))
}

/// Delete end user (reseller only)
pub async fn delete_end_user(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    connect_info: Option<ConnectInfo<std::net::SocketAddr>>,
    headers: HeaderMap,
    Path(user_id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let reseller_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Verify the user belongs to this reseller
    let user = app_state.user_service.get_user_by_id(user_id).await?;
    if user.created_by != Some(reseller_id) {
        return Err(AppError::Forbidden);
    }

    // Extract IP address and user agent for logging
    let ip_address = connect_info.as_ref().map(|ci| ci.0.ip().to_string());
    let user_agent = headers
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    tracing::debug!(
        "🔍 Deleting end-user - reseller: {}, user: {}",
        claims.username,
        user.username
    );

    // Log the deletion persistently before actual deletion
    if let Err(e) = app_state
        .reseller_logs_service
        .log_end_user_deletion(
            reseller_id,
            claims.username.clone(),
            user.username.clone(),
            ip_address.clone(),
            user_agent.clone(),
        )
        .await
    {
        tracing::error!("❌ Failed to log persistent end-user deletion: {:?}", e);
        // Continue with deletion even if logging fails
    } else {
        tracing::debug!(
            "✅ Persistent deletion log created for user: {}",
            user.username
        );
    }

    // Delete the user using reseller-specific method
    app_state
        .user_service
        .delete_end_user(reseller_id, user_id)
        .await?;

    tracing::debug!(
        "✅ End-user deleted successfully - Username: {}",
        user.username
    );
    Ok(Json(serde_json::json!({ "success": true })))
}

// GET /api/reseller/users/check-username/:username - Check username availability
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
    // Only resellers can check username availability for their context
    if claims.role != UserRole::Reseller {
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
