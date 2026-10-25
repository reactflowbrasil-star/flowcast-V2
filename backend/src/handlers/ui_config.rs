use axum::{extract::State, Json};
use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Serialize)]
pub struct UiConfigResponse {
    pub login_series_backdrops: Vec<String>,
    pub login_movies_backdrops: Vec<String>,
    pub allow_direct_registration: bool,
}

fn parse_backdrops_list(value: Option<String>) -> Vec<String> {
    let raw = value.unwrap_or_default();
    raw.split([',', '\n', '\r'])
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// Public UI configuration used by clients (no auth required).
/// Only returns non-sensitive display settings.
pub async fn get_ui_config(
    State(app_state): State<crate::AppState>,
) -> Result<Json<UiConfigResponse>, AppError> {
    let login_series_backdrops = parse_backdrops_list(
        app_state
            .database
            .get_config("ui_login_series_backdrops")
            .await
            .ok()
            .flatten(),
    );
    let login_movies_backdrops = parse_backdrops_list(
        app_state
            .database
            .get_config("ui_login_movies_backdrops")
            .await
            .ok()
            .flatten(),
    );

    let allow_direct_registration = app_state
        .database
        .get_config("allow_direct_registration")
        .await
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    Ok(Json(UiConfigResponse {
        login_series_backdrops,
        login_movies_backdrops,
        allow_direct_registration,
    }))
}

