use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ActivityLog {
    pub id: i64,
    pub user_id: i64,
    pub target_user_id: Option<i64>,
    pub action_type: String,
    pub description: String,
    pub credits_amount: Option<f64>,
    pub metadata: Option<String>,
    pub created_at: DateTime<Utc>,
    pub created_by: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateActivityLogRequest {
    pub user_id: i64,
    pub target_user_id: Option<i64>,
    pub action_type: ActionType,
    pub description: String,
    pub credits_amount: Option<f64>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ActivityLogWithUsernames {
    pub id: i64,
    pub user_id: i64,
    pub user_username: String,
    pub target_user_id: Option<i64>,
    pub target_username: Option<String>,
    pub action_type: String,
    pub description: String,
    pub credits_amount: Option<f64>,
    pub metadata: Option<String>,
    pub created_at: DateTime<Utc>,
    pub created_by: i64,
    pub created_by_username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    // User management
    UserCreated,
    UserDeleted,
    UserActivated,
    UserDeactivated,
    UserUpdated,

    // Reseller management
    ResellerCreated,
    ResellerDeleted,
    ResellerUpdated,

    // Credit management
    CreditAssigned,
    CreditUsed,
    CreditRefunded,

    // Demo management
    DemoCreated,
    DemoExpired,
    DemoExtended,

    // Subscription management
    SubscriptionExtended,
    SubscriptionExpired,

    // System events
    SystemInit,
    Login,
    Logout,
    SecurityEvent,

    // Device management
    DeviceAdded,
    DeviceRemoved,
    DeviceLimitUpdated,

    // API Key management
    ApiKeyCreated,
    ApiKeyDeleted,
    ApiKeyRegenerated,
    ApiKeyUsed,
}

impl std::fmt::Display for ActionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let action_str = match self {
            ActionType::UserCreated => "USER_CREATED",
            ActionType::UserDeleted => "USER_DELETED",
            ActionType::UserActivated => "USER_ACTIVATED",
            ActionType::UserDeactivated => "USER_DEACTIVATED",
            ActionType::UserUpdated => "USER_UPDATED",
            ActionType::ResellerCreated => "RESELLER_CREATED",
            ActionType::ResellerDeleted => "RESELLER_DELETED",
            ActionType::ResellerUpdated => "RESELLER_UPDATED",
            ActionType::CreditAssigned => "CREDIT_ASSIGNED",
            ActionType::CreditUsed => "CREDIT_USED",
            ActionType::CreditRefunded => "CREDIT_REFUNDED",
            ActionType::DemoCreated => "DEMO_CREATED",
            ActionType::DemoExpired => "DEMO_EXPIRED",
            ActionType::DemoExtended => "DEMO_EXTENDED",
            ActionType::SubscriptionExtended => "SUBSCRIPTION_EXTENDED",
            ActionType::SubscriptionExpired => "SUBSCRIPTION_EXPIRED",
            ActionType::SystemInit => "SYSTEM_INIT",
            ActionType::Login => "LOGIN",
            ActionType::Logout => "LOGOUT",
            ActionType::SecurityEvent => "SECURITY_EVENT",
            ActionType::DeviceAdded => "DEVICE_ADDED",
            ActionType::DeviceRemoved => "DEVICE_REMOVED",
            ActionType::DeviceLimitUpdated => "DEVICE_LIMIT_UPDATED",
            ActionType::ApiKeyCreated => "API_KEY_CREATED",
            ActionType::ApiKeyDeleted => "API_KEY_DELETED",
            ActionType::ApiKeyRegenerated => "API_KEY_REGENERATED",
            ActionType::ApiKeyUsed => "API_KEY_USED",
        };
        write!(f, "{}", action_str)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLogFilters {
    pub action_type: Option<String>,
    pub user_id: Option<i64>,
    pub target_user_id: Option<i64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLogResponse {
    pub logs: Vec<ActivityLogWithUsernames>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}
