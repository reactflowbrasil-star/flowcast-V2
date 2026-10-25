use std::time::Instant;
use axum::{
    extract::State,
    http::HeaderMap,
    middleware::Next,
    response::Response,
};
use crate::{
    error::AppError,
    services::ResellerApiKeyService,
    AppState,
};
use super::types::ApiKeyContext;

pub async fn api_key_auth_middleware(
    State(app_state): State<AppState>,
    headers: HeaderMap,
    mut request: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let started = Instant::now();
    let api_key = headers
        .get("X-API-Key")
        .or_else(|| headers.get("x-api-key"))
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::AuthenticationFailed)?;

    let service = ResellerApiKeyService::new(app_state.database.pool.clone());
    let validated = service.validate_api_key(api_key).await?;

    let connect_info = request
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|c| &c.0);
    let client_ip = crate::middleware::extract_client_ip(&headers, connect_info);
    let path = request.uri().path().to_string();
    let method = request.method().to_string();
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let allowed_origins = parse_allowed_origins(&validated.allowed_origins);
    if allowed_origins.is_empty() {
        return Err(AppError::Forbidden);
    }

    if !allowed_origins.contains(&"*".to_string()) {
        let origin = headers
            .get("Origin")
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Forbidden)?;
        if !allowed_origins.iter().any(|a| a == origin || a == "*") {
            return Err(AppError::Forbidden);
        }
    }

    if let Some(ref whitelist) = validated.ip_whitelist {
        if !whitelist.is_empty() {
            let ip = client_ip.clone().ok_or(AppError::Forbidden)?;
            if !whitelist
                .iter()
                .any(|allowed| allowed == &ip || allowed == "*")
            {
                return Err(AppError::Forbidden);
            }
        }
    }

    let within_limits = service
        .check_rate_limit(
            validated.id,
            validated.rate_limit_per_minute,
            validated.rate_limit_per_day,
            client_ip.as_deref(),
        )
        .await?;

    if !within_limits {
        return Err(AppError::RateLimitExceeded);
    }

    let context = ApiKeyContext {
        key_id: validated.id,
        reseller_id: validated.reseller_id,
        permissions: validated.permissions,
    };

    request.extensions_mut().insert(context);

    let response = next.run(request).await;
    if let Err(e) = service
        .record_api_key_usage_detailed(crate::services::reseller_api_keys::ApiKeyUsageRecord {
            key_id: validated.id,
            endpoint: &path,
            method: &method,
            status_code: response.status().as_u16() as i32,
            ip: client_ip.as_deref(),
            user_agent: user_agent.as_deref(),
            response_time_ms: Some(started.elapsed().as_millis() as i64),
        })
        .await
    {
        tracing::warn!("Failed to record API key usage for key {}: {}", validated.id, e);
    }

    Ok(response)
}

pub(crate) fn has_permission(ctx: &ApiKeyContext, permission: &str) -> bool {
    ctx.permissions.iter().any(|p| p == permission)
}

// Replaced local extract_client_ip with secure version in middleware

fn parse_allowed_origins(raw: &str) -> Vec<String> {
    if raw.trim().is_empty() || raw.trim() == "*" {
        return if raw.trim() == "*" {
            vec!["*".to_string()]
        } else {
            vec![]
        };
    }

    if let Ok(parsed) = serde_json::from_str::<Vec<String>>(raw) {
        return parsed
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }

    raw.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}
