use crate::{
    error::AppError,
    models::master_api_key::{
        CreateMasterApiKeyRequest, MasterApiKey, MasterApiKeyListResponse, MasterApiKeyResponse,
        UpdateMasterApiKeyRequest,
    },
};
use chrono::Utc;
use rand::Rng;
use sqlx::{PgPool, Row};
use tracing::{info, warn};

pub struct MasterApiKeyService {
    pool: PgPool,
}

impl MasterApiKeyService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Generate a secure random API key with a prefix
    fn generate_api_key() -> String {
        const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let mut rng = rand::thread_rng();

        let random_part: String = (0..48)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect();
        
        format!("sk_live_{}", random_part)
    }

    /// Create a new Master API Key
    pub async fn create_master_api_key(
        &self,
        request: CreateMasterApiKeyRequest,
        created_by: i64,
    ) -> Result<MasterApiKeyResponse, AppError> {
        let api_key = Self::generate_api_key();
        let key_prefix = api_key[..16].to_string();
        let key_hash = bcrypt::hash(&api_key, bcrypt::DEFAULT_COST)
            .map_err(|_| AppError::InternalServerError)?;
        let now = Utc::now();

        let row = sqlx::query(
            r#"
            INSERT INTO auth.master_api_keys (key_name, key_prefix, key_hash, enabled, created_by, created_at, updated_at, description)
            VALUES ($1, $2, $3, true, $4, $5, $6, $7)
            RETURNING id
            "#,
        )
        .bind(&request.key_name)
        .bind(&key_prefix)
        .bind(&key_hash)
        .bind(created_by)
        .bind(now)
        .bind(now)
        .bind(&request.description)
        .fetch_one(&self.pool)
        .await
        .map_err(AppError::DatabaseError)?;

        let id: i64 = row.get("id");

        let mut master_key: MasterApiKeyResponse = MasterApiKey {
            id,
            key_name: request.key_name,
            key_prefix,
            key_hash,
            enabled: true,
            created_by,
            created_at: now,
            updated_at: now,
            last_used_at: None,
            description: request.description,
        }.into();

        // Inject the plain text key only for this one-time creation response
        master_key.api_key = Some(api_key);

        info!(
            "Master API Key '{}' created by user {}",
            master_key.key_name, created_by
        );

        Ok(master_key)
    }

    /// Get all Master API Keys (with preview only)
    pub async fn get_master_api_keys(&self) -> Result<Vec<MasterApiKeyListResponse>, AppError> {
        let rows = sqlx::query(
            r#"
            SELECT id, key_name, key_prefix, key_hash, enabled, created_by,
                   created_at, updated_at, last_used_at, description
            FROM auth.master_api_keys
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(AppError::DatabaseError)?;

        let keys: Vec<MasterApiKey> = rows
            .into_iter()
            .map(|row| MasterApiKey {
                id: row.get("id"),
                key_name: row.get("key_name"),
                key_prefix: row.get("key_prefix"),
                key_hash: row.get("key_hash"),
                enabled: row.get("enabled"),
                created_by: row.get("created_by"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                last_used_at: row.get("last_used_at"),
                description: row.get("description"),
            })
            .collect();

        Ok(keys.into_iter().map(|k| k.into()).collect())
    }

    /// Get Master API Key by ID (full key shown)
    pub async fn get_master_api_key_by_id(
        &self,
        id: i64,
    ) -> Result<MasterApiKeyResponse, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, key_name, key_prefix, key_hash, enabled, created_by,
                   created_at, updated_at, last_used_at, description
            FROM auth.master_api_keys
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(AppError::DatabaseError)?
        .ok_or_else(|| AppError::NotFound)?;

        let key = MasterApiKey {
            id: row.get("id"),
            key_name: row.get("key_name"),
            key_prefix: row.get("key_prefix"),
            key_hash: row.get("key_hash"),
            enabled: row.get("enabled"),
            created_by: row.get("created_by"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            last_used_at: row.get("last_used_at"),
            description: row.get("description"),
        };

        Ok(key.into())
    }

    /// Update Master API Key
    pub async fn update_master_api_key(
        &self,
        id: i64,
        request: UpdateMasterApiKeyRequest,
    ) -> Result<MasterApiKeyResponse, AppError> {
        let now = Utc::now();

        // Update fields individually
        if let Some(key_name) = &request.key_name {
            sqlx::query("UPDATE auth.master_api_keys SET key_name = $1, updated_at = $2 WHERE id = $3")
                .bind(key_name)
                .bind(now)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(AppError::DatabaseError)?;
        }

        if let Some(enabled) = request.enabled {
            sqlx::query("UPDATE auth.master_api_keys SET enabled = $1, updated_at = $2 WHERE id = $3")
                .bind(enabled)
                .bind(now)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(AppError::DatabaseError)?;
        }

        if let Some(description) = &request.description {
            sqlx::query(
                "UPDATE auth.master_api_keys SET description = $1, updated_at = $2 WHERE id = $3",
            )
            .bind(description)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(AppError::DatabaseError)?;
        }

        // Always update the updated_at timestamp
        sqlx::query("UPDATE auth.master_api_keys SET updated_at = $1 WHERE id = $2")
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(AppError::DatabaseError)?;

        self.get_master_api_key_by_id(id).await
    }

    /// Delete Master API Key
    pub async fn delete_master_api_key(&self, id: i64) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM auth.master_api_keys WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(AppError::DatabaseError)?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }

        info!("Master API Key with ID {} deleted", id);
        Ok(())
    }

    /// Validate Master API Key and update last_used_at
    pub async fn validate_and_use_master_api_key(&self, api_key: &str) -> Result<bool, AppError> {
        if api_key.len() < 16 {
            return Ok(false);
        }

        let key_prefix = &api_key[..16];
        let now = Utc::now();

        // Check if key exists and is enabled
        let key = sqlx::query(
            r#"
            SELECT id, key_hash, enabled
            FROM auth.master_api_keys 
            WHERE key_prefix = $1 AND enabled = true
            "#,
        )
        .bind(key_prefix)
        .fetch_optional(&self.pool)
        .await
        .map_err(AppError::DatabaseError)?;

        if let Some(key_record) = key {
            let key_hash: String = key_record.get("key_hash");
            
            // Verify hash
            let is_valid = bcrypt::verify(api_key, &key_hash).unwrap_or(false);
            if !is_valid {
                return Ok(false);
            }

            let key_id: i64 = key_record.get("id");
            // Update last_used_at
            sqlx::query("UPDATE auth.master_api_keys SET last_used_at = $1 WHERE id = $2")
                .bind(now)
                .bind(key_id)
                .execute(&self.pool)
                .await
                .map_err(AppError::DatabaseError)?;

            warn!("SECURITY: Master API Key used (ID: {})", key_id);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Regenerate API key for existing Master API Key
    pub async fn regenerate_api_key(&self, id: i64) -> Result<MasterApiKeyResponse, AppError> {
        let new_api_key = Self::generate_api_key();
        let key_prefix = new_api_key[..16].to_string();
        let key_hash = bcrypt::hash(&new_api_key, bcrypt::DEFAULT_COST)
            .map_err(|_| AppError::InternalServerError)?;
        let now = Utc::now();

        sqlx::query("UPDATE auth.master_api_keys SET key_prefix = $1, key_hash = $2, updated_at = $3 WHERE id = $4")
            .bind(&key_prefix)
            .bind(&key_hash)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(AppError::DatabaseError)?;

        info!("Master API Key regenerated for ID {}", id);
        
        // Fetch the updated record
        let mut response = self.get_master_api_key_by_id(id).await?;
        // Inject plain text for this one-time response
        response.api_key = Some(new_api_key);
        Ok(response)
    }
}
