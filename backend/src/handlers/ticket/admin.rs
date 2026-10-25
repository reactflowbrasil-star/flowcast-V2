use axum::{
    extract::{Path, State},
    Extension,
    Json as AxumJson,
};
use serde_json::{json, Value};
use tracing::info;

use crate::{
    error::AppError,
    models::UserRole,
    services::Claims,
    AppState,
};
use super::{ApiResult, TicketDetails, parse_user_id};

pub async fn update_ticket_admin(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
    AxumJson(request): AxumJson<crate::models::ticket::UpdateTicketRequest>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let pool = &app_state.database.pool;
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can update core.tickets".to_string(),
        ));
    }

    let _ticket: Option<sqlx::postgres::PgRow> =
        sqlx::query("SELECT id FROM core.support_tickets WHERE id = $1")
            .bind(ticket_id)
            .fetch_optional(pool)
            .await
            .map_err(AppError::DatabaseError)?;
    if _ticket.is_none() {
        return Err(AppError::NotFound);
    }

    if let Some(status) = &request.status {
        sqlx::query(
            "UPDATE core.support_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        )
        .bind(status.as_str())
        .bind(ticket_id)
        .execute(pool)
        .await
        .map_err(AppError::DatabaseError)?;
    }

    if let Some(assigned_to) = &request.assigned_to {
        if *assigned_to > 0 {
            let assignee: (i64, String) =
                sqlx::query_as("SELECT id, role FROM auth.users WHERE id = $1")
                    .bind(assigned_to)
                    .fetch_one(pool)
                    .await
                    .map_err(AppError::DatabaseError)?;
            if assignee.1 != "admin" {
                return Err(AppError::BadRequest(
                    "Can only assign tickets to admins".to_string(),
                ));
            }
        }
        sqlx::query("UPDATE core.support_tickets SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
            .bind(assigned_to).bind(ticket_id).execute(pool).await.map_err(AppError::DatabaseError)?;
    }

    if let Some(priority) = &request.priority {
        sqlx::query("UPDATE core.support_tickets SET priority = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
            .bind(priority.as_str()).bind(ticket_id).execute(pool).await.map_err(AppError::DatabaseError)?;
    }

    let updated_ticket: TicketDetails = sqlx::query_as(
        r#"
        SELECT t.id, t.ticket_number, t.title, t.description, t.priority, t.status, t.category,
               t.created_by, t.assigned_to, t.created_at, t.updated_at,
               u1.username as creator_username, u2.username as assignee_username
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

    let updated_json = serde_json::to_value(updated_ticket)?;
    Ok(AxumJson(ApiResult::success(updated_json)))
}

pub async fn assign_ticket_to_self(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let pool = &app_state.database.pool;
    let admin_id = parse_user_id(&claims)?;
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can assign tickets".to_string(),
        ));
    }

    sqlx::query("SELECT id FROM core.support_tickets WHERE id = $1")
        .bind(ticket_id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::DatabaseError)?
        .ok_or_else(|| AppError::NotFound)?;

    sqlx::query(
        r#"
        UPDATE core.support_tickets
        SET assigned_to = $1,
            status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        "#,
    )
    .bind(admin_id)
    .bind(ticket_id)
    .execute(pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(AxumJson(ApiResult::success(
        json!({"success": true, "assigned_to": admin_id}),
    )))
}

pub async fn delete_ticket_admin(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(ticket_id): Path<i64>,
) -> Result<AxumJson<ApiResult<Value>>, AppError> {
    let pool = &app_state.database.pool;
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::BadRequest(
            "Only admins can delete tickets".to_string(),
        ));
    }

    let ticket: (i64, String) =
        sqlx::query_as("SELECT id, title FROM core.support_tickets WHERE id = $1")
            .bind(ticket_id)
            .fetch_optional(pool)
            .await
            .map_err(AppError::DatabaseError)?
            .ok_or_else(|| AppError::NotFound)?;

    sqlx::query("DELETE FROM core.ticket_messages WHERE ticket_id = $1")
        .bind(ticket_id)
        .execute(pool)
        .await
        .map_err(AppError::DatabaseError)?;
    sqlx::query("DELETE FROM core.support_tickets WHERE id = $1")
        .bind(ticket_id)
        .execute(pool)
        .await
        .map_err(AppError::DatabaseError)?;

    info!(
        "Admin {} deleted ticket {} ({})",
        claims.username, ticket_id, ticket.1
    );
    Ok(AxumJson(ApiResult::success(
        json!({"message": "Ticket deleted successfully", "ticket_id": ticket_id}),
    )))
}
