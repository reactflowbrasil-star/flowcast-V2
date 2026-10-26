// ─── License Verification Handler (Unlocked) ───────────────────────────

use axum::{
    extract::{ConnectInfo, State},
    http::StatusCode,
    response::Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ActivateRequest {
    pub purchase_code: String,
    #[serde(default)]
    pub domain: Option<String>,
}

/// POST /api/admin/license/activate
/// Instantly activates any code as Extended License.
pub async fn activate_license(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(payload): Json<ActivateRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let code = payload.purchase_code.trim();
    let requester_ip = addr.ip().to_string();
    let domain = payload.domain.as_deref();

    match state.license_service.activate(code, Some(&requester_ip), domain).await {
        Ok(status) => Ok(Json(json!({
            "success": true,
            "license": status
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "success": false,
                "error": e
            })),
        )),
    }
}

/// GET /api/admin/license/status
/// Always returns Extended License status.
pub async fn get_license_status(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match state.license_service.get_status().await {
        Ok(status) => Ok(Json(json!(status))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )),
    }
}

/// GET /api/license/type
/// Public — always returns licensed = true, Extended License.
pub async fn get_license_type(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match state.license_service.get_status().await {
        Ok(status) => Ok(Json(json!({
            "licensed": status.licensed,
            "license_type": status.license_type,
        }))),
        Err(_) => Ok(Json(json!({
            "licensed": true,
            "license_type": "Extended License",
        }))),
    }
}
