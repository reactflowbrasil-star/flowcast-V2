use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterApiKey {
    pub id: i64,
    pub key_name: String,
    pub key_prefix: String,
    pub key_hash: String,
    pub enabled: bool,
    pub created_by: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMasterApiKeyRequest {
    pub key_name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMasterApiKeyRequest {
    pub key_name: Option<String>,
    pub enabled: Option<bool>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MasterApiKeyResponse {
    pub id: i64,
    pub key_name: String,
    pub api_key_prefix: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>, // Solo se muestra al crear/actualizar (plain text transitorio)
    pub enabled: bool,
    pub created_by: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MasterApiKeyListResponse {
    pub id: i64,
    pub key_name: String,
    pub api_key_preview: String, // Corresponde al prefix
    pub enabled: bool,
    pub created_by: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub description: Option<String>,
}

impl From<MasterApiKey> for MasterApiKeyResponse {
    fn from(key: MasterApiKey) -> Self {
        Self {
            id: key.id,
            key_name: key.key_name,
            api_key_prefix: key.key_prefix,
            api_key: None, // Por omisión nunca se devuelve
            enabled: key.enabled,
            created_by: key.created_by,
            created_at: key.created_at,
            updated_at: key.updated_at,
            last_used_at: key.last_used_at,
            description: key.description,
        }
    }
}

impl From<MasterApiKey> for MasterApiKeyListResponse {
    fn from(key: MasterApiKey) -> Self {
        let api_key_preview = format!("{}*****************", key.key_prefix);

        Self {
            id: key.id,
            key_name: key.key_name,
            api_key_preview,
            enabled: key.enabled,
            created_by: key.created_by,
            created_at: key.created_at,
            updated_at: key.updated_at,
            last_used_at: key.last_used_at,
            description: key.description,
        }
    }
}
