use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, Pool, Postgres, Row};

use crate::error::AppError;

/// Permission definition with metadata for the API key system.
/// Permissions are stored as strings to allow easy extension without code changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
}

/// Registry of available permissions. This can be extended by adding new entries.
/// In the future, this could be loaded from database or config file.
pub struct PermissionRegistry;

impl PermissionRegistry {
    /// Get all available permissions. Add new permissions here as needed.
    pub fn all() -> Vec<PermissionDefinition> {
        vec![
            // User management permissions
            PermissionDefinition {
                id: "users:read".to_string(),
                name: "Read Users".to_string(),
                description: "List and view user details".to_string(),
                category: "Users".to_string(),
            },
            PermissionDefinition {
                id: "users:create".to_string(),
                name: "Create Users".to_string(),
                description: "Create new users (deducts credits)".to_string(),
                category: "Users".to_string(),
            },
            PermissionDefinition {
                id: "users:update".to_string(),
                name: "Update auth.users".to_string(),
                description: "Update user status and settings".to_string(),
                category: "Users".to_string(),
            },
            PermissionDefinition {
                id: "users:extend".to_string(),
                name: "Extend Subscriptions".to_string(),
                description: "Extend user subscription duration (deducts credits)".to_string(),
                category: "Users".to_string(),
            },
            PermissionDefinition {
                id: "users:delete".to_string(),
                name: "Delete Users".to_string(),
                description: "Delete users permanently".to_string(),
                category: "Users".to_string(),
            },
            PermissionDefinition {
                id: "users:categories".to_string(),
                name: "Manage User Categories".to_string(),
                description: "Update content categories assigned to users".to_string(),
                category: "Users".to_string(),
            },
            // Credit permissions
            PermissionDefinition {
                id: "credits:read".to_string(),
                name: "Read Credits".to_string(),
                description: "View credit balance and calculate costs".to_string(),
                category: "Credits".to_string(),
            },
            // Category permissions
            PermissionDefinition {
                id: "categories:read".to_string(),
                name: "Read Categories".to_string(),
                description: "List available content categories".to_string(),
                category: "Content".to_string(),
            },
            // Demo permissions
            PermissionDefinition {
                id: "demos:read".to_string(),
                name: "Read Demos".to_string(),
                description: "List demo users".to_string(),
                category: "Demos".to_string(),
            },
            PermissionDefinition {
                id: "demos:create".to_string(),
                name: "Create Demos".to_string(),
                description: "Create demo users (free, limited time)".to_string(),
                category: "Demos".to_string(),
            },
            PermissionDefinition {
                id: "demos:delete".to_string(),
                name: "Delete Demos".to_string(),
                description: "Delete demo users".to_string(),
                category: "Demos".to_string(),
            },
        ]
    }

    /// Check if a permission ID is valid
    pub fn is_valid(permission_id: &str) -> bool {
        Self::all().iter().any(|p| p.id == permission_id)
    }

    /// Get permission IDs only
    pub fn all_ids() -> Vec<String> {
        Self::all().iter().map(|p| p.id.clone()).collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ResellerApiKey {
    pub id: i64,
    pub reseller_id: i64,
    pub key_name: String,
    #[sqlx(skip)]
    #[serde(skip_serializing)]
    pub api_key_hash: String,
    pub api_key_prefix: String,
    pub permissions: String,
    pub allowed_origins: Option<String>,
    pub ip_whitelist: Option<String>,
    pub rate_limit_per_minute: i32,
    pub rate_limit_per_day: i32,
    pub is_active: bool,
    pub last_used_at: Option<DateTime<Utc>>,
    pub total_requests: i64,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResellerApiKeyResponse {
    pub id: i64,
    pub reseller_id: i64,
    pub key_name: String,
    pub api_key_prefix: String,
    pub permissions: Vec<String>,
    pub allowed_origins: String,
    pub ip_whitelist: Option<Vec<String>>,
    pub rate_limit_per_minute: i32,
    pub rate_limit_per_day: i32,
    pub is_active: bool,
    pub last_used_at: Option<DateTime<Utc>>,
    pub total_requests: i64,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

impl From<ResellerApiKey> for ResellerApiKeyResponse {
    fn from(key: ResellerApiKey) -> Self {
        let permissions: Vec<String> = serde_json::from_str(&key.permissions).unwrap_or_default();
        let ip_whitelist: Option<Vec<String>> = key
            .ip_whitelist
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        Self {
            id: key.id,
            reseller_id: key.reseller_id,
            key_name: key.key_name,
            api_key_prefix: key.api_key_prefix,
            permissions,
            allowed_origins: key.allowed_origins.unwrap_or_else(|| "*".to_string()),
            ip_whitelist,
            rate_limit_per_minute: key.rate_limit_per_minute,
            rate_limit_per_day: key.rate_limit_per_day,
            is_active: key.is_active,
            last_used_at: key.last_used_at,
            total_requests: key.total_requests,
            created_at: key.created_at,
            expires_at: key.expires_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateApiKeyRequest {
    pub key_name: String,
    pub permissions: Vec<String>,
    #[serde(default = "default_allowed_origins")]
    pub allowed_origins: String,
    pub ip_whitelist: Option<Vec<String>>,
    #[serde(default = "default_rate_limit_minute")]
    pub rate_limit_per_minute: i32,
    #[serde(default = "default_rate_limit_day")]
    pub rate_limit_per_day: i32,
    pub expires_at: Option<DateTime<Utc>>,
}

fn default_allowed_origins() -> String {
    "*".to_string()
}

fn default_rate_limit_minute() -> i32 {
    60
}

fn default_rate_limit_day() -> i32 {
    10000
}

fn normalize_allowed_origins(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(
            "allowed_origins cannot be empty".to_string(),
        ));
    }

    if trimmed == "*" {
        return Ok("*".to_string());
    }

    if let Ok(list) = serde_json::from_str::<Vec<String>>(trimmed) {
        let cleaned: Vec<String> = list
            .into_iter()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .collect();
        if cleaned.is_empty() {
            return Err(AppError::BadRequest(
                "allowed_origins must contain at least one origin".to_string(),
            ));
        }
        return serde_json::to_string(&cleaned)
            .map_err(|_| AppError::BadRequest("Invalid allowed_origins".to_string()));
    }

    let cleaned: Vec<String> = trimmed
        .split(',')
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();

    if cleaned.is_empty() {
        return Err(AppError::BadRequest(
            "allowed_origins must contain at least one origin".to_string(),
        ));
    }

    serde_json::to_string(&cleaned)
        .map_err(|_| AppError::BadRequest("Invalid allowed_origins".to_string()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateApiKeyRequest {
    pub key_name: Option<String>,
    pub permissions: Option<Vec<String>>,
    pub allowed_origins: Option<String>,
    pub ip_whitelist: Option<Vec<String>>,
    pub rate_limit_per_minute: Option<i32>,
    pub rate_limit_per_day: Option<i32>,
    pub is_active: Option<bool>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateApiKeyResponse {
    pub api_key: ResellerApiKeyResponse,
    pub secret_key: String,
}

#[derive(Debug, Clone)]
pub struct ValidatedApiKey {
    pub id: i64,
    pub reseller_id: i64,
    pub permissions: Vec<String>,
    pub allowed_origins: String,
    pub ip_whitelist: Option<Vec<String>>,
    pub rate_limit_per_minute: i32,
    pub rate_limit_per_day: i32,
}

pub struct ResellerApiKeyService {
    pool: Pool<Postgres>,
}

/// Parameters for recording a single API key usage event.
pub struct ApiKeyUsageRecord<'a> {
    pub key_id: i64,
    pub endpoint: &'a str,
    pub method: &'a str,
    pub status_code: i32,
    pub ip: Option<&'a str>,
    pub user_agent: Option<&'a str>,
    pub response_time_ms: Option<i64>,
}

impl ResellerApiKeyService {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }

    pub fn generate_api_key() -> (String, String, String) {
        let mut rng = rand::thread_rng();
        let random_bytes: [u8; 32] = rng.gen();
        let key_suffix = URL_SAFE_NO_PAD.encode(random_bytes);
        let full_key = format!("sk_live_{}", key_suffix);
        let prefix = format!("sk_live_{}...", &key_suffix[..8]);

        let mut hasher = Sha256::new();
        hasher.update(full_key.as_bytes());
        let hash = hex::encode(hasher.finalize());

        (full_key, prefix, hash)
    }

    pub fn hash_api_key(key: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(key.as_bytes());
        hex::encode(hasher.finalize())
    }

    pub async fn create_api_key(
        &self,
        reseller_id: i64,
        request: CreateApiKeyRequest,
    ) -> Result<CreateApiKeyResponse, AppError> {
        // Validate permissions
        for perm in &request.permissions {
            if !PermissionRegistry::is_valid(perm) {
                return Err(AppError::BadRequest(format!(
                    "Invalid permission: {}",
                    perm
                )));
            }
        }

        let allowed_origins = normalize_allowed_origins(&request.allowed_origins)?;

        // Generate the API key
        let (secret_key, prefix, hash) = Self::generate_api_key();

        let permissions_json = serde_json::to_string(&request.permissions)
            .map_err(|_| AppError::InternalServerError)?;

        let ip_whitelist_json = request
            .ip_whitelist
            .as_ref()
            .map(|ips| serde_json::to_string(ips).unwrap_or_else(|_| "[]".to_string()));

        let row = sqlx::query(
            r#"
            INSERT INTO auth.reseller_api_keys (
                reseller_id, key_name, api_key_hash, api_key_prefix,
                permissions, allowed_origins, ip_whitelist,
                rate_limit_per_minute, rate_limit_per_day, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
            "#,
        )
        .bind(reseller_id)
        .bind(&request.key_name)
        .bind(&hash)
        .bind(&prefix)
        .bind(&permissions_json)
        .bind(&allowed_origins)
        .bind(&ip_whitelist_json)
        .bind(request.rate_limit_per_minute)
        .bind(request.rate_limit_per_day)
        .bind(request.expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to create API key: {}", e);
            AppError::DatabaseError(e)
        })?;

        let api_key_id: i64 = row.get("id");

        // Fetch the created key
        let api_key = self.get_api_key_by_id(reseller_id, api_key_id).await?;

        Ok(CreateApiKeyResponse {
            api_key: api_key.into(),
            secret_key,
        })
    }

    pub async fn list_api_keys(
        &self,
        reseller_id: i64,
    ) -> Result<Vec<ResellerApiKeyResponse>, AppError> {
        let keys: Vec<ResellerApiKey> = sqlx::query_as(
            r#"
            SELECT id, reseller_id, key_name, api_key_hash, api_key_prefix,
                   permissions, allowed_origins, ip_whitelist,
                   rate_limit_per_minute, rate_limit_per_day, is_active,
                   last_used_at, total_requests, created_at, expires_at
            FROM auth.reseller_api_keys
            WHERE reseller_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(reseller_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to list API keys: {}", e);
            AppError::DatabaseError(e)
        })?;

        Ok(keys.into_iter().map(|k| k.into()).collect())
    }

    pub async fn get_api_key_by_id(
        &self,
        reseller_id: i64,
        key_id: i64,
    ) -> Result<ResellerApiKey, AppError> {
        sqlx::query_as(
            r#"
            SELECT id, reseller_id, key_name, api_key_hash, api_key_prefix,
                   permissions, allowed_origins, ip_whitelist,
                   rate_limit_per_minute, rate_limit_per_day, is_active,
                   last_used_at, total_requests, created_at, expires_at
            FROM auth.reseller_api_keys
            WHERE id = $1 AND reseller_id = $2
            "#,
        )
        .bind(key_id)
        .bind(reseller_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get API key: {}", e);
            AppError::DatabaseError(e)
        })?
        .ok_or(AppError::NotFound)
    }

    pub async fn update_api_key(
        &self,
        reseller_id: i64,
        key_id: i64,
        request: UpdateApiKeyRequest,
    ) -> Result<ResellerApiKeyResponse, AppError> {
        // First verify the key belongs to this reseller
        let existing = self.get_api_key_by_id(reseller_id, key_id).await?;

        // Build update query dynamically
        let key_name = request.key_name.unwrap_or(existing.key_name);
        let permissions = request
            .permissions
            .map(|p| serde_json::to_string(&p).unwrap_or_else(|_| existing.permissions.clone()))
            .unwrap_or(existing.permissions);
        let allowed_origins = match request.allowed_origins {
            Some(ref raw) => Some(normalize_allowed_origins(raw)?),
            None => existing.allowed_origins,
        };
        let ip_whitelist = request
            .ip_whitelist
            .map(|ips| serde_json::to_string(&ips).ok())
            .unwrap_or(existing.ip_whitelist.map(|s| s.to_string()));
        let rate_limit_per_minute = request
            .rate_limit_per_minute
            .unwrap_or(existing.rate_limit_per_minute);
        let rate_limit_per_day = request
            .rate_limit_per_day
            .unwrap_or(existing.rate_limit_per_day);
        let is_active = request.is_active.unwrap_or(existing.is_active);
        let expires_at = request.expires_at.or(existing.expires_at);

        sqlx::query(
            r#"
            UPDATE auth.reseller_api_keys
            SET key_name = $1, permissions = $2, allowed_origins = $3,
                ip_whitelist = $4, rate_limit_per_minute = $5, rate_limit_per_day = $6,
                is_active = $7, expires_at = $8
            WHERE id = $9 AND reseller_id = $10
            "#,
        )
        .bind(&key_name)
        .bind(&permissions)
        .bind(&allowed_origins)
        .bind(&ip_whitelist)
        .bind(rate_limit_per_minute)
        .bind(rate_limit_per_day)
        .bind(is_active)
        .bind(expires_at)
        .bind(key_id)
        .bind(reseller_id)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update API key: {}", e);
            AppError::DatabaseError(e)
        })?;

        let updated = self.get_api_key_by_id(reseller_id, key_id).await?;
        Ok(updated.into())
    }

    pub async fn delete_api_key(&self, reseller_id: i64, key_id: i64) -> Result<(), AppError> {
        let result =
            sqlx::query("DELETE FROM auth.reseller_api_keys WHERE id = $1 AND reseller_id = $2")
                .bind(key_id)
                .bind(reseller_id)
                .execute(&self.pool)
                .await
                .map_err(|e| {
                    tracing::error!("Failed to delete API key: {}", e);
                    AppError::DatabaseError(e)
                })?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }

        Ok(())
    }

    pub async fn regenerate_api_key(
        &self,
        reseller_id: i64,
        key_id: i64,
    ) -> Result<CreateApiKeyResponse, AppError> {
        // Verify the key exists and belongs to reseller
        let existing = self.get_api_key_by_id(reseller_id, key_id).await?;

        // Generate new key
        let (secret_key, prefix, hash) = Self::generate_api_key();

        sqlx::query(
            r#"
            UPDATE auth.reseller_api_keys
            SET api_key_hash = $1, api_key_prefix = $2, total_requests = 0, last_used_at = NULL
            WHERE id = $3 AND reseller_id = $4
            "#,
        )
        .bind(&hash)
        .bind(&prefix)
        .bind(key_id)
        .bind(reseller_id)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to regenerate API key: {}", e);
            AppError::DatabaseError(e)
        })?;

        let mut updated = existing;
        updated.api_key_prefix = prefix;
        updated.total_requests = 0;
        updated.last_used_at = None;

        Ok(CreateApiKeyResponse {
            api_key: updated.into(),
            secret_key,
        })
    }

    pub async fn validate_api_key(&self, api_key: &str) -> Result<ValidatedApiKey, AppError> {
        let hash = Self::hash_api_key(api_key);

        let key: ResellerApiKey = sqlx::query_as(
            r#"
            SELECT id, reseller_id, key_name, api_key_hash, api_key_prefix,
                   permissions, allowed_origins, ip_whitelist,
                   rate_limit_per_minute, rate_limit_per_day, is_active,
                   last_used_at, total_requests, created_at, expires_at
            FROM auth.reseller_api_keys
            WHERE api_key_hash = $1
            "#,
        )
        .bind(&hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to validate API key: {}", e);
            AppError::DatabaseError(e)
        })?
        .ok_or(AppError::AuthenticationFailed)?;

        // Check if key is active
        if !key.is_active {
            return Err(AppError::AuthenticationFailed);
        }

        // Check if key has expired
        if let Some(expires_at) = key.expires_at {
            if expires_at <= Utc::now() {
                return Err(AppError::AuthenticationFailed);
            }
        }

        // Verify reseller is still active
        let reseller_active: bool =
            sqlx::query_scalar("SELECT active FROM auth.users WHERE id = $1 AND role = 'reseller'")
                .bind(key.reseller_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(AppError::DatabaseError)?
                .unwrap_or(false);

        if !reseller_active {
            return Err(AppError::AccountInactive);
        }

        let permissions: Vec<String> = serde_json::from_str(&key.permissions).unwrap_or_default();
        let ip_whitelist: Option<Vec<String>> = key
            .ip_whitelist
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        Ok(ValidatedApiKey {
            id: key.id,
            reseller_id: key.reseller_id,
            permissions,
            allowed_origins: key.allowed_origins.unwrap_or_else(|| "*".to_string()),
            ip_whitelist,
            rate_limit_per_minute: key.rate_limit_per_minute,
            rate_limit_per_day: key.rate_limit_per_day,
        })
    }

    pub async fn record_api_key_usage(&self, key_id: i64) -> Result<(), AppError> {
        self.record_api_key_usage_detailed(ApiKeyUsageRecord {
            key_id,
            endpoint: "/",
            method: "UNKNOWN",
            status_code: 0,
            ip: None,
            user_agent: None,
            response_time_ms: None,
        })
        .await
    }

    pub async fn record_api_key_usage_detailed(
        &self,
        record: ApiKeyUsageRecord<'_>,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            INSERT INTO activity.reseller_api_key_usage (api_key_id, endpoint, method, status_code, ip_address, user_agent, response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(record.key_id)
        .bind(record.endpoint)
        .bind(record.method)
        .bind(record.status_code)
        .bind(record.ip)
        .bind(record.user_agent)
        .bind(record.response_time_ms)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to insert API key usage row: {}", e);
            AppError::DatabaseError(e)
        })?;

        // Update aggregate counters
        sqlx::query(
            r#"
            UPDATE auth.reseller_api_keys
            SET total_requests = total_requests + 1, last_used_at = CURRENT_TIMESTAMP
            WHERE id = $1
            "#,
        )
        .bind(record.key_id)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to record API key usage: {}", e);
            AppError::DatabaseError(e)
        })?;

        Ok(())
    }

    pub async fn check_rate_limit(
        &self,
        key_id: i64,
        rate_limit_per_minute: i32,
        rate_limit_per_day: i32,
        ip: Option<&str>,
    ) -> Result<bool, AppError> {
        let requests_last_minute: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM activity.reseller_api_key_usage
            WHERE api_key_id = $1
            AND request_timestamp > NOW() - INTERVAL '1 minute'
            "#,
        )
        .bind(key_id)
        .fetch_one(&self.pool)
        .await?;

        if requests_last_minute >= i64::from(rate_limit_per_minute) {
            return Ok(false);
        }

        if let Some(ip) = ip {
            let ip_requests_last_minute: i64 = sqlx::query_scalar(
                r#"
                SELECT COUNT(*) FROM activity.reseller_api_key_usage
                WHERE api_key_id = $1
                  AND ip_address = $2
                  AND request_timestamp > NOW() - INTERVAL '1 minute'
                "#,
            )
            .bind(key_id)
            .bind(ip)
            .fetch_one(&self.pool)
            .await?;

            if ip_requests_last_minute >= i64::from(rate_limit_per_minute) {
                return Ok(false);
            }
        }

        let requests_last_day: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM activity.reseller_api_key_usage
            WHERE api_key_id = $1
            AND request_timestamp > NOW() - INTERVAL '1 day'
            "#,
        )
        .bind(key_id)
        .fetch_one(&self.pool)
        .await?;

        if requests_last_day >= i64::from(rate_limit_per_day) {
            return Ok(false);
        }

        if let Some(ip) = ip {
            let ip_requests_last_day: i64 = sqlx::query_scalar(
                r#"
                SELECT COUNT(*) FROM activity.reseller_api_key_usage
                WHERE api_key_id = $1
                  AND ip_address = $2
                  AND request_timestamp > NOW() - INTERVAL '1 day'
                "#,
            )
            .bind(key_id)
            .bind(ip)
            .fetch_one(&self.pool)
            .await?;

            if ip_requests_last_day >= i64::from(rate_limit_per_day) {
                return Ok(false);
            }
        }

        Ok(true)
    }
}
