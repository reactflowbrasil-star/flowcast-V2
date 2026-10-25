use crate::database::Database;
use crate::models::device::{Device, RegisterDeviceRequest};
use anyhow::Result;
use chrono::Utc;
use sqlx::Row;

#[derive(Debug, Clone)]
pub struct DeviceService {
    db: Database,
}

impl DeviceService {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Register a new device for a user
    /// Uses a transaction with FOR UPDATE lock to prevent race conditions
    pub async fn register_device(
        &self,
        user_id: i64,
        request: RegisterDeviceRequest,
    ) -> Result<()> {
        // Use a transaction to prevent race conditions
        let mut tx = self.db.pool.begin().await?;

        // Check if device is already registered for this user
        let existing_device =
            sqlx::query("SELECT id FROM auth.user_devices WHERE user_id = $1 AND device_id = $2")
                .bind(user_id)
                .bind(&request.device_id)
                .fetch_optional(&mut *tx)
                .await?;

        if existing_device.is_some() {
            // Update last_active if device already exists
            sqlx::query(
                "UPDATE auth.user_devices SET last_active = $1, device_name = $2 WHERE user_id = $3 AND device_id = $4"
            )
            .bind(Utc::now())
            .bind(&request.device_name)
            .bind(user_id)
            .bind(&request.device_id)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;
            return Ok(());
        }

        // Lock the user row and get max_devices atomically
        let user_row = sqlx::query("SELECT max_devices FROM auth.users WHERE id = $1 FOR UPDATE")
            .bind(user_id)
            .fetch_one(&mut *tx)
            .await?;

        let user_max_devices: i32 = user_row.get("max_devices");

        // Count current devices within the transaction
        let device_count_row =
            sqlx::query("SELECT COUNT(*) as count FROM auth.user_devices WHERE user_id = $1")
                .bind(user_id)
                .fetch_one(&mut *tx)
                .await?;

        let device_count: i64 = device_count_row.get("count");

        if device_count >= user_max_devices as i64 {
            tx.rollback().await?;
            return Err(anyhow::anyhow!(
                "Device limit exceeded. Maximum {} devices allowed.",
                user_max_devices
            ));
        }

        // Register new device
        sqlx::query(
            "INSERT INTO auth.user_devices (user_id, device_id, device_name, last_active, created_at) 
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(user_id)
        .bind(&request.device_id)
        .bind(&request.device_name)
        .bind(Utc::now())
        .bind(Utc::now())
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Get all active devices for a user
    pub async fn get_active_devices(&self, user_id: i64) -> Result<Vec<Device>> {
        let rows = sqlx::query(
            "SELECT id, user_id, device_id, device_name, last_active, created_at 
             FROM auth.user_devices 
             WHERE user_id = $1 
             ORDER BY last_active DESC",
        )
        .bind(user_id)
        .fetch_all(&self.db.pool)
        .await?;

        let devices = rows
            .into_iter()
            .map(|row| Device {
                id: row.get("id"),
                user_id: row.get("user_id"),
                device_id: row.get("device_id"),
                device_name: row.get("device_name"),
                last_active: row.get("last_active"),
                created_at: row.get("created_at"),
            })
            .collect();

        Ok(devices)
    }

    /// Remove a device for a user (without blacklisting)
    pub async fn remove_device(
        &self,
        user_id: i64,
        device_id: &str,
    ) -> Result<bool, crate::error::AppError> {
        let result = sqlx::query(
            "DELETE FROM auth.user_devices WHERE user_id = $1 AND (device_id = $2 OR id::text = $2)",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(&self.db.pool)
        .await
        .map_err(crate::error::AppError::DatabaseError)?;

        Ok(result.rows_affected() > 0)
    }

    /// Remove a device and blacklist it for immediate disconnection
    pub async fn remove_and_blacklist_device(
        &self,
        user_id: i64,
        device_id: &str,
    ) -> Result<bool, crate::error::AppError> {
        let result = sqlx::query(
            "DELETE FROM auth.user_devices WHERE user_id = $1 AND (device_id = $2 OR id::text = $2)",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(&self.db.pool)
        .await
        .map_err(crate::error::AppError::DatabaseError)?;

        let was_removed = result.rows_affected() > 0;

        // If device was removed, add it to the blacklist for immediate disconnection
        if was_removed {
            self.blacklist_device_token(user_id, device_id).await?;
        }

        Ok(was_removed)
    }

    /// Blacklist a device without removing it from active devices
    pub async fn blacklist_device(
        &self,
        user_id: i64,
        device_id: &str,
    ) -> Result<bool, crate::error::AppError> {
        // First check if device exists
        let device_exists =
            sqlx::query("SELECT 1 FROM auth.user_devices WHERE user_id = $1 AND device_id = $2")
                .bind(user_id)
                .bind(device_id)
                .fetch_optional(&self.db.pool)
                .await
                .map_err(crate::error::AppError::DatabaseError)?
                .is_some();

        if device_exists {
            self.blacklist_device_token(user_id, device_id).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Blacklist a device token to force immediate disconnection.
    /// NOTE: The blacklisted_tokens table is created by db_structure module at startup.
    async fn blacklist_device_token(
        &self,
        user_id: i64,
        device_id: &str,
    ) -> Result<(), crate::error::AppError> {
        // Add device to blacklist
        sqlx::query(
            "INSERT INTO activity.blacklisted_tokens (user_id, device_id) VALUES ($1, $2)
             ON CONFLICT (user_id, device_id) DO UPDATE SET blacklisted_at = CURRENT_TIMESTAMP",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(&self.db.pool)
        .await
        .map_err(crate::error::AppError::DatabaseError)?;

        tracing::info!(
            "Device {} for user {} blacklisted for immediate disconnection",
            device_id,
            user_id
        );
        Ok(())
    }

    /// Check if a device token is blacklisted
    pub async fn is_device_blacklisted(&self, user_id: i64, device_id: &str) -> Result<bool> {
        let result =
            sqlx::query("SELECT 1 FROM activity.blacklisted_tokens WHERE user_id = $1 AND device_id = $2")
                .bind(user_id)
                .bind(device_id)
                .fetch_optional(&self.db.pool)
                .await?;

        Ok(result.is_some())
    }

    /// Update device last active timestamp
    pub async fn update_device_activity(&self, user_id: i64, device_id: &str) -> Result<()> {
        sqlx::query(
            "UPDATE auth.user_devices SET last_active = $1 WHERE user_id = $2 AND device_id = $3",
        )
        .bind(Utc::now())
        .bind(user_id)
        .bind(device_id)
        .execute(&self.db.pool)
        .await?;

        Ok(())
    }

    /// Get user's maximum allowed devices
    async fn get_user_max_devices(&self, user_id: i64) -> Result<i32> {
        let row = sqlx::query("SELECT max_devices FROM auth.users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&self.db.pool)
            .await?;

        Ok(row.get("max_devices"))
    }

    /// Check if a device can connect (enforce device limits)
    pub async fn can_device_connect(&self, user_id: i64, device_id: &str) -> Result<bool> {
        let active_devices = self.get_active_devices(user_id).await?;
        let user_max_devices = self.get_user_max_devices(user_id).await?;

        // If device is already registered, allow connection
        if active_devices.iter().any(|d| d.device_id == device_id) {
            return Ok(true);
        }

        // If under limit, allow new device
        Ok(active_devices.len() < user_max_devices as usize)
    }

    /// Get device count for a user
    pub async fn get_device_count(&self, user_id: i64) -> Result<i32> {
        let row = sqlx::query("SELECT COUNT(*) as count FROM auth.user_devices WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&self.db.pool)
            .await?;

        Ok(row.get::<i64, _>("count") as i32)
    }

    /// Get all devices in the system (admin only)
    pub async fn get_all_devices(&self) -> Result<Vec<serde_json::Value>> {
        let devices = sqlx::query(
            r#"
            SELECT
                ud.id,
                ud.user_id,
                ud.device_id,
                ud.device_name,
                ud.last_active,
                ud.created_at,
                u.username,
                u.email,
                u.role,
                u.max_devices,
                COUNT(*) OVER (PARTITION BY ud.user_id) as device_count
            FROM auth.user_devices ud
            JOIN auth.users u ON ud.user_id = u.id
            ORDER BY ud.last_active DESC
            "#,
        )
        .fetch_all(&self.db.pool)
        .await?;

        let mut result = Vec::new();
        for row in devices {
            let device_count = row.get::<i64, _>("device_count") as i32;
            let max_devices = row.get::<i32, _>("max_devices");

            result.push(serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "user_id": row.get::<i64, _>("user_id"),
                "device_id": row.get::<String, _>("device_id"),
                "device_name": row.get::<String, _>("device_name"),
                "last_active": row.get::<chrono::DateTime<chrono::Utc>, _>("last_active").to_rfc3339(),
                "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
                "username": row.get::<String, _>("username"),
                "email": row.get::<Option<String>, _>("email"),
                "role": row.get::<String, _>("role"),
                "max_devices": max_devices,
                "device_count": device_count,
                "device_limit": format!("{}/{}", device_count, max_devices)
            }));
        }

        Ok(result)
    }

    /// Disconnect a device (force logout by updating last_active to far past)
    pub async fn disconnect_device(&self, device_id: &str) -> Result<()> {
        // Set last_active to a very old date to force disconnection
        let old_date = chrono::Utc::now() - chrono::Duration::days(365);

        let rows_affected =
            sqlx::query("UPDATE auth.user_devices SET last_active = $1 WHERE device_id = $2")
                .bind(old_date)
                .bind(device_id)
                .execute(&self.db.pool)
                .await?
                .rows_affected();

        if rows_affected == 0 {
            return Err(anyhow::anyhow!("Device not found"));
        }

        Ok(())
    }

    /// Get device statistics (admin only)
    pub async fn get_device_stats(&self) -> Result<serde_json::Value> {
        // Total devices
        let total_devices = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM auth.user_devices")
            .fetch_one(&self.db.pool)
            .await?;

        // Active devices (last active within 24 hours)
        let active_devices = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM auth.user_devices WHERE last_active > NOW() - INTERVAL '1 day'",
        )
        .fetch_one(&self.db.pool)
        .await?;

        // Users with devices
        let users_with_devices =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(DISTINCT user_id) FROM auth.user_devices")
                .fetch_one(&self.db.pool)
                .await?;

        // Users at limit (users who have reached their max_devices, excluding admins)
        let users_at_limit = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM (
                SELECT u.id, u.max_devices, COUNT(ud.id) as device_count
                FROM auth.users u
                LEFT JOIN auth.user_devices ud ON u.id = ud.user_id
                WHERE u.role IN ('end_user', 'reseller')
                GROUP BY u.id, u.max_devices
            ) stats
            WHERE stats.device_count >= stats.max_devices AND stats.max_devices > 0
            "#,
        )
        .fetch_one(&self.db.pool)
        .await?;

        // Total capacity (sum of max_devices for end_users and resellers only)
        let total_capacity = sqlx::query_scalar::<_, i64>(
            "SELECT COALESCE(SUM(max_devices), 0) FROM auth.users WHERE max_devices > 0 AND role IN ('end_user', 'reseller')"
        )
        .fetch_one(&self.db.pool)
        .await?;

        // Average devices per user
        let avg_devices_per_user = if users_with_devices > 0 {
            total_devices as f64 / users_with_devices as f64
        } else {
            0.0
        };

        // Utilization percentage
        let utilization = if total_capacity > 0 {
            (total_devices as f64 / total_capacity as f64 * 100.0).round() as i64
        } else {
            0
        };

        // Devices by role
        let devices_by_role = sqlx::query(
            r#"
            SELECT u.role, COUNT(*) as count
            FROM auth.user_devices ud
            JOIN auth.users u ON ud.user_id = u.id
            GROUP BY u.role
            "#,
        )
        .fetch_all(&self.db.pool)
        .await?;

        let mut role_stats = serde_json::Map::new();
        for row in devices_by_role {
            let role = row.get::<String, _>("role");
            let count = row.get::<i64, _>("count");
            role_stats.insert(role, serde_json::Value::Number(count.into()));
        }

        // Devices by user (detailed breakdown)
        let devices_by_user = sqlx::query(
            r#"
            SELECT stats.user_id, stats.username, stats.max_devices, stats.device_count
            FROM (
                SELECT u.id as user_id, u.username, u.max_devices, COUNT(ud.id) as device_count
                FROM auth.users u
                LEFT JOIN auth.user_devices ud ON u.id = ud.user_id
                WHERE u.role IN ('end_user', 'reseller')
                GROUP BY u.id, u.username, u.max_devices
            ) stats
            WHERE stats.device_count > 0
            ORDER BY stats.device_count DESC
            "#,
        )
        .fetch_all(&self.db.pool)
        .await?;

        let mut user_stats = Vec::new();
        for row in devices_by_user {
            let user_id = row.get::<i64, _>("user_id");
            let username = row.get::<String, _>("username");
            let max_devices = row.get::<i32, _>("max_devices");
            let device_count = row.get::<i64, _>("device_count");

            user_stats.push(serde_json::json!({
                "user_id": user_id,
                "username": username,
                "max_devices": max_devices,
                "device_count": device_count
            }));
        }

        Ok(serde_json::json!({
            "total_devices": total_devices,
            "active_devices": active_devices,
            "users_with_devices": users_with_devices,
            "users_at_limit": users_at_limit,
            "total_capacity": total_capacity,
            "avg_devices_per_user": avg_devices_per_user,
            "utilization": utilization,
            "devices_by_role": role_stats,
            "devices_by_user": user_stats
        }))
    }

    /// Get all blacklisted devices for admin management
    pub async fn get_blacklisted_devices(
        &self,
    ) -> Result<Vec<serde_json::Value>, crate::error::AppError> {
        let devices = sqlx::query(
            r#"
            SELECT bt.*, u.username, u.id as user_id
            FROM activity.blacklisted_tokens bt
            JOIN auth.users u ON bt.user_id = u.id
            ORDER BY bt.blacklisted_at DESC
            "#,
        )
        .fetch_all(&self.db.pool)
        .await
        .map_err(crate::error::AppError::DatabaseError)?;

        let mut result = Vec::new();
        for row in devices {
            let blacklisted_at: chrono::DateTime<chrono::Utc> =
                row.get::<chrono::DateTime<chrono::Utc>, _>("blacklisted_at");
            result.push(serde_json::json!({
                "user_id": row.get::<i64, _>("user_id"),
                "username": row.get::<String, _>("username"),
                "device_id": row.get::<String, _>("device_id"),
                "blacklisted_at": blacklisted_at.to_rfc3339()
            }));
        }

        Ok(result)
    }

    /// Remove a device from blacklist (admin only)
    pub async fn remove_from_blacklist(
        &self,
        user_id: i64,
        device_id: &str,
    ) -> Result<bool, crate::error::AppError> {
        let result =
            sqlx::query("DELETE FROM activity.blacklisted_tokens WHERE user_id = $1 AND device_id = $2")
                .bind(user_id)
                .bind(device_id)
                .execute(&self.db.pool)
                .await
                .map_err(crate::error::AppError::DatabaseError)?;

        Ok(result.rows_affected() > 0)
    }

    /// Check if device exists in user_devices table
    pub async fn device_exists(
        &self,
        user_id: i64,
        device_id: &str,
    ) -> Result<bool, crate::error::AppError> {
        let result =
            sqlx::query("SELECT 1 FROM auth.user_devices WHERE user_id = $1 AND device_id = $2")
                .bind(user_id)
                .bind(device_id)
                .fetch_optional(&self.db.pool)
                .await
                .map_err(crate::error::AppError::DatabaseError)?;

        Ok(result.is_some())
    }
}
