use axum::{
    extract::{Path, Query, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::error::AppError;
use crate::AppState;
use super::{ApiKeyContext, CategoryInfo, has_permission, get_user_categories};

// ============== DEMO ENDPOINTS ==============

#[derive(Debug, Serialize)]
pub struct ApiDemoResponse {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub active: bool,
    pub demo_expires_at: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub categories: Option<Vec<CategoryInfo>>,
}

#[derive(Debug, Serialize)]
pub struct ApiDemosListResponse {
    pub demos: Vec<ApiDemoResponse>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateDemoRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub duration_hours: Option<i64>, // default 12 hours
    pub category_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct ListDemosQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
    pub status: Option<String>, // active, expired
}

pub async fn list_demos(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Query(query): Query<ListDemosQuery>,
) -> Result<Json<ApiDemosListResponse>, AppError> {
    if !has_permission(&ctx, "demos:read") {
        return Err(AppError::Forbidden);
    }

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = (page - 1) * limit;

    let mut conditions = vec!["created_by = $1".to_string(), "is_demo = true".to_string()];

    if let Some(ref status) = query.status {
        match status.as_str() {
            "active" => conditions.push("demo_expires_at > NOW()".to_string()),
            "expired" => conditions.push("demo_expires_at <= NOW()".to_string()),
            _ => {}
        }
    }

    let where_clause = conditions.join(" AND ");

    let total: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM auth.users WHERE {}",
        where_clause
    ))
    .bind(ctx.reseller_id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    let rows = sqlx::query(&format!(
        "SELECT id, username, email, active, demo_expires_at::text as demo_expires_at, created_at::text as created_at FROM auth.users WHERE {} ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        where_clause
    ))
    .bind(ctx.reseller_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let demos: Vec<ApiDemoResponse> = rows
        .iter()
        .map(|row| ApiDemoResponse {
            id: row.get("id"),
            username: row.get("username"),
            email: row.get("email"),
            active: row.get::<bool, _>("active"),
            demo_expires_at: row.get("demo_expires_at"),
            created_at: row.get("created_at"),
            categories: None,
        })
        .collect();

    Ok(Json(ApiDemosListResponse { demos, total }))
}

pub async fn create_demo(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Json(request): Json<CreateDemoRequest>,
) -> Result<Json<ApiDemoResponse>, AppError> {
    if !has_permission(&ctx, "demos:create") {
        return Err(AppError::Forbidden);
    }

    if request.username.len() < 3 || request.username.len() > 50 {
        return Err(AppError::BadRequest(
            "Username must be between 3 and 50 characters".to_string(),
        ));
    }

    if request.password.len() < 6 {
        return Err(AppError::BadRequest(
            "Password must be at least 6 characters".to_string(),
        ));
    }

    // Get reseller's demo limits
    let reseller_row = sqlx::query(
        "SELECT daily_demo_limit, demos_created_today, last_demo_reset_date FROM auth.users WHERE id = $1"
    )
    .bind(ctx.reseller_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    // Get global demo duration from core.config
    let global_duration: i64 = sqlx::query_scalar::<_, String>(
        "SELECT value FROM core.config WHERE key = 'demo_duration_hours'",
    )
    .fetch_optional(&app_state.database.pool)
    .await
    .ok()
    .flatten()
    .and_then(|v| v.parse().ok())
    .unwrap_or(12);

    let daily_limit: i32 = reseller_row
        .get::<Option<i32>, _>("daily_demo_limit")
        .unwrap_or(0);
    let mut demos_today: i32 = reseller_row
        .get::<Option<i32>, _>("demos_created_today")
        .unwrap_or(0);
    let last_reset: Option<chrono::NaiveDate> = reseller_row.get("last_demo_reset_date");

    // Reset counter if new day
    let today = chrono::Utc::now().date_naive();
    if last_reset.is_none_or(|d| d < today) {
        demos_today = 0;
        sqlx::query(
            "UPDATE auth.users SET demos_created_today = 0, last_demo_reset_date = $1 WHERE id = $2",
        )
        .bind(today)
        .bind(ctx.reseller_id)
        .execute(&app_state.database.pool)
        .await
        .ok();
    }

    // Check daily limit
    if daily_limit <= 0 {
        return Err(AppError::BadRequest(
            "Demo creation not enabled for this reseller".to_string(),
        ));
    }

    if demos_today >= daily_limit {
        return Err(AppError::BadRequest(format!(
            "Daily demo limit reached ({}/{}). Try again tomorrow.",
            demos_today, daily_limit
        )));
    }

    // Use global duration (admin-defined) - ignore request duration
    let duration_hours = global_duration.max(1);
    let demo_expires_at = chrono::Utc::now() + chrono::Duration::hours(duration_hours);

    let password_hash = bcrypt::hash(&request.password, bcrypt::DEFAULT_COST)
        .map_err(|_| AppError::InternalServerError)?;

    let row = sqlx::query(
        r#"
        INSERT INTO auth.users (username, password_hash, email, role, max_devices, expires_at, demo_expires_at, is_demo, created_by, active)
        VALUES ($1, $2, $3, 'end_user', 1, $4, $5, true, $6, true)
        RETURNING id
        "#,
    )
    .bind(&request.username)
    .bind(&password_hash)
    .bind(&request.email)
    .bind(demo_expires_at)
    .bind(demo_expires_at)
    .bind(ctx.reseller_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE constraint failed") || e.to_string().contains("duplicate key") {
            AppError::BadRequest("Username already exists".to_string())
        } else {
            AppError::DatabaseError(e)
        }
    })?;

    let demo_id: i64 = row.get("id");

    // Increment demos_created_today counter
    sqlx::query(
        "UPDATE auth.users SET demos_created_today = COALESCE(demos_created_today, 0) + 1 WHERE id = $1",
    )
    .bind(ctx.reseller_id)
    .execute(&app_state.database.pool)
    .await
    .ok();

    // Assign categories
    if let Some(category_ids) = request.category_ids {
        for cat_id in category_ids {
            let _ = sqlx::query(
                "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(demo_id)
            .bind(cat_id)
            .execute(&app_state.database.pool)
            .await;
        }
    } else {
        // Default: all categories
        let all_cats: Vec<i64> = sqlx::query_scalar("SELECT id FROM content.categories")
            .fetch_all(&app_state.database.pool)
            .await
            .unwrap_or_default();
        for cat_id in all_cats {
            let _ = sqlx::query(
                "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2) ON CONFLICT (user_id, category_id) DO NOTHING",
            )
            .bind(demo_id)
            .bind(cat_id)
            .execute(&app_state.database.pool)
            .await;
        }
    }

    let row = sqlx::query(
        "SELECT id, username, email, active, demo_expires_at::text as demo_expires_at, created_at::text as created_at FROM auth.users WHERE id = $1",
    )
    .bind(demo_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(Json(ApiDemoResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        active: row.get::<bool, _>("active"),
        demo_expires_at: row.get("demo_expires_at"),
        created_at: row.get("created_at"),
        categories: None,
    }))
}

pub async fn get_demo(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(demo_id): Path<i64>,
) -> Result<Json<ApiDemoResponse>, AppError> {
    if !has_permission(&ctx, "demos:read") {
        return Err(AppError::Forbidden);
    }

    let row = sqlx::query(
        "SELECT id, username, email, active, demo_expires_at::text as demo_expires_at, created_at::text as created_at FROM auth.users WHERE id = $1 AND created_by = $2 AND is_demo = true",
    )
    .bind(demo_id)
    .bind(ctx.reseller_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?
    .ok_or(AppError::NotFound)?;

    let categories = get_user_categories(&app_state.database.pool, demo_id).await;

    Ok(Json(ApiDemoResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        active: row.get::<bool, _>("active"),
        demo_expires_at: row.get("demo_expires_at"),
        created_at: row.get("created_at"),
        categories: Some(categories),
    }))
}

pub async fn delete_demo(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(demo_id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !has_permission(&ctx, "demos:delete") {
        return Err(AppError::Forbidden);
    }

    let result =
        sqlx::query("DELETE FROM auth.users WHERE id = $1 AND created_by = $2 AND is_demo = true")
            .bind(demo_id)
            .bind(ctx.reseller_id)
            .execute(&app_state.database.pool)
            .await
            .map_err(AppError::DatabaseError)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(
        serde_json::json!({ "success": true, "message": "Demo deleted" }),
    ))
}
