use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    Extension,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::services::Claims;
use crate::models::subscription_plan::*;
use crate::services::subscription;
use crate::AppState;

// ─── Public Endpoints (no auth) ───

/// GET /api/public/packages — List active packages
pub async fn list_packages(
    State(app_state): State<AppState>,
) -> Result<Json<Vec<PublicPackageResponse>>, AppError> {
    let packages = subscription::list_active_packages(&app_state.database.pool)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to list packages: {}", e)))?;

    let public: Vec<PublicPackageResponse> = packages.into_iter().map(|p| p.into()).collect();
    Ok(Json(public))
}

/// POST /api/public/register — Self-register as direct end user
pub async fn register_direct_user(
    State(app_state): State<AppState>,
    Json(payload): Json<RegisterDirectUserRequest>,
) -> Result<Json<Value>, AppError> {
    // Check if direct registration is enabled
    if !subscription::is_direct_registration_enabled(&app_state.database.pool).await {
        return Err(AppError::BadRequest(
            "Direct registration is not enabled".to_string(),
        ));
    }

    // Validate input
    if payload.username.len() < 3 || payload.username.len() > 50 {
        return Err(AppError::BadRequest(
            "Username must be between 3 and 50 characters".to_string(),
        ));
    }
    if payload.password.len() < 6 {
        return Err(AppError::BadRequest(
            "Password must be at least 6 characters".to_string(),
        ));
    }
    if !payload.email.contains('@') || payload.email.len() < 5 {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }

    // Check username availability
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE LOWER(username) = LOWER($1))",
    )
    .bind(&payload.username)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(format!("DB error: {}", e)))?;

    if exists {
        return Err(AppError::BadRequest("Username already taken".to_string()));
    }

    // Check email availability
    let email_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER($1))",
    )
    .bind(&payload.email)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(format!("DB error: {}", e)))?;

    if email_exists {
        return Err(AppError::BadRequest(
            "Email already registered".to_string(),
        ));
    }

    // Hash password
    let password_hash = app_state.auth_service.hash_password(&payload.password)?;

    let requires_verification =
        subscription::is_email_verification_required(&app_state.database.pool).await;

    // Create user (active but without a package — they'll choose one after login)
    let user_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO auth.users
            (username, password_hash, email, role, active, subscription_source, email_verified, created_by)
        VALUES ($1, $2, $3, 'end_user', true, 'direct', $4, NULL)
        RETURNING id
        "#,
    )
    .bind(&payload.username)
    .bind(&password_hash)
    .bind(&payload.email)
    .bind(!requires_verification) // email_verified = true if verification not required
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(format!("Failed to create user: {}", e)))?;

    // Send verification email if required
    if requires_verification {
        let token = subscription::generate_email_verify_token(&app_state.database.pool, user_id)
            .await
            .map_err(|e| AppError::InternalError(format!("Token generation failed: {}", e)))?;

        // Try to send email (non-blocking failure)
        let verify_url = format!(
            "{}/api/public/verify-email?token={}",
            &app_state.config.public_base_url,
            token
        );

        if let Err(e) = app_state
            .email_service
            .send_verification_email(&payload.email, &payload.username, &verify_url)
            .await
        {
            tracing::warn!("Failed to send verification email: {}", e);
        }

        return Ok(Json(json!({
            "message": "Account created. Please check your email to verify your account.",
            "requires_verification": true,
            "user_id": user_id
        })));
    }

    // Generate token for auto-login if no email verification needed
    let user = app_state
        .user_service
        .get_user_by_id(user_id)
        .await?;
    let token = app_state.auth_service.generate_token(&user)?;

    Ok(Json(json!({
        "message": "Account created successfully",
        "requires_verification": false,
        "user_id": user_id,
        "token": token
    })))
}

/// GET /api/public/verify-email?token=xxx — Verify email
pub async fn verify_email(
    State(app_state): State<AppState>,
    Query(params): Query<VerifyEmailParams>,
) -> Result<Json<Value>, AppError> {
    let user_id = subscription::verify_email_token(&app_state.database.pool, &params.token)
        .await
        .map_err(|e| AppError::InternalError(format!("Verification failed: {}", e)))?;

    match user_id {
        Some(id) => {
            tracing::info!(user_id = id, "✅ Email verified successfully");
            Ok(Json(json!({
                "message": "Email verified successfully. You can now log in.",
                "verified": true
            })))
        }
        None => Err(AppError::BadRequest(
            "Invalid or expired verification token".to_string(),
        )),
    }
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailParams {
    pub token: String,
}

/// POST /api/public/check-email — Check email availability
pub async fn check_email_availability(
    State(app_state): State<AppState>,
    Json(payload): Json<CheckEmailRequest>,
) -> Result<Json<Value>, AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER($1))",
    )
    .bind(&payload.email)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(format!("DB error: {}", e)))?;

    Ok(Json(json!({
        "available": !exists
    })))
}

// ─── Authenticated End-User Endpoints ───

/// GET /api/user/subscription — Current subscription status
pub async fn get_subscription(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<SubscriptionStatusResponse>, AppError> {
    let user_id: i64 = claims.sub.parse().map_err(|_| AppError::AuthenticationFailed)?;

    // Get user's subscription source
    let sub_source: Option<String> = sqlx::query_scalar(
        "SELECT subscription_source FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(format!("DB error: {}", e)))?;

    let sub = subscription::get_user_subscription(&app_state.database.pool, user_id)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to get subscription: {}", e)))?;

    let package = if let Some(ref s) = sub {
        subscription::get_package(&app_state.database.pool, s.package_id)
            .await
            .map_err(|e| AppError::InternalError(format!("Failed to get package: {}", e)))?
            .map(|p| p.into())
    } else {
        None
    };

    Ok(Json(SubscriptionStatusResponse {
        subscription: sub,
        package,
        subscription_source: sub_source,
    }))
}

/// POST /api/user/subscribe — Create Stripe Checkout session for a package
pub async fn create_checkout(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SubscribeRequest>,
) -> Result<Json<CheckoutResponse>, AppError> {
    let user_id: i64 = claims.sub.parse().map_err(|_| AppError::AuthenticationFailed)?;

    // Get the package
    let package = subscription::get_package(&app_state.database.pool, payload.package_id)
        .await
        .map_err(|e| AppError::InternalError(format!("DB error: {}", e)))?
        .ok_or_else(|| AppError::BadRequest("Package not found".to_string()))?;

    if !package.active {
        return Err(AppError::BadRequest(
            "This package is no longer available".to_string(),
        ));
    }

    // Regular License: block checkout for paid packages at runtime
    if package.price_cents > 0 {
        let is_extended = app_state.license_service.get_status().await
            .map(|s| s.licensed && s.license_type.as_deref() == Some("Extended License"))
            .unwrap_or(false);

        if !is_extended {
            return Err(AppError::BadRequest(
                "Paid packages require an Extended License. Free packages are available with Regular License.".to_string(),
            ));
        }
    }

    // ─── Free package bypass: skip Stripe entirely ───
    if package.price_cents <= 0 {
        let now = chrono::Utc::now();
        let period_end = if package.billing_mode == "one_time" {
            let days = package.duration_days.unwrap_or(30);
            now + chrono::Duration::days(days as i64)
        } else {
            match package.billing_interval.as_deref() {
                Some("year") => now + chrono::Duration::days(365),
                _ => now + chrono::Duration::days(30),
            }
        };

        let free_session_id = format!("free_{}", uuid::Uuid::new_v4());

        // Create the subscription record
        subscription::create_direct_subscription(
            &app_state.database.pool,
            user_id,
            package.id,
            &free_session_id,
            None,
        )
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to create subscription: {}", e)))?;

        // Activate immediately
        subscription::activate_subscription(
            &app_state.database.pool,
            user_id,
            &package,
            None,
            None,
            now,
            period_end,
        )
        .await
        .map_err(|e| AppError::InternalError(format!("Activation failed: {}", e)))?;

        tracing::info!(
            user_id = user_id,
            package = package.name,
            "✅ Free package activated (no Stripe)"
        );

        let base_url = &app_state.config.public_base_url;
        return Ok(Json(CheckoutResponse {
            url: format!("{}/subscription/success?session_id={}", base_url, free_session_id),
            session_id: free_session_id,
        }));
    }

    // Get user info for Stripe
    let user_email: Option<String> = sqlx::query_scalar(
        "SELECT email FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(format!("DB error: {}", e)))?;

    // Build Stripe Checkout Session — read from DB first
    let stripe_secret = crate::config::get_dynamic_config_value(
        &app_state.database.pool, "stripe_secret_key", &app_state.config.stripe_secret_key,
    ).await;
    let base_url = &app_state.config.public_base_url;

    let mode = if package.billing_mode == "recurring" {
        "subscription"
    } else {
        "payment"
    };

    // Build form params for Stripe API
    let mut params: Vec<(String, String)> = vec![
        ("mode".to_string(), mode.to_string()),
        (
            "success_url".to_string(),
            format!("{}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}", base_url),
        ),
        (
            "cancel_url".to_string(),
            format!("{}/subscription/cancel", base_url),
        ),
        ("metadata[user_id]".to_string(), user_id.to_string()),
        (
            "metadata[package_id]".to_string(),
            package.id.to_string(),
        ),
        (
            "metadata[package_name]".to_string(),
            package.name.clone(),
        ),
    ];

    if let Some(ref email) = user_email {
        params.push(("customer_email".to_string(), email.clone()));
    }

    // Use stripe_price_id if set (for recurring), otherwise create a line item
    if let Some(ref price_id) = package.stripe_price_id {
        params.push(("line_items[0][price]".to_string(), price_id.clone()));
        params.push(("line_items[0][quantity]".to_string(), "1".to_string()));
    } else {
        // Create ad-hoc price
        params.push((
            "line_items[0][price_data][currency]".to_string(),
            package.currency.clone(),
        ));
        params.push((
            "line_items[0][price_data][unit_amount]".to_string(),
            package.price_cents.to_string(),
        ));
        params.push((
            "line_items[0][price_data][product_data][name]".to_string(),
            package.name.clone(),
        ));

        if package.billing_mode == "recurring" {
            let interval = package
                .billing_interval
                .as_deref()
                .unwrap_or("month");
            params.push((
                "line_items[0][price_data][recurring][interval]".to_string(),
                interval.to_string(),
            ));
        }

        params.push(("line_items[0][quantity]".to_string(), "1".to_string()));
    }

    // Call Stripe API
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .header("Authorization", format!("Bearer {}", stripe_secret))
        .form(&params)
        .send()
        .await
        .map_err(|e| AppError::InternalError(format!("Stripe API error: {}", e)))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        tracing::error!("Stripe error: {}", error_body);
        return Err(AppError::InternalError(format!(
            "Stripe checkout creation failed: {}",
            error_body
        )));
    }

    let session: Value = response
        .json()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to parse Stripe response: {}", e)))?;

    let session_id = session["id"]
        .as_str()
        .ok_or_else(|| AppError::InternalError("No session ID in Stripe response".to_string()))?;
    let checkout_url = session["url"]
        .as_str()
        .ok_or_else(|| AppError::InternalError("No URL in Stripe response".to_string()))?;

    // Create pending subscription record
    subscription::create_direct_subscription(
        &app_state.database.pool,
        user_id,
        package.id,
        session_id,
        None,
    )
    .await
    .map_err(|e| AppError::InternalError(format!("Failed to create subscription: {}", e)))?;

    Ok(Json(CheckoutResponse {
        url: checkout_url.to_string(),
        session_id: session_id.to_string(),
    }))
}

/// POST /api/user/subscription/cancel — Cancel subscription at period end
pub async fn cancel_subscription(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Value>, AppError> {
    let user_id: i64 = claims.sub.parse().map_err(|_| AppError::AuthenticationFailed)?;

    let sub = subscription::cancel_subscription_at_period_end(&app_state.database.pool, user_id)
        .await
        .map_err(|e| AppError::InternalError(format!("Cancel failed: {}", e)))?;

    match sub {
        Some(s) => {
            // Also cancel on Stripe if we have a subscription ID
            if let Some(ref stripe_sub_id) = s.stripe_subscription_id {
                let client = reqwest::Client::new();
                let _ = client
                    .post(format!(
                        "https://api.stripe.com/v1/subscriptions/{}",
                        stripe_sub_id
                    ))
                    .header(
                        "Authorization",
                        format!("Bearer {}", crate::config::get_dynamic_config_value(
                            &app_state.database.pool, "stripe_secret_key", &app_state.config.stripe_secret_key,
                        ).await),
                    )
                    .form(&[("cancel_at_period_end", "true")])
                    .send()
                    .await;
            }

            Ok(Json(json!({
                "message": "Subscription will be canceled at the end of the current period",
                "cancel_at_period_end": true,
                "current_period_end": s.current_period_end
            })))
        }
        None => Err(AppError::BadRequest(
            "No active subscription found".to_string(),
        )),
    }
}

/// POST /api/user/subscription/resubscribe — Re-subscribe after cancellation
pub async fn resubscribe(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SubscribeRequest>,
) -> Result<Json<CheckoutResponse>, AppError> {
    // Resubscribe is just creating a new checkout
    create_checkout(State(app_state), Extension(claims), Json(payload)).await
}

// ─── Stripe Webhook ───

/// POST /api/payments/stripe/subscription-webhook
pub async fn subscription_webhook(
    State(app_state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<StatusCode, AppError> {
    let payload = std::str::from_utf8(&body)
        .map_err(|_| AppError::BadRequest("Invalid payload encoding".to_string()))?;

    // Verify Stripe signature
    let sig = headers
        .get("Stripe-Signature")
        .or_else(|| headers.get("stripe-signature"))
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::BadRequest("Missing stripe-signature header".to_string()))?;

    let webhook_secret = crate::config::get_dynamic_config_value(
        &app_state.database.pool,
        "stripe_subscription_webhook_secret",
        &std::env::var("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET")
            .unwrap_or_else(|_| app_state.config.stripe_webhook_secret.clone()),
    ).await;

    // Verify the signature (simplified — in production use stripe crate)
    if !verify_stripe_signature(payload, sig, &webhook_secret) {
        tracing::warn!("❌ Invalid Stripe webhook signature for subscription event");
        return Err(AppError::BadRequest("Invalid signature".to_string()));
    }

    let event: Value = serde_json::from_str(payload)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {}", e)))?;

    let event_type = event["type"].as_str().unwrap_or("");
    tracing::info!("📩 Stripe subscription webhook: {}", event_type);

    match event_type {
        "checkout.session.completed" => {
            handle_checkout_completed(&app_state, &event["data"]["object"]).await?;
        }
        "invoice.payment_succeeded" => {
            handle_invoice_paid(&app_state, &event["data"]["object"]).await?;
        }
        "invoice.payment_failed" => {
            handle_invoice_failed(&app_state, &event["data"]["object"]).await?;
        }
        "customer.subscription.updated" => {
            handle_subscription_updated(&app_state, &event["data"]["object"]).await?;
        }
        "customer.subscription.deleted" => {
            handle_subscription_deleted(&app_state, &event["data"]["object"]).await?;
        }
        _ => {
            tracing::debug!("Unhandled subscription webhook event: {}", event_type);
        }
    }

    Ok(StatusCode::OK)
}

async fn handle_checkout_completed(
    app_state: &AppState,
    session: &Value,
) -> Result<(), AppError> {
    let session_id = session["id"].as_str().unwrap_or("");
    let metadata = &session["metadata"];
    let user_id: i64 = metadata["user_id"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let package_id: i64 = metadata["package_id"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    if user_id == 0 || package_id == 0 {
        tracing::warn!("Missing metadata in checkout session: {}", session_id);
        return Ok(());
    }

    let package = subscription::get_package(&app_state.database.pool, package_id)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .ok_or_else(|| AppError::InternalError("Package not found for webhook".to_string()))?;

    let stripe_sub_id = session["subscription"].as_str();
    let stripe_customer_id = session["customer"].as_str();

    // Calculate period
    let now = chrono::Utc::now();
    let period_end = if package.billing_mode == "one_time" {
        let days = package.duration_days.unwrap_or(30);
        now + chrono::Duration::days(days as i64)
    } else {
        // For recurring, Stripe will tell us via invoice events — set initial period
        match package.billing_interval.as_deref() {
            Some("year") => now + chrono::Duration::days(365),
            _ => now + chrono::Duration::days(30),
        }
    };

    subscription::activate_subscription(
        &app_state.database.pool,
        user_id,
        &package,
        stripe_sub_id,
        stripe_customer_id,
        now,
        period_end,
    )
    .await
    .map_err(|e| AppError::InternalError(format!("Activation failed: {}", e)))?;

    // Log the transaction in billing_transactions
    let _ = sqlx::query(
        r#"
        INSERT INTO billing.billing_transactions
            (reseller_id, source, amount_cents, currency, credits_qty, status, notes)
        VALUES ($1, 'stripe', $2, $3, 0, 'completed', $4)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(user_id)
    .bind(package.price_cents)
    .bind(&package.currency)
    .bind(format!("Direct subscription: {} (session {})", package.name, session_id))
    .execute(&app_state.database.pool)
    .await;

    tracing::info!(
        user_id = user_id,
        package = package.name,
        "✅ Direct subscription activated via checkout"
    );

    Ok(())
}

async fn handle_invoice_paid(app_state: &AppState, invoice: &Value) -> Result<(), AppError> {
    if let Some(stripe_sub_id) = invoice["subscription"].as_str() {
        let period_start = invoice["period_start"]
            .as_i64()
            .map(|ts| chrono::DateTime::from_timestamp(ts, 0).unwrap_or_else(chrono::Utc::now));
        let period_end = invoice["period_end"]
            .as_i64()
            .map(|ts| chrono::DateTime::from_timestamp(ts, 0).unwrap_or_else(chrono::Utc::now));

        if let (Some(start), Some(end)) = (period_start, period_end) {
            subscription::update_subscription_period(
                &app_state.database.pool,
                stripe_sub_id,
                start,
                end,
            )
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?;

            tracing::info!(
                stripe_sub_id = stripe_sub_id,
                "✅ Subscription period renewed via invoice"
            );
        }
    }
    Ok(())
}

async fn handle_invoice_failed(app_state: &AppState, invoice: &Value) -> Result<(), AppError> {
    if let Some(stripe_sub_id) = invoice["subscription"].as_str() {
        subscription::mark_subscription_status(
            &app_state.database.pool,
            stripe_sub_id,
            "past_due",
        )
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

        tracing::warn!(
            stripe_sub_id = stripe_sub_id,
            "⚠️ Invoice payment failed — subscription marked past_due"
        );
    }
    Ok(())
}

async fn handle_subscription_updated(
    app_state: &AppState,
    sub_obj: &Value,
) -> Result<(), AppError> {
    let stripe_sub_id = sub_obj["id"].as_str().unwrap_or("");
    let status = sub_obj["status"].as_str().unwrap_or("active");
    let cancel_at_period_end = sub_obj["cancel_at_period_end"].as_bool().unwrap_or(false);

    // Map Stripe status to our status
    let our_status = match status {
        "active" => "active",
        "trialing" => "active",
        "past_due" => "past_due",
        "unpaid" => "past_due",
        "canceled" => "canceled",
        "incomplete" => "incomplete",
        "incomplete_expired" => "canceled",
        "paused" => "inactive",
        _ => "inactive", // Unknown states should NOT grant access
    };

    sqlx::query(
        r#"
        UPDATE billing.direct_subscriptions
        SET status = $1, cancel_at_period_end = $2, updated_at = NOW()
        WHERE stripe_subscription_id = $3
        "#,
    )
    .bind(our_status)
    .bind(cancel_at_period_end)
    .bind(stripe_sub_id)
    .execute(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(e.to_string()))?;

    Ok(())
}

async fn handle_subscription_deleted(
    app_state: &AppState,
    sub_obj: &Value,
) -> Result<(), AppError> {
    let stripe_sub_id = sub_obj["id"].as_str().unwrap_or("");

    // Mark subscription as expired
    subscription::mark_subscription_status(&app_state.database.pool, stripe_sub_id, "expired")
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    // Deactivate the user
    sqlx::query(
        r#"
        UPDATE auth.users SET active = false, updated_at = NOW()
        WHERE id = (
            SELECT user_id FROM billing.direct_subscriptions
            WHERE stripe_subscription_id = $1
        )
        "#,
    )
    .bind(stripe_sub_id)
    .execute(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(e.to_string()))?;

    tracing::info!(
        stripe_sub_id = stripe_sub_id,
        "🔒 Subscription deleted — user deactivated"
    );

    Ok(())
}

// ─── Admin Endpoints ───

/// GET /api/admin/packages — List all packages (including inactive)
pub async fn admin_list_packages(
    State(app_state): State<AppState>,
) -> Result<Json<Vec<Package>>, AppError> {
    let packages = subscription::list_all_packages(&app_state.database.pool)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to list packages: {}", e)))?;
    Ok(Json(packages))
}

/// POST /api/admin/packages — Create a new package
pub async fn admin_create_package(
    State(app_state): State<AppState>,
    Json(payload): Json<CreatePackageRequest>,
) -> Result<Json<Package>, AppError> {
    // Regular License: only free packages allowed
    let is_extended = app_state.license_service.get_status().await
        .map(|s| s.licensed && s.license_type.as_deref() == Some("Extended License"))
        .unwrap_or(false);

    if !is_extended && payload.price_cents > 0 {
        return Err(AppError::BadRequest(
            "Regular License only allows free packages (price must be 0). Upgrade to Extended License for paid packages.".to_string(),
        ));
    }

    // Validate billing mode
    if payload.billing_mode != "recurring" && payload.billing_mode != "one_time" {
        return Err(AppError::BadRequest(
            "billing_mode must be 'recurring' or 'one_time'".to_string(),
        ));
    }

    if payload.billing_mode == "one_time" && payload.duration_days.is_none() {
        return Err(AppError::BadRequest(
            "duration_days is required for one_time billing".to_string(),
        ));
    }

    let package = subscription::create_package(&app_state.database.pool, &payload)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to create package: {}", e)))?;

    tracing::info!(
        package_id = package.id,
        name = package.name,
        "📦 Package created"
    );

    Ok(Json(package))
}

/// PUT /api/admin/packages/:id — Update a package
pub async fn admin_update_package(
    State(app_state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdatePackageRequest>,
) -> Result<Json<Value>, AppError> {
    // Regular License: only free packages allowed
    let is_extended = app_state.license_service.get_status().await
        .map(|s| s.licensed && s.license_type.as_deref() == Some("Extended License"))
        .unwrap_or(false);

    if !is_extended {
        if let Some(price) = payload.price_cents {
            if price > 0 {
                return Err(AppError::BadRequest(
                    "Regular License only allows free packages (price must be 0). Upgrade to Extended License for paid packages.".to_string(),
                ));
            }
        }
    }

    let updated = subscription::update_package(&app_state.database.pool, id, &payload)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to update package: {}", e)))?;

    match updated {
        Some(pkg) => Ok(Json(json!(pkg))),
        None => Err(AppError::BadRequest("Package not found".to_string())),
    }
}

/// DELETE /api/admin/packages/:id — Deactivate a package
pub async fn admin_deactivate_package(
    State(app_state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let deleted = subscription::delete_package(&app_state.database.pool, id)
        .await
        .map_err(|e| AppError::BadRequest(format!("{}", e)))?;

    if deleted {
        Ok(Json(json!({"message": "Package deleted"})))
    } else {
        Err(AppError::BadRequest("Package not found".to_string()))
    }
}

/// GET /api/admin/direct-subscriptions — List all direct subscriptions
pub async fn admin_list_subscriptions(
    State(app_state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<_, DirectSubscription>(
        "SELECT * FROM billing.direct_subscriptions ORDER BY created_at DESC",
    )
    .fetch_all(&app_state.database.pool)
    .await
    .map_err(|e| AppError::InternalError(format!("DB error: {}", e)))?;

    Ok(Json(json!(rows)))
}

/// GET /api/admin/direct-subscriptions/stats — Subscription stats
pub async fn admin_subscription_stats(
    State(app_state): State<AppState>,
) -> Result<Json<DirectSubscriptionStats>, AppError> {
    let stats = subscription::get_subscription_stats(&app_state.database.pool)
        .await
        .map_err(|e| AppError::InternalError(format!("Stats error: {}", e)))?;
    Ok(Json(stats))
}

// ─── Stripe signature verification ───

fn verify_stripe_signature(payload: &str, sig_header: &str, secret: &str) -> bool {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    // Parse the signature header
    let mut timestamp = "";
    let mut signature = "";

    for item in sig_header.split(',') {
        let parts: Vec<&str> = item.trim().splitn(2, '=').collect();
        if parts.len() == 2 {
            match parts[0] {
                "t" => timestamp = parts[1],
                "v1" => signature = parts[1],
                _ => {}
            }
        }
    }

    if timestamp.is_empty() || signature.is_empty() {
        return false;
    }

    // Compute expected signature
    let signed_payload = format!("{}.{}", timestamp, payload);
    let mut mac = match Hmac::<Sha256>::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(signed_payload.as_bytes());

    let expected = hex::encode(mac.finalize().into_bytes());
    expected == signature
}
