use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::models::activity_log::{ActionType, CreateActivityLogRequest};
use crate::models::user::UserRole;
use crate::services::{Claims, PricingService};

// HMAC verification for Stripe webhook
use hmac::{Hmac, Mac};
use sha2::Sha256;

#[derive(Debug, Deserialize)]
pub struct CreateCheckoutSessionRequest {
    pub quantity: i32,
}

#[derive(Debug, Serialize)]
pub struct CreateCheckoutSessionResponse {
    pub session_id: String,
    pub url: String,
    pub quantity: i32,
    pub unit_amount_cents: i32,
    pub discount_percent: f64,
    pub amount_total_cents: i32,
    pub currency: String,
}

// Verify Stripe signature (Stripe-Signature header)
// Spec: compute HMAC-SHA256 over "{timestamp}.{payload}" with endpoint secret.
// Compare against any v1 signature in header.
// Also enforce a timestamp tolerance to prevent replay.
fn verify_stripe_signature(payload: &str, sig_header: &str, secret: &str) -> bool {
    // Parse header: "t=timestamp,v1=hexdigest[,v1=...]"
    let mut timestamp: Option<&str> = None;
    let mut signatures: Vec<&str> = Vec::new();
    for part in sig_header.split(',') {
        let mut kv = part.splitn(2, '=');
        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
            match k.trim() {
                "t" => timestamp = Some(v.trim()),
                "v1" => signatures.push(v.trim()),
                _ => {}
            }
        }
    }
    let ts = match timestamp {
        Some(t) => t,
        None => return false,
    };
    // Reject old or future timestamps to reduce replay risk.
    const SIGNATURE_TOLERANCE_SECONDS: i64 = 300;
    let ts_num: i64 = match ts.parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    let now = chrono::Utc::now().timestamp();
    if (now - ts_num).abs() > SIGNATURE_TOLERANCE_SECONDS {
        return false;
    }
    // Build signed payload
    let signed = format!("{}.{}", ts, payload);

    // Compute expected signature
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(signed.as_bytes());
    let expected = mac.finalize().into_bytes();
    let expected_hex = hex::encode(expected);

    // Constant-time compare against any provided v1 signature
    signatures
        .iter()
        .any(|sig| ct_eq_hex(expected_hex.as_bytes(), sig.as_bytes()))
}

// Constant-time equality for lowercase hex strings of equal length
fn ct_eq_hex(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    // Normalize both to lowercase without allocation where possible
    let mut diff = 0u8;
    for i in 0..a.len() {
        let ca = a[i].to_ascii_lowercase();
        let cb = b[i].to_ascii_lowercase();
        diff |= ca ^ cb;
    }
    diff == 0
}

/**
POST /api/reseller/credits/checkout-session
- Auth: Reseller only
- Body: { quantity: i32 }
- Flow:
  1) Load pricing config
  2) Compute discount and unit_amount_cents
  3) Create Stripe Checkout Session with metadata
  4) Persist a 'created' credit_purchases record by session_id
  5) Return session.url to client for redirect
*/
pub async fn create_checkout_session(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateCheckoutSessionRequest>,
) -> Result<Json<CreateCheckoutSessionResponse>, AppError> {
    // Validate role
    if claims.role != UserRole::Reseller {
        return Err(AppError::Forbidden);
    }
    let reseller_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Validate quantity (lock quantity at Checkout by not using adjustable quantity)
    let qty = req.quantity;
    if qty <= 0 || qty > 100000 {
        return Err(AppError::BadRequest("Invalid quantity".to_string()));
    }

    // Pricing
    let pricing_service = PricingService::new(app_state.database.clone());
    let config = pricing_service.load_config().await?;
    let discount_percent = pricing_service.get_discount_for_qty(qty, &config);
    let unit_amount_cents =
        pricing_service.compute_unit_amount_cents(config.base_price_usd, discount_percent);
    let amount_total_cents =
        pricing_service.compute_total_amount_cents(qty, config.base_price_usd, discount_percent);
    let unit_amount_cents = i32::try_from(unit_amount_cents)
        .map_err(|_| AppError::BadRequest("unit_amount_cents too large".to_string()))?;
    let amount_total_cents = i32::try_from(amount_total_cents)
        .map_err(|_| AppError::BadRequest("amount_total_cents too large".to_string()))?;

    // Stripe Checkout Session — read from DB first, fallback to env var config
    let pool = &app_state.database.pool;
    let secret = crate::config::get_dynamic_config_value(
        pool, "stripe_secret_key", &app_state.config.stripe_secret_key,
    ).await;
    let currency = crate::config::get_dynamic_config_value(
        pool, "stripe_currency", &app_state.config.stripe_currency,
    ).await;
    let success_url = crate::config::get_dynamic_config_value(
        pool, "stripe_success_url", &app_state.config.stripe_success_url,
    ).await;
    let cancel_url = crate::config::get_dynamic_config_value(
        pool, "stripe_cancel_url", &app_state.config.stripe_cancel_url,
    ).await;

    let form: Vec<(String, String)> = vec![
        ("mode".to_string(), "payment".to_string()),
        ("success_url".to_string(), success_url),
        ("cancel_url".to_string(), cancel_url),
        (
            "line_items[0][price_data][currency]".to_string(),
            currency.clone(),
        ),
        (
            "line_items[0][price_data][product_data][name]".to_string(),
            "StreamCore Credits".to_string(),
        ),
        (
            "line_items[0][price_data][unit_amount]".to_string(),
            unit_amount_cents.to_string(),
        ),
        ("line_items[0][quantity]".to_string(), qty.to_string()),
        // Metadata for webhook reconciliation
        ("metadata[reseller_id]".to_string(), reseller_id.to_string()),
        (
            "metadata[reseller_username]".to_string(),
            claims.username.clone(),
        ),
        ("metadata[credits_qty]".to_string(), qty.to_string()),
        (
            "metadata[discount_percent]".to_string(),
            format!("{:.2}", discount_percent),
        ),
        (
            "metadata[unit_amount_cents]".to_string(),
            unit_amount_cents.to_string(),
        ),
        ("metadata[currency]".to_string(), currency.clone()),
    ];

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .basic_auth(secret, Some("")) // Stripe accepts Basic with secret as username
        .form(&form)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Stripe create session HTTP error: {}", e);
            AppError::InternalServerError
        })?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        tracing::error!("Stripe create session failed: HTTP {} - {}", status, text);
        return Err(AppError::InternalServerError);
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| {
        tracing::error!("Stripe create session JSON parse error: {}", e);
        AppError::InternalServerError
    })?;

    let session_id = json
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let url = json
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if session_id.is_empty() || url.is_empty() {
        tracing::error!("Stripe session missing id or url in response: {}", json);
        return Err(AppError::InternalServerError);
    }

    // Persist initial purchase record
    sqlx::query(
        r#"
        INSERT INTO billing.credit_purchases (
            reseller_id, session_id, quantity, unit_amount_cents,
            discount_percent, amount_total_cents, currency, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'created')
        "#,
    )
    .bind(reseller_id)
    .bind(&session_id)
    .bind(qty)
    .bind(unit_amount_cents)
    .bind(discount_percent)
    .bind(amount_total_cents)
    .bind(&currency)
    .execute(&app_state.database.pool)
    .await
    .map_err(|e| {
        tracing::error!("DB insert credit_purchases failed: {}", e);
        AppError::DatabaseError(e)
    })?;

    let out = CreateCheckoutSessionResponse {
        session_id,
        url,
        quantity: qty,
        unit_amount_cents,
        discount_percent,
        amount_total_cents,
        currency,
    };

    Ok(Json(out))
}

/**
POST /api/payments/stripe/webhook
- Verifies signature
- Processes checkout.session.completed to credit reseller and mark purchase completed
- Idempotent via credit_purchases.session_id UNIQUE and status check
*/
pub async fn stripe_webhook(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<serde_json::Value>)> {
    let payload = match std::str::from_utf8(&body) {
        Ok(s) => s,
        Err(_) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "invalid_payload_encoding" })),
            ));
        }
    };

    // Header key is case-insensitive; Stripe sends "Stripe-Signature"
    let sig_header = match headers
        .get("Stripe-Signature")
        .or_else(|| headers.get("stripe-signature"))
        .and_then(|h| h.to_str().ok())
    {
        Some(s) => s.to_string(),
        None => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "missing_signature" })),
            ));
        }
    };

    // Verify signature with endpoint secret — read from DB first
    let webhook_secret = crate::config::get_dynamic_config_value(
        &app_state.database.pool, "stripe_webhook_secret", &app_state.config.stripe_webhook_secret,
    ).await;
    if !verify_stripe_signature(
        payload,
        &sig_header,
        &webhook_secret,
    ) {
        tracing::warn!("Stripe webhook signature verification failed");
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "invalid_signature" })),
        ));
    }

    // Parse event
    let event: serde_json::Value = match serde_json::from_str(payload) {
        Ok(v) => v,
        Err(_) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "invalid_json" })),
            ));
        }
    };

    let event_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if event_type != "checkout.session.completed" {
        // Ack other events quietly
        return Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "received": true })),
        ));
    }

    // Extract metadata
    let obj = &event["data"]["object"];
    let session_id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let md = obj.get("metadata");
    let reseller_id = md
        .and_then(|m| m.get("reseller_id"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    let credits_qty = md
        .and_then(|m| m.get("credits_qty"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(0);
    let unit_amount_cents = md
        .and_then(|m| m.get("unit_amount_cents"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(0);
    let discount_percent = md
        .and_then(|m| m.get("discount_percent"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let currency = md
        .and_then(|m| m.get("currency"))
        .and_then(|v| v.as_str())
        .unwrap_or("usd")
        .to_string();

    if session_id.is_empty() || reseller_id <= 0 || credits_qty <= 0 {
        tracing::warn!("Webhook missing required metadata or invalid values");
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "invalid_metadata" })),
        ));
    }

    let total_cents = (unit_amount_cents as i64).saturating_mul(credits_qty as i64);
    let total_cents = match i32::try_from(total_cents) {
        Ok(val) => val,
        Err(_) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "amount_total_cents_too_large" })),
            ));
        }
    };

    // Atomic idempotent upsert + crediting inside a transaction to prevent
    // double-crediting when Stripe retries the webhook concurrently.
    let mut tx = app_state.database.pool.begin().await.map_err(|e| {
        tracing::error!("Failed to begin transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error" })),
        )
    })?;

    // Use INSERT ... ON CONFLICT DO UPDATE with a WHERE clause to atomically ensure 
    // it's only updated to 'completed' exactly once. If it's already completed, the WHERE 
    // clause fails and RETURNING yields nothing.
    let updated_record: Option<i64> = sqlx::query_scalar(
        r#"
        INSERT INTO billing.credit_purchases (
            reseller_id, session_id, quantity, unit_amount_cents, discount_percent, amount_total_cents, currency, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
        ON CONFLICT(session_id) DO UPDATE SET
            quantity = excluded.quantity,
            unit_amount_cents = excluded.unit_amount_cents,
            discount_percent = excluded.discount_percent,
            amount_total_cents = excluded.amount_total_cents,
            currency = excluded.currency,
            status = 'completed',
            updated_at = CURRENT_TIMESTAMP
        WHERE credit_purchases.status != 'completed'
        RETURNING id
        "#,
    )
    .bind(reseller_id)
    .bind(session_id)
    .bind(credits_qty)
    .bind(unit_amount_cents)
    .bind(discount_percent)
    .bind(total_cents)
    .bind(&currency)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("DB upsert credit_purchases failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error" })),
        )
    })?;

    if updated_record.is_none() {
        let _ = tx.rollback().await;
        // The record already existed and was already completed
        return Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "status": "already_processed" })),
        ));
    }

    // Add credits to reseller within the same transaction
    sqlx::query("UPDATE auth.users SET credits = COALESCE(credits, 0) + $1 WHERE id = $2")
        .bind(credits_qty as f64)
        .bind(reseller_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!("Failed to add credits after payment: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "credit_apply_failed" })),
            )
        })?;

    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit payment transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error" })),
        )
    })?;

    // Log activity
    let _ = app_state
        .activity_log_service
        .create_log(CreateActivityLogRequest {
            user_id: reseller_id,
            target_user_id: None,
            action_type: ActionType::CreditAssigned,
            description: format!(
                "Credits purchased: {} (Stripe session {})",
                credits_qty, session_id
            ),
            credits_amount: Some(credits_qty as f64),
            metadata: Some(serde_json::json!({
                "session_id": session_id,
                "unit_amount_cents": unit_amount_cents,
                "discount_percent": discount_percent,
                "amount_total_cents": total_cents,
                "currency": currency
            })),
        })
        .await;

    // Mirror the Stripe purchase into unified billing_transactions if not already present
    let stripe_bt_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM billing.billing_transactions WHERE source = 'stripe' AND reference = $1)",
    )
    .bind(session_id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(false);

    if !stripe_bt_exists {
        // created_by is unknown in webhook, leave NULL
        let _ = sqlx::query(
            r#"
            INSERT INTO billing.billing_transactions
                (reseller_id, source, method, reference, amount_cents, currency, credits_qty, status, notes, metadata, created_by)
            VALUES
                ($1, 'stripe', 'card', $2, $3, $4, $5, 'completed', NULL, NULL, NULL)
            "#,
        )
        .bind(reseller_id)
        .bind(session_id)
        .bind(total_cents)
        .bind(&currency)
        .bind(credits_qty)
        .execute(&app_state.database.pool)
        .await;
    }

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({ "status": "processed" })),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign_payload(payload: &str, timestamp: i64, secret: &str) -> String {
        type HmacSha256 = Hmac<Sha256>;
        let signed = format!("{}.{}", timestamp, payload);
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(signed.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    #[test]
    fn verify_stripe_signature_accepts_valid_signature() {
        let payload = r#"{"id":"evt_1","type":"checkout.session.completed"}"#;
        let secret = "whsec_test_secret";
        let ts = chrono::Utc::now().timestamp();
        let sig = sign_payload(payload, ts, secret);
        let header = format!("t={},v1={}", ts, sig);

        assert!(verify_stripe_signature(payload, &header, secret));
    }

    #[test]
    fn verify_stripe_signature_accepts_any_matching_v1_and_case_insensitive_hex() {
        let payload = r#"{"id":"evt_2"}"#;
        let secret = "whsec_test_secret";
        let ts = chrono::Utc::now().timestamp();
        let valid = sign_payload(payload, ts, secret).to_uppercase();
        let header = format!("t={},v1=deadbeef,v1={},foo=bar", ts, valid);

        assert!(verify_stripe_signature(payload, &header, secret));
    }

    #[test]
    fn verify_stripe_signature_rejects_invalid_signature() {
        let payload = r#"{"id":"evt_3"}"#;
        let secret = "whsec_test_secret";
        let ts = chrono::Utc::now().timestamp();
        let header = format!("t={},v1=not_a_valid_signature", ts);

        assert!(!verify_stripe_signature(payload, &header, secret));
    }

    #[test]
    fn verify_stripe_signature_rejects_out_of_tolerance_timestamp() {
        let payload = r#"{"id":"evt_4"}"#;
        let secret = "whsec_test_secret";
        let ts = chrono::Utc::now().timestamp() - 301;
        let sig = sign_payload(payload, ts, secret);
        let header = format!("t={},v1={}", ts, sig);

        assert!(!verify_stripe_signature(payload, &header, secret));
    }

    #[test]
    fn verify_stripe_signature_rejects_malformed_headers() {
        let payload = r#"{"id":"evt_5"}"#;
        let secret = "whsec_test_secret";

        assert!(!verify_stripe_signature(payload, "v1=abc", secret));
        assert!(!verify_stripe_signature(
            payload,
            "t=not_a_number,v1=abc",
            secret
        ));
        assert!(!verify_stripe_signature(payload, "", secret));
    }
}
