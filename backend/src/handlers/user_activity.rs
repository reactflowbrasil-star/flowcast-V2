use crate::error::AppError;
use crate::models::user::UserRole;
use crate::models::user_activity::*;
use crate::services::Claims;
use axum::{
    extract::{ConnectInfo, Query, State},
    http::HeaderMap,
    response::Json,
    Extension,
};
use std::net::SocketAddr;

/// Get login history (admin only)
pub async fn get_login_history(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(filters): Query<ActivityFilters>,
) -> Result<Json<LoginHistoryResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get user to check their role
    let user = app_state.user_service.get_user_by_id(user_id).await?;

    // Only admins can access login history
    if !matches!(user.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::PermissionDenied(
            "Only admins can access login history".to_string(),
        ));
    }

    let history = app_state
        .user_activity_service
        .get_login_history(filters)
        .await?;
    Ok(Json(history))
}

/// Get viewing history (admin only)
pub async fn get_viewing_history(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(filters): Query<ActivityFilters>,
) -> Result<Json<ViewingHistoryResponse>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get user to check their role
    let user = app_state.user_service.get_user_by_id(user_id).await?;

    // Only admins can access viewing history
    if !matches!(user.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::PermissionDenied(
            "Only admins can access viewing history".to_string(),
        ));
    }

    let history = app_state
        .user_activity_service
        .get_viewing_history(filters)
        .await?;
    Ok(Json(history))
}

/// Get dashboard analytics metrics (admin only)
pub async fn get_dashboard_metrics(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<DashboardMetrics>, AppError> {
    let user_id = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get user to check their role
    let user = app_state.user_service.get_user_by_id(user_id).await?;

    // Only admins can access dashboard metrics
    if !matches!(user.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::PermissionDenied(
            "Only admins can access dashboard metrics".to_string(),
        ));
    }

    let metrics = app_state
        .user_activity_service
        .get_dashboard_metrics()
        .await?;
    Ok(Json(metrics))
}

// Removed duplicate extract_client_info function - using middleware version

/// Log user login (internal use - called from auth handlers)
pub async fn log_user_login(
    app_state: &crate::AppState,
    user_id: i64,
    username: &str,
    headers: &HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    success: bool,
) -> Result<(), AppError> {
    let (ip_address, device_info, user_agent) =
        crate::middleware::extract_client_info(headers, connect_info);

    let request = CreateLoginHistoryRequest {
        user_id,
        username: username.to_string(),
        ip_address,
        device_info,
        user_agent,
        success,
    };

    app_state.user_activity_service.log_login(request).await?;
    Ok(())
}

/// Parameters for logging a content viewing event.
pub struct ContentViewingEvent<'a> {
    pub user_id: i64,
    pub username: &'a str,
    pub content_type: ContentType,
    pub content_id: Option<i64>,
    pub content_title: &'a str,
    pub episode_title: Option<&'a str>,
    pub season_number: Option<i32>,
    pub episode_number: Option<i32>,
    pub headers: &'a HeaderMap,
    pub connect_info: Option<ConnectInfo<SocketAddr>>,
}

/// Log content viewing (internal use - called from content delivery handlers)
pub async fn log_content_viewing(
    app_state: &crate::AppState,
    event: ContentViewingEvent<'_>,
) -> Result<(), AppError> {
    let (ip_address, device_info, user_agent) =
        crate::middleware::extract_client_info(event.headers, event.connect_info);

    // Get the actual content title from database if content_id is provided
    let actual_content_title = if let Some(cid) = event.content_id {
        // FORZAR el uso del título correcto - simplificar al máximo
        match app_state.content_service.get_content_by_id(cid).await {
            Ok(Some(content)) => {
                // Solo usar el título real del contenido

                content.title.clone()
            }
            _ => {
                // Si no se encuentra, usar el título original
                tracing::warn!(
                    "❌ Content {} not found, using original title: {}",
                    cid,
                    event.content_title
                );
                event.content_title.to_string()
            }
        }
    } else {
        event.content_title.to_string()
    };

    let request = CreateViewingHistoryRequest {
        user_id: event.user_id,
        username: event.username.to_string(),
        content_type: event.content_type.to_string(),
        content_id: event.content_id,
        content_title: actual_content_title,
        episode_title: event.episode_title.map(|s| s.to_string()),
        season_number: event.season_number,
        episode_number: event.episode_number,
        series_title: None, // This will be determined by the streaming handlers
        ip_address,
        device_info,
        user_agent,
    };

    app_state.user_activity_service.log_viewing(request).await?;
    Ok(())
}
