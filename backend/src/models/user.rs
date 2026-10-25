use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Admin,
    Reseller,
    EndUser,
    System, // Virtual role for Master API Keys
}

impl FromStr for UserRole {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "admin" => Ok(UserRole::Admin),
            "reseller" => Ok(UserRole::Reseller),
            "end_user" => Ok(UserRole::EndUser),
            "system" => Ok(UserRole::System),
            _ => Err(anyhow::anyhow!("Invalid user role: {}", s)),
        }
    }
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let role_str = match self {
            UserRole::Admin => "admin",
            UserRole::Reseller => "reseller",
            UserRole::EndUser => "end_user",
            UserRole::System => "system",
        };
        write!(f, "{}", role_str)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: i64,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub email: Option<String>,
    #[sqlx(try_from = "String")]
    pub role: UserRole,
    pub credits: Option<f64>,
    pub active: bool,
    pub created_by: Option<i64>,
    pub max_devices: i32,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    // Demo fields
    pub daily_demo_limit: Option<i32>,
    pub demos_created_today: Option<i32>,
    pub last_demo_reset_date: Option<chrono::NaiveDate>,
    pub is_demo: Option<bool>,
    pub demo_expires_at: Option<DateTime<Utc>>,
    // Direct subscription fields
    #[sqlx(default)]
    pub subscription_source: Option<String>, // 'reseller' | 'direct' | 'gift_code' | 'admin'
    #[sqlx(default)]
    pub email_verified: Option<bool>,
    #[sqlx(default)]
    pub email_verify_token: Option<String>,
    #[sqlx(default)]
    pub email_verify_expires: Option<DateTime<Utc>>,
    // Subscriptions (not stored in users table, loaded separately)
    #[serde(skip_serializing_if = "Option::is_none")]
    #[sqlx(skip)]
    pub subscribed_categories: Option<Vec<i64>>,
}

impl TryFrom<String> for UserRole {
    type Error = anyhow::Error;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.as_str().parse()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub role: UserRole,
    pub credits: Option<f64>,
    pub max_devices: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
    pub category_ids: Option<Vec<i64>>, // Categories the user has access to
    pub daily_demo_limit: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
    pub device_id: Option<String>,
    pub totp_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
    /// Internal session metadata (tier + coherence)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_meta: Option<crate::services::session_integrity::SessionMeta>,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub role: UserRole,
    pub credits: Option<f64>,
    pub active: bool,
    pub max_devices: i32,
    pub expires_at: Option<String>, // RFC3339 formatted string
    // Demo fields
    pub daily_demo_limit: Option<i32>,
    pub demos_created_today: Option<i32>,
    pub demos_remaining_today: Option<i32>,
    pub is_demo: Option<bool>,
    pub demo_expires_at: Option<String>, // RFC3339 formatted string
    // Direct subscription
    pub subscription_source: Option<String>,
    // Subscriptions
    pub subscribed_categories: Option<Vec<i64>>, // Category IDs the user has access to
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub email: Option<String>,
    pub active: Option<bool>,
    pub max_devices: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
    pub category_ids: Option<Vec<i64>>, // Categories the user has access to
}

#[derive(Debug, Serialize)]
pub struct CreditRates {
    pub default_connections: i32,
    pub base_cost: f64,
    pub extra_connection_cost: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConfigRequest {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDemoRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub category_ids: Option<Vec<i64>>, // Categories the demo user has access to
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateResellerDemoLimitRequest {
    pub daily_demo_limit: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserSubscription {
    pub id: i64,
    pub user_id: i64,
    pub category_id: i64,
    pub created_at: DateTime<Utc>,
}
