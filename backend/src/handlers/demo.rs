use crate::error::AppError;
use axum::extract::{ConnectInfo, Json, State};
use axum::http::HeaderMap;
use axum::response::Json as AxumJson;
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct PublicCreateDemoRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub category_ids: Option<Vec<i64>>,
}

impl PublicCreateDemoRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        crate::validation::ValidationUtils::validate_username(&self.username)?;
        crate::validation::ValidationUtils::validate_password(&self.password)?;
        if let Some(email) = &self.email {
            crate::validation::ValidationUtils::validate_email(email)?;
        }
        Ok(())
    }
}

#[derive(Debug, Serialize)]
pub struct CreateDemoResponse {
    pub id: i64,
    pub username: String,
    pub demo_expires_at: String,
    pub message: String,
}

/// Public endpoint to create a demo user
/// - 12 hour expiry
/// - max_devices = 1
/// - created_by = NULL
/// - Soft IP ban if more than 3 creations from same IP in last 24h (ban 15 days)
pub async fn create_demo_public(
    State(app_state): State<crate::AppState>,
    connect_info: Option<ConnectInfo<std::net::SocketAddr>>,
    headers: HeaderMap,
    Json(request): Json<PublicCreateDemoRequest>,
) -> Result<(axum::http::StatusCode, AxumJson<CreateDemoResponse>), AppError> {
    // Validate input
    request.validate()?;

    // Check whether public demo creation is enabled (admin can toggle via config key "public_demo_enabled")
    let public_demo_enabled = match app_state.database.get_config("public_demo_enabled").await {
        Ok(Some(val)) => {
            let v = val.to_lowercase();
            !(v == "false" || v == "0" || v == "off" || v == "no")
        }
        _ => false, // fail-closed: deny if config is unreachable
    };
    if !public_demo_enabled {
        return Err(AppError::Forbidden);
    }

    // Extract client IP (prefer X-Forwarded-For). Keep socket fallback.
    let (maybe_ip, _device_info, _ua) =
        crate::middleware::extract_client_info(&headers, connect_info);
    let client_ip = maybe_ip
        .or_else(|| connect_info.as_ref().map(|ci| ci.0.ip().to_string()))
        .unwrap_or_else(|| "0.0.0.0".to_string());

    // Read configurable threshold and ban duration from core.config table
    // Defaults: threshold = 3, ban_days = 15
    let threshold = match app_state
        .database
        .get_config("demo_creation_threshold")
        .await
    {
        Ok(Some(val)) => val.parse::<i64>().unwrap_or(3),
        _ => 3,
    };
    let ban_days = match app_state
        .database
        .get_config("demo_ban_duration_days")
        .await
    {
        Ok(Some(val)) => val.parse::<i64>().unwrap_or(15),
        _ => 15,
    };

    tracing::info!(
        "create_demo_public: client_ip={}, effective_threshold={}, ban_days={}",
        client_ip,
        threshold,
        ban_days
    );

    // Check recent demo creations from this IP in last 24 hours
    let recent_count: i64 = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM auth.users
        WHERE is_demo = true
          AND created_at >= NOW() - INTERVAL '24 hours'
          AND id IN (
              SELECT user_id FROM activity.user_login_history WHERE ip_address = $1
          )
        "#,
    )
    .bind(&client_ip)
    .fetch_one(&app_state.database.pool)
    .await?;

    // If recent_count exceeds threshold, create a soft IP ban
    if recent_count > threshold {
        let expires_at = Utc::now() + chrono::Duration::days(ban_days);

        let ban_request = crate::models::security::CreateSecurityBanRequest {
            user_id: None,
            username: format!("ip:{}", client_ip),
            ban_type: "TEMPORARY".to_string(),
            ban_reason: format!("Exceeded demo creation threshold from IP {}", client_ip),
            ban_level: 1,
            expires_at: Some(expires_at),
            created_by: None,
        };

        // Use security service to create ban
        app_state
            .security_service
            .create_security_ban(ban_request)
            .await?;

        return Err(AppError::Forbidden);
    }

    // Get demo duration from core.config
    let duration_hours = match app_state.database.get_config("demo_duration_hours").await {
        Ok(Some(val)) => val.parse::<i64>().unwrap_or(12),
        _ => 12,
    };

    // Create demo user directly
    let password_hash = app_state.auth_service.hash_password(&request.password)?;

    let demo_expires_at = chrono::Utc::now() + chrono::Duration::hours(duration_hours);

    let user: (i64, String, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        r#"
        INSERT INTO auth.users (username, email, password_hash, role, active, created_by, max_devices,
                          is_demo, demo_expires_at, expires_at, created_at)
        VALUES ($1, $2, $3, 'end_user', true, NULL, 1, true, $4, $5, CURRENT_TIMESTAMP)
        RETURNING id, username, demo_expires_at
        "#,
    )
    .bind(request.username)
    .bind(request.email)
    .bind(password_hash)
    .bind(demo_expires_at)
    .bind(demo_expires_at)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
            AppError::BadRequest("Username already exists".to_string())
        }
        _ => AppError::DatabaseError(e),
    })?;

    // Set subscriptions
    if let Some(category_ids) = &request.category_ids {
        if !category_ids.is_empty() {
            app_state
                .user_service
                .set_user_subscriptions(user.0, category_ids)
                .await?;
        }
    } else {
        // give access to all categories
        let all_categories = sqlx::query_scalar::<_, i64>("SELECT id FROM content.categories")
            .fetch_all(&app_state.database.pool)
            .await?;
        app_state
            .user_service
            .set_user_subscriptions(user.0, &all_categories)
            .await?;
    }

    // Record creation in user_login_history for IP tracking
    let _ = sqlx::query(
        "INSERT INTO activity.user_login_history (user_id, username, ip_address, device_info, user_agent, success) VALUES ($1, $2, $3, $4, $5, 1)",
    )
    .bind(user.0)
    .bind(&user.1)
    .bind(&client_ip)
    .bind(None::<String>)
    .bind(headers.get("user-agent").and_then(|h| h.to_str().ok()).map(|s| s.to_string()))
    .execute(&app_state.database.pool)
    .await;

    Ok((
        axum::http::StatusCode::CREATED,
        AxumJson(CreateDemoResponse {
            id: user.0,
            username: user.1,
            demo_expires_at: user.2.to_rfc3339(),
            message: "Demo user created".to_string(),
        }),
    ))
}

/// Response for public demo status check
#[derive(Debug, Serialize)]
pub struct DemoStatusResponse {
    pub demo_enabled: bool,
    pub duration_hours: i64,
}

/// Public endpoint to check if demo creation is enabled (for login page UI)
pub async fn get_demo_enabled_status(
    State(app_state): State<crate::AppState>,
) -> Result<AxumJson<DemoStatusResponse>, AppError> {
    let demo_enabled = match app_state.database.get_config("public_demo_enabled").await {
        Ok(Some(val)) => {
            let v = val.to_lowercase();
            !(v == "false" || v == "0" || v == "off" || v == "no")
        }
        _ => false, // fail-closed: deny if config is unreachable
    };

    let duration_hours = match app_state.database.get_config("demo_duration_hours").await {
        Ok(Some(val)) => val.parse::<i64>().unwrap_or(12),
        _ => 12,
    };

    Ok(AxumJson(DemoStatusResponse {
        demo_enabled,
        duration_hours,
    }))
}
