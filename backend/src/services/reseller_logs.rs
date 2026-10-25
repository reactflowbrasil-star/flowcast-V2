use crate::error::AppError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres, Row};

#[derive(Debug, Serialize, Deserialize)]
pub struct ResellerLogEntry {
    pub id: i64,
    pub reseller_id: Option<i64>,
    pub reseller_username: String,
    pub end_user_username: String,
    pub end_user_email: Option<String>,
    pub credits_cost: f64,
    pub duration_months: i32,
    pub action: String,
    pub created_at: DateTime<Utc>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateResellerLogRequest {
    pub reseller_id: i64,
    pub reseller_username: String,
    pub end_user_username: String,
    pub end_user_email: Option<String>,
    pub credits_cost: f64,
    pub duration_months: i32,
    pub action: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Clone)]
pub struct ResellerLogsService {
    pool: Pool<Postgres>,
}

impl ResellerLogsService {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }

    /// Log the creation of an end-user by a reseller
    pub async fn log_end_user_creation(
        &self,
        request: CreateResellerLogRequest,
    ) -> Result<i64, AppError> {
        tracing::debug!(
            "🔍 Logging end-user creation - reseller: {}, user: {}, cost: {} credits",
            request.reseller_username,
            request.end_user_username,
            request.credits_cost
        );

        let row = sqlx::query(
            r#"
            INSERT INTO billing.reseller_logs (
                reseller_id, reseller_username, end_user_username, end_user_email,
                credits_cost, duration_months, action, ip_address, user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
            "#,
        )
        .bind(request.reseller_id)
        .bind(&request.reseller_username)
        .bind(&request.end_user_username)
        .bind(&request.end_user_email)
        .bind(request.credits_cost)
        .bind(request.duration_months)
        .bind(&request.action)
        .bind(&request.ip_address)
        .bind(&request.user_agent)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("❌ Failed to insert reseller log: {:?}", e);
            AppError::DatabaseError(e)
        })?;

        let log_id: i64 = row.get("id");
        tracing::debug!("✅ Reseller log created with ID: {}", log_id);

        Ok(log_id)
    }

    /// Log the deletion of an end-user by a reseller
    pub async fn log_end_user_deletion(
        &self,
        reseller_id: i64,
        reseller_username: String,
        end_user_username: String,
        ip_address: Option<String>,
        user_agent: Option<String>,
    ) -> Result<i64, AppError> {
        tracing::debug!(
            "🔍 Logging end-user deletion - reseller: {}, user: {}",
            reseller_username,
            end_user_username
        );

        let row = sqlx::query(
            r#"
            INSERT INTO billing.reseller_logs (
                reseller_id, reseller_username, end_user_username,
                credits_cost, duration_months, action, ip_address, user_agent
            )
            VALUES ($1, $2, $3, 0.0, 0, 'DELETE', $4, $5)
            RETURNING id
            "#,
        )
        .bind(reseller_id)
        .bind(&reseller_username)
        .bind(&end_user_username)
        .bind(&ip_address)
        .bind(&user_agent)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("❌ Failed to insert deletion log: {:?}", e);
            AppError::DatabaseError(e)
        })?;

        let log_id: i64 = row.get("id");
        tracing::debug!("✅ Deletion log created with ID: {}", log_id);

        Ok(log_id)
    }

    /// Get basic logs for a specific reseller (simplified version)
    pub async fn get_reseller_logs_simple(
        &self,
        _reseller_id: i64,
        _limit: Option<i32>,
    ) -> Result<Vec<ResellerLogEntry>, AppError> {
        // Return empty vector for now - will implement later
        Ok(Vec::new())
    }

    /// Get credit usage statistics for a reseller
    pub async fn get_reseller_credit_stats(
        &self,
        _reseller_id: i64,
    ) -> Result<serde_json::Value, AppError> {
        // Return basic stats for now - will implement properly later
        let result = serde_json::json!({
            "total_credits_spent": 0.0,
            "total_users_created": 0,
            "total_users_deleted": 0
        });

        Ok(result)
    }
}
