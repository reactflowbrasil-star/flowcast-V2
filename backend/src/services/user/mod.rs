use crate::database::Database;
use crate::error::AppError;
use crate::models::user::{
    CreateUserRequest, CreditRates, UpdateUserRequest, User, UserRole,
};
use crate::services::auth::AuthService;
use crate::validation::ValidationUtils;
use chrono::Utc;
use sqlx::Row;
use tracing::info;

mod demos;
mod subscriptions;

#[derive(Clone)]
pub struct UserService {
    db: Database,
    auth_service: AuthService,
}

impl UserService {
    pub fn new(db: Database, auth_service: AuthService) -> Self {
        Self { db, auth_service }
    }

    /// Create a new admin user (only callable by existing admin)
    pub async fn create_admin(
        &self,
        creator_id: i64,
        request: CreateUserRequest,
    ) -> Result<User, AppError> {
        // Verify creator is admin
        self.verify_admin_role(creator_id).await?;

        // Validate request
        if !matches!(request.role, UserRole::Admin | UserRole::System) {
            return Err(AppError::BadRequest("Role must be admin".to_string()));
        }

        // Hash password
        let password_hash = self.auth_service.hash_password(&request.password)?;

        // Create admin user
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO auth.users (username, email, password_hash, role, active, created_by, max_devices, expires_at,
                             daily_demo_limit, demos_created_today, is_demo)
            VALUES ($1, $2, $3, $4, TRUE, $5, 0, $6, 0, 0, FALSE)
            RETURNING *
            "#,
        )
        .bind(&request.username)
        .bind(&request.email)
        .bind(&password_hash)
        .bind(request.role.to_string())
        .bind(creator_id)
        .bind(request.expires_at)
        .fetch_one(&self.db.pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                AppError::BadRequest("Username already exists".to_string())
            }
            _ => AppError::DatabaseError(e),
        })?;

        Ok(user)
    }

    /// Create a new reseller (only callable by admin)
    pub async fn create_reseller(
        &self,
        admin_id: i64,
        request: CreateUserRequest,
    ) -> Result<User, AppError> {
        // Verify creator is admin
        self.verify_admin_role(admin_id).await?;

        // Validate request
        if request.role != UserRole::Reseller {
            return Err(AppError::BadRequest("Role must be reseller".to_string()));
        }

        let credits = request.credits.unwrap_or(0.0);
        if credits < 0.0 {
            return Err(AppError::BadRequest(
                "Credits cannot be negative".to_string(),
            ));
        }

        // Hash password
        let password_hash = self.auth_service.hash_password(&request.password)?;

        // Create reseller user
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO auth.users (username, email, password_hash, role, credits, active, created_by, max_devices, expires_at,
                             daily_demo_limit, demos_created_today, is_demo)
            VALUES ($1, $2, $3, $4, $5, TRUE, $6, 0, $7, $8, 0, FALSE)
            RETURNING *
            "#,
        )
        .bind(&request.username)
        .bind(&request.email)
        .bind(&password_hash)
        .bind(request.role.to_string())
        .bind(credits)
        .bind(admin_id)
        .bind(request.expires_at)
        .bind(request.daily_demo_limit.unwrap_or(5))
        .fetch_one(&self.db.pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                AppError::BadRequest("Username already exists".to_string())
            }
            _ => AppError::DatabaseError(e),
        })?;

        Ok(user)
    }

    /// Create a new end user (callable by admin or reseller)
    /// Returns (User, Option<(credit_cost, duration_months)>) - credit info is Some for reseller creations
    pub async fn create_end_user(
        &self,
        creator_id: i64,
        request: CreateUserRequest,
    ) -> Result<(User, Option<(f64, f64)>), AppError> {
        tracing::debug!(
            "🔍 create_end_user called with creator_id: {}, username: {}, role: {:?}",
            creator_id,
            request.username,
            request.role
        );

        // Get creator info
        tracing::trace!(" Getting creator info for ID: {}", creator_id);
        let creator = self.get_user_by_id(creator_id).await?;
        tracing::debug!(
            "🔍 Creator found: {} (role: {:?})",
            creator.username,
            creator.role
        );

        // Validate request
        tracing::debug!(
            "🔍 Validating request - role: {:?}, max_devices: {:?}",
            request.role,
            request.max_devices
        );
        if request.role != UserRole::EndUser {
            tracing::warn!("❌  Invalid role provided: {:?}", request.role);
            return Err(AppError::BadRequest("Role must be end_user".to_string()));
        }

        let max_devices = request.max_devices.unwrap_or(3);
        tracing::trace!(" Max devices resolved to: {}", max_devices);
        if max_devices < 1 {
            tracing::warn!("❌  Invalid max_devices: {}", max_devices);
            return Err(AppError::BadRequest(
                "Max devices must be at least 1".to_string(),
            ));
        }

        // Calculate credit cost if creator is reseller
        let mut credit_cost_info: Option<(f64, f64)> = None; // (credit_cost, duration_months)
        tracing::debug!(
            "🔍 Creator role: {:?}, checking credit calculation",
            creator.role
        );
        if creator.role == UserRole::Reseller {
            tracing::trace!(" Creator is reseller, calculating credit cost");

            // Calculate credits based on duration and devices
            let duration_months = if let Some(expires_at) = request.expires_at {
                let now = Utc::now();
                let duration =
                    ((expires_at.timestamp() - now.timestamp()) / (30 * 24 * 3600)) as f64;
                tracing::debug!("🔍 Expiration provided, duration_months: {}", duration);
                duration
            } else {
                tracing::trace!(" No expiration provided, using default 1 month");
                1.0 // Default to 1 month if no expiration
            };

            // Base cost for 3 devices = 1 credit per month
            let mut credits_per_month = 1.0;
            if max_devices > 3 {
                // Each additional device after 3 costs 0.25 credits per month
                let extra_devices = max_devices - 3;
                credits_per_month = 1.0 + (extra_devices as f64 * 0.25);
                tracing::debug!(
                    "🔍 Extra devices: {}, credits_per_month: {}",
                    extra_devices,
                    credits_per_month
                );
            }

            let credit_cost = duration_months * credits_per_month;
            credit_cost_info = Some((credit_cost, duration_months));
            tracing::debug!(
                "🔍 Final credit cost: {} for {} months",
                credit_cost,
                duration_months
            );

            // Check if reseller has enough credits
            tracing::trace!(" Checking if reseller has sufficient credits");
            if !self
                .validate_sufficient_credits(creator_id, credit_cost)
                .await?
            {
                tracing::warn!(
                    "❌  Insufficient credits for reseller {} - needed: {}, has: insufficient",
                    creator_id,
                    credit_cost
                );
                return Err(AppError::InsufficientCredits);
            }
            // Deduct credits from reseller in a transaction to ensure consistency
            let mut tx = self.db.pool.begin().await?;

            // Double-check credits in transaction to prevent race conditions
            let current_credits = sqlx::query_scalar::<_, f64>(
                "SELECT credits FROM auth.users WHERE id = $1 AND role = 'reseller'",
            )
            .bind(creator_id)
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or(0.0);

            if current_credits < credit_cost {
                tx.rollback().await?;
                return Err(AppError::InsufficientCredits);
            }

            // Deduct credits
            sqlx::query("UPDATE auth.users SET credits = credits - $1 WHERE id = $2")
                .bind(credit_cost)
                .bind(creator_id)
                .execute(&mut *tx)
                .await?;

            tx.commit().await?;
            tracing::trace!(" Reseller has sufficient credits");
        } else {
            tracing::trace!(" Creator is admin, no credit calculation needed");
        }

        // Hash password
        tracing::trace!(" Hashing password for user: {}", request.username);
        let password_hash = self.auth_service.hash_password(&request.password)?;
        tracing::trace!(" Password hashed successfully");

        // Create end user
        tracing::trace!(" Attempting to insert user into database");
        tracing::debug!(
            "🔍 User data - username: {}, email: {:?}, max_devices: {}, expires_at: {:?}",
            request.username,
            request.email,
            max_devices,
            request.expires_at
        );

        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO auth.users (username, email, password_hash, role, active, created_by, max_devices, expires_at,
                             is_demo)
            VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7, FALSE)
            RETURNING *
            "#,
        )
        .bind(&request.username)
        .bind(&request.email)
        .bind(&password_hash)
        .bind(request.role.to_string())
        .bind(creator_id)
        .bind(max_devices)
        .bind(request.expires_at)
        .fetch_one(&self.db.pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                tracing::warn!("❌  Username already exists: {}", request.username);
                AppError::BadRequest("Username already exists".to_string())
            }
            _ => {
                tracing::warn!("❌  Database error inserting user: {}", e);
                AppError::DatabaseError(e)
            }
        })?;

        tracing::trace!(" User created successfully with ID: {}", user.id);

        // Set user subscriptions if provided
        tracing::trace!(" Setting user subscriptions");
        if let Some(category_ids) = &request.category_ids {
            tracing::trace!(" Category IDs provided: {:?}", category_ids);
            if !category_ids.is_empty() {
                tracing::debug!(
                    "🔍 Setting {} categories for user {}",
                    category_ids.len(),
                    user.id
                );
                self.set_user_subscriptions(user.id, category_ids).await?;
            } else {
                tracing::trace!(" Empty category_ids provided");
            }
        } else {
            tracing::trace!(" No category_ids provided, getting all categories");
            // If no categories specified, give access to all categories (backward compatibility)
            let all_categories = sqlx::query_scalar::<_, i64>("SELECT id FROM content.categories")
                .fetch_all(&self.db.pool)
                .await?;
            tracing::debug!(
                "🔍 Found {} total categories, assigning all to user {}",
                all_categories.len(),
                user.id
            );
            self.set_user_subscriptions(user.id, &all_categories)
                .await?;
        }

        tracing::trace!(" User subscriptions set successfully");

        Ok((user, credit_cost_info))
    }

    /// Ban/unban a user (admin can ban anyone, reseller can ban their own end users)
    pub async fn set_user_active_status(
        &self,
        actor_id: i64,
        user_id: i64,
        active: bool,
    ) -> Result<User, AppError> {
        let actor = self.get_user_by_id(actor_id).await?;
        let target_user = self.get_user_by_id(user_id).await?;

        // Check permissions
        match actor.role {
            UserRole::Admin | UserRole::System => {
                // Admin/System can ban/unban anyone except themselves
                if actor_id == user_id {
                    return Err(AppError::BadRequest(
                        "Cannot change your own active status".to_string(),
                    ));
                }
            }
            UserRole::Reseller => {
                // Reseller can only ban/unban their own end users
                if target_user.role != UserRole::EndUser || target_user.created_by != Some(actor_id)
                {
                    return Err(AppError::Forbidden);
                }
            }
            UserRole::EndUser => {
                return Err(AppError::Forbidden);
            }
        }

        // Update user active status
        let updated_user =
            sqlx::query_as::<_, User>("UPDATE auth.users SET active = $1 WHERE id = $2 RETURNING *")
                .bind(active)
                .bind(user_id)
                .fetch_one(&self.db.pool)
                .await?;

        Ok(updated_user)
    }

    /// Update reseller credits (admin only)
    pub async fn update_reseller_credits(
        &self,
        admin_id: i64,
        reseller_id: i64,
        credits: f64,
    ) -> Result<User, AppError> {
        // Verify admin role
        self.verify_admin_role(admin_id).await?;

        if credits < 0.0 {
            return Err(AppError::BadRequest(
                "Credits cannot be negative".to_string(),
            ));
        }

        // Verify target is reseller
        let reseller = self.get_user_by_id(reseller_id).await?;
        if reseller.role != UserRole::Reseller {
            return Err(AppError::BadRequest(
                "Target user must be a reseller".to_string(),
            ));
        }

        // Update credits
        let updated_user =
            sqlx::query_as::<_, User>("UPDATE auth.users SET credits = $1 WHERE id = $2 RETURNING *")
                .bind(credits)
                .bind(reseller_id)
                .fetch_one(&self.db.pool)
                .await?;

        Ok(updated_user)
    }

    /// Get all resellers (admin only)
    pub async fn get_all_resellers(&self, admin_id: i64) -> Result<Vec<User>, AppError> {
        self.verify_admin_role(admin_id).await?;

        let resellers = sqlx::query_as::<_, User>(
            "SELECT * FROM auth.users WHERE role = 'reseller' ORDER BY created_at DESC",
        )
        .fetch_all(&self.db.pool)
        .await?;

        Ok(resellers)
    }

    /// Get all end users (admin only)
    pub async fn get_all_end_users(&self, admin_id: i64) -> Result<Vec<User>, AppError> {
        self.verify_admin_role(admin_id).await?;

        let end_users = sqlx::query_as::<_, User>(
            "SELECT * FROM auth.users WHERE role = 'end_user' ORDER BY created_at DESC",
        )
        .fetch_all(&self.db.pool)
        .await?;

        Ok(end_users)
    }

    /// Get reseller's end users (reseller can see their own, admin can see any)
    pub async fn get_reseller_end_users(
        &self,
        actor_id: i64,
        reseller_id: i64,
    ) -> Result<Vec<User>, AppError> {
        let actor = self.get_user_by_id(actor_id).await?;

        // Check permissions
        match actor.role {
            UserRole::Admin | UserRole::System => {
                // Admin/System can see any reseller's users
            }
            UserRole::Reseller => {
                // Reseller can only see their own users
                if actor_id != reseller_id {
                    return Err(AppError::Forbidden);
                }
            }
            UserRole::EndUser => {
                return Err(AppError::Forbidden);
            }
        }

        let end_users = sqlx::query_as::<_, User>(
            "SELECT * FROM auth.users WHERE role = 'end_user' AND created_by = $1 ORDER BY created_at DESC"
        )
        .bind(reseller_id)
        .fetch_all(&self.db.pool)
        .await?;

        Ok(end_users)
    }

    /// Get user by username
    pub async fn get_user_by_username(&self, username: &str) -> Result<User, AppError> {
        let user =
            sqlx::query_as::<_, User>("SELECT * FROM auth.users WHERE UPPER(username) = UPPER($1)")
                .bind(username)
                .fetch_optional(&self.db.pool)
                .await?
                .ok_or(AppError::NotFound)?;

        Ok(user)
    }

    /// Helper: Verify user has admin role
    async fn verify_admin_role(&self, user_id: i64) -> Result<(), AppError> {
        let user = self.get_user_by_id(user_id).await?;
        if !matches!(user.role, UserRole::Admin | UserRole::System) {
            return Err(AppError::Forbidden);
        }
        Ok(())
    }

    /// Update system configuration (admin only)
    pub async fn update_config(
        &self,
        admin_id: i64,
        key: &str,
        value: &str,
    ) -> Result<(), AppError> {
        // Verify admin role
        self.verify_admin_role(admin_id).await?;

        // Validate configuration key and value using validation utils
        ValidationUtils::validate_config_key(key)?;
        ValidationUtils::validate_config_value(key, value)?;

        // Update or insert configuration
        sqlx::query(
            "INSERT INTO core.config (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
        )
            .bind(key)
            .bind(value)
            .execute(&self.db.pool)
            .await?;

        Ok(())
    }

    /// Get system configuration (admin only)
    pub async fn get_config(
        &self,
        admin_id: i64,
    ) -> Result<std::collections::HashMap<String, String>, AppError> {
        // Verify admin role
        self.verify_admin_role(admin_id).await?;

        let rows = sqlx::query("SELECT key, value FROM core.config")
            .fetch_all(&self.db.pool)
            .await?;

        let mut config = std::collections::HashMap::new();
        for row in rows {
            let key: String = row.get("key");
            let value: String = row.get("value");
            config.insert(key, value);
        }

        Ok(config)
    }

    /// Get current credit rates for display (accessible by resellers)
    pub async fn get_credit_rates(&self, user_id: i64) -> Result<CreditRates, AppError> {
        let user = self.get_user_by_id(user_id).await?;

        // Only resellers and admins can view credit rates
        match user.role {
            UserRole::Admin | UserRole::Reseller | UserRole::System => {}
            UserRole::EndUser => return Err(AppError::Forbidden),
        }

        let default_connections = self
            .get_config_value("default_connections")
            .await?
            .unwrap_or("3".to_string())
            .parse::<i32>()
            .unwrap_or(3);

        let extra_connection_cost = self
            .get_config_value("extra_connection_cost")
            .await?
            .unwrap_or("0.25".to_string())
            .parse::<f64>()
            .unwrap_or(0.25);

        Ok(CreditRates {
            default_connections,
            base_cost: 1.0,
            extra_connection_cost,
        })
    }

    /// Validate if reseller has sufficient credits for user creation
    pub async fn validate_sufficient_credits(
        &self,
        reseller_id: i64,
        required_credits: f64,
    ) -> Result<bool, AppError> {
        let reseller = self.get_user_by_id(reseller_id).await?;

        if reseller.role != UserRole::Reseller {
            return Err(AppError::BadRequest("User is not a reseller".to_string()));
        }

        let current_credits = reseller.credits.unwrap_or(0.0);
        Ok(current_credits >= required_credits)
    }

    /// Get user by ID (internal use)
    pub async fn get_user_by_id(&self, user_id: i64) -> Result<User, AppError> {
        let mut user = sqlx::query_as::<_, User>("SELECT * FROM auth.users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&self.db.pool)
            .await?
            .ok_or(AppError::UserNotFound)?;

        // Load subscribed categories
        let category_ids: Vec<i64> =
            sqlx::query_scalar("SELECT category_id FROM billing.user_subscriptions WHERE user_id = $1")
                .bind(user_id)
                .fetch_all(&self.db.pool)
                .await?;

        user.subscribed_categories = if category_ids.is_empty() {
            None
        } else {
            Some(category_ids)
        };

        // Debug logging
        tracing::debug!(
            user_id = user_id,
            role = ?user.role,
            subscribed_categories = ?user.subscribed_categories,
            "get_user_by_id: loaded user with categories"
        );

        Ok(user)
    }

    /// Get user by ID (admin only)
    pub async fn get_user_by_id_admin(
        &self,
        admin_id: i64,
        user_id: i64,
    ) -> Result<User, AppError> {
        // Verify admin permissions
        self.verify_admin_permissions(admin_id).await?;

        self.get_user_by_id(user_id).await
    }

    /// Update user information (admin can update anyone, reseller can update their own end users)
    pub async fn update_user(
        &self,
        actor_id: i64,
        user_id: i64,
        request: UpdateUserRequest,
    ) -> Result<User, AppError> {
        let actor = self.get_user_by_id(actor_id).await?;

        // Check permissions
        match actor.role {
            UserRole::Admin | UserRole::System => {
                // Admin/System can update anyone
            }
            UserRole::Reseller => {
                // Reseller can only update their own end users
                let target_user = self.get_user_by_id(user_id).await?;
                if target_user.role != UserRole::EndUser || target_user.created_by != Some(actor_id)
                {
                    return Err(AppError::Forbidden);
                }
            }
            UserRole::EndUser => {
                return Err(AppError::Forbidden);
            }
        }

        // For simplicity, update fields one by one
        if let Some(username) = request.username {
            sqlx::query("UPDATE auth.users SET username = $1 WHERE id = $2")
                .bind(username)
                .bind(user_id)
                .execute(&self.db.pool)
                .await?;
        }

        if let Some(email) = request.email {
            sqlx::query("UPDATE auth.users SET email = $1 WHERE id = $2")
                .bind(email)
                .bind(user_id)
                .execute(&self.db.pool)
                .await?;
        }

        if let Some(active) = request.active {
            sqlx::query("UPDATE auth.users SET active = $1 WHERE id = $2")
                .bind(active)
                .bind(user_id)
                .execute(&self.db.pool)
                .await?;
        }

        if let Some(max_devices) = request.max_devices {
            sqlx::query("UPDATE auth.users SET max_devices = $1 WHERE id = $2")
                .bind(max_devices)
                .bind(user_id)
                .execute(&self.db.pool)
                .await?;
        }

        if let Some(expires_at) = request.expires_at {
            sqlx::query("UPDATE auth.users SET expires_at = $1 WHERE id = $2")
                .bind(expires_at)
                .bind(user_id)
                .execute(&self.db.pool)
                .await?;
        }

        // Update user categories if provided
        if let Some(category_ids) = request.category_ids {
            self.set_user_subscriptions(user_id, &category_ids).await?;
        }

        // Get the updated user
        let user = sqlx::query_as::<_, User>("SELECT * FROM auth.users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&self.db.pool)
            .await?;

        Ok(user)
    }

    /// Delete user (admin only)
    pub async fn delete_user(&self, admin_id: i64, user_id: i64) -> Result<(), AppError> {
        // Verify admin permissions
        self.verify_admin_permissions(admin_id).await?;

        // Don't allow deleting admin users
        let user = self.get_user_by_id(user_id).await?;
        if matches!(user.role, UserRole::Admin | UserRole::System) {
            return Err(AppError::ValidationError(
                "Cannot delete admin users".to_string(),
            ));
        }

        info!(
            "Admin {} deleting user {} ({})",
            admin_id, user_id, user.username
        );

        // If deleting a reseller, transfer their end users to the admin
        if user.role == UserRole::Reseller {
            // Transfer all end users created by this reseller to the admin
            sqlx::query(
                "UPDATE auth.users SET created_by = $1 WHERE created_by = $2 AND role = 'end_user'",
            )
            .bind(admin_id)
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;
        }

        // Delete related records that prevent user deletion
        // Delete security incidents where this user is referenced
        sqlx::query("DELETE FROM auth.security_incidents WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete security bans where this user is referenced
        sqlx::query("DELETE FROM auth.security_bans WHERE user_id = $1 OR created_by = $2")
            .bind(user_id)
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete activity logs where this user is referenced
        sqlx::query(
            "DELETE FROM activity.activity_logs WHERE user_id = $1 OR target_user_id = $2 OR created_by = $3",
        )
        .bind(user_id)
        .bind(user_id)
        .bind(user_id)
        .execute(&self.db.pool)
        .await?;

        // Delete rate limits for this user
        sqlx::query("DELETE FROM activity.rate_limits WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete user login history
        sqlx::query("DELETE FROM activity.user_login_history WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete user viewing history
        sqlx::query("DELETE FROM activity.user_viewing_history WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete blacklisted tokens for this user
        sqlx::query("DELETE FROM activity.blacklisted_tokens WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete devices for this user
        sqlx::query("DELETE FROM auth.devices WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete user devices
        sqlx::query("DELETE FROM auth.user_devices WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete user subscriptions
        sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete in correct order to handle circular dependencies:
        // 1. First delete ticket_message_reads (references ticket_messages and support_tickets)
        sqlx::query("DELETE FROM core.ticket_message_reads WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // 2. Delete ticket_message_reads for tickets created by this user
        sqlx::query("DELETE FROM core.ticket_message_reads WHERE ticket_id IN (SELECT id FROM core.support_tickets WHERE created_by = $1)")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // 3. Delete ticket messages by this user
        sqlx::query("DELETE FROM core.ticket_messages WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // 4. Delete ticket messages for tickets created by this user
        sqlx::query("DELETE FROM core.ticket_messages WHERE ticket_id IN (SELECT id FROM core.support_tickets WHERE created_by = $1)")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Update core.tickets to remove user references (set assigned_to to NULL)
        sqlx::query("UPDATE core.tickets SET assigned_to = NULL WHERE assigned_to = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete tickets created by this user (tickets table uses user_id, not created_by)
        sqlx::query("DELETE FROM core.tickets WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Update core.support_tickets to remove user references (set assigned_to to NULL)
        sqlx::query("UPDATE core.support_tickets SET assigned_to = NULL WHERE assigned_to = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete support_tickets created by this user (CASCADE should handle this, but explicit is better)
        sqlx::query("DELETE FROM core.support_tickets WHERE created_by = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Now delete the user
        sqlx::query("DELETE FROM auth.users WHERE id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        info!(
            "Successfully deleted user {} ({}) and all related data",
            user_id, user.username
        );
        Ok(())
    }

    /// Update user credits (admin only)
    pub async fn update_user_credits(
        &self,
        admin_id: i64,
        user_id: i64,
        credits: f64,
    ) -> Result<User, AppError> {
        // Verify admin permissions
        self.verify_admin_permissions(admin_id).await?;

        if credits < 0.0 {
            return Err(AppError::BadRequest(
                "Credits cannot be negative".to_string(),
            ));
        }

        let user =
            sqlx::query_as::<_, User>("UPDATE auth.users SET credits = $1 WHERE id = $2 RETURNING *")
                .bind(credits)
                .bind(user_id)
                .fetch_one(&self.db.pool)
                .await?;

        Ok(user)
    }

    /// Reset user password (admin only)
    pub async fn reset_user_password(
        &self,
        admin_id: i64,
        user_id: i64,
        new_password: String,
    ) -> Result<(), AppError> {
        // Verify admin permissions
        self.verify_admin_permissions(admin_id).await?;

        let password_hash = bcrypt::hash(&new_password, bcrypt::DEFAULT_COST)
            .map_err(|_| AppError::InternalServerError)?;

        sqlx::query("UPDATE auth.users SET password_hash = $1 WHERE id = $2")
            .bind(password_hash)
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        Ok(())
    }

    /// Transfer user to another reseller (admin only)
    pub async fn transfer_user(
        &self,
        admin_id: i64,
        user_id: i64,
        new_reseller_id: i64,
    ) -> Result<User, AppError> {
        // Verify admin permissions
        self.verify_admin_permissions(admin_id).await?;

        // Verify the new reseller exists and is a reseller
        let _reseller =
            sqlx::query_as::<_, User>("SELECT * FROM auth.users WHERE id = $1 AND role = 'reseller'")
                .bind(new_reseller_id)
                .fetch_optional(&self.db.pool)
                .await?
                .ok_or(AppError::ValidationError("Invalid reseller ID".to_string()))?;

        let user =
            sqlx::query_as::<_, User>("UPDATE auth.users SET created_by = $1 WHERE id = $2 RETURNING *")
                .bind(new_reseller_id)
                .bind(user_id)
                .fetch_one(&self.db.pool)
                .await?;

        Ok(user)
    }

    /// Helper: Verify admin permissions
    pub async fn verify_admin_permissions(&self, admin_id: i64) -> Result<(), AppError> {
        let _admin = sqlx::query_as::<_, User>(
            "SELECT * FROM auth.users WHERE id = $1 AND role IN ('admin', 'system') AND active = true",
        )
        .bind(admin_id)
        .fetch_optional(&self.db.pool)
        .await?
        .ok_or(AppError::AuthenticationFailed)?;

        Ok(())
    }

    /// Helper: Get config value
    pub async fn get_config_value(&self, key: &str) -> Result<Option<String>, AppError> {
        let row = sqlx::query("SELECT value FROM core.config WHERE key = $1")
            .bind(key)
            .fetch_optional(&self.db.pool)
            .await?;

        Ok(row.map(|r| r.get::<String, _>("value")))
    }

    /// Calculate credits required for a user based on duration and devices
    pub fn calculate_credits(duration_months: i32, max_devices: i32) -> f64 {
        // Base cost for 3 devices = 1 credit per month
        let mut credits_per_month = 1.0;
        if max_devices > 3 {
            // Each additional device after 3 costs 0.25 credits per month
            let extra_devices = max_devices - 3;
            credits_per_month = 1.0 + (extra_devices as f64 * 0.25);
        }
        duration_months as f64 * credits_per_month
    }

    /// Deduct credits from reseller
    pub async fn deduct_credits(&self, reseller_id: i64, amount: f64) -> Result<(), AppError> {
        let result =
            sqlx::query("UPDATE auth.users SET credits = credits - $1 WHERE id = $2 AND credits >= $3")
                .bind(amount)
                .bind(reseller_id)
                .bind(amount)
                .execute(&self.db.pool)
                .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::BadRequest("Insufficient credits".to_string()));
        }

        Ok(())
    }

    /// Delete end user (reseller can only delete their own end users)
    pub async fn delete_end_user(&self, reseller_id: i64, user_id: i64) -> Result<(), AppError> {
        // Verify reseller role
        let reseller = self.get_user_by_id(reseller_id).await?;
        if reseller.role != UserRole::Reseller {
            return Err(AppError::Forbidden);
        }

        // Verify target user is an end user created by this reseller
        let target_user = self.get_user_by_id(user_id).await?;
        if target_user.role != UserRole::EndUser || target_user.created_by != Some(reseller_id) {
            return Err(AppError::Forbidden);
        }

        info!(
            "Reseller {} deleting end user {} ({})",
            reseller_id, user_id, target_user.username
        );

        // Delete related records that prevent user deletion
        // Delete security incidents where this user is referenced
        sqlx::query("DELETE FROM auth.security_incidents WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete security bans where this user is referenced
        sqlx::query("DELETE FROM auth.security_bans WHERE user_id = $1 OR created_by = $2")
            .bind(user_id)
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete activity logs where this user is referenced
        sqlx::query(
            "DELETE FROM activity.activity_logs WHERE user_id = $1 OR target_user_id = $2 OR created_by = $3",
        )
        .bind(user_id)
        .bind(user_id)
        .bind(user_id)
        .execute(&self.db.pool)
        .await?;

        // Delete rate limits for this user
        sqlx::query("DELETE FROM activity.rate_limits WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete user login history
        sqlx::query("DELETE FROM activity.user_login_history WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete user viewing history
        sqlx::query("DELETE FROM activity.user_viewing_history WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete blacklisted tokens for this user
        sqlx::query("DELETE FROM activity.blacklisted_tokens WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete devices for this user
        sqlx::query("DELETE FROM auth.devices WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete user devices
        sqlx::query("DELETE FROM auth.user_devices WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete user subscriptions
        sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete ticket-related data
        // 1. First delete ticket_message_reads (references ticket_messages and support_tickets)
        sqlx::query("DELETE FROM core.ticket_message_reads WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // 2. Delete ticket_message_reads for tickets created by this user
        sqlx::query("DELETE FROM core.ticket_message_reads WHERE ticket_id IN (SELECT id FROM core.support_tickets WHERE created_by = $1)")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // 3. Delete ticket messages by this user
        sqlx::query("DELETE FROM core.ticket_messages WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // 4. Delete ticket messages for tickets created by this user
        sqlx::query("DELETE FROM core.ticket_messages WHERE ticket_id IN (SELECT id FROM core.support_tickets WHERE created_by = $1)")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Update core.tickets to remove user references (set assigned_to to NULL)
        sqlx::query("UPDATE core.tickets SET assigned_to = NULL WHERE assigned_to = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete tickets created by this user (tickets table uses user_id, not created_by)
        sqlx::query("DELETE FROM core.tickets WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Update core.support_tickets to remove user references (set assigned_to to NULL)
        sqlx::query("UPDATE core.support_tickets SET assigned_to = NULL WHERE assigned_to = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Delete support_tickets created by this user
        sqlx::query("DELETE FROM core.support_tickets WHERE created_by = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        // Now delete the user
        sqlx::query("DELETE FROM auth.users WHERE id = $1")
            .bind(user_id)
            .execute(&self.db.pool)
            .await?;

        info!(
            "Successfully deleted end user {} ({}) and all related data",
            user_id, target_user.username
        );
        Ok(())
    }
    /// Add credits to a reseller (used by payment webhooks)
    pub async fn add_credits(&self, reseller_id: i64, amount: f64) -> Result<(), AppError> {
        if amount <= 0.0 {
            return Err(AppError::BadRequest("Amount must be positive".to_string()));
        }

        // Ensure target is a reseller
        let reseller = self.get_user_by_id(reseller_id).await?;
        if reseller.role != UserRole::Reseller {
            return Err(AppError::BadRequest(
                "Target user must be a reseller".to_string(),
            ));
        }

        sqlx::query(
            "UPDATE auth.users SET credits = COALESCE(credits, 0) + $1 WHERE id = $2 AND role = 'reseller'",
        )
        .bind(amount)
        .bind(reseller_id)
        .execute(&self.db.pool)
        .await
        .map_err(AppError::DatabaseError)?;

        Ok(())
    }
}
