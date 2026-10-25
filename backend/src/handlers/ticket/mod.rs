use crate::{
    error::AppError,
    models::{
        ticket::{
            CreateAdminTicketRequest, CreateMessageRequest, CreateTicketRequest,
            TicketMessageWithUser,
        },
        UserRole,
    },
    services::Claims,
    AppState,
};

pub mod admin;
pub use admin::*;

use axum::Json as AxumJson;
use axum::{
    extract::{Path, Query, State},
    Extension,
};
use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use tracing::{error, info, warn};

// Note: Using ax_custom_extractors::Json or axum::Json as appropriate for the project
// Actually, the project uses axum::extract::Json in most places based on imports seen earlier.
// Re-importing axum::Json for consistency if needed.

// Helper type for API responses
#[derive(serde::Serialize)]
pub struct ApiResult<T> {
    pub success: bool,
    pub data: T,
}

impl<T> ApiResult<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data,
        }
    }
}

// Legacy alias for compatibility - use CreateMessageRequest from models
pub type AddMessageRequest = CreateMessageRequest;

#[derive(Deserialize)]
pub struct PaginationParams {
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub status: Option<String>,
    pub priority: Option<String>,
}

#[derive(Serialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub pagination: PaginationInfo,
}

#[derive(Serialize)]
pub struct PaginationInfo {
    pub current_page: u32,
    pub per_page: u32,
    pub total_items: i64,
    pub total_pages: u32,
    pub has_next: bool,
    pub has_prev: bool,
}

// Helper function to safely parse user ID from claims
pub(crate) fn parse_user_id(claims: &Claims) -> Result<i64, AppError> {
    claims.sub.parse::<i64>().map_err(|e| {
        error!("Failed to parse user ID from claims: {}", e);
        AppError::BadRequest("Invalid user ID in token".to_string())
    })
}

// Validation helpers
fn validate_ticket_title(title: &str) -> Result<(), AppError> {
    if title.trim().is_empty() {
        return Err(AppError::BadRequest("Title cannot be empty".to_string()));
    }
    if title.len() > 200 {
        return Err(AppError::BadRequest(
            "Title cannot exceed 200 characters".to_string(),
        ));
    }
    Ok(())
}

fn validate_ticket_description(description: &str) -> Result<(), AppError> {
    if description.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Description cannot be empty".to_string(),
        ));
    }
    if description.len() > 5000 {
        return Err(AppError::BadRequest(
            "Description cannot exceed 5000 characters".to_string(),
        ));
    }
    Ok(())
}

fn validate_message_content(message: &str) -> Result<(), AppError> {
    if message.trim().is_empty() {
        return Err(AppError::BadRequest("Message cannot be empty".to_string()));
    }
    if message.len() > 2000 {
        return Err(AppError::BadRequest(
            "Message cannot exceed 2000 characters".to_string(),
        ));
    }
    Ok(())
}

// Rate limiting helper
async fn check_rate_limit(
    pool: &PgPool,
    user_id: i64,
    action: &str,
    limit: i32,
    window_minutes: i32,
) -> Result<(), AppError> {
    let _window_start = chrono::Utc::now() - chrono::Duration::minutes(window_minutes as i64);

    let count: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM activity.rate_limits
        WHERE user_id = $1 AND action = $2 AND created_at > CURRENT_TIMESTAMP - ($3 * INTERVAL '1 minute')
        "#,
    )
    .bind(user_id)
    .bind(action)
    .bind(window_minutes as f64)
    .fetch_one(pool)
    .await
    .map_err(|e| {
        error!("Failed to check rate limit: {}", e);
        AppError::DatabaseError(e)
    })?;

    if count.0 >= limit as i64 {
        warn!(
            "Rate limit exceeded for user {} action {}: {} requests in {} minutes",
            user_id, action, count.0, window_minutes
        );
        return Err(AppError::BadRequest(format!(
            "Rate limit exceeded. Maximum {} {} per {} minutes",
            limit, action, window_minutes
        )));
    }

    // Record this action
    sqlx::query(
        "INSERT INTO activity.rate_limits (user_id, action, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)",
    )
    .bind(user_id)
    .bind(action)
    .execute(pool)
    .await
    .map_err(|e| {
        error!("Failed to record rate limit: {}", e);
        AppError::DatabaseError(e)
    })?;

    Ok(())
}

#[derive(Serialize)]
pub struct TicketMessage {
    pub id: i64,
    pub ticket_id: i64,
    pub user_id: i64,
    pub message: String,
    pub is_internal: bool,
    pub created_at: String,
    pub username: String,
    pub user_role: String,
}

#[derive(Serialize)]
pub struct TicketWithMessages {
    pub ticket: Value,
    pub messages: Vec<TicketMessageWithUser>, // Standard naming
    pub unread_count: i64,
}

#[derive(sqlx::FromRow, Serialize)]
struct TicketSummary {
    id: i64,
    ticket_number: String,
    title: String,
    description: String,
    priority: String,
    status: String,
    category: String,
    created_by: i64,
    assigned_to: Option<i64>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    creator_username: String,
    assignee_username: Option<String>,
    message_count: i64,
    unread_count: i64,
}

// Get tickets list with pagination (Admin sees all, Reseller sees only their own)
pub async fn get_tickets(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<PaginationParams>,
) -> Result<AxumJson<ApiResult<PaginatedResponse<Value>>>, AppError> {
    let pool = &app_state.database.pool;
    let user_id = parse_user_id(&claims)?;
    let role_str = if matches!(claims.role, UserRole::Admin | UserRole::System) {
        "admin"
    } else {
        "reseller"
    };

    // Pagination parameters
    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(20).clamp(1, 100); // Max 100 items per page
    let offset = (page - 1) * limit;

    // First get total count for pagination
    let total_count: (i64,) = if matches!(claims.role, UserRole::Admin | UserRole::System) {
        if let Some(status) = &params.status {
            sqlx::query_as("SELECT COUNT(*) FROM core.support_tickets WHERE status = $1")
                .bind(status)
                .fetch_one(pool)
                .await
                .map_err(AppError::DatabaseError)?
        } else {
            sqlx::query_as("SELECT COUNT(*) FROM core.support_tickets")
                .fetch_one(pool)
                .await
                .map_err(AppError::DatabaseError)?
        }
    } else if let Some(status) = &params.status {
        sqlx::query_as("SELECT COUNT(*) FROM core.support_tickets WHERE created_by = $1 AND status = $2")
            .bind(user_id)
            .bind(status)
            .fetch_one(pool)
            .await
            .map_err(AppError::DatabaseError)?
    } else {
        sqlx::query_as("SELECT COUNT(*) FROM core.support_tickets WHERE created_by = $1")
            .bind(user_id)
            .fetch_one(pool)
            .await
            .map_err(AppError::DatabaseError)?
    };

    // Get tickets with message counts efficiently
    let tickets: Vec<TicketSummary> = sqlx::query_as(
        r#"
        SELECT
            t.id, t.ticket_number, t.title, t.description,
            t.priority, t.status, t.category,
            t.created_by, t.assigned_to, t.created_at, t.updated_at,
            u1.username as creator_username,
            u2.username as assignee_username,
            COUNT(tm.id) as message_count,
            COALESCE(unread.unread_count, 0) as unread_count
        FROM core.support_tickets t
        JOIN auth.users u1 ON t.created_by = u1.id
        LEFT JOIN auth.users u2 ON t.assigned_to = u2.id
        LEFT JOIN core.ticket_messages tm ON t.id = tm.ticket_id
        LEFT JOIN (
            SELECT
                tm.ticket_id,
                COUNT(*) as unread_count
            FROM core.ticket_messages tm
            LEFT JOIN core.ticket_message_reads tmr ON tmr.ticket_id = tm.ticket_id AND tmr.user_id = $1
            WHERE tm.user_id != $2
            AND (tmr.last_read_message_id IS NULL OR tm.id > tmr.last_read_message_id)
            GROUP BY tm.ticket_id
        ) unread ON t.id = unread.ticket_id
        WHERE ($3 = 'admin') OR ($4 = 'reseller' AND t.created_by = $5)
        GROUP BY t.id, t.ticket_number, t.title, t.description,
                 t.priority, t.status, t.category,
                 t.created_by, t.assigned_to, t.created_at, t.updated_at,
                 u1.username, u2.username, unread.unread_count
        ORDER BY t.updated_at DESC
        LIMIT $6 OFFSET $7
        "#,
    )
    .bind(user_id)
    .bind(user_id)
    .bind(role_str)
    .bind(role_str)
    .bind(user_id)
    .bind(limit as i64)
    .bind(offset as i64)
    .fetch_all(pool)
    .await
    .map_err(|e| {
        error!("Failed to fetch tickets: {}", e);
        AppError::DatabaseError(e)
    })?;

    // Convert to JSON
    let ticket_data: Vec<Value> = tickets
        .into_iter()
        .map(|ticket| {
            serde_json::json!({
                "id": ticket.id,
                "ticket_number": ticket.ticket_number,
                "title": ticket.title,
                "description": ticket.description,
                "priority": ticket.priority,
                "status": ticket.status,
                "category": ticket.category,
                "created_by": ticket.created_by,
                "assigned_to": ticket.assigned_to,
                "created_at": ticket.created_at,
                "updated_at": ticket.updated_at,
                "creator_username": ticket.creator_username,
                "assignee_username": ticket.assignee_username,
                "message_count": ticket.message_count,
                "unread_count": ticket.unread_count,
                "has_unread": ticket.unread_count > 0
            })
        })
        .collect();

    // Calculate pagination info
    let total_pages = if limit > 0 {
        ((total_count.0 as f64) / (limit as f64)).ceil() as u32
    } else {
        0
    };
    let pagination = PaginationInfo {
        current_page: page,
        per_page: limit,
        total_items: total_count.0,
        total_pages,
        has_next: page < total_pages,
        has_prev: page > 1,
    };

    let response = PaginatedResponse {
        data: ticket_data,
        pagination,
    };

    Ok(AxumJson(ApiResult::success(response)))
}

// Generate unique ticket number
fn generate_ticket_number() -> String {
    let now = Utc::now();
    let date_part = now.format("%Y%m%d").to_string();
    let random_part = format!("{:04}", rand::thread_rng().gen_range(1000..9999));
    format!("TKT-{}-{}", date_part, random_part)
}

#[derive(sqlx::FromRow, Serialize)]
struct ResellerInfo {
    id: i64,
    username: String,
    active: Option<bool>,
}

// Create a new ticket (Admin)
pub async fn create_ticket_admin(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    AxumJson(request): AxumJson<CreateAdminTicketRequest>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let pool = &app_state.database.pool;

    info!(
        "Admin {} attempting to create ticket with request: {:?}",
        claims.username, request
    );

    // Only admins can create tickets via this endpoint
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        error!(
            "Non-admin user {} attempted to create admin ticket",
            claims.username
        );
        return Err(AppError::BadRequest(
            "Only admins can create tickets via this endpoint".to_string(),
        ));
    }

    // Validate input
    validate_ticket_title(&request.title)?;
    validate_ticket_description(&request.description)?;

    // Verify that the reseller exists and is active
    let reseller: Option<ResellerInfo> = sqlx::query_as(
        "SELECT id, username, active FROM auth.users WHERE id = $1 AND role = 'reseller'",
    )
    .bind(request.reseller_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let reseller = match reseller {
        Some(r) => r,
        None => {
            error!(
                "Admin {} attempted to create ticket for non-existent reseller ID {}",
                claims.username, request.reseller_id
            );
            return Err(AppError::BadRequest("Invalid reseller ID".to_string()));
        }
    };

    if reseller.active != Some(true) {
        error!(
            "Admin {} attempted to create ticket for inactive reseller {}",
            claims.username, reseller.username
        );
        return Err(AppError::BadRequest(
            "Cannot create ticket for inactive reseller".to_string(),
        ));
    }

    info!(
        "Admin {} creating ticket for reseller {}: {}",
        claims.username, reseller.username, request.title
    );

    let ticket_number = generate_ticket_number();

    // Insert the ticket
    let priority_str = request.priority.as_str();
    let category_str = request.category.as_str();
    let row = sqlx::query(
        r#"
        INSERT INTO core.support_tickets (
            ticket_number, title, description, priority, status, category,
            created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'open', $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
        "#,
    )
    .bind(&ticket_number)
    .bind(&request.title)
    .bind(&request.description)
    .bind(priority_str)
    .bind(category_str)
    .bind(request.reseller_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let ticket_id: i64 = row.get("id");

    Ok(AxumJson(ApiResult::success(serde_json::json!({
        "id": ticket_id,
        "ticket_number": ticket_number,
        "title": request.title,
        "description": request.description,
        "priority": priority_str,
        "status": "open",
        "category": category_str,
        "created_by": request.reseller_id,
        "reseller_username": reseller.username,
        "message": "Ticket created successfully for reseller"
    }))))
}

#[derive(sqlx::FromRow, Serialize)]
pub(crate) struct TicketDetails {
    id: i64,
    ticket_number: String,
    title: String,
    description: String,
    priority: String,
    status: String,
    category: String,
    created_by: i64,
    assigned_to: Option<i64>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    creator_username: String,
    assignee_username: Option<String>,
}

// Create a new ticket (Reseller only)
pub async fn create_ticket(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    AxumJson(request): AxumJson<CreateTicketRequest>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let pool = &app_state.database.pool;
    if claims.role != UserRole::Reseller {
        return Err(AppError::BadRequest(
            "Only resellers can create tickets".to_string(),
        ));
    }
    let user_id = parse_user_id(&claims)?;
    validate_ticket_title(&request.title)?;
    validate_ticket_description(&request.description)?;
    check_rate_limit(pool, user_id, "create_ticket", 5, 60).await?;

    let ticket_number = generate_ticket_number();
    let row = sqlx::query(
        r#"
        INSERT INTO core.support_tickets (
            ticket_number, title, description, priority, status, category,
            created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'open', $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
        "#,
    )
    .bind(&ticket_number)
    .bind(&request.title)
    .bind(&request.description)
    .bind(request.priority.as_str())
    .bind(request.category.as_str())
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let ticket_id: i64 = row.get("id");

    let ticket: TicketDetails = sqlx::query_as(
        r#"
        SELECT
            t.id, t.ticket_number, t.title, t.description,
            t.priority, t.status, t.category,
            t.created_by, t.assigned_to, t.created_at, t.updated_at,
            u1.username as creator_username,
            u2.username as assignee_username
        FROM core.support_tickets t
        JOIN auth.users u1 ON t.created_by = u1.id
        LEFT JOIN auth.users u2 ON t.assigned_to = u2.id
        WHERE t.id = $1
        "#,
    )
    .bind(ticket_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(AxumJson(ApiResult::success(serde_json::json!({
        "id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "priority": ticket.priority,
        "status": ticket.status,
        "category": ticket.category,
        "created_by": ticket.created_by,
        "assigned_to": ticket.assigned_to,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "creator_username": ticket.creator_username,
        "assignee_username": ticket.assignee_username,
        "message_count": 0
    }))))
}

pub async fn get_ticket_detail(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let pool = &app_state.database.pool;
    let ticket: TicketDetails = sqlx::query_as(
        r#"
        SELECT
            t.id, t.ticket_number, t.title, t.description,
            t.priority, t.status, t.category,
            t.created_by, t.assigned_to, t.created_at, t.updated_at,
            u1.username as creator_username,
            u2.username as assignee_username
        FROM core.support_tickets t
        JOIN auth.users u1 ON t.created_by = u1.id
        LEFT JOIN auth.users u2 ON t.assigned_to = u2.id
        WHERE t.id = $1
        "#,
    )
    .bind(ticket_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::DatabaseError)?
    .ok_or_else(|| AppError::NotFound)?;

    let user_id = parse_user_id(&claims)?;
    if claims.role == UserRole::Reseller && ticket.created_by != user_id {
        return Err(AppError::BadRequest("Access denied".to_string()));
    }

    let messages: Vec<TicketMessageWithUser> = sqlx::query_as(
        r#"
        SELECT
            m.id, m.ticket_id, m.user_id, m.message, m.is_internal, 
            m.attachments, m.created_at, u.username, u.role as user_role
        FROM core.ticket_messages m
        JOIN auth.users u ON m.user_id = u.id
        WHERE m.ticket_id = $1
        ORDER BY m.created_at ASC
        "#,
    )
    .bind(ticket_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let filtered_messages: Vec<_> = if claims.role == UserRole::Reseller {
        messages.into_iter().filter(|m| !m.is_internal).collect()
    } else {
        messages
    };

    let unread_count = get_unread_message_count(pool, ticket_id, user_id).await?;

    Ok(AxumJson(ApiResult::success(serde_json::json!({
        "ticket": {
            "id": ticket.id,
            "ticket_number": ticket.ticket_number,
            "title": ticket.title,
            "description": ticket.description,
            "priority": ticket.priority,
            "status": ticket.status,
            "category": ticket.category,
            "created_by": ticket.created_by,
            "assigned_to": ticket.assigned_to,
            "created_at": ticket.created_at,
            "updated_at": ticket.updated_at,
            "creator_username": ticket.creator_username,
            "assignee_username": ticket.assignee_username,
            "unread_count": unread_count,
            "has_unread": unread_count > 0
        },
        "messages": filtered_messages
    }))))
}

pub async fn update_ticket(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
    AxumJson(request): AxumJson<Value>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let existing_ticket: (i64, String) =
        sqlx::query_as("SELECT created_by, status FROM core.support_tickets WHERE id = $1")
            .bind(ticket_id)
            .fetch_optional(&pool)
            .await
            .map_err(AppError::DatabaseError)?
            .ok_or_else(|| AppError::NotFound)?;

    if claims.role == UserRole::Reseller {
        let user_id = parse_user_id(&claims)?;
        if existing_ticket.0 != user_id {
            return Err(AppError::BadRequest("Access denied".to_string()));
        }
        if existing_ticket.1 != "open" {
            return Err(AppError::BadRequest(
                "Cannot update closed/in-progress tickets".to_string(),
            ));
        }
    }

    if let Some(title) = request.get("title").and_then(|v| v.as_str()) {
        sqlx::query(
            "UPDATE core.support_tickets SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        )
        .bind(title)
        .bind(ticket_id)
        .execute(&pool)
        .await
        .map_err(AppError::DatabaseError)?;
    }
    if let Some(description) = request.get("description").and_then(|v| v.as_str()) {
        sqlx::query("UPDATE core.support_tickets SET description = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
            .bind(description).bind(ticket_id).execute(&pool).await.map_err(AppError::DatabaseError)?;
    }

    if matches!(claims.role, UserRole::Admin | UserRole::System) {
        if let Some(status) = request.get("status").and_then(|v| v.as_str()) {
            match status {
                "resolved" => {
                    sqlx::query("UPDATE core.support_tickets SET status = $1, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
                        .bind(status).bind(ticket_id).execute(&pool).await.map_err(AppError::DatabaseError)?;
                }
                "closed" => {
                    sqlx::query("UPDATE core.support_tickets SET status = $1, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
                        .bind(status).bind(ticket_id).execute(&pool).await.map_err(AppError::DatabaseError)?;
                }
                _ => {
                    sqlx::query("UPDATE core.support_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
                        .bind(status).bind(ticket_id).execute(&pool).await.map_err(AppError::DatabaseError)?;
                }
            }
        }
        if let Some(assigned_to) = request.get("assigned_to").and_then(|v| v.as_i64()) {
            sqlx::query("UPDATE core.support_tickets SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
                .bind(assigned_to).bind(ticket_id).execute(&pool).await.map_err(AppError::DatabaseError)?;
        }
        if let Some(priority) = request.get("priority").and_then(|v| v.as_str()) {
            sqlx::query("UPDATE core.support_tickets SET priority = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
                .bind(priority).bind(ticket_id).execute(&pool).await.map_err(AppError::DatabaseError)?;
        }
    }

    Ok(AxumJson(ApiResult::success(
        json!({"message": "Ticket updated"}),
    )))
}

pub async fn add_message(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
    AxumJson(request): AxumJson<Value>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let ticket: (i64, String) =
        sqlx::query_as("SELECT created_by, status FROM core.support_tickets WHERE id = $1")
            .bind(ticket_id)
            .fetch_optional(&pool)
            .await
            .map_err(AppError::DatabaseError)?
            .ok_or_else(|| AppError::NotFound)?;

    let user_id = parse_user_id(&claims)?;
    if claims.role == UserRole::Reseller && ticket.0 != user_id {
        return Err(AppError::BadRequest("Access denied".to_string()));
    }

    let message = request
        .get("message")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("Message required".to_string()))?;
    validate_message_content(message)?;
    check_rate_limit(&pool, user_id, "add_message", 20, 60).await?;

    let is_internal = if matches!(claims.role, UserRole::Admin | UserRole::System) {
        request
            .get("is_internal")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    } else {
        false
    };

    let row = sqlx::query("INSERT INTO core.ticket_messages (ticket_id, message, is_internal, user_id, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING id")
        .bind(ticket_id).bind(message).bind(is_internal).bind(user_id).fetch_one(&pool).await.map_err(AppError::DatabaseError)?;

    sqlx::query("UPDATE core.support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1")
        .bind(ticket_id)
        .execute(&pool)
        .await
        .map_err(AppError::DatabaseError)?;

    let created_message: TicketMessageWithUser = sqlx::query_as(
        r#"
        SELECT m.id, m.ticket_id, m.user_id, m.message, m.is_internal, 
               m.attachments, m.created_at, u.username, u.role as user_role
        FROM core.ticket_messages m
        JOIN auth.users u ON m.user_id = u.id
        WHERE m.id = $1
        "#,
    )
    .bind(row.get::<i64, _>("id"))
    .fetch_one(&pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(AxumJson(ApiResult::success(json!(created_message))))
}

pub async fn get_ticket_stats(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest("Admin access required".to_string()));
    }

    let stats: (i64, i64, i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        r#"
        SELECT
            COUNT(*),
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END),
            SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END),
            SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END),
            SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END),
            SUM(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '1 day' THEN 1 ELSE 0 END)
        FROM core.support_tickets
        "#,
    )
    .fetch_one(&pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let message_stats: (i64, i64, i64) = sqlx::query_as(
        r#"
        SELECT
            COUNT(*),
            COUNT(DISTINCT ticket_id),
            SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '1 day' THEN 1 ELSE 0 END)
        FROM core.ticket_messages
        "#,
    )
    .fetch_one(&pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let admin_id = parse_user_id(&claims)?;
    let unread_for_admin: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM core.ticket_messages tm
        LEFT JOIN core.ticket_message_reads tmr ON tmr.ticket_id = tm.ticket_id AND tmr.user_id = $1
        WHERE tm.user_id != $2
        AND (tmr.last_read_message_id IS NULL OR tm.id > tmr.last_read_message_id)
        "#,
    )
    .bind(admin_id)
    .bind(admin_id)
    .fetch_one(&pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(AxumJson(ApiResult::success(json!({
        "tickets": {
            "total": stats.0, "open": stats.1, "in_progress": stats.2, "resolved": stats.3, "closed": stats.4,
            "urgent": stats.5, "high": stats.6, "created_this_week": stats.7, "updated_today": stats.8
        },
        "messages": {
            "total_messages": message_stats.0, "tickets_with_messages": message_stats.1, "messages_today": message_stats.2,
            "unread_for_admin": unread_for_admin.0
        }
    }))))
}

pub async fn get_ticket_messages(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
) -> Result<AxumJson<ApiResult<TicketWithMessages>>, AppError> {
    let pool = &app_state.database.pool;
    let user_id = parse_user_id(&claims)?;
    let role_str = if matches!(claims.role, UserRole::Admin | UserRole::System) {
        "admin"
    } else {
        "reseller"
    };

    let ticket: TicketDetails = sqlx::query_as(
        r#"
        SELECT t.*, u1.username as creator_username, u2.username as assignee_username
        FROM core.support_tickets t
        JOIN auth.users u1 ON t.created_by = u1.id
        LEFT JOIN auth.users u2 ON t.assigned_to = u2.id
        WHERE t.id = $1 AND ($2 = 'admin' OR ($3 = 'reseller' AND t.created_by = $4))
        "#,
    )
    .bind(ticket_id)
    .bind(role_str)
    .bind(role_str)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::DatabaseError)?
    .ok_or_else(|| AppError::NotFound)?;

    let messages: Vec<TicketMessageWithUser> = sqlx::query_as(
        r#"
        SELECT m.id, m.ticket_id, m.user_id, m.message, m.is_internal, 
               m.attachments, m.created_at, u.username, u.role as user_role
        FROM core.ticket_messages m
        JOIN auth.users u ON m.user_id = u.id
        WHERE m.ticket_id = $1
        ORDER BY m.created_at ASC
        "#,
    )
    .bind(ticket_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let unread_count = get_unread_message_count(pool, ticket_id, user_id).await?;

    let ticket_json = serde_json::to_value(ticket)?;
    Ok(AxumJson(ApiResult::success(TicketWithMessages {
        ticket: ticket_json,
        messages,
        unread_count,
    })))
}

pub async fn add_ticket_message(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
    AxumJson(request): AxumJson<AddMessageRequest>,
) -> Result<AxumJson<ApiResult<TicketMessageWithUser>>, AppError> {
    let pool = &app_state.database.pool;
    let user_id = parse_user_id(&claims)?;
    validate_message_content(&request.message)?;
    check_rate_limit(pool, user_id, "add_message", 20, 60).await?;

    let role_str = if matches!(claims.role, UserRole::Admin | UserRole::System) {
        "admin"
    } else {
        "reseller"
    };
    let ticket: (i64, String) = sqlx::query_as(
        r#"
        SELECT id, status FROM core.support_tickets
        WHERE id = $1 AND ($2 = 'admin' OR ($3 = 'reseller' AND created_by = $4))
        "#,
    )
    .bind(ticket_id)
    .bind(role_str)
    .bind(role_str)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::DatabaseError)?
    .ok_or_else(|| AppError::NotFound)?;

    if ticket.1 == "closed" {
        return Err(AppError::BadRequest(
            "Cannot add messages to closed tickets".to_string(),
        ));
    }

    let is_internal = request.is_internal.unwrap_or(false);
    let row = sqlx::query("INSERT INTO core.ticket_messages (ticket_id, user_id, message, is_internal) VALUES ($1, $2, $3, $4) RETURNING id")
        .bind(ticket_id).bind(user_id).bind(&request.message).bind(is_internal).fetch_one(pool).await.map_err(AppError::DatabaseError)?;

    let new_status = if matches!(claims.role, UserRole::Admin | UserRole::System) && ticket.1 == "open" {
        "in_progress"
    } else if claims.role == UserRole::Reseller && ticket.1 == "in_progress" {
        "waiting_response"
    } else {
        &ticket.1
    };

    sqlx::query(
        "UPDATE core.support_tickets SET updated_at = CURRENT_TIMESTAMP, status = $1 WHERE id = $2",
    )
    .bind(new_status)
    .bind(ticket_id)
    .execute(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let message: TicketMessageWithUser = sqlx::query_as(
        r#"
        SELECT m.id, m.ticket_id, m.user_id, m.message, m.is_internal, 
               m.attachments, m.created_at, u.username, u.role as user_role
        FROM core.ticket_messages m
        JOIN auth.users u ON m.user_id = u.id
        WHERE m.id = $1
        "#,
    )
    .bind(row.get::<i64, _>("id"))
    .fetch_one(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(AxumJson(ApiResult::success(message)))
}

pub async fn mark_ticket_messages_read(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let pool = &app_state.database.pool;
    let user_id = parse_user_id(&claims)?;
    let role_str = if matches!(claims.role, UserRole::Admin | UserRole::System) {
        "admin"
    } else {
        "reseller"
    };

    sqlx::query_as::<_, (i64,)>(
        r#"
        SELECT id FROM core.support_tickets
        WHERE id = $1 AND ($2 = 'admin' OR ($3 = 'reseller' AND created_by = $4))
        "#,
    )
    .bind(ticket_id)
    .bind(role_str)
    .bind(role_str)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::DatabaseError)?
    .ok_or_else(|| AppError::NotFound)?;

    let latest_message: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM core.ticket_messages WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(ticket_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    if let Some(latest) = latest_message {
        sqlx::query(
            r#"
            INSERT INTO core.ticket_message_reads (ticket_id, user_id, last_read_message_id)
            VALUES ($1, $2, $3)
            ON CONFLICT(ticket_id, user_id) DO UPDATE SET
                last_read_message_id = excluded.last_read_message_id,
                read_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(ticket_id)
        .bind(user_id)
        .bind(latest.0)
        .execute(pool)
        .await
        .map_err(AppError::DatabaseError)?;
    }

    Ok(AxumJson(ApiResult::success(json!({"success": true}))))
}

async fn get_unread_message_count(
    pool: &PgPool,
    ticket_id: i64,
    user_id: i64,
) -> Result<i64, AppError> {
    let count: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM core.ticket_messages tm
        LEFT JOIN core.ticket_message_reads tmr ON tmr.ticket_id = tm.ticket_id AND tmr.user_id = $1
        WHERE tm.ticket_id = $2 AND tm.user_id != $3
        AND (tmr.last_read_message_id IS NULL OR tm.id > tmr.last_read_message_id)
        "#,
    )
    .bind(user_id)
    .bind(ticket_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::DatabaseError)?;
    Ok(count.0)
}

pub async fn get_unread_count_total(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let pool = &app_state.database.pool;
    let user_id = parse_user_id(&claims)?;
    let role_str = if matches!(claims.role, UserRole::Admin | UserRole::System) {
        "admin"
    } else {
        "reseller"
    };

    let total_unread: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM core.ticket_messages tm
        JOIN core.support_tickets st ON tm.ticket_id = st.id
        LEFT JOIN core.ticket_message_reads tmr ON tmr.ticket_id = tm.ticket_id AND tmr.user_id = $1
        WHERE tm.user_id != $2
        AND (tmr.last_read_message_id IS NULL OR tm.id > tmr.last_read_message_id)
        AND (($3 = 'admin') OR ($4 = 'reseller' AND st.created_by = $5))
        "#,
    )
    .bind(user_id)
    .bind(user_id)
    .bind(role_str)
    .bind(role_str)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(AxumJson(ApiResult::success(
        json!({"total_unread": total_unread.0}),
    )))
}

