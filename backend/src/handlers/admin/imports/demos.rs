use axum::{
    extract::{Query, State},
    response::Json,
    Extension,
};
use serde::Deserialize;
use sqlx::{Postgres, QueryBuilder};

use crate::error::AppError;
use crate::models::user::{User, UserRole};
use crate::models::user_activity::{LoginHistoryResponse, UserLoginHistory};
use crate::services::Claims;
use super::users::UserResponse;

#[derive(Debug, Deserialize)]
pub struct DemoConfigPayload {
    pub demo_creation_threshold: Option<i64>, // creations per 24h (IP based)
    pub ban_duration_days: Option<i64>,       // ban duration in days
    pub demo_duration_hours: Option<i64>,     // demo account duration (global)
    pub public_demo_enabled: Option<bool>,    // toggle demo registration on/off
}

#[derive(Debug, Deserialize)]
pub struct DemoHistoryQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
    pub username: Option<String>,
    pub ip: Option<String>,
    pub success: Option<bool>,
}

/// GET /api/admin/demos - list all demo users (admin only)
pub async fn get_demo_users(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    // Only admins can access demo list
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let demos = sqlx::query_as::<_, User>(
        "SELECT * FROM auth.users WHERE is_demo = true ORDER BY created_at DESC",
    )
    .fetch_all(&app_state.database.pool)
    .await?;

    if demos.is_empty() {
        return Ok(Json(Vec::new()));
    }

    // Batch load all categories for all demo users (eliminates N+1)
    let user_ids: Vec<i64> = demos.iter().map(|u| u.id).collect();
    let categories_map = app_state
        .content_service
        .get_users_categories_batch(&user_ids)
        .await?;

    // Batch load last login IPs for all demo users (eliminates N+1)
    let placeholders = user_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("${}", i + 1))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        r#"
        SELECT DISTINCT ON (user_id) user_id, ip_address 
        FROM activity.user_login_history 
        WHERE user_id IN ({}) AND success = true 
        ORDER BY user_id, login_timestamp DESC
        "#,
        placeholders
    );

    let mut query = sqlx::query(&sql);
    for id in &user_ids {
        query = query.bind(id);
    }
    let rows = query.fetch_all(&app_state.database.pool).await?;

    let mut last_ip_map: std::collections::HashMap<i64, String> = std::collections::HashMap::new();
    for row in rows {
        use sqlx::Row;
        let user_id: i64 = row.get("user_id");
        let ip: String = row.get("ip_address");
        last_ip_map.insert(user_id, ip);
    }

    // Build response with pre-loaded data
    let response: Vec<UserResponse> = demos
        .into_iter()
        .map(|user| {
            let mut user_response: UserResponse = user.into();
            user_response.subscribed_categories = categories_map.get(&user_response.id).cloned();
            user_response.last_login_ip = last_ip_map.get(&user_response.id).cloned();
            user_response
        })
        .collect();

    Ok(Json(response))
}

/// GET /api/admin/demos/history - paginated login history for demo accounts
pub async fn get_demo_history(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<DemoHistoryQuery>,
) -> Result<Json<LoginHistoryResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let page = params.page.unwrap_or(1).max(1);
    let requested_limit = params.limit.unwrap_or(50);
    let limit = requested_limit.clamp(10, 200);
    let offset = (page - 1) * limit;

    #[derive(Debug, Clone)]
    struct Clause {
        condition: &'static str,
        value: Option<ClauseValue>,
    }

    #[derive(Debug, Clone)]
    enum ClauseValue {
        Text(String),
        Bool(bool),
    }

    let mut clauses = vec![Clause {
        condition: "u.is_demo = true",
        value: None,
    }];

    if let Some(username) = params.username.as_ref().and_then(|u| {
        let trimmed = u.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    }) {
        clauses.push(Clause {
            condition: "u.username ILIKE ",
            value: Some(ClauseValue::Text(format!("%{}%", username))),
        });
    }

    if let Some(ip) = params.ip.as_ref().and_then(|ip| {
        let trimmed = ip.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    }) {
        clauses.push(Clause {
            condition: "ulh.ip_address = ",
            value: Some(ClauseValue::Text(ip)),
        });
    }

    if let Some(success) = params.success {
        clauses.push(Clause {
            condition: "ulh.success = ",
            value: Some(ClauseValue::Bool(success)),
        });
    }

    let mut count_builder = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*) FROM activity.user_login_history ulh JOIN auth.users u ON ulh.user_id = u.id",
    );

    if !clauses.is_empty() {
        count_builder.push(" WHERE ");
        let mut separated = count_builder.separated(" AND ");
        for clause in &clauses {
            separated.push(clause.condition);
            if let Some(value) = &clause.value {
                match value {
                    ClauseValue::Text(text) => {
                        separated.push_bind(text.clone());
                    }
                    ClauseValue::Bool(flag) => {
                        separated.push_bind(*flag);
                    }
                }
            }
        }
    }

    let total: i64 = count_builder
        .build_query_scalar::<i64>()
        .fetch_one(&app_state.database.pool)
        .await
        .map_err(AppError::from)?;

    let mut data_builder = QueryBuilder::<Postgres>::new(
        "SELECT ulh.id, ulh.user_id, ulh.username, ulh.login_timestamp, ulh.ip_address, ulh.device_info, ulh.user_agent, ulh.success \
         FROM activity.user_login_history ulh JOIN auth.users u ON ulh.user_id = u.id",
    );

    if !clauses.is_empty() {
        data_builder.push(" WHERE ");
        let mut separated = data_builder.separated(" AND ");
        for clause in &clauses {
            separated.push(clause.condition);
            if let Some(value) = &clause.value {
                match value {
                    ClauseValue::Text(text) => {
                        separated.push_bind(text.clone());
                    }
                    ClauseValue::Bool(flag) => {
                        separated.push_bind(*flag);
                    }
                }
            }
        }
    }

    data_builder.push(" ORDER BY ulh.login_timestamp DESC LIMIT ");
    data_builder.push_bind(limit);
    data_builder.push(" OFFSET ");
    data_builder.push_bind(offset);

    let logs: Vec<UserLoginHistory> = data_builder
        .build_query_as::<UserLoginHistory>()
        .fetch_all(&app_state.database.pool)
        .await
        .map_err(AppError::from)?;

    let total_pages = if total == 0 {
        0
    } else {
        ((total - 1) / limit) + 1
    };

    Ok(Json(LoginHistoryResponse {
        logs,
        total,
        page,
        limit,
        total_pages,
    }))
}

/// PUT /api/admin/demos/config - update demo-related config (admin only)
pub async fn update_demo_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<DemoConfigPayload>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Only admins can update demo config
    let admin_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Update keys if provided
    if let Some(threshold) = payload.demo_creation_threshold {
        app_state
            .user_service
            .update_config(admin_id, "demo_creation_threshold", &threshold.to_string())
            .await?;
    }
    if let Some(ban_days) = payload.ban_duration_days {
        app_state
            .user_service
            .update_config(admin_id, "demo_ban_duration_days", &ban_days.to_string())
            .await?;
    }
    if let Some(enabled) = payload.public_demo_enabled {
        app_state
            .user_service
            .update_config(
                admin_id,
                "public_demo_enabled",
                if enabled { "true" } else { "false" },
            )
            .await?;
    }
    if let Some(hours) = payload.demo_duration_hours {
        let clamped = hours.clamp(1, 168); // 1 hour to 7 days max
        app_state
            .user_service
            .update_config(admin_id, "demo_duration_hours", &clamped.to_string())
            .await?;
    }

    // Return current effective config
    let threshold: Option<String> =
        sqlx::query_scalar("SELECT value FROM core.config WHERE key = 'demo_creation_threshold'")
            .fetch_optional(&app_state.database.pool)
            .await?;
    let ban_days: Option<String> =
        sqlx::query_scalar("SELECT value FROM core.config WHERE key = 'demo_ban_duration_days'")
            .fetch_optional(&app_state.database.pool)
            .await?;
    let duration_hours: Option<String> =
        sqlx::query_scalar("SELECT value FROM core.config WHERE key = 'demo_duration_hours'")
            .fetch_optional(&app_state.database.pool)
            .await?;
    let demo_enabled: Option<String> =
        sqlx::query_scalar("SELECT value FROM core.config WHERE key = 'public_demo_enabled'")
            .fetch_optional(&app_state.database.pool)
            .await?;

    Ok(Json(serde_json::json!({
        "demo_creation_threshold": threshold,
        "demo_ban_duration_days": ban_days,
        "demo_duration_hours": duration_hours.unwrap_or_else(|| "12".to_string()),
        "public_demo_enabled": demo_enabled.unwrap_or_else(|| "true".to_string())
    })))
}

/// GET /api/admin/demos/config - return current demo-related config (admin only)
pub async fn get_demo_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Only admins can access demo config
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let threshold: Option<String> =
        sqlx::query_scalar("SELECT value FROM core.config WHERE key = 'demo_creation_threshold'")
            .fetch_optional(&app_state.database.pool)
            .await?;
    let ban_days: Option<String> =
        sqlx::query_scalar("SELECT value FROM core.config WHERE key = 'demo_ban_duration_days'")
            .fetch_optional(&app_state.database.pool)
            .await?;
    let duration_hours: Option<String> =
        sqlx::query_scalar("SELECT value FROM core.config WHERE key = 'demo_duration_hours'")
            .fetch_optional(&app_state.database.pool)
            .await?;
    let demo_enabled: Option<String> =
        sqlx::query_scalar("SELECT value FROM core.config WHERE key = 'public_demo_enabled'")
            .fetch_optional(&app_state.database.pool)
            .await?;

    Ok(Json(serde_json::json!({
        "demo_creation_threshold": threshold,
        "demo_ban_duration_days": ban_days,
        "demo_duration_hours": duration_hours.unwrap_or_else(|| "12".to_string()),
        "public_demo_enabled": demo_enabled.unwrap_or_else(|| "true".to_string())
    })))
}
