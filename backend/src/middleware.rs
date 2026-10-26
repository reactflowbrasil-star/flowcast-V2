use crate::error::AppError;
use crate::models::user::UserRole;
use crate::services::Claims;
use axum::{
    extract::{Request, State},
    http::{HeaderMap, Method},
    middleware::Next,
    response::Response,
};
use sqlx::Row;
use std::time::Instant;

/// Authentication middleware that verifies JWT token, user active status, and device binding
pub async fn auth_middleware(
    State(app_state): State<crate::AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let headers = request.headers();
    let token = extract_token_from_headers(headers)?;
    let claims = app_state.auth_service.verify_token(&token)?;

    // Verify user is still active (not banned)
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state.user_service.get_user_by_id(user_id).await?;
    if !user.active {
        return Err(AppError::AccountInactive);
    }

    // Check subscription status for end users (skip for admin/reseller)
    if matches!(claims.role, crate::models::user::UserRole::EndUser) {
        let now = chrono::Utc::now();

        // Check if subscription has expired
        if let Some(expires_at) = user.expires_at {
            if expires_at <= now {
                tracing::warn!(
                    user_id = user.id,
                    expires_at = %expires_at,
                    server_time = %now,
                    "User subscription has expired"
                );
                return Err(AppError::SubscriptionExpired);
            }
        }
    }

    // Check if device is blacklisted (for immediate disconnection)
    if let Some(device_id) = &claims.device_id {
        let is_blacklisted = app_state
            .device_service
            .is_device_blacklisted(user.id, device_id)
            .await
            .map_err(|e| {
                tracing::error!(user_id = user.id, device_id = device_id, "Failed to check device blacklist: {}", e);
                AppError::InternalServerError
            })?;
        if is_blacklisted {
            return Err(AppError::DeviceDisconnected);
        }

        // Check if device still exists in user_devices table (critical security validation)
        // EXCEPT for device endpoints (GET and POST /api/devices) which should allow device management
        let is_device_endpoint = request.uri().path() == "/api/devices"
            && (request.method() == Method::GET || request.method() == Method::POST);

        // Only validate device existence if NOT a device management endpoint
        if !is_device_endpoint
            && !app_state
                .device_service
                .device_exists(user.id, device_id)
                .await
                .unwrap_or(false)
        {
            tracing::warn!(
                user_id = user.id,
                device_id = device_id,
                "Device not found in database - forcing disconnection"
            );
            return Err(AppError::DeviceDisconnected);
        }
    }

    // Add claims to request extensions for use in handlers
    request.extensions_mut().insert(claims);

    // Also add the user object for handlers that need it
    request.extensions_mut().insert(user);

    Ok(next.run(request).await)
}

/// Role-based authorization middleware factory
pub fn require_role(
    required_role: UserRole,
) -> impl Fn(
    Request,
    Next,
)
    -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Response, AppError>> + Send>>
       + Clone {
    move |request: Request, next: Next| {
        let required_role = required_role.clone();
        Box::pin(async move {
            let claims = request
                .extensions()
                .get::<Claims>()
                .ok_or(AppError::AuthenticationFailed)?;

            // Check if user has required role or higher privileges
            match (&claims.role, &required_role) {
                // System role (Master API Key) can act as Admin
                (UserRole::System, UserRole::Admin) => {}
                // System CANNOT act as Reseller or EndUser
                (UserRole::System, _) => return Err(AppError::Forbidden),
                
                // Admin can access everything
                (UserRole::Admin, _) => {}
                // Reseller can access reseller and end user endpoints
                (UserRole::Reseller, UserRole::Reseller) => {}
                (UserRole::Reseller, UserRole::EndUser) => {}
                // End user can only access end user endpoints
                (UserRole::EndUser, UserRole::EndUser) => {}
                // All other combinations are forbidden
                _ => return Err(AppError::Forbidden),
            }

            Ok(next.run(request).await)
        })
    }
}

/// Admin-only middleware
pub async fn admin_only(request: Request, next: Next) -> Result<Response, AppError> {
    let claims = request
        .extensions()
        .get::<Claims>()
        .ok_or(AppError::AuthenticationFailed)?;

    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    Ok(next.run(request).await)
}

// Removed duplicate reseller_or_admin function - using stateful version below

/// Admin-only middleware (stateful version)
pub async fn require_admin(
    State(_app_state): State<crate::AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let claims = request
        .extensions()
        .get::<Claims>()
        .ok_or(AppError::AuthenticationFailed)?;

    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    Ok(next.run(request).await)
}

/// Reseller-only middleware (stateful version)
pub async fn require_reseller(
    State(_app_state): State<crate::AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let claims = request
        .extensions()
        .get::<Claims>()
        .ok_or(AppError::AuthenticationFailed)?;

    if !matches!(claims.role, UserRole::Reseller) {
        return Err(AppError::Forbidden);
    }

    Ok(next.run(request).await)
}

/// Reseller or admin middleware (stateful version)
pub async fn reseller_or_admin(
    State(_app_state): State<crate::AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let claims = request
        .extensions()
        .get::<Claims>()
        .ok_or(AppError::AuthenticationFailed)?;

    match claims.role {
        UserRole::Admin | UserRole::Reseller => {}
        _ => return Err(AppError::Forbidden),
    }

    Ok(next.run(request).await)
}

/// License enforcement middleware — all features unlocked.
pub async fn require_any_license(
    State(_app_state): State<crate::AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    Ok(next.run(request).await)
}

/// License enforcement middleware — extended features unlocked.
pub async fn require_extended_license(
    State(_app_state): State<crate::AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    Ok(next.run(request).await)
}

/// Extract JWT token from Authorization header
pub fn extract_token_from_headers(headers: &HeaderMap) -> Result<String, AppError> {
    if let Some(auth) = headers.get("authorization") {
        if let Ok(auth_header) = auth.to_str() {
            if let Some(token) = auth_header.strip_prefix("Bearer ") {
                return Ok(token.to_string());
            }
        }
    }

    // Fallback: support token from cookie for browser-initiated media requests
    if let Some(cookie_header) = headers.get("cookie") {
        if let Ok(cookie_str) = cookie_header.to_str() {
            // Simple cookie parser; split by ';' and trim
            for part in cookie_str.split(';') {
                let trimmed = part.trim();
                if let Some((name, value)) = trimmed.split_once('=') {
                    if name == "iptv_auth_token" && !value.is_empty() {
                        return Ok(value.to_string());
                    }
                }
            }
        }
    }

    Err(AppError::AuthenticationFailed)
}

/// Request logging and metrics middleware
pub async fn request_logging_middleware(request: Request, next: Next) -> Response {
    let start_time = Instant::now();
    let method = request.method().clone();
    let uri = request.uri().clone();

    // Extract all information we need from request before using it
    // Capture User-Agent as an owned String to avoid borrowing across .await
    let user_agent: String = request
        .headers()
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let user_info = request
        .extensions()
        .get::<Claims>()
        .map(|claims| format!("user_id:{} role:{}", claims.sub, claims.role))
        .unwrap_or_else(|| "anonymous".to_string());

    // Now we can use the request since we're not borrowing it anymore
    let response = next.run(request).await;
    let duration = start_time.elapsed();
    let status = response.status();

    // Log request details
    tracing::info!(
        method = %method,
        uri = %uri,
        user_agent = %user_agent,
        user_info = %user_info,
        duration_ms = %duration.as_millis(),
        status = %status,
        "Request completed"
    );

    response
}

/// Input validation middleware for JSON payloads
pub async fn input_validation_middleware(
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let content_type = request
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let is_multipart = content_type.starts_with("multipart/form-data");

    // Check content length to prevent large payloads
    if !is_multipart {
        if let Some(content_length) = request.headers().get("content-length") {
            if let Ok(length_str) = content_length.to_str() {
                if let Ok(length) = length_str.parse::<usize>() {
                    const MAX_PAYLOAD_SIZE: usize = 10 * 1024 * 1024; // 10MB
                    if length > MAX_PAYLOAD_SIZE {
                        return Err(AppError::BadRequest("Payload too large".to_string()));
                    }
                }
            }
        }
    }

    // Validate content type for POST/PUT/PATCH requests that have a body
    if matches!(
        request.method(),
        &Method::POST | &Method::PUT | &Method::PATCH
    ) {
        // Only validate Content-Type if the request actually has a body (content-length > 0)
        let has_body = request
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<usize>().ok())
            .is_some_and(|len| len > 0);

        if has_body {
            if content_type.is_empty() {
                return Err(AppError::BadRequest(
                    "Content-Type header is required".to_string(),
                ));
            }
            if !is_multipart && !content_type.starts_with("application/json") {
                return Err(AppError::BadRequest(
                    "Content-Type must be application/json".to_string(),
                ));
            }
        }
    }

    Ok(next.run(request).await)
}

/// JWT-only authentication middleware
/// Used for endpoints that need device-independent authentication
pub async fn jwt_only_auth_middleware(
    State(app_state): State<crate::AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let headers = request.headers();
    let token = extract_token_from_headers(headers)?;
    let claims = app_state.auth_service.verify_token(&token)?;

    // Verify user is still active (not banned)
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let user = app_state.user_service.get_user_by_id(user_id).await?;
    if !user.active {
        return Err(AppError::AccountInactive);
    }

    // Check if device still exists in user_devices table (critical security validation)
    // EXCEPT for device endpoints (GET and POST /api/devices) which should allow device management
    if let Some(device_id) = &claims.device_id {
        let is_device_endpoint = request.uri().path() == "/api/devices"
            && (request.method() == Method::GET || request.method() == Method::POST);

        // Only validate device existence if NOT a device management endpoint
        if !is_device_endpoint
            && !app_state
                .device_service
                .device_exists(user.id, device_id)
                .await
                .unwrap_or(false)
        {
            tracing::warn!(
                user_id = user.id,
                device_id = device_id,
                "Device not found in database - forcing disconnection (JWT-only middleware)"
            );
            return Err(AppError::DeviceDisconnected);
        }
    }

    // Add claims to request extensions for use in handlers
    request.extensions_mut().insert(claims);

    // Also add the user object for handlers that need it
    request.extensions_mut().insert(user);

    Ok(next.run(request).await)
}

/// Hybrid Authentication Middleware (JWT + Master API Key)
/// This validates JWTs for normal users, or Master API Keys for server-to-server Admin access.
pub async fn master_api_key_middleware(
    State(app_state): State<crate::AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let headers = request.headers();

    // Check for Master API Key in headers
    if let Some(master_key) = headers.get("X-Master-API-Key") {
        if let Ok(provided_key) = master_key.to_str() {
            // Validate Master API Key against database
            let service =
                crate::services::MasterApiKeyService::new(app_state.database.pool.clone());

            match service.validate_and_use_master_api_key(provided_key).await {
                Ok(true) => {
                    let path = request.uri().path();
                    
                    // SECURITY STRICT SCOPE: Master API Keys can ONLY access Admin routes
                    if !path.starts_with("/api/admin") {
                        tracing::warn!(
                            "SECURITY: Master API Key attempted to access restricted endpoint: {}",
                            path
                        );
                        return Err(AppError::Forbidden);
                    }

                    // Extract ConnectInfo securely for IP logging
                    let connect_info = request
                        .extensions()
                        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
                        .map(|c| &c.0);

                    // Master API Key is valid - authenticate as System actor
                    tracing::warn!(
                        "SECURITY: Master API Key used for admin request to {} from IP: {:?}",
                        path,
                        extract_client_ip(headers, connect_info)
                    );

                    // Create a virtual system user for context
                    let super_admin = crate::models::user::User {
                        id: -1, // Special ID for master API key
                        username: "MASTER_API_KEY".to_string(),
                        password_hash: String::new(),
                        email: Some("master@system.internal".to_string()),
                        role: UserRole::System,
                        credits: None,
                        active: true,
                        created_by: None,
                        max_devices: 999,
                        expires_at: None,
                        created_at: chrono::Utc::now(),
                        daily_demo_limit: None,
                        demos_created_today: None,
                        last_demo_reset_date: None,
                        is_demo: Some(false),
                        demo_expires_at: None,
                        subscription_source: None,
                        email_verified: Some(true),
                        email_verify_token: None,
                        email_verify_expires: None,
                        subscribed_categories: None,
                    };

                    // Get the first admin user to use as the "actor" for Master API Key requests
                    let admin_user: Option<sqlx::postgres::PgRow> =
                        sqlx::query("SELECT id, username FROM auth.users WHERE role = 'admin' LIMIT 1")
                            .fetch_optional(&app_state.database.pool)
                            .await
                            .map_err(|e| {
                                tracing::error!(
                                    "Failed to get admin user for Master API Key: {}",
                                    e
                                );
                                AppError::DatabaseError(e)
                            })?;

                    let (admin_id, admin_username): (String, String) = match admin_user {
                        Some(user) => (
                            user.get::<i64, _>("id").to_string(),
                            user.get::<String, _>("username"),
                        ),
                        None => {
                            tracing::error!("No admin users found in database for Master API Key authentication");
                            return Err(AppError::AuthenticationFailed);
                        }
                    };

                    // Create virtual claims for master API key using real admin user
                    let master_claims = Claims {
                        sub: admin_id,
                        username: format!("MASTER_API_KEY({})", admin_username),
                        role: UserRole::System,
                        device_id: Some("MASTER_DEVICE".to_string()),
                        exp: (chrono::Utc::now() + chrono::Duration::hours(1)).timestamp(),
                        iat: chrono::Utc::now().timestamp(),
                    };

                    // Add to request extensions
                    request.extensions_mut().insert(master_claims);
                    request.extensions_mut().insert(super_admin);

                    // Proceed to the admin handler as System
                    return Ok(next.run(request).await);
                }
                Ok(false) => {
                    // Invalid Master API Key - proceed with normal auth
                }
                Err(e) => {
                    tracing::error!("Error validating Master API Key: {:?}", e);
                    // On database error, proceed with normal auth for safety
                }
            }
        }
    }

    // No valid Master API Key found, proceed with normal authentication
    auth_middleware(State(app_state), request, next).await
}

/// Extract client IP address securely, verifying proxy headers ONLY from trusted private networks
pub fn extract_client_ip(
    headers: &HeaderMap,
    connect_info: Option<&std::net::SocketAddr>,
) -> Option<String> {
    // 1. Get the direct remote IP address of the peer connecting to this Rust process
    let remote_ip = connect_info.map(|addr| addr.ip());

    // 2. Check if the direct peer is a trusted proxy
    // By default, ONLY trust loopback and unspecified addresses to prevent IP spoofing
    // in shared private networks. Docker/internal setups must explicitly opt-in.
    static TRUST_PRIVATE: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    let trust_private = *TRUST_PRIVATE.get_or_init(|| {
        std::env::var("TRUST_ALL_PRIVATE_PROXIES").unwrap_or_else(|_| "false".to_string()) == "true"
    });

    let is_trusted_proxy = remote_ip.is_some_and(|ip| {
        ip.is_loopback()
            || ip.is_unspecified()
            || (trust_private
                && match ip {
                    std::net::IpAddr::V4(ipv4) => ipv4.is_private(),
                    _ => false,
                })
    });

    if is_trusted_proxy {
        // Try X-Forwarded-For header first (most common with proxies/load balancers)
        if let Some(x_forwarded_for) = headers.get("x-forwarded-for") {
            if let Ok(x_forwarded_for_str) = x_forwarded_for.to_str() {
                // X-Forwarded-For can contain multiple IPs, take the first one
                if let Some(first_ip) = x_forwarded_for_str.split(',').next() {
                    return Some(first_ip.trim().to_string());
                }
            }
        }

        // Try X-Real-IP header (used by some proxies)
        if let Some(x_real_ip) = headers.get("x-real-ip") {
            if let Ok(x_real_ip_str) = x_real_ip.to_str() {
                return Some(x_real_ip_str.to_string());
            }
        }

        // Try CF-Connecting-IP header (Cloudflare specific)
        if let Some(cf_connecting_ip) = headers.get("cf-connecting-ip") {
            if let Ok(cf_connecting_ip_str) = cf_connecting_ip.to_str() {
                return Some(cf_connecting_ip_str.to_string());
            }
        }
    }

    // 3. Fallback to the physical remote IP (if not proxied or proxy is not trusted)
    remote_ip.map(|ip| ip.to_string())
}

/// Extract client information from headers and connection info
/// Returns (ip_address, device_info, user_agent)
pub fn extract_client_info(
    headers: &HeaderMap,
    connect_info: Option<axum::extract::ConnectInfo<std::net::SocketAddr>>,
) -> (Option<String>, Option<String>, Option<String>) {
    // Extract IP address securely using the helper function
    let ip_address = extract_client_ip(headers, connect_info.as_ref().map(|c| &c.0));

    // Extract User-Agent
    let user_agent = headers
        .get("user-agent")
        .and_then(|ua| ua.to_str().ok())
        .map(|s| s.to_string());

    // Extract device info (simplified - could be enhanced with a proper parser)
    let device_info = user_agent.as_ref().map(|ua| {
        if ua.contains("Mobile") || ua.contains("Android") || ua.contains("iPhone") {
            "Mobile".to_string()
        } else if ua.contains("Tablet") || ua.contains("iPad") {
            "Tablet".to_string()
        } else if ua.contains("TV") || ua.contains("SmartTV") {
            "Smart TV".to_string()
        } else {
            "Desktop".to_string()
        }
    });

    (ip_address, device_info, user_agent)
}

#[cfg(test)]
mod tests {
    use super::extract_token_from_headers;
    use crate::error::AppError;
    use axum::http::{HeaderMap, HeaderValue};

    #[test]
    fn extract_token_from_bearer_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer test.jwt.token"),
        );

        let token = extract_token_from_headers(&headers).expect("token should be extracted");
        assert_eq!(token, "test.jwt.token");
    }

    #[test]
    fn extract_token_from_cookie_when_authorization_missing() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "cookie",
            HeaderValue::from_static("session=abc; iptv_auth_token=cookie-token-123; theme=dark"),
        );

        let token = extract_token_from_headers(&headers).expect("token should be extracted");
        assert_eq!(token, "cookie-token-123");
    }

    #[test]
    fn fails_when_cookie_token_is_empty() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "cookie",
            HeaderValue::from_static("session=abc; iptv_auth_token=; theme=dark"),
        );

        let err = extract_token_from_headers(&headers).expect_err("empty cookie token must fail");
        assert!(matches!(err, AppError::AuthenticationFailed));
    }

    #[test]
    fn fails_when_headers_are_missing() {
        let headers = HeaderMap::new();

        let err = extract_token_from_headers(&headers).expect_err("missing token must fail");
        assert!(matches!(err, AppError::AuthenticationFailed));
    }
}
