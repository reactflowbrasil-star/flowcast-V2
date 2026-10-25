use crate::database::Database;
use crate::error::AppError;
use crate::models::activity_log::{
    ActionType, ActivityLog, ActivityLogFilters, ActivityLogResponse, ActivityLogWithUsernames,
    CreateActivityLogRequest,
};

#[derive(Clone)]
pub struct ActivityLogService {
    pub db: Database,
}

impl ActivityLogService {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Create a new activity log entry
    pub async fn create_log(
        &self,
        request: CreateActivityLogRequest,
    ) -> Result<ActivityLog, AppError> {
        let metadata_json = match request.metadata {
            Some(meta) => Some(serde_json::to_string(&meta)?),
            None => None,
        };

        let log = sqlx::query_as::<_, ActivityLog>(
            r#"
            INSERT INTO activity.activity_logs (
                user_id, target_user_id, action_type, description, 
                credits_amount, metadata, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(request.user_id)
        .bind(request.target_user_id)
        .bind(request.action_type.to_string())
        .bind(request.description)
        .bind(request.credits_amount)
        .bind(metadata_json)
        .bind(request.user_id) // created_by is the same as user_id for now
        .fetch_one(&self.db.pool)
        .await?;

        Ok(log)
    }

    /// Get activity logs for admin (all logs)
    pub async fn get_admin_logs(
        &self,
        filters: ActivityLogFilters,
    ) -> Result<ActivityLogResponse, AppError> {
        let page = filters.page.unwrap_or(1);
        let limit = filters.limit.unwrap_or(50);
        let offset = (page - 1) * limit;

        // Use parameterized queries to prevent SQL injection
        // Build dynamic query with proper parameter binding
        let logs = sqlx::query_as::<_, ActivityLogWithUsernames>(
            r#"
            SELECT 
                al.id,
                al.user_id,
                COALESCE(u1.username, 'Unknown') as user_username,
                al.target_user_id,
                u2.username as target_username,
                al.action_type,
                al.description,
                al.credits_amount,
                al.metadata,
                al.created_at,
                al.created_by,
                COALESCE(u3.username, 'Unknown') as created_by_username
            FROM activity.activity_logs al
            LEFT JOIN auth.users u1 ON al.user_id = u1.id
            LEFT JOIN auth.users u2 ON al.target_user_id = u2.id
            LEFT JOIN auth.users u3 ON al.created_by = u3.id
            WHERE ($1::TEXT IS NULL OR al.action_type = $1)
              AND ($2::BIGINT IS NULL OR al.user_id = $2)
              AND ($3::BIGINT IS NULL OR al.target_user_id = $3)
              AND ($4::TEXT IS NULL OR al.created_at >= $4::TIMESTAMPTZ)
              AND ($5::TEXT IS NULL OR al.created_at <= $5::TIMESTAMPTZ)
            ORDER BY al.created_at DESC
            LIMIT $6 OFFSET $7
            "#,
        )
        .bind(filters.action_type.as_deref())
        .bind(filters.user_id)
        .bind(filters.target_user_id)
        .bind(filters.start_date.as_deref())
        .bind(filters.end_date.as_deref())
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db.pool)
        .await?;

        // Get total count with parameterized query
        let total: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM activity.activity_logs al
            WHERE ($1::TEXT IS NULL OR al.action_type = $1)
              AND ($2::BIGINT IS NULL OR al.user_id = $2)
              AND ($3::BIGINT IS NULL OR al.target_user_id = $3)
              AND ($4::TEXT IS NULL OR al.created_at >= $4::TIMESTAMPTZ)
              AND ($5::TEXT IS NULL OR al.created_at <= $5::TIMESTAMPTZ)
            "#,
        )
        .bind(filters.action_type.as_deref())
        .bind(filters.user_id)
        .bind(filters.target_user_id)
        .bind(filters.start_date.as_deref())
        .bind(filters.end_date.as_deref())
        .fetch_one(&self.db.pool)
        .await?;

        let total_pages = (total + limit - 1) / limit;

        Ok(ActivityLogResponse {
            logs,
            total,
            page,
            limit,
            total_pages,
        })
    }

    /// Get activity logs for reseller (only their related logs)
    pub async fn get_reseller_logs(
        &self,
        reseller_id: i64,
        filters: ActivityLogFilters,
    ) -> Result<ActivityLogResponse, AppError> {
        let page = filters.page.unwrap_or(1);
        let limit = filters.limit.unwrap_or(50);
        let offset = (page - 1) * limit;

        // Use parameterized queries to prevent SQL injection
        let logs = sqlx::query_as::<_, ActivityLogWithUsernames>(
            r#"
            SELECT
                al.id,
                al.user_id,
                COALESCE(u1.username, 'Unknown') as user_username,
                al.target_user_id,
                u2.username as target_username,
                al.action_type,
                al.description,
                al.credits_amount,
                al.metadata,
                al.created_at,
                al.created_by,
                COALESCE(u3.username, 'Unknown') as created_by_username
            FROM activity.activity_logs al
            LEFT JOIN auth.users u1 ON al.user_id = u1.id
            LEFT JOIN auth.users u2 ON al.target_user_id = u2.id
            LEFT JOIN auth.users u3 ON al.created_by = u3.id
            LEFT JOIN auth.users u4 ON al.user_id = u4.id
            LEFT JOIN auth.users u5 ON al.target_user_id = u5.id
            WHERE (
                al.user_id = $1 OR
                al.target_user_id = $1 OR
                al.created_by = $1 OR
                u4.created_by = $1 OR
                u5.created_by = $1
            )
              AND ($2::TEXT IS NULL OR al.action_type = $2)
              AND ($3::TEXT IS NULL OR al.created_at >= $3::TIMESTAMPTZ)
              AND ($4::TEXT IS NULL OR al.created_at <= $4::TIMESTAMPTZ)
            ORDER BY al.created_at DESC
            LIMIT $5 OFFSET $6
            "#,
        )
        .bind(reseller_id)
        .bind(filters.action_type.as_deref())
        .bind(filters.start_date.as_deref())
        .bind(filters.end_date.as_deref())
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.db.pool)
        .await?;

        // Get total count with parameterized query
        let total: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM activity.activity_logs al
            LEFT JOIN auth.users u4 ON al.user_id = u4.id
            LEFT JOIN auth.users u5 ON al.target_user_id = u5.id
            WHERE (
                al.user_id = $1 OR
                al.target_user_id = $1 OR
                al.created_by = $1 OR
                u4.created_by = $1 OR
                u5.created_by = $1
            )
              AND ($2::TEXT IS NULL OR al.action_type = $2)
              AND ($3::TEXT IS NULL OR al.created_at >= $3::TIMESTAMPTZ)
              AND ($4::TEXT IS NULL OR al.created_at <= $4::TIMESTAMPTZ)
            "#,
        )
        .bind(reseller_id)
        .bind(filters.action_type.as_deref())
        .bind(filters.start_date.as_deref())
        .bind(filters.end_date.as_deref())
        .fetch_one(&self.db.pool)
        .await?;

        let total_pages = (total + limit - 1) / limit;

        Ok(ActivityLogResponse {
            logs,
            total,
            page,
            limit,
            total_pages,
        })
    }

    /// Helper method to log user creation
    pub async fn log_user_created(
        &self,
        admin_id: i64,
        created_user_id: i64,
        username: &str,
    ) -> Result<(), AppError> {
        let request = CreateActivityLogRequest {
            user_id: admin_id,
            target_user_id: Some(created_user_id),
            action_type: ActionType::UserCreated,
            description: format!("User '{}' created", username),
            credits_amount: None,
            metadata: Some(serde_json::json!({
                "username": username,
                "created_user_id": created_user_id
            })),
        };

        self.create_log(request).await?;
        Ok(())
    }

    /// Helper method to log user creation with credit cost (for resellers)
    pub async fn log_user_created_with_credits(
        &self,
        creator_id: i64,
        created_user_id: i64,
        username: &str,
        credit_cost: f64,
        max_devices: i32,
        duration_months: f64,
    ) -> Result<(), AppError> {
        let request = CreateActivityLogRequest {
            user_id: creator_id,
            target_user_id: Some(created_user_id),
            action_type: ActionType::UserCreated,
            description: format!(
                "User '{}' created (Cost: {} credits, {} devices, {:.1} months)",
                username, credit_cost, max_devices, duration_months
            ),
            credits_amount: Some(credit_cost),
            metadata: Some(serde_json::json!({
                "username": username,
                "created_user_id": created_user_id,
                "credit_cost": credit_cost,
                "max_devices": max_devices,
                "duration_months": duration_months
            })),
        };

        self.create_log(request).await?;
        Ok(())
    }

    /// Helper method to log credit usage
    pub async fn log_credit_used(
        &self,
        user_id: i64,
        target_user_id: i64,
        amount: f64,
        reason: &str,
    ) -> Result<(), AppError> {
        let request = CreateActivityLogRequest {
            user_id,
            target_user_id: Some(target_user_id),
            action_type: ActionType::CreditUsed,
            description: format!("Credits used: {} - {}", amount, reason),
            credits_amount: Some(amount),
            metadata: Some(serde_json::json!({
                "reason": reason,
                "amount": amount
            })),
        };

        self.create_log(request).await?;
        Ok(())
    }

    /// Helper method to log reseller creation
    pub async fn log_reseller_created(
        &self,
        admin_id: i64,
        reseller_id: i64,
        username: &str,
        credits: f64,
    ) -> Result<(), AppError> {
        let request = CreateActivityLogRequest {
            user_id: admin_id,
            target_user_id: Some(reseller_id),
            action_type: ActionType::ResellerCreated,
            description: format!("Reseller '{}' created with {} credits", username, credits),
            credits_amount: Some(credits),
            metadata: Some(serde_json::json!({
                "username": username,
                "initial_credits": credits
            })),
        };

        self.create_log(request).await?;
        Ok(())
    }

    /// Helper method to log user login
    pub async fn log_user_login(&self, user_id: i64, username: &str) -> Result<(), AppError> {
        let request = CreateActivityLogRequest {
            user_id,
            target_user_id: None,
            action_type: ActionType::Login,
            description: format!("User '{}' logged in", username),
            credits_amount: None,
            metadata: Some(serde_json::json!({
                "username": username,
                "login_time": chrono::Utc::now().to_rfc3339()
            })),
        };

        self.create_log(request).await?;
        Ok(())
    }

    /// Helper method to log security events (like invalid app secret attempts)
    pub async fn log_security_event(
        &self,
        _event_type: &str,
        description: &str,
        metadata: &serde_json::Value,
    ) -> Result<(), AppError> {
        let request = CreateActivityLogRequest {
            user_id: 0, // Use 0 for system/security events
            target_user_id: None,
            action_type: ActionType::SecurityEvent,
            description: description.to_string(),
            credits_amount: None,
            metadata: Some(metadata.clone()),
        };

        self.create_log(request).await?;
        Ok(())
    }
}
