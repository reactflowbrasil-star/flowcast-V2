use crate::error::AppError;
use crate::handlers::two_factor::verify_2fa_for_login;
use crate::handlers::user_activity;
use crate::middleware::extract_token_from_headers;
use crate::models::user::{LoginRequest, LoginResponse, UserInfo};
use axum::{
    extract::{ConnectInfo, State},
    http::{header::SET_COOKIE, HeaderMap, HeaderValue, StatusCode},
    response::Json,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::net::SocketAddr;

#[derive(Debug, Serialize)]
pub struct LoginResponseWith2FA {
    #[serde(flatten)]
    pub login_response: Option<LoginResponse>,
    pub requires_2fa: bool,
    pub message: Option<String>,
}

/// Login endpoint
pub async fn login(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // ── IP-based rate limiting ──────────────────────────
    let client_ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse::<std::net::IpAddr>().ok())
        .or_else(|| connect_info.as_ref().map(|ci| ci.0.ip()));

    if let Some(ip) = client_ip {
        if let Err(retry_after) = app_state.login_rate_limiter.check_ip(ip).await {
            tracing::warn!(
                ip = %ip,
                retry_after = retry_after,
                "🚫 RATE LIMITED - STREAMCORE: Too many login attempts from IP"
            );
            return Err(AppError::TooManyRequests(retry_after));
        }
    }

    // Check if user is banned before proceeding
    if let Some(ban) = app_state
        .security_service
        .is_user_banned(&payload.username)
        .await?
    {
        tracing::warn!(
            username = payload.username,
            ban_level = ban.ban_level,
            ban_reason = ban.ban_reason,
            expires_at = ?ban.expires_at,
            "🚫 ACCESO DENEGADO - STREAMCORE: Intento de login de usuario baneado - cuenta suspendida"
        );

        return Err(AppError::BadRequest(format!(
            "Account temporarily suspended. Reason: {}. {}",
            ban.ban_reason,
            match ban.expires_at {
                Some(expires) => format!(
                    "Ban expires at: {}",
                    expires.format("%Y-%m-%d %H:%M:%S UTC")
                ),
                None => "This is a permanent ban.".to_string(),
            }
        )));
    }

    // Find user by username (including inactive users to provide better error messages)
    let user = sqlx::query_as::<_, crate::models::user::User>(
        r#"
        SELECT id, username, password_hash, email, role,
               credits, active, created_by, max_devices, expires_at, created_at,
               daily_demo_limit, demos_created_today, last_demo_reset_date,
               is_demo, demo_expires_at,
               subscription_source, email_verified, email_verify_token, email_verify_expires
        FROM auth.users
        WHERE username = $1
        "#,
    )
    .bind(&payload.username)
    .fetch_optional(&app_state.database.pool)
    .await?
    .ok_or_else(|| {
        tracing::warn!(
            username = payload.username,
            "👤 USUARIO NO ENCONTRADO - STREAMCORE: Intento de login con usuario inexistente"
        );
        AppError::UserNotFound
    })?;

    // Note: We allow inactive users to login so they can see the banned page
    // The frontend will handle redirecting banned users to the appropriate page

    // Role-based access control (admin/reseller vs end_user) is enforced by route
    // middleware and handler-level checks. All authenticated users proceed through
    // password verification here; downstream middleware/handlers decide resource access.

    // Verify password
    if !app_state
        .auth_service
        .verify_password(&payload.password, &user.password_hash)?
    {
        // Log failed login attempt
        tracing::warn!(
            user_id = user.id,
            username = user.username,
            "❌ AUTH ERROR - STREAMCORE: Incorrect password in login attempt"
        );

        if let Err(e) = user_activity::log_user_login(
            &app_state,
            user.id,
            &user.username,
            &headers,
            connect_info,
            false, // failed login
        )
        .await
        {
            tracing::warn!("Failed to log failed login activity: {}", e);
        }
        return Err(AppError::InvalidPassword);
    }

    // Check if 2FA is enabled for this user
    let totp_enabled: bool =
        sqlx::query_scalar("SELECT COALESCE(totp_enabled, false) FROM auth.users WHERE id = $1")
            .bind(user.id)
            .fetch_one(&app_state.database.pool)
            .await
            .map_err(|e| {
                tracing::error!("Failed to check 2FA status for user {}: {}", user.id, e);
                AppError::DatabaseError(e)
            })?;

    if totp_enabled {
        // 2FA is enabled - verify TOTP code
        match &payload.totp_code {
            Some(code) if !code.is_empty() => {
                // Verify the 2FA code
                let code_valid = verify_2fa_for_login(&app_state, user.id, code).await?;
                if !code_valid {
                    tracing::warn!(
                        user_id = user.id,
                        username = user.username,
                        "🔐 2FA FAILED - STREAMCORE: Invalid 2FA code"
                    );
                    return Err(AppError::BadRequest("Invalid 2FA code".to_string()));
                }
                tracing::info!(
                    user_id = user.id,
                    username = user.username,
                    "🔐 2FA verified successfully"
                );
            }
            _ => {
                // No 2FA code provided - return requires_2fa response
                tracing::info!(
                    user_id = user.id,
                    username = user.username,
                    "🔐 2FA required - awaiting code"
                );
                return Err(AppError::TwoFactorRequired);
            }
        }
    }

    // Check if user account is expired (only for end users, not admins/resellers)
    if user.role == crate::models::user::UserRole::EndUser {
        if let Some(expires_at) = user.expires_at {
            if expires_at < chrono::Utc::now() {
                tracing::warn!(
                    user_id = user.id,
                    username = user.username,
                    expires_at = ?expires_at,
                    "⏰ EXPIRED ACCOUNT - STREAMCORE: Login attempt from user with expired subscription"
                );

                // Log failed login attempt for expired user
                if let Err(e) = user_activity::log_user_login(
                    &app_state,
                    user.id,
                    &user.username,
                    &headers,
                    connect_info,
                    false, // failed login
                )
                .await
                {
                    tracing::warn!("Failed to log expired user login activity: {}", e);
                }

                return Err(AppError::BadRequest(format!(
                    "Your subscription expired on {}. Please contact the administrator to renew your access.",
                    expires_at.format("%Y-%m-%d")
                )));
            }
        }
    }

    // Check if user account is inactive (only for end users)
    if user.role == crate::models::user::UserRole::EndUser && !user.active {
        tracing::warn!(
            user_id = user.id,
            username = user.username,
            active = user.active,
            "🚫 DISABLED ACCOUNT - STREAMCORE: Login attempt from user with inactive account"
        );

        // Log failed login attempt for inactive user
        if let Err(e) = user_activity::log_user_login(
            &app_state,
            user.id,
            &user.username,
            &headers,
            connect_info,
            false, // failed login
        )
        .await
        {
            tracing::warn!("Failed to log inactive user login activity: {}", e);
        }

        return Err(AppError::BadRequest(
            "Your account is disabled. Please contact the administrator.".to_string(),
        ));
    }

    // Log successful login
    tracing::info!(
        user_id = user.id,
        username = user.username,
        role = ?user.role,
        device_id = payload.device_id.as_deref().unwrap_or("unknown"),
        "🔐 LOGIN EXITOSO: Usuario autenticado correctamente en STREAMCORE"
    );

    // Generate JWT token (include device_id if provided)
    let token = if payload.device_id.is_some() {
        app_state
            .auth_service
            .generate_token_with_device(&user, payload.device_id.clone())?
    } else {
        app_state.auth_service.generate_token(&user)?
    };

    // Load user's subscribed categories
    let subscribed_categories = if user.role == crate::models::user::UserRole::EndUser {
        // For end users, load their subscribed categories
        match app_state.content_service.get_user_categories(user.id).await {
            Ok(categories) => Some(categories.into_iter().map(|c| c.id).collect()),
            Err(_) => None,
        }
    } else {
        None
    };

    // Calculate demos remaining for resellers
    let demos_remaining_today = if user.role == crate::models::user::UserRole::Reseller {
        let today = chrono::Utc::now().date_naive();
        let daily_limit = user.daily_demo_limit.unwrap_or(0);
        let mut demos_created_today = user.demos_created_today.unwrap_or(0);
        let last_reset_date = user.last_demo_reset_date;

        // Reset counter if it's a new day
        if last_reset_date != Some(today) {
            demos_created_today = 0;
        }

        Some((daily_limit - demos_created_today).max(0))
    } else {
        None
    };

    // Log the login (existing activity log)
    if let Err(e) = app_state
        .activity_log_service
        .log_user_login(user.id, &user.username)
        .await
    {
        tracing::warn!("Failed to log user login: {}", e);
    }

    // Log the login (new user activity tracking)
    if let Err(e) = user_activity::log_user_login(
        &app_state,
        user.id,
        &user.username,
        &headers,
        connect_info,
        true, // successful login
    )
    .await
    {
        tracing::warn!("Failed to log user login activity: {}", e);
    }

    // Evaluate session metadata (internal coherence check)
    let session_meta = crate::services::session_integrity::evaluate_tier(
        &app_state.database.pool,
    )
    .await;

    // Return response with token and user info
    let mut response = LoginResponse {
        token,
        session_meta: None,
        user: UserInfo {
            id: user.id,
            username: user.username.clone(),
            email: user.email,
            role: user.role,
            credits: user.credits,
            active: user.active,
            max_devices: user.max_devices,
            expires_at: user.expires_at.map(|dt| dt.to_rfc3339()),
            daily_demo_limit: user.daily_demo_limit,
            demos_created_today: user.demos_created_today,
            demos_remaining_today,
            is_demo: user.is_demo,
            demo_expires_at: user.demo_expires_at.map(|dt| dt.to_rfc3339()),
            subscription_source: user.subscription_source.clone(),
            subscribed_categories,
        },
    };

    // Embed session tier in response metadata
    response.session_meta = Some(session_meta);

    Ok(Json(response))
}

/// Logout endpoint - returns Set-Cookie headers to clear auth cookies on all relevant paths
pub async fn logout() -> Result<(HeaderMap, Json<Value>), StatusCode> {
    let mut headers = HeaderMap::new();

    // Clear auth cookies for common paths to avoid path-mismatch leftovers
    let cookies = [
        // Base path
        "iptv_auth_token=; Path=/; Max-Age=0; SameSite=Lax",
        "iptv_user_data=; Path=/; Max-Age=0; SameSite=Lax",
        // Admin area
        "iptv_auth_token=; Path=/admin; Max-Age=0; SameSite=Lax",
        "iptv_user_data=; Path=/admin; Max-Age=0; SameSite=Lax",
        // Reseller area
        "iptv_auth_token=; Path=/reseller; Max-Age=0; SameSite=Lax",
        "iptv_user_data=; Path=/reseller; Max-Age=0; SameSite=Lax",
    ];

    for c in cookies.iter() {
        if let Ok(hv) = HeaderValue::from_str(c) {
            headers.append(SET_COOKIE, hv);
        }
    }

    Ok((
        headers,
        Json(json!({
            "message": "Logged out successfully"
        })),
    ))
}

/// Token refresh endpoint
pub async fn refresh_token(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, AppError> {
    let token = extract_token_from_headers(&headers)?;
    let claims = app_state.auth_service.verify_token(&token)?;

    // SECURITY: Re-validate user status before issuing a new token
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state.user_service.get_user_by_id(user_id).await?;

    // Check if user is still active
    if !user.active {
        return Err(AppError::AccountInactive);
    }

    // Check if user is banned
    if let Some(_ban) = app_state
        .security_service
        .is_user_banned(&user.username)
        .await?
    {
        return Err(AppError::BadRequest(
            "Account suspended. Token refresh denied.".to_string(),
        ));
    }

    // Check subscription expiry for end users
    if user.role == crate::models::user::UserRole::EndUser {
        if let Some(expires_at) = user.expires_at {
            if expires_at < chrono::Utc::now() {
                return Err(AppError::SubscriptionExpired);
            }
        }
    }

    // Check device status if present in claims
    if let Some(ref device_id) = claims.device_id {
        let is_blacklisted = app_state
            .device_service
            .is_device_blacklisted(user.id, device_id)
            .await
            .map_err(|e| {
                tracing::error!("Failed to check device blacklist for user {}: {}", user.id, e);
                AppError::InternalServerError
            })?;
        if is_blacklisted {
            return Err(AppError::DeviceDisconnected);
        }
    }

    // All checks passed — generate new token preserving device_id
    let new_token = if claims.device_id.is_some() {
        app_state
            .auth_service
            .generate_token_with_device(&user, claims.device_id)?
    } else {
        app_state.auth_service.generate_token(&user)?
    };

    Ok(Json(json!({
        "token": new_token
    })))
}
