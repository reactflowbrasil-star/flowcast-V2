use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ─── Package (admin-defined subscription package) ───

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Package {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub price_cents: i32,
    pub currency: String,
    pub billing_mode: String,     // 'recurring' | 'one_time'
    pub billing_interval: Option<String>, // 'month' | 'year' (for recurring)
    pub duration_days: Option<i32>,       // for one_time
    pub max_devices: i32,
    pub category_ids: serde_json::Value,  // JSONB array of category IDs
    pub features: Option<serde_json::Value>, // JSONB object of features
    pub stripe_price_id: Option<String>,
    pub badge_text: Option<String>,
    pub badge_color: Option<String>,
    pub active: bool,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PublicPackageResponse {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub price_cents: i32,
    pub currency: String,
    pub billing_mode: String,
    pub billing_interval: Option<String>,
    pub duration_days: Option<i32>,
    pub max_devices: i32,
    pub category_ids: serde_json::Value,
    pub features: Option<serde_json::Value>,
    pub badge_text: Option<String>,
    pub badge_color: Option<String>,
}

impl From<Package> for PublicPackageResponse {
    fn from(p: Package) -> Self {
        Self {
            id: p.id,
            name: p.name,
            description: p.description,
            price_cents: p.price_cents,
            currency: p.currency,
            billing_mode: p.billing_mode,
            billing_interval: p.billing_interval,
            duration_days: p.duration_days,
            max_devices: p.max_devices,
            category_ids: p.category_ids,
            features: p.features,
            badge_text: p.badge_text,
            badge_color: p.badge_color,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreatePackageRequest {
    pub name: String,
    pub description: Option<String>,
    pub price_cents: i32,
    pub currency: Option<String>,         // default: "usd"
    pub billing_mode: String,             // "recurring" | "one_time"
    pub billing_interval: Option<String>, // "month" | "year"
    pub duration_days: Option<i32>,       // for one_time only
    pub max_devices: Option<i32>,         // default: 1
    pub category_ids: Vec<i64>,
    pub features: Option<serde_json::Value>,
    pub stripe_price_id: Option<String>,
    pub badge_text: Option<String>,
    pub badge_color: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePackageRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub price_cents: Option<i32>,
    pub currency: Option<String>,
    pub billing_mode: Option<String>,
    pub billing_interval: Option<String>,
    pub duration_days: Option<i32>,
    pub max_devices: Option<i32>,
    pub category_ids: Option<Vec<i64>>,
    pub features: Option<serde_json::Value>,
    pub stripe_price_id: Option<String>,
    pub badge_text: Option<String>,
    pub badge_color: Option<String>,
    pub active: Option<bool>,
    pub sort_order: Option<i32>,
}

// ─── Direct Subscription (end-user Stripe subscription) ───

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DirectSubscription {
    pub id: i64,
    pub user_id: i64,
    pub package_id: i64,
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    pub stripe_session_id: Option<String>,
    pub status: String, // pending | active | past_due | canceled | expired
    pub current_period_start: Option<DateTime<Utc>>,
    pub current_period_end: Option<DateTime<Utc>>,
    pub cancel_at_period_end: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SubscriptionStatusResponse {
    pub subscription: Option<DirectSubscription>,
    pub package: Option<PublicPackageResponse>,
    pub subscription_source: Option<String>,
}

// ─── End User Registration ───

#[derive(Debug, Deserialize)]
pub struct RegisterDirectUserRequest {
    pub username: String,
    pub password: String,
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct SubscribeRequest {
    pub package_id: i64,
}

#[derive(Debug, Serialize)]
pub struct CheckoutResponse {
    pub url: String,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
pub struct CheckEmailRequest {
    pub email: String,
}

// ─── Admin subscription stats ───

#[derive(Debug, Serialize)]
pub struct DirectSubscriptionStats {
    pub total_active: i64,
    pub total_canceled: i64,
    pub total_expired: i64,
    pub total_revenue_cents: i64,
    pub new_this_month: i64,
}

#[allow(dead_code)]
#[derive(Debug, Serialize)]
pub struct DirectSubscriptionWithUser {
    pub subscription: DirectSubscription,
    pub username: String,
    pub email: Option<String>,
    pub package_name: String,
}
