use axum::{
    extract::{Extension, State},
    response::Json,
};
use crate::{
    error::AppError,
    AppState,
};
use super::{
    auth::has_permission,
    types::{ApiKeyContext, CalculateCostRequest, CalculateCostResponse, CreditBalanceResponse},
};

pub async fn get_credit_balance(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
) -> Result<Json<CreditBalanceResponse>, AppError> {
    if !has_permission(&ctx, "credits:read") {
        return Err(AppError::Forbidden);
    }

    let credits: f64 = sqlx::query_scalar("SELECT credits FROM auth.users WHERE id = $1")
        .bind(ctx.reseller_id)
        .fetch_one(&app_state.database.pool)
        .await
        .unwrap_or(0.0);

    Ok(Json(CreditBalanceResponse { credits }))
}

pub async fn calculate_cost(
    State(app_state): State<AppState>,
    Extension(ctx): Extension<ApiKeyContext>,
    Json(request): Json<CalculateCostRequest>,
) -> Result<Json<CalculateCostResponse>, AppError> {
    if !has_permission(&ctx, "credits:read") {
        return Err(AppError::Forbidden);
    }

    let duration_months = request.duration_months.unwrap_or(1);

    // Read configurable credit cost per extra device from DB (default 0.25)
    let credit_per_extra_device: f64 = app_state
        .user_service
        .get_config_value("credit_per_extra_device")
        .await
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.25);

    let cost = calculate_credit_cost(request.max_devices, duration_months, credit_per_extra_device);

    let current_balance: f64 = sqlx::query_scalar("SELECT credits FROM auth.users WHERE id = $1")
        .bind(ctx.reseller_id)
        .fetch_one(&app_state.database.pool)
        .await
        .unwrap_or(0.0);

    Ok(Json(CalculateCostResponse {
        cost,
        current_balance,
        sufficient: current_balance >= cost,
    }))
}

pub(crate) fn calculate_credit_cost(max_devices: i32, duration_months: i64, credit_per_extra_device: f64) -> f64 {
    let mut cost = 1.0;
    if max_devices > 3 {
        let extra_devices = (max_devices - 3) as f64;
        cost = 1.0 + (extra_devices * credit_per_extra_device);
    }
    cost * duration_months as f64
}
