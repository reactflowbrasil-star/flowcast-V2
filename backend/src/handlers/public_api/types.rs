use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct ApiKeyContext {
    pub key_id: i64,
    pub reseller_id: i64,
    pub permissions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ApiUserResponse {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub max_devices: i32,
    pub active: bool,
    pub expires_at: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub categories: Option<Vec<CategoryInfo>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CategoryInfo {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub category_type: String,
}

#[derive(Debug, Serialize)]
pub struct PaginationMeta {
    pub page: i64,
    pub limit: i64,
    pub total: i64,
    pub total_pages: i64,
    pub has_next: bool,
    pub has_prev: bool,
}

#[derive(Debug, Serialize)]
pub struct ApiUsersListResponse {
    pub users: Vec<ApiUserResponse>,
    pub total: i64,
    pub pagination: PaginationMeta,
}

#[derive(Debug, Deserialize)]
pub struct ListUsersQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
    pub search: Option<String>,
    pub status: Option<String>,     // active, inactive, expired, expiring
    pub expiring_days: Option<i64>, // users expiring within N days
    pub sort_by: Option<String>,    // created_at, expires_at, username
    pub sort_order: Option<String>, // asc, desc
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub max_devices: Option<i32>,
    pub duration_months: Option<i64>,
    pub duration_days: Option<i64>,
    pub category_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct ExtendUserRequest {
    pub duration_months: Option<i64>,
    pub duration_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserStatusRequest {
    pub active: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub email: Option<String>,
    pub password: Option<String>,
    pub max_devices: Option<i32>,
    pub active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: Option<String>, // if None, generate random password
}

#[derive(Debug, Serialize)]
pub struct ResetPasswordResponse {
    pub success: bool,
    pub new_password: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct CreditBalanceResponse {
    pub credits: f64,
}

#[derive(Debug, Deserialize)]
pub struct CalculateCostRequest {
    pub max_devices: i32,
    pub duration_months: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct CalculateCostResponse {
    pub cost: f64,
    pub current_balance: f64,
    pub sufficient: bool,
}
