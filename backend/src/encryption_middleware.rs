//! AES-256-GCM response encryption middleware.
//!
//! Encrypts JSON responses **only for `EndUser` role** when `API_ENCRYPTION_KEY` is configured.
//! Admin and Reseller responses pass through unchanged.
//!
//! Clients must send:
//!   `X-SC-Sig`: HMAC-SHA256(key, "<timestamp>:<METHOD>:<path>")
//!   `X-SC-Ts`:  Unix timestamp (±5 min tolerance)

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use hmac::{Hmac, Mac};
use http_body_util::BodyExt;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::config;
use crate::models::user::UserRole;
use crate::services::Claims;

type HmacSha256 = Hmac<Sha256>;

/// Maximum clock skew tolerance for HMAC timestamp validation (5 minutes).
const TIMESTAMP_TOLERANCE_SECS: u64 = 300;

/// Encryption middleware — encrypts JSON responses for end-users.
///
/// This should be applied **after** auth middleware so that `Claims` are available
/// in request extensions.
pub async fn encrypt_response_middleware(
    State(app_state): State<crate::AppState>,
    request: Request,
    next: Next,
) -> Response {
    let encryption_key = match &app_state.config.api_encryption_key {
        Some(key) => key.clone(),
        None => return next.run(request).await, // No key configured, pass through
    };

    // Extract claims from request extensions (set by auth middleware)
    let claims = request.extensions().get::<Claims>().cloned();

    let is_end_user = claims
        .as_ref()
        .map(|c| c.role == UserRole::EndUser)
        .unwrap_or(false);

    // Only encrypt for end-users
    if !is_end_user {
        return next.run(request).await;
    }

    // Validate HMAC signature for end-user requests
    let method = request.method().clone();
    let path = request.uri().path().to_string();

    if let Err(response) = validate_hmac_signature(&request, &method, &path, &encryption_key) {
        return response;
    }

    // Run the inner handler
    let response = next.run(request).await;

    // Only encrypt JSON responses
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("application/json") {
        return response;
    }

    // Don't encrypt error responses (let error messages through for debugging)
    let status = response.status();
    if status.is_server_error() {
        return response;
    }

    // Extract response parts and body
    let (mut parts, body) = response.into_parts();

    let body_bytes = match body.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read response body")
                .into_response();
        }
    };

    // Skip encryption for empty bodies
    if body_bytes.is_empty() {
        return Response::from_parts(parts, Body::from(body_bytes));
    }

    // Encrypt the body
    let plaintext = match std::str::from_utf8(&body_bytes) {
        Ok(s) => s,
        Err(_) => {
            return Response::from_parts(parts, Body::from(body_bytes));
        }
    };

    match config::aes_encrypt(plaintext, &encryption_key) {
        Ok(encrypted_b64) => {
            parts.headers.insert(
                "X-Encrypted",
                HeaderValue::from_static("aes256gcm"),
            );
            parts.headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            );
            // Remove content-length so axum recalculates
            parts.headers.remove(header::CONTENT_LENGTH);

            Response::from_parts(parts, Body::from(encrypted_b64))
        }
        Err(e) => {
            tracing::error!("Failed to encrypt API response: {}", e);
            // Fall back to unencrypted response on error
            Response::from_parts(parts, Body::from(body_bytes))
        }
    }
}

/// Validate `X-SC-Sig` and `X-SC-Ts` headers.
///
/// Signature = HMAC-SHA256(key, "<timestamp>:<METHOD>:<path>")
fn validate_hmac_signature(
    request: &Request,
    method: &Method,
    path: &str,
    hex_key: &str,
) -> Result<(), Response> {
    let sig_header = request
        .headers()
        .get("X-SC-Sig")
        .and_then(|v| v.to_str().ok());

    let ts_header = request
        .headers()
        .get("X-SC-Ts")
        .and_then(|v| v.to_str().ok());

    let (sig, ts_str) = match (sig_header, ts_header) {
        (Some(s), Some(t)) => (s, t),
        _ => {
            return Err((
                StatusCode::FORBIDDEN,
                axum::Json(serde_json::json!({
                    "error": "Missing client signature",
                    "details": "X-SC-Sig and X-SC-Ts headers are required"
                })),
            )
                .into_response());
        }
    };

    // Parse and validate timestamp
    let ts: u64 = ts_str.parse().map_err(|_| {
        (
            StatusCode::FORBIDDEN,
            axum::Json(serde_json::json!({
                "error": "Invalid timestamp",
                "details": "X-SC-Ts must be a valid unix timestamp"
            })),
        )
            .into_response()
    })?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let diff = if now > ts { now - ts } else { ts - now };
    if diff > TIMESTAMP_TOLERANCE_SECS {
        return Err((
            StatusCode::FORBIDDEN,
            axum::Json(serde_json::json!({
                "error": "Request expired",
                "details": "Timestamp is too far from server time"
            })),
        )
            .into_response());
    }

    // Compute expected HMAC
    let key_bytes = hex::decode(hex_key).map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Invalid encryption key").into_response()
    })?;

    let message = format!("{}:{}:{}", ts_str, method.as_str(), path);

    let mut mac = HmacSha256::new_from_slice(&key_bytes).map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "HMAC key error").into_response()
    })?;
    mac.update(message.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());

    // Constant-time comparison
    if !constant_time_eq(sig.as_bytes(), expected.as_bytes()) {
        return Err((
            StatusCode::FORBIDDEN,
            axum::Json(serde_json::json!({
                "error": "Invalid signature",
                "details": "X-SC-Sig verification failed"
            })),
        )
            .into_response());
    }

    Ok(())
}

/// Constant-time byte comparison to prevent timing attacks.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn hmac_signature_roundtrip() {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();

        let method = "GET";
        let path = "/api/tv/channels";
        let message = format!("{}:{}:{}", ts, method, path);

        let key_bytes = hex::decode(TEST_KEY).unwrap();
        let mut mac = HmacSha256::new_from_slice(&key_bytes).unwrap();
        mac.update(message.as_bytes());
        let sig = hex::encode(mac.finalize().into_bytes());

        // Verify the signature is valid
        let key_bytes2 = hex::decode(TEST_KEY).unwrap();
        let mut mac2 = HmacSha256::new_from_slice(&key_bytes2).unwrap();
        mac2.update(message.as_bytes());
        let expected = hex::encode(mac2.finalize().into_bytes());

        assert!(constant_time_eq(sig.as_bytes(), expected.as_bytes()));
    }

    #[test]
    fn hmac_wrong_key_fails() {
        let ts = "1700000000";
        let message = format!("{}:GET:/api/test", ts);

        let key_bytes = hex::decode(TEST_KEY).unwrap();
        let mut mac = HmacSha256::new_from_slice(&key_bytes).unwrap();
        mac.update(message.as_bytes());
        let sig = hex::encode(mac.finalize().into_bytes());

        let wrong_key = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        let wrong_bytes = hex::decode(wrong_key).unwrap();
        let mut mac2 = HmacSha256::new_from_slice(&wrong_bytes).unwrap();
        mac2.update(message.as_bytes());
        let expected = hex::encode(mac2.finalize().into_bytes());

        assert!(!constant_time_eq(sig.as_bytes(), expected.as_bytes()));
    }

    #[test]
    fn constant_time_eq_different_lengths() {
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    #[test]
    fn constant_time_eq_same() {
        assert!(constant_time_eq(b"hello", b"hello"));
    }

    #[test]
    fn constant_time_eq_different() {
        assert!(!constant_time_eq(b"hello", b"world"));
    }
}
