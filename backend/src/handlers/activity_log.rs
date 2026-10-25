use crate::error::AppError;
use crate::models::activity_log::{ActivityLogFilters, ActivityLogResponse};
use crate::models::user::UserRole;
use crate::services::Claims;
use axum::{
    extract::{Query, State},
    response::Json,
    Extension,
};

/// Get activity logs (admin sees all logs, reseller sees only their logs)
pub async fn get_admin_activity_logs(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(filters): Query<ActivityLogFilters>,
) -> Result<Json<ActivityLogResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get user to check their role
    let user = app_state.user_service.get_user_by_id(user_id).await?;

    let logs = match user.role {
        UserRole::Admin | UserRole::System => {
            // Admin/System can see all logs
            app_state
                .activity_log_service
                .get_admin_logs(filters)
                .await?
        }
        UserRole::Reseller => {
            // Reseller can only see their own logs
            app_state
                .activity_log_service
                .get_reseller_logs(user_id, filters)
                .await?
        }
        _ => {
            return Err(AppError::PermissionDenied(
                "Only admins and resellers can access activity logs".to_string(),
            ));
        }
    };

    Ok(Json(logs))
}

/// Get activity logs for reseller (only their related logs)
pub async fn get_reseller_activity_logs(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(filters): Query<ActivityLogFilters>,
) -> Result<Json<ActivityLogResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Verify user exists and get their role
    let user = app_state.user_service.get_user_by_id(user_id).await?;

    // Only allow resellers to access this endpoint
    if user.role != UserRole::Reseller {
        return Err(AppError::PermissionDenied(
            "Only resellers can access reseller logs".to_string(),
        ));
    }

    let logs = app_state
        .activity_log_service
        .get_reseller_logs(user_id, filters)
        .await?;

    Ok(Json(logs))
}
