use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SecurityIncident {
    pub id: i64,
    pub user_id: Option<i64>,
    pub username: String,
    pub incident_type: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub device_id: Option<String>,
    pub details: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SecurityBan {
    pub id: i64,
    pub user_id: Option<i64>,
    pub username: String,
    pub ban_type: String,
    pub ban_reason: String,
    pub ban_level: i32,
    pub banned_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub created_by: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSecurityIncidentRequest {
    pub user_id: Option<i64>,
    pub username: String,
    pub incident_type: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub device_id: Option<String>,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSecurityBanRequest {
    pub user_id: Option<i64>,
    pub username: String,
    pub ban_type: String,
    pub ban_reason: String,
    pub ban_level: i32,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_by: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SecurityFilters {
    pub incident_type: Option<String>,
    pub username: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct SecurityIncidentsResponse {
    pub incidents: Vec<SecurityIncident>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct SecurityBansResponse {
    pub bans: Vec<SecurityBan>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct SecurityStatsResponse {
    pub total_incidents: i64,
    pub incidents_today: i64,
    pub active_bans: i64,
    pub permanent_bans: i64,
    pub incidents_by_type: Vec<IncidentTypeCount>,
    pub recent_incidents: Vec<SecurityIncident>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct IncidentTypeCount {
    pub incident_type: String,
    pub count: i64,
}

#[derive(Debug, Deserialize)]
pub struct UnbanUserRequest {
    pub reason: String,
}

// Tipos de incidentes de seguridad
pub const INCIDENT_BRUTE_FORCE: &str = "BRUTE_FORCE";
pub const INCIDENT_SUSPICIOUS_ACTIVITY: &str = "SUSPICIOUS_ACTIVITY";
pub const INCIDENT_MULTIPLE_DEVICES: &str = "MULTIPLE_DEVICES";
pub const INCIDENT_TOKEN_MANIPULATION: &str = "TOKEN_MANIPULATION";

// Tipos de ban
pub const BAN_TYPE_TEMPORARY: &str = "TEMPORARY";
pub const BAN_TYPE_PERMANENT: &str = "PERMANENT";

// Niveles de ban
pub const BAN_LEVEL_FIRST: i32 = 1; // 20 minutos
pub const BAN_LEVEL_SECOND: i32 = 2; // 72 horas
pub const BAN_LEVEL_PERMANENT: i32 = 3; // Permanente
