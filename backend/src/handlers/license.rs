// ─── License Verification Handler ───────────────────────────
//
// HTTP endpoints for license activation and status queries.

use axum::{
    extract::{ConnectInfo, State},
    http::StatusCode,
    response::Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;

use crate::AppState;

// ─── Request DTOs ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ActivateRequest {
    pub purchase_code: String,
    #[serde(default)]
    pub domain: Option<String>,
}

// ─── Endpoints ──────────────────────────────────────────────

/// POST /api/admin/license/activate
///
/// Activates a purchase code by verifying it against the Envato API.
/// Requires admin authentication.
pub async fn activate_license(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(payload): Json<ActivateRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let code = payload.purchase_code.trim();

    if code.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Purchase code is required" })),
        ));
    }

    // Simple UUID format validation
    let uuid_regex = regex::Regex::new(
        r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
    ).unwrap();

    if !uuid_regex.is_match(code) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Invalid purchase code format",
                "expected": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            })),
        ));
    }

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
///
/// Returns the current license activation status.
/// Requires admin authentication.
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
///
/// Public (no auth) — just returns the license type so the frontend
/// can decide whether to show the activation gate or not.
pub async fn get_license_type(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match state.license_service.get_status().await {
        Ok(status) => Ok(Json(json!({
            "licensed": status.licensed,
            "license_type": status.license_type,
        }))),
        Err(_) => {
            // If DB is unreachable, assume not licensed (safe default)
            Ok(Json(json!({
                "licensed": false,
                "license_type": null,
            })))
        }
    }
}
