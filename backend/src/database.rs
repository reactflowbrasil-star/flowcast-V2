use std::{env, str::FromStr};

use chrono::Utc;
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    Pool, Postgres, Row,
};

use crate::db_structure::{self, SchemaState};

#[derive(Debug, Clone)]
pub struct Database {
    pub pool: Pool<Postgres>,
}

fn parse_env_u32(key: &str, default: u32) -> u32 {
    env::var(key)
        .ok()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .unwrap_or(default)
}

fn parse_env_u64(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(default)
}

impl Database {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let connect_options =
            PgConnectOptions::from_str(database_url)?.statement_cache_capacity(100); // Enable prepared statement caching for performance

        let setup_pool = PgPoolOptions::new()
            .after_connect(|conn, _| {
                Box::pin(async move {
                    sqlx::query("SET search_path TO auth, content, billing, activity, core, public")
                        .execute(conn)
                        .await?;
                    Ok(())
                })
            })
            .max_connections(2)
            .acquire_timeout(std::time::Duration::from_secs(30))
            .connect_with(connect_options.clone())
            .await?;

        let reset_db = std::env::var("RESET_DB")
            .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE"))
            .unwrap_or(false);
        if reset_db {
            // Drop all application schemas for a clean reset
            for schema in &["content", "auth", "billing", "activity", "core", "public"] {
                let drop_sql = format!("DROP SCHEMA IF EXISTS {} CASCADE", schema);
                sqlx::query(&drop_sql).execute(&setup_pool).await?;
            }
            sqlx::query("CREATE SCHEMA public")
                .execute(&setup_pool)
                .await?;
        }

        // Fail fast if the schema uses INT4 ids while the app expects BIGINT.
        let id_type = sqlx::query_scalar::<_, String>(
            "SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id' AND table_schema IN ('public', 'auth')",
        )
        .fetch_optional(&setup_pool)
        .await?;
        if let Some(data_type) = id_type {
            if data_type == "integer" {
                return Err(anyhow::anyhow!(
                    "Database schema uses INT4 ids. Set RESET_DB=true once to recreate the schema with BIGINT ids."
                ));
            }
        }

        let schema_state = db_structure::ensure_database_schema(&setup_pool).await?;
        setup_pool.close().await;

        let min_connections = parse_env_u32("PG_MIN_CONNECTIONS", 0);
        let mut max_connections = parse_env_u32("PG_MAX_CONNECTIONS", 10);
        if max_connections < min_connections {
            max_connections = min_connections;
        }
        let acquire_timeout_secs = parse_env_u64("PG_ACQUIRE_TIMEOUT_SECS", 30);

        let pool = PgPoolOptions::new()
            .after_connect(|conn, _| {
                Box::pin(async move {
                    sqlx::query("SET search_path TO auth, content, billing, activity, core, public")
                        .execute(conn)
                        .await?;
                    Ok(())
                })
            })
            .max_connections(max_connections)
            .min_connections(min_connections)
            .acquire_timeout(std::time::Duration::from_secs(acquire_timeout_secs))
            .connect_with(connect_options)
            .await?;

        let db = Self { pool };
        if matches!(schema_state, SchemaState::FreshInstall) {
            println!("🆕 Database created from scratch");
        }

        db_structure::ensure_system_info_record(&db.pool).await?;
        db_structure::ensure_default_categories(&db.pool).await?;
        db_structure::ensure_default_tv_channel_categories(&db.pool).await?;
        db_structure::ensure_default_admin_user(&db.pool).await?;

        Ok(db)
    }

    /// Get a user by username
    pub async fn get_user_by_username(
        &self,
        username: &str,
    ) -> anyhow::Result<Option<crate::models::user::User>> {
        let row = sqlx::query(
            "SELECT id, username, email, password_hash, role, credits, active, max_devices, created_by, expires_at, created_at,
                    daily_demo_limit, demos_created_today, last_demo_reset_date,
                    is_demo, demo_expires_at, subscription_source,
                    email_verified, email_verify_token, email_verify_expires
             FROM auth.users WHERE username = $1"
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            Ok(Some(crate::models::user::User {
                id: row.get("id"),
                username: row.get("username"),
                email: row.get("email"),
                password_hash: row.get("password_hash"),
                role: row.get::<String, _>("role").parse()?,
                credits: row.get("credits"),
                active: row.get("active"),
                max_devices: row.get("max_devices"),
                created_by: row.get("created_by"),
                expires_at: row.get("expires_at"),
                created_at: row.get("created_at"),
                daily_demo_limit: row.get("daily_demo_limit"),
                demos_created_today: row.get("demos_created_today"),
                last_demo_reset_date: row.get("last_demo_reset_date"),
                is_demo: row.get("is_demo"),
                demo_expires_at: row.get("demo_expires_at"),
                subscription_source: row.get("subscription_source"),
                email_verified: row.get("email_verified"),
                email_verify_token: row.get("email_verify_token"),
                email_verify_expires: row.get("email_verify_expires"),
                subscribed_categories: None,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get system configuration value
    pub async fn get_config(&self, key: &str) -> anyhow::Result<Option<String>> {
        let row = sqlx::query("SELECT value FROM core.config WHERE key = $1")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|r| r.get("value")))
    }

    /// Set system configuration value
    pub async fn set_config(&self, key: &str, value: &str) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO core.config (key, value, updated_at) VALUES ($1, $2, $3)
             ON CONFLICT(key) DO UPDATE SET value = $4, updated_at = $5",
        )
        .bind(key)
        .bind(value)
        .bind(Utc::now())
        .bind(value)
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get all categories
    pub async fn get_categories(&self) -> anyhow::Result<Vec<crate::models::content::Category>> {
        let rows = sqlx::query(
            "SELECT id, name, category_type, tmdb_id, created_at FROM content.categories ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;

        let categories = rows
            .into_iter()
            .map(|row| crate::models::content::Category {
                id: row.get("id"),
                name: row.get("name"),
                category_type: row.get("category_type"),
                tmdb_id: row.get("tmdb_id"),
                created_at: row.get("created_at"),
            })
            .collect();

        Ok(categories)
    }
}
