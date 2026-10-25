use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Gift code stored in DB
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GiftCode {
    pub id: i64,
    pub code: String,
    pub duration_days: i32, // stored internally as days (admin supplies months -> converted)
    pub uses_total: i32,
    pub uses_remaining: i32,
    pub expires_at: Option<DateTime<Utc>>,
    /// JSON array of category ids (nullable)
    pub allowed_categories: Option<String>,
    pub max_devices: Option<i32>,
    pub created_by: i64,
    pub created_at: DateTime<Utc>,
}

/// Redemption record
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GiftCodeRedemption {
    pub id: i64,
    pub gift_code_id: i64,
    pub redeemer_user_id: Option<i64>,
    pub redeemer_username: Option<String>,
    pub redeemer_email: Option<String>,
    pub redeemed_at: DateTime<Utc>,
    pub duration_days_granted: i32,
    pub granted_categories: Option<String>, // JSON snapshot
    pub granted_max_devices: Option<i32>,
}

/// Request for creating a single gift code
#[derive(Debug, Deserialize)]
pub struct CreateGiftCodeRequest {
    pub code: Option<String>, // optional custom code; if None, system generates
    pub duration_months: i64, // admin specifies months -> service converts to days
    pub uses_total: i64,      // 1 for single-use, >1 for multi-use
    pub expires_at: Option<DateTime<Utc>>,
    pub allowed_categories: Option<Vec<i64>>, // category ids
    pub max_devices: Option<i32>,
}

/// Bulk create request
#[derive(Debug, Deserialize)]
pub struct BulkCreateGiftCodesRequest {
    pub prefix: Option<String>, // optional prefix for codes
    pub count: i64,             // how many codes to create
    pub duration_months: i64,
    pub uses_total: i64,
    pub expires_at: Option<DateTime<Utc>>,
    pub allowed_categories: Option<Vec<i64>>,
    pub max_devices: Option<i32>,
}

/// Public redeem request (create account alternative is handled in handler)
#[derive(Debug, Deserialize)]
pub struct RedeemGiftCodeRequest {
    pub code: String,
    // optional: create_account handled by handler (username/password/email) - not duplicated here
}

/// Validation response for a gift code (used by public validate endpoint)
#[derive(Debug, Serialize)]
pub struct GiftCodeValidation {
    pub code: String,
    pub duration_days: i32,
    pub uses_remaining: i32,
    pub expires_at: Option<DateTime<Utc>>,
    pub allowed_categories: Option<Vec<i64>>,
    pub max_devices: Option<i32>,
}

/// Response for created code
#[derive(Debug, Serialize)]
pub struct GiftCodeResponse {
    pub id: i64,
    pub code: String,
    pub duration_days: i32,
    pub uses_total: i32,
    pub uses_remaining: i32,
    pub expires_at: Option<DateTime<Utc>>,
    pub allowed_categories: Option<Vec<i64>>,
    pub max_devices: Option<i32>,
    pub created_by: i64,
    pub created_at: DateTime<Utc>,
}
