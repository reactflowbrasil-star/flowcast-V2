use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SupportTicket {
    pub id: i64,
    pub ticket_number: String,
    pub title: String,
    pub description: String,
    pub priority: TicketPriority,
    pub status: TicketStatus,
    pub category: TicketCategory,
    pub created_by: i64,
    pub assigned_to: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SupportTicketWithUsers {
    pub id: i64,
    pub ticket_number: String,
    pub title: String,
    pub description: String,
    pub priority: TicketPriority,
    pub status: TicketStatus,
    pub category: TicketCategory,
    pub created_by: i64,
    pub assigned_to: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub metadata: Option<String>,
    // User information
    pub creator_username: String,
    pub assignee_username: Option<String>,
    pub message_count: i64,
    pub last_message_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TicketMessage {
    pub id: i64,
    pub ticket_id: i64,
    pub user_id: i64,
    pub message: String,
    pub is_internal: bool,
    pub attachments: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TicketMessageWithUser {
    pub id: i64,
    pub ticket_id: i64,
    pub user_id: i64,
    pub message: String,
    pub is_internal: bool,
    pub attachments: Option<String>,
    pub created_at: DateTime<Utc>,
    pub username: String,
    pub user_role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
#[serde(rename_all = "lowercase")]
pub enum TicketPriority {
    #[sqlx(rename = "low")]
    Low,
    #[sqlx(rename = "medium")]
    Medium,
    #[sqlx(rename = "high")]
    High,
    #[sqlx(rename = "urgent")]
    Urgent,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum TicketStatus {
    #[sqlx(rename = "open")]
    Open,
    #[sqlx(rename = "in_progress")]
    InProgress,
    #[sqlx(rename = "waiting_response")]
    WaitingResponse,
    #[sqlx(rename = "resolved")]
    Resolved,
    #[sqlx(rename = "closed")]
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
#[serde(rename_all = "lowercase")]
pub enum TicketCategory {
    #[sqlx(rename = "technical")]
    Technical,
    #[sqlx(rename = "billing")]
    Billing,
    #[sqlx(rename = "account")]
    Account,
    #[sqlx(rename = "content")]
    Content,
    #[sqlx(rename = "other")]
    Other,
}

#[derive(Debug, Deserialize)]
pub struct CreateTicketRequest {
    pub title: String,
    pub description: String,
    pub priority: TicketPriority,
    pub category: TicketCategory,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAdminTicketRequest {
    pub title: String,
    pub description: String,
    pub priority: TicketPriority,
    pub category: TicketCategory,
    pub reseller_id: i64, // ID del reseller para quien se crea el ticket
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTicketRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<TicketPriority>,
    pub status: Option<TicketStatus>,
    pub category: Option<TicketCategory>,
    pub assigned_to: Option<i64>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMessageRequest {
    pub message: String,
    pub is_internal: Option<bool>,
    pub attachments: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct TicketFilters {
    pub status: Option<TicketStatus>,
    pub priority: Option<TicketPriority>,
    pub category: Option<TicketCategory>,
    pub created_by: Option<i64>,
    pub assigned_to: Option<i64>,
    pub search: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct TicketListResponse {
    pub tickets: Vec<SupportTicketWithUsers>,
    pub total: i64,
    pub page: u32,
    pub limit: u32,
    pub total_pages: u32,
}

#[derive(Debug, Serialize)]
pub struct TicketDetailResponse {
    pub ticket: SupportTicketWithUsers,
    pub messages: Vec<TicketMessageWithUser>,
}

impl TicketPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            TicketPriority::Low => "low",
            TicketPriority::Medium => "medium",
            TicketPriority::High => "high",
            TicketPriority::Urgent => "urgent",
        }
    }
}

impl TicketStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TicketStatus::Open => "open",
            TicketStatus::InProgress => "in_progress",
            TicketStatus::WaitingResponse => "waiting_response",
            TicketStatus::Resolved => "resolved",
            TicketStatus::Closed => "closed",
        }
    }
}

impl std::str::FromStr for TicketStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "open" => Ok(TicketStatus::Open),
            "in_progress" => Ok(TicketStatus::InProgress),
            "waiting_response" => Ok(TicketStatus::WaitingResponse),
            "resolved" => Ok(TicketStatus::Resolved),
            "closed" => Ok(TicketStatus::Closed),
            _ => Err(format!("Invalid ticket status: {}", s)),
        }
    }
}

impl TicketCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            TicketCategory::Technical => "technical",
            TicketCategory::Billing => "billing",
            TicketCategory::Account => "account",
            TicketCategory::Content => "content",
            TicketCategory::Other => "other",
        }
    }
}
