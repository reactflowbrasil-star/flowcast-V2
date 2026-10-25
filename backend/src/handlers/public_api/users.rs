use axum::{
    extract::{Path, Query, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::QueryBuilder;
use sqlx::Row;

use crate::{error::AppError, models::user::User, AppState};
use super::{
    auth::has_permission,
    billing::calculate_credit_cost,
    types::*,
};

const DAYS_PER_MONTH: i64 = 30;

pub async fn list_users(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Query(query): Query<ListUsersQuery>,
) -> Result<Json<ApiUsersListResponse>, AppError> {
    if !has_permission(&ctx, "users:read") {
        return Err(AppError::Forbidden);
    }

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = (page - 1) * limit;

    // Build dynamic WHERE clause
    let mut conditions = vec![
        "created_by = $1".to_string(),
        "role = 'end_user'".to_string(),
    ];
    // Search filter (username or email)
    if query.search.is_some() {
        conditions.push("(username LIKE $2 OR email LIKE $3)".to_string());
    }

    // Status filter
    // SECURITY: Use safe integer clamping instead of format! interpolation for days values
    if let Some(ref status) = query.status {
        match status.as_str() {
            "active" => conditions
                .push("active = true AND (expires_at IS NULL OR expires_at > NOW())".to_string()),
            "inactive" => conditions.push("active = false".to_string()),
            "expired" => {
                conditions.push("expires_at IS NOT NULL AND expires_at <= NOW()".to_string())
            }
            "expiring" => {
                let days = query.expiring_days.unwrap_or(7).clamp(1, 365);
                conditions.push(format!(
                    "expires_at IS NOT NULL AND expires_at > NOW() AND expires_at <= NOW() + make_interval(days => {})",
                    days
                ));
            }
            _ => {}
        }
    } else if let Some(days) = query.expiring_days {
        let safe_days = days.clamp(1, 365);
        conditions.push(format!(
            "expires_at IS NOT NULL AND expires_at > NOW() AND expires_at <= NOW() + make_interval(days => {})",
            safe_days
        ));
    }

    // Build ORDER BY clause
    let sort_column = match query.sort_by.as_deref() {
        Some("username") => "username",
        Some("expires_at") => "expires_at",
        _ => "created_at",
    };
    let sort_order = match query.sort_order.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };

    let where_clause = conditions.join(" AND ");

    // Count query
    let count_sql = format!("SELECT COUNT(*) FROM auth.users WHERE {}", where_clause);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);

    // Bind values for count query
    count_query = count_query.bind(ctx.reseller_id);
    if let Some(ref search) = query.search {
        let search_pattern = format!("%{}%", search);
        count_query = count_query.bind(search_pattern.clone());
        count_query = count_query.bind(search_pattern);
    }

    let total: i64 = count_query
        .fetch_one(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    // Main query
    let main_sql = format!(
        "SELECT id, username, email, max_devices, active, expires_at::text as expires_at, created_at::text as created_at FROM auth.users WHERE {} ORDER BY {} {} LIMIT ${} OFFSET ${}",
        where_clause, 
        sort_column, 
        sort_order,
        if query.search.is_some() { 4 } else { 2 },
        if query.search.is_some() { 5 } else { 3 }
    );

    let mut main_query = sqlx::query(&main_sql);
    main_query = main_query.bind(ctx.reseller_id);
    if let Some(ref search) = query.search {
        let search_pattern = format!("%{}%", search);
        main_query = main_query.bind(search_pattern.clone());
        main_query = main_query.bind(search_pattern);
    }
    main_query = main_query.bind(limit);
    main_query = main_query.bind(offset);

    let rows = main_query
        .fetch_all(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    let users: Vec<ApiUserResponse> = rows
        .iter()
        .map(|row| ApiUserResponse {
            id: row.get("id"),
            username: row.get("username"),
            email: row.get("email"),
            max_devices: row.get::<i32, _>("max_devices"),
            active: row.get::<bool, _>("active"),
            expires_at: row.get("expires_at"),
            created_at: row.get("created_at"),
            categories: None,
        })
        .collect();

    let total_pages = (total as f64 / limit as f64).ceil() as i64;

    Ok(Json(ApiUsersListResponse {
        users,
        total,
        pagination: PaginationMeta {
            page,
            limit,
            total,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        },
    }))
}

pub async fn get_user(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(user_id): Path<i64>,
) -> Result<Json<ApiUserResponse>, AppError> {
    if !has_permission(&ctx, "users:read") {
        return Err(AppError::Forbidden);
    }

    let row = sqlx::query(
        r#"
        SELECT id, username, email, max_devices, active, expires_at::text as expires_at, created_at::text as created_at
        FROM auth.users 
        WHERE id = $1 AND created_by = $2 AND role = 'end_user'
        "#,
    )
    .bind(user_id)
    .bind(ctx.reseller_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?
    .ok_or(AppError::NotFound)?;

    Ok(Json(ApiUserResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        max_devices: row.get::<i32, _>("max_devices"),
        active: row.get::<bool, _>("active"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
        categories: None,
    }))
}

pub async fn create_user(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Json(request): Json<CreateUserRequest>,
) -> Result<Json<ApiUserResponse>, AppError> {
    if !has_permission(&ctx, "users:create") {
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

    let max_devices = request.max_devices.unwrap_or(1).max(1);
    let duration_months = request.duration_months.unwrap_or(1);
    let duration_days = request.duration_days.unwrap_or(0);

    let credit_cost = calculate_credit_cost(max_devices, duration_months, 0.25);

    let mut tx = app_state.database.pool.begin().await?;

    let reseller_credits: f64 = sqlx::query_scalar("SELECT credits FROM auth.users WHERE id = $1")
        .bind(ctx.reseller_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(0.0);

    if reseller_credits < credit_cost {
        tx.rollback().await.ok();
        return Err(AppError::BadRequest(format!(
            "Insufficient credits. Required: {}, Available: {}",
            credit_cost, reseller_credits
        )));
    }

    let expires_at = chrono::Utc::now()
        + chrono::Duration::days(duration_months * DAYS_PER_MONTH + duration_days);

    let password_hash = bcrypt::hash(&request.password, bcrypt::DEFAULT_COST)
        .map_err(|_| AppError::InternalServerError)?;

    let row = sqlx::query(
        r#"
        INSERT INTO auth.users (username, password_hash, email, role, max_devices, expires_at, created_by, active)
        VALUES ($1, $2, $3, 'end_user', $4, $5, $6, true)
        RETURNING id
        "#,
    )
    .bind(&request.username)
    .bind(&password_hash)
    .bind(&request.email)
    .bind(max_devices)
    .bind(expires_at)
    .bind(ctx.reseller_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE constraint failed") || e.to_string().contains("duplicate key") {
            AppError::BadRequest("Username already exists".to_string())
        } else {
            AppError::DatabaseError(e)
        }
    })?;

    let user_id: i64 = row.get("id");

    let credit_update =
        sqlx::query("UPDATE auth.users SET credits = credits - $1 WHERE id = $2 AND credits >= $3")
            .bind(credit_cost)
            .bind(ctx.reseller_id)
            .bind(credit_cost)
            .execute(&mut *tx)
            .await?;

    if credit_update.rows_affected() == 0 {
        tx.rollback().await.ok();
        return Err(AppError::BadRequest("Insufficient credits".to_string()));
    }

    let row = sqlx::query(
        "SELECT id, username, email, max_devices, active, expires_at::text as expires_at, created_at::text as created_at FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(AppError::DatabaseError)?;

    tx.commit().await?;

    Ok(Json(ApiUserResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        max_devices: row.get::<i32, _>("max_devices"),
        active: row.get::<bool, _>("active"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
        categories: None,
    }))
}

pub async fn extend_user(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(user_id): Path<i64>,
    Json(request): Json<ExtendUserRequest>,
) -> Result<Json<ApiUserResponse>, AppError> {
    if !has_permission(&ctx, "users:extend") {
        return Err(AppError::Forbidden);
    }

    let duration_months = request.duration_months.unwrap_or(1);
    let duration_days = request.duration_days.unwrap_or(0);
    let total_days = duration_months * DAYS_PER_MONTH + duration_days;

    if total_days <= 0 {
        return Err(AppError::BadRequest(
            "Duration must be greater than 0".to_string(),
        ));
    }

    let mut tx = app_state.database.pool.begin().await?;

    let user: User = sqlx::query_as("SELECT * FROM auth.users WHERE id = $1 AND role = 'end_user'")
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(AppError::NotFound)?;

    if user.created_by != Some(ctx.reseller_id) {
        tx.rollback().await.ok();
        return Err(AppError::NotFound);
    }

    let credit_cost = calculate_credit_cost(user.max_devices, duration_months, 0.25);

    let credit_update =
        sqlx::query("UPDATE auth.users SET credits = credits - $1 WHERE id = $2 AND credits >= $3")
            .bind(credit_cost)
            .bind(ctx.reseller_id)
            .bind(credit_cost)
            .execute(&mut *tx)
            .await?;

    if credit_update.rows_affected() == 0 {
        tx.rollback().await.ok();
        return Err(AppError::BadRequest("Insufficient credits".to_string()));
    }

    let now = chrono::Utc::now();
    let base_date = match user.expires_at {
        Some(expiry) if expiry > now => expiry,
        _ => now,
    };
    let new_expiry = base_date + chrono::Duration::days(total_days);

    sqlx::query("UPDATE auth.users SET expires_at = $1 WHERE id = $2")
        .bind(new_expiry)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    let row = sqlx::query(
        "SELECT id, username, email, max_devices, active, expires_at::text as expires_at, created_at::text as created_at FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(AppError::DatabaseError)?;

    tx.commit().await?;

    Ok(Json(ApiUserResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        max_devices: row.get::<i32, _>("max_devices"),
        active: row.get::<bool, _>("active"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
        categories: None,
    }))
}

pub async fn update_user_status(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(user_id): Path<i64>,
    Json(request): Json<UpdateUserStatusRequest>,
) -> Result<Json<ApiUserResponse>, AppError> {
    if !has_permission(&ctx, "users:update") {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query(
        "UPDATE auth.users SET active = $1 WHERE id = $2 AND created_by = $3 AND role = 'end_user'",
    )
    .bind(request.active)
    .bind(user_id)
    .bind(ctx.reseller_id)
    .execute(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    let row = sqlx::query(
        "SELECT id, username, email, max_devices, active, expires_at::text as expires_at, created_at::text as created_at FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(Json(ApiUserResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        max_devices: row.get::<i32, _>("max_devices"),
        active: row.get::<bool, _>("active"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
        categories: None,
    }))
}

pub async fn delete_user(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(user_id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !has_permission(&ctx, "users:delete") {
        return Err(AppError::Forbidden);
    }

    let result =
        sqlx::query("DELETE FROM auth.users WHERE id = $1 AND created_by = $2 AND role = 'end_user'")
            .bind(user_id)
            .bind(ctx.reseller_id)
            .execute(&app_state.database.pool)
            .await
            .map_err(AppError::DatabaseError)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(
        serde_json::json!({ "success": true, "message": "User deleted" }),
    ))
}
pub(crate) async fn get_user_categories(pool: &sqlx::Pool<sqlx::Postgres>, user_id: i64) -> Vec<CategoryInfo> {
    let rows = sqlx::query(
        r#"
        SELECT c.id, c.name, c.category_type 
        FROM content.categories c
        INNER JOIN billing.user_subscriptions us ON us.category_id = c.id
        WHERE us.user_id = $1
        ORDER BY c.name
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    rows.iter()
        .map(|row| CategoryInfo {
            id: row.get("id"),
            name: row.get("name"),
            category_type: row.get("category_type"),
        })
        .collect()
}

// Categories endpoints

#[derive(Debug, Serialize)]
pub struct CategoriesListResponse {
    pub categories: Vec<CategoryInfo>,
}

pub async fn list_categories(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
) -> Result<Json<CategoriesListResponse>, AppError> {
    if !has_permission(&ctx, "categories:read") {
        return Err(AppError::Forbidden);
    }

    let rows = sqlx::query(
        r#"
        SELECT id, name, category_type 
        FROM content.categories 
        ORDER BY name
        "#,
    )
    .fetch_all(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let categories = rows
        .iter()
        .map(|row| CategoryInfo {
            id: row.get("id"),
            name: row.get("name"),
            category_type: row.get("category_type"),
        })
        .collect();

    Ok(Json(CategoriesListResponse { categories }))
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserCategoriesRequest {
    pub category_ids: Vec<i64>,
}

pub async fn update_user_categories(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(user_id): Path<i64>,
    Json(request): Json<UpdateUserCategoriesRequest>,
) -> Result<Json<ApiUserResponse>, AppError> {
    if !has_permission(&ctx, "users:categories") {
        return Err(AppError::Forbidden);
    }

    // Verify user belongs to this reseller
    let user_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = $1 AND created_by = $2 AND role = 'end_user')",
    )
    .bind(user_id)
    .bind(ctx.reseller_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    if !user_exists {
        return Err(AppError::NotFound);
    }

    // Delete existing subscriptions
    sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1")
        .bind(user_id)
        .execute(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    // Insert new subscriptions
    for cat_id in &request.category_ids {
        let _ = sqlx::query(
            "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(user_id)
        .bind(cat_id)
        .execute(&app_state.database.pool)
        .await;
    }

    // Return updated user with categories
    let row = sqlx::query(
        "SELECT id, username, email, max_devices, active, expires_at::text as expires_at, created_at::text as created_at FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let categories = get_user_categories(&app_state.database.pool, user_id).await;

    Ok(Json(ApiUserResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        max_devices: row.get::<i32, _>("max_devices"),
        active: row.get::<bool, _>("active"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
        categories: Some(categories),
    }))
}

pub async fn get_user_with_categories(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(user_id): Path<i64>,
) -> Result<Json<ApiUserResponse>, AppError> {
    if !has_permission(&ctx, "users:read") {
        return Err(AppError::Forbidden);
    }

    let row = sqlx::query(
        r#"
        SELECT id, username, email, max_devices, active, expires_at::text as expires_at, created_at::text as created_at
        FROM auth.users 
        WHERE id = $1 AND created_by = $2 AND role = 'end_user'
        "#,
    )
    .bind(user_id)
    .bind(ctx.reseller_id)
    .fetch_optional(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?
    .ok_or(AppError::NotFound)?;

    let categories = get_user_categories(&app_state.database.pool, user_id).await;

    Ok(Json(ApiUserResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        max_devices: row.get::<i32, _>("max_devices"),
        active: row.get::<bool, _>("active"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
        categories: Some(categories),
    }))
}

pub async fn update_user(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(user_id): Path<i64>,
    Json(request): Json<UpdateUserRequest>,
) -> Result<Json<ApiUserResponse>, AppError> {
    if !has_permission(&ctx, "users:update") {
        return Err(AppError::Forbidden);
    }

    // Verify user belongs to this reseller
    let user_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = $1 AND created_by = $2 AND role = 'end_user')",
    )
    .bind(user_id)
    .bind(ctx.reseller_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    if !user_exists {
        return Err(AppError::NotFound);
    }

    let mut qb = QueryBuilder::new("UPDATE auth.users SET ");
    let mut assignments = qb.separated(", ");
    let mut has_assignments = false;

    if let Some(ref email) = request.email {
        assignments.push("email = ").push_bind(email);
        has_assignments = true;
    }

    if let Some(ref password) = request.password {
        if password.len() < 6 {
            return Err(AppError::BadRequest(
                "Password must be at least 6 characters".to_string(),
            ));
        }
        let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)
            .map_err(|_| AppError::InternalServerError)?;
        assignments
            .push("password_hash = ")
            .push_bind(password_hash);
        has_assignments = true;
    }

    if let Some(max_devices) = request.max_devices {
        if !(1..=10).contains(&max_devices) {
            return Err(AppError::BadRequest(
                "max_devices must be between 1 and 10".to_string(),
            ));
        }
        assignments.push("max_devices = ").push_bind(max_devices);
        has_assignments = true;
    }

    if let Some(active) = request.active {
        assignments.push("active = ").push_bind(active);
        has_assignments = true;
    }

    if !has_assignments {
        return Err(AppError::BadRequest("No fields to update".to_string()));
    }

    qb.push(" WHERE id = ").push_bind(user_id);
    qb.push(" AND created_by = ").push_bind(ctx.reseller_id);
    qb.push(" AND role = 'end_user'");

    qb.build()
        .execute(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    // Return updated user
    let row = sqlx::query(
        "SELECT id, username, email, max_devices, active, expires_at::text as expires_at, created_at::text as created_at FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let categories = get_user_categories(&app_state.database.pool, user_id).await;

    Ok(Json(ApiUserResponse {
        id: row.get("id"),
        username: row.get("username"),
        email: row.get("email"),
        max_devices: row.get::<i32, _>("max_devices"),
        active: row.get::<bool, _>("active"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
        categories: Some(categories),
    }))
}


pub async fn reset_user_password(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Path(user_id): Path<i64>,
    Json(request): Json<ResetPasswordRequest>,
) -> Result<Json<ResetPasswordResponse>, AppError> {
    if !has_permission(&ctx, "users:update") {
        return Err(AppError::Forbidden);
    }

    // Verify user belongs to this reseller
    let user_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = $1 AND created_by = $2 AND role = 'end_user')",
    )
    .bind(user_id)
    .bind(ctx.reseller_id)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    if !user_exists {
        return Err(AppError::NotFound);
    }

    // Generate or use provided password
    let new_password = request
        .new_password
        .unwrap_or_else(|| generate_random_password(12));

    if new_password.len() < 6 {
        return Err(AppError::BadRequest(
            "Password must be at least 6 characters".to_string(),
        ));
    }

    let password_hash = bcrypt::hash(&new_password, bcrypt::DEFAULT_COST)
        .map_err(|_| AppError::InternalServerError)?;

    sqlx::query("UPDATE auth.users SET password_hash = $1 WHERE id = $2")
        .bind(&password_hash)
        .bind(user_id)
        .execute(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    Ok(Json(ResetPasswordResponse {
        success: true,
        new_password,
        message: "Password reset successfully".to_string(),
    }))
}
fn generate_random_password(length: usize) -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let mut rng = rand::thread_rng();
    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}
