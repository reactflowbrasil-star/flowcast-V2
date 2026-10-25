use crate::error::AppError;
use crate::models::user::{
    CreateDemoRequest, UpdateResellerDemoLimitRequest, UpdateUserRequest, User, UserRole,
};
use tracing::info;

use super::UserService;

impl UserService {
    /// Create a demo user (reseller only)
    pub async fn create_demo_user(
        &self,
        reseller_id: i64,
        request: CreateDemoRequest,
    ) -> Result<User, AppError> {
        // Verify reseller permissions
        let reseller = self.get_user_by_id(reseller_id).await?;
        if reseller.role != UserRole::Reseller {
            return Err(AppError::Forbidden);
        }

        // Check and update daily demo limit
        self.check_and_update_demo_limit(reseller_id).await?;

        // Hash password
        let password_hash = self.auth_service.hash_password(&request.password)?;

        // Calculate demo expiration (2 hours from now)
        let demo_expires_at = chrono::Utc::now() + chrono::Duration::hours(2);

        // Create demo user
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO auth.users (username, email, password_hash, role, active, created_by, max_devices,
                             is_demo, demo_expires_at, expires_at)
            VALUES ($1, $2, $3, 'end_user', TRUE, $4, 3, TRUE, $5, $6)
            RETURNING *
            "#,
        )
        .bind(&request.username)
        .bind(&request.email)
        .bind(&password_hash)
        .bind(reseller_id)
        .bind(demo_expires_at)
        .bind(demo_expires_at) // Also set regular expiry to demo expiry
        .fetch_one(&self.db.pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                AppError::BadRequest("Username already exists".to_string())
            }
            _ => AppError::DatabaseError(e),
        })?;

        // Set user subscriptions if provided
        if let Some(category_ids) = &request.category_ids {
            if !category_ids.is_empty() {
                self.set_user_subscriptions(user.id, category_ids).await?;
            }
        } else {
            // If no categories specified, give access to all categories (backward compatibility)
            let all_categories = sqlx::query_scalar::<_, i64>("SELECT id FROM content.categories")
                .fetch_all(&self.db.pool)
                .await?;
            self.set_user_subscriptions(user.id, &all_categories)
                .await?;
        }

        Ok(user)
    }

    /// Check and update demo limit for reseller
    async fn check_and_update_demo_limit(&self, reseller_id: i64) -> Result<(), AppError> {
        let mut tx = self.db.pool.begin().await?;

        let reseller = sqlx::query_as::<_, User>("SELECT * FROM auth.users WHERE id = $1")
            .bind(reseller_id)
            .fetch_one(&mut *tx)
            .await?;

        let today = chrono::Utc::now().date_naive();
        let daily_limit = reseller.daily_demo_limit.unwrap_or(0);
        let mut demos_created_today = reseller.demos_created_today.unwrap_or(0);
        let last_reset_date = reseller.last_demo_reset_date;

        // Reset counter if it's a new day
        if last_reset_date != Some(today) {
            demos_created_today = 0;
        }

        // Check if limit is reached
        if demos_created_today >= daily_limit {
            tx.rollback().await?;
            return Err(AppError::BadRequest(format!(
                "Daily demo limit reached ({}/{}). Try again tomorrow.",
                demos_created_today, daily_limit
            )));
        }

        // Update counter
        sqlx::query(
            "UPDATE auth.users SET demos_created_today = $1, last_demo_reset_date = $2 WHERE id = $3",
        )
        .bind(demos_created_today + 1)
        .bind(today)
        .bind(reseller_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Update reseller demo limit (admin only)
    pub async fn update_reseller(
        &self,
        admin_id: i64,
        reseller_id: i64,
        request: UpdateUserRequest,
    ) -> Result<User, AppError> {
        // Verify admin permissions
        let admin = self.get_user_by_id(admin_id).await?;
        if !matches!(admin.role, UserRole::Admin | UserRole::System) {
            return Err(AppError::Forbidden);
        }

        // Verify target is a reseller
        let target_user = self.get_user_by_id(reseller_id).await?;
        if target_user.role != UserRole::Reseller {
            return Err(AppError::BadRequest(
                "Target user is not a reseller".to_string(),
            ));
        }

        // Update fields one by one
        if let Some(username) = request.username {
            sqlx::query("UPDATE auth.users SET username = $1 WHERE id = $2")
                .bind(username)
                .bind(reseller_id)
                .execute(&self.db.pool)
                .await?;
        }

        if let Some(email) = request.email {
            sqlx::query("UPDATE auth.users SET email = $1 WHERE id = $2")
                .bind(email)
                .bind(reseller_id)
                .execute(&self.db.pool)
                .await?;
        }

        if let Some(active) = request.active {
            sqlx::query("UPDATE auth.users SET active = $1 WHERE id = $2")
                .bind(active)
                .bind(reseller_id)
                .execute(&self.db.pool)
                .await?;
        }

        // Get updated user
        let updated_user = self.get_user_by_id(reseller_id).await?;

        info!("Admin {} updated reseller {}", admin_id, reseller_id);
        Ok(updated_user)
    }

    pub async fn update_reseller_demo_limit(
        &self,
        admin_id: i64,
        reseller_id: i64,
        request: UpdateResellerDemoLimitRequest,
    ) -> Result<User, AppError> {
        // Verify admin permissions
        self.verify_admin_permissions(admin_id).await?;

        // Verify target is a reseller
        let reseller = self.get_user_by_id(reseller_id).await?;
        if reseller.role != UserRole::Reseller {
            return Err(AppError::BadRequest(
                "Target user is not a reseller".to_string(),
            ));
        }

        // Update daily demo limit
        let user = sqlx::query_as::<_, User>(
            "UPDATE auth.users SET daily_demo_limit = $1 WHERE id = $2 RETURNING *",
        )
        .bind(request.daily_demo_limit)
        .bind(reseller_id)
        .fetch_one(&self.db.pool)
        .await?;

        Ok(user)
    }

    /// Get demo statistics for reseller
    pub async fn get_demo_stats(&self, reseller_id: i64) -> Result<serde_json::Value, AppError> {
        let reseller = self.get_user_by_id(reseller_id).await?;
        if reseller.role != UserRole::Reseller {
            return Err(AppError::Forbidden);
        }

        let today = chrono::Utc::now().date_naive();
        let daily_limit = reseller.daily_demo_limit.unwrap_or(0);
        let mut demos_created_today = reseller.demos_created_today.unwrap_or(0);
        let last_reset_date = reseller.last_demo_reset_date;

        // Reset counter if it's a new day - UPDATE DATABASE
        let needs_reset = last_reset_date != Some(today);
        if needs_reset {
            info!(
                "Resetting demo counter for reseller {} - new day detected",
                reseller_id
            );
            demos_created_today = 0;

            // Update the database with the reset values
            sqlx::query(
                "UPDATE auth.users SET demos_created_today = 0, last_demo_reset_date = $1 WHERE id = $2",
            )
            .bind(today)
            .bind(reseller_id)
            .execute(&self.db.pool)
            .await?;
        }

        let demos_remaining = (daily_limit - demos_created_today).max(0);

        // Get active demo users count
        let active_demos = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM auth.users WHERE created_by = $1 AND is_demo = TRUE AND demo_expires_at > $2"
        )
        .bind(reseller_id)
        .bind(chrono::Utc::now())
        .fetch_one(&self.db.pool)
        .await?;

        Ok(serde_json::json!({
            "daily_limit": daily_limit,
            "demos_created_today": demos_created_today,
            "demos_remaining_today": demos_remaining,
            "active_demos": active_demos,
            "last_reset_date": last_reset_date.map(|d| d.to_string()),
            "needs_reset": needs_reset
        }))
    }

    /// Clean up expired demo users (should be called periodically)
    pub async fn cleanup_expired_demos(&self) -> Result<i64, AppError> {
        let deleted_count =
            sqlx::query("DELETE FROM auth.users WHERE is_demo = TRUE AND demo_expires_at <= $1")
                .bind(chrono::Utc::now())
                .execute(&self.db.pool)
                .await?
                .rows_affected();

        Ok(deleted_count as i64)
    }

    /// Reset demo counters for all resellers if it's a new day
    pub async fn reset_daily_demo_counters(&self) -> Result<i64, AppError> {
        let today = chrono::Utc::now().date_naive();

        let updated_count = sqlx::query(
            "UPDATE auth.users SET demos_created_today = 0, last_demo_reset_date = $1 WHERE role = 'reseller' AND (last_demo_reset_date IS NULL OR last_demo_reset_date != $2)"
        )
        .bind(today)
        .bind(today)
        .execute(&self.db.pool)
        .await?
        .rows_affected();

        if updated_count > 0 {
            info!(
                "Reset demo counters for {} resellers (new day: {})",
                updated_count, today
            );
        }

        Ok(updated_count as i64)
    }
}
