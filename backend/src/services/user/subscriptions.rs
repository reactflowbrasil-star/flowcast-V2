use crate::error::AppError;

use super::UserService;

impl UserService {
    /// Get user's subscribed categories
    pub async fn get_user_subscriptions(&self, user_id: i64) -> Result<Vec<i64>, AppError> {
        let category_ids = sqlx::query_scalar::<_, i64>(
            "SELECT category_id FROM billing.user_subscriptions WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_all(&self.db.pool)
        .await?;

        Ok(category_ids)
    }

    /// Set user's subscribed categories (replaces existing subscriptions)
    pub async fn set_user_subscriptions(
        &self,
        user_id: i64,
        category_ids: &[i64],
    ) -> Result<(), AppError> {
        tracing::debug!(
            "🔍 set_user_subscriptions called for user_id: {}, category_ids: {:?}",
            user_id,
            category_ids
        );

        let mut tx = self.db.pool.begin().await?;
        tracing::trace!(" Transaction started for user subscriptions");

        // Delete existing subscriptions
        tracing::debug!("🔍 Deleting existing subscriptions for user {}", user_id);
        let deleted_count = sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        tracing::debug!(
            "🔍 Deleted {} existing subscriptions",
            deleted_count.rows_affected()
        );

        // Insert new subscriptions
        tracing::debug!("🔍 Inserting {} new subscriptions", category_ids.len());
        for &category_id in category_ids {
            tracing::debug!("🔍 Inserting subscription for category_id: {}", category_id);
            sqlx::query(
                "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2)
                 ON CONFLICT (user_id, category_id) DO NOTHING",
            )
            .bind(user_id)
            .bind(category_id)
            .execute(&mut *tx)
            .await?;
        }
        tracing::trace!(" All subscriptions inserted successfully");

        tx.commit().await?;
        Ok(())
    }

    /// Add a subscription for a user
    pub async fn add_user_subscription(
        &self,
        user_id: i64,
        category_id: i64,
    ) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2)
             ON CONFLICT (user_id, category_id) DO NOTHING",
        )
        .bind(user_id)
        .bind(category_id)
        .execute(&self.db.pool)
        .await?;

        Ok(())
    }

    /// Remove a subscription for a user
    pub async fn remove_user_subscription(
        &self,
        user_id: i64,
        category_id: i64,
    ) -> Result<(), AppError> {
        sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1 AND category_id = $2")
            .bind(user_id)
            .bind(category_id)
            .execute(&self.db.pool)
            .await?;

        Ok(())
    }
}
