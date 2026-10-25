use crate::database::Database;
use crate::error::AppError;
use crate::models::user_activity::*;
use sqlx::{Postgres, QueryBuilder, Row};
use tracing::info;

#[derive(Clone)]
pub struct UserActivityService {
    db: Database,
}

/// Parameters for logging a simple streaming viewing event.
pub struct SimpleViewingEvent<'a> {
    pub user_id: i64,
    pub username: &'a str,
    pub content_id: i64,
    pub content_title: &'a str,
    pub content_type: &'a str,
    pub series_title: Option<&'a str>,
    pub ip_address: Option<&'a str>,
    pub device_info: Option<&'a str>,
}

impl UserActivityService {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Log a user login event
    pub async fn log_login(
        &self,
        request: CreateLoginHistoryRequest,
    ) -> Result<UserLoginHistory, AppError> {
        let login = sqlx::query_as::<_, UserLoginHistory>(
            r#"
            INSERT INTO activity.user_login_history (
                user_id, username, ip_address, device_info, user_agent, success
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            "#,
        )
        .bind(request.user_id)
        .bind(&request.username)
        .bind(&request.ip_address)
        .bind(&request.device_info)
        .bind(&request.user_agent)
        .bind(request.success)
        .fetch_one(&self.db.pool)
        .await?;

        info!(
            "Logged login for user {} ({})",
            request.username, request.user_id
        );
        Ok(login)
    }

    /// Log a content viewing event
    pub async fn log_viewing(
        &self,
        request: CreateViewingHistoryRequest,
    ) -> Result<UserViewingHistory, AppError> {
        let row = sqlx::query(
            r#"
            INSERT INTO activity.user_viewing_history (
                user_id, username, content_type, content_id, content_title,
                episode_title, season_number, episode_number,
                series_title, ip_address, device_info, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id, user_id, username, content_type, content_id, content_title, episode_title, season_number, episode_number, start_timestamp, ip_address, device_info, user_agent, series_title
            "#,
        )
        .bind(request.user_id)
        .bind(&request.username)
        .bind(&request.content_type)
        .bind(request.content_id)
        .bind(&request.content_title)
        .bind(&request.episode_title)
        .bind(request.season_number)
        .bind(request.episode_number)
        .bind(&request.series_title)
        .bind(&request.ip_address)
        .bind(&request.device_info)
        .bind(&request.user_agent)
        .fetch_one(&self.db.pool)
        .await?;

        let viewing = UserViewingHistory {
            id: row.get("id"),
            user_id: row.get("user_id"),
            username: row.get("username"),
            content_type: row.get("content_type"),
            content_id: row.get("content_id"),
            content_title: row.get("content_title"),
            episode_title: row.get("episode_title"),
            season_number: row.get("season_number"),
            episode_number: row.get("episode_number"),
            start_timestamp: row.get("start_timestamp"),
            ip_address: row.get("ip_address"),
            device_info: row.get("device_info"),
            user_agent: row.get("user_agent"),
            series_title: row.get("series_title"),
        };

        info!(
            "Logged viewing for user {} ({}): {} - {}",
            request.username, request.user_id, request.content_type, request.content_title
        );
        Ok(viewing)
    }


    /// Simple logging for streaming requests - just basic info
    pub async fn log_simple_viewing(
        &self,
        event: SimpleViewingEvent<'_>,
    ) -> Result<UserViewingHistory, AppError> {
        let row = sqlx::query(
            r#"
            INSERT INTO activity.user_viewing_history (
                user_id, username, content_type, content_id, content_title,
                series_title, ip_address, device_info
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, user_id, username, content_type, content_id, content_title, 
                      NULL::TEXT as episode_title, NULL::INTEGER as season_number, 
                      NULL::INTEGER as episode_number, start_timestamp, ip_address, 
                      device_info, NULL::TEXT as user_agent, series_title
            "#,
        )
        .bind(event.user_id)
        .bind(event.username)
        .bind(event.content_type)
        .bind(event.content_id)
        .bind(event.content_title)
        .bind(event.series_title)
        .bind(event.ip_address)
        .bind(event.device_info)
        .fetch_one(&self.db.pool)
        .await?;

        let viewing = UserViewingHistory {
            id: row.get("id"),
            user_id: row.get("user_id"),
            username: row.get("username"),
            content_type: row.get("content_type"),
            content_id: row.get("content_id"),
            content_title: row.get("content_title"),
            episode_title: row.get("episode_title"),
            season_number: row.get("season_number"),
            episode_number: row.get("episode_number"),
            start_timestamp: row.get("start_timestamp"),
            ip_address: row.get("ip_address"),
            device_info: row.get("device_info"),
            user_agent: row.get("user_agent"),
            series_title: row.get("series_title"),
        };

        info!(
            "📺 STREAMING: User {} ({}) watching {} (ID: {}) - Type: {}",
            event.username, event.user_id, event.content_title, event.content_id, event.content_type
        );
        Ok(viewing)
    }

    /// Get login history with filters and pagination
    pub async fn get_login_history(
        &self,
        filters: ActivityFilters,
    ) -> Result<LoginHistoryResponse, AppError> {
        let page = filters.page.unwrap_or(1).max(1);
        let limit = filters.limit.unwrap_or(50).max(1);
        let offset = (page - 1) * limit;

        let mut count_builder =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM activity.user_login_history");
        let mut data_builder = QueryBuilder::<Postgres>::new("SELECT * FROM activity.user_login_history");

        let apply_filters = |builder: &mut QueryBuilder<'_, Postgres>| {
            let mut filter_has_where = false;
            if let Some(user_id) = filters.user_id {
                builder.push(" WHERE ");
                builder.push("user_id = ").push_bind(user_id);
                filter_has_where = true;
            }
            if let Some(username) = &filters.username {
                if !filter_has_where {
                    builder.push(" WHERE ");
                    filter_has_where = true;
                } else {
                    builder.push(" AND ");
                }
                builder
                    .push("username LIKE ")
                    .push_bind(format!("%{}%", username));
            }
            if let Some(start_date) = &filters.start_date {
                if !filter_has_where {
                    builder.push(" WHERE ");
                    filter_has_where = true;
                } else {
                    builder.push(" AND ");
                }
                builder
                    .push("login_timestamp >= ")
                    .push_bind(start_date.clone());
            }
            if let Some(end_date) = &filters.end_date {
                if !filter_has_where {
                    builder.push(" WHERE ");
                    filter_has_where = true;
                } else {
                    builder.push(" AND ");
                }
                builder
                    .push("login_timestamp <= ")
                    .push_bind(end_date.clone());
            }
            if let Some(ip_address) = &filters.ip_address {
                if !filter_has_where {
                    builder.push(" WHERE ");
                } else {
                    builder.push(" AND ");
                }
                builder.push("ip_address = ").push_bind(ip_address.clone());
            }
        };

        apply_filters(&mut count_builder);
        apply_filters(&mut data_builder);

        let total: i64 = count_builder
            .build_query_scalar()
            .fetch_one(&self.db.pool)
            .await?;

        data_builder.push(" ORDER BY login_timestamp DESC LIMIT ");
        data_builder.push_bind(limit);
        data_builder.push(" OFFSET ");
        data_builder.push_bind(offset);

        let logs: Vec<UserLoginHistory> = data_builder
            .build_query_as()
            .fetch_all(&self.db.pool)
            .await?;

        let total_pages = if limit > 0 {
            (total + limit - 1) / limit
        } else {
            0
        };

        Ok(LoginHistoryResponse {
            logs,
            total,
            page,
            limit,
            total_pages,
        })
    }

    /// Get viewing history with filters and pagination
    pub async fn get_viewing_history(
        &self,
        filters: ActivityFilters,
    ) -> Result<ViewingHistoryResponse, AppError> {
        let page = filters.page.unwrap_or(1).max(1);
        let limit = filters.limit.unwrap_or(50).max(1);
        let offset = (page - 1) * limit;

        let mut count_builder =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM activity.user_viewing_history");
        let mut data_builder = QueryBuilder::<Postgres>::new("SELECT * FROM activity.user_viewing_history");

        let apply_filters = |builder: &mut QueryBuilder<'_, Postgres>| {
            let mut filter_has_where = false;
            if let Some(user_id) = filters.user_id {
                builder.push(" WHERE ");
                builder.push("user_id = ").push_bind(user_id);
                filter_has_where = true;
            }
            if let Some(username) = &filters.username {
                if !filter_has_where {
                    builder.push(" WHERE ");
                    filter_has_where = true;
                } else {
                    builder.push(" AND ");
                }
                builder
                    .push("username LIKE ")
                    .push_bind(format!("%{}%", username));
            }
            if let Some(content_type) = &filters.content_type {
                if !filter_has_where {
                    builder.push(" WHERE ");
                    filter_has_where = true;
                } else {
                    builder.push(" AND ");
                }
                builder
                    .push("content_type = ")
                    .push_bind(content_type.clone());
            }
            if let Some(start_date) = &filters.start_date {
                if !filter_has_where {
                    builder.push(" WHERE ");
                    filter_has_where = true;
                } else {
                    builder.push(" AND ");
                }
                builder
                    .push("start_timestamp >= ")
                    .push_bind(start_date.clone());
            }
            if let Some(end_date) = &filters.end_date {
                if !filter_has_where {
                    builder.push(" WHERE ");
                    filter_has_where = true;
                } else {
                    builder.push(" AND ");
                }
                builder
                    .push("start_timestamp <= ")
                    .push_bind(end_date.clone());
            }
            if let Some(ip_address) = &filters.ip_address {
                if !filter_has_where {
                    builder.push(" WHERE ");
                } else {
                    builder.push(" AND ");
                }
                builder.push("ip_address = ").push_bind(ip_address.clone());
            }
        };

        apply_filters(&mut count_builder);
        apply_filters(&mut data_builder);

        let total: i64 = count_builder
            .build_query_scalar()
            .fetch_one(&self.db.pool)
            .await?;

        data_builder.push(" ORDER BY start_timestamp DESC LIMIT ");
        data_builder.push_bind(limit);
        data_builder.push(" OFFSET ");
        data_builder.push_bind(offset);

        let logs: Vec<UserViewingHistory> = data_builder
            .build_query_as()
            .fetch_all(&self.db.pool)
            .await?;

        let total_pages = if limit > 0 {
            (total + limit - 1) / limit
        } else {
            0
        };

        Ok(ViewingHistoryResponse {
            logs,
            total,
            page,
            limit,
            total_pages,
        })
    }

    /// Get dashboard metrics for analytics
    pub async fn get_dashboard_metrics(&self) -> Result<DashboardMetrics, AppError> {
        // Total logins today
        let total_logins_today = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM activity.user_login_history WHERE DATE(login_timestamp) = CURRENT_DATE",
        )
        .fetch_one(&self.db.pool)
        .await?;

        // Unique active users (last 7 days)
        let unique_active_users = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT user_id) FROM activity.user_login_history WHERE login_timestamp >= CURRENT_DATE - INTERVAL '7 days' AND success = true"
        )
        .fetch_one(&self.db.pool)
        .await?;

        // Failed login attempts today
        let failed_login_attempts = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM activity.user_login_history WHERE DATE(login_timestamp) = CURRENT_DATE AND success = false"
        )
        .fetch_one(&self.db.pool)
        .await?;

        // Total content views (last 7 days)
        let total_content_views = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM activity.user_viewing_history WHERE start_timestamp >= CURRENT_DATE - INTERVAL '7 days'"
        )
        .fetch_one(&self.db.pool)
        .await?;

        // Most viewed content (last 7 days)
        let most_viewed_content = sqlx::query_as::<_, PopularContent>(
            r#"
            SELECT content_id, content_title, content_type, COUNT(*) as view_count
            FROM activity.user_viewing_history
            WHERE start_timestamp >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY content_id, content_title, content_type
            ORDER BY view_count DESC
            LIMIT 10
            "#,
        )
        .fetch_all(&self.db.pool)
        .await?;

        // Device distribution
        let device_stats = sqlx::query_as::<_, (Option<String>, i64)>(
            r#"
            SELECT device_info, COUNT(*) as count
            FROM activity.user_login_history
            WHERE login_timestamp >= CURRENT_DATE - INTERVAL '7 days' AND success = true
            GROUP BY device_info
            "#,
        )
        .fetch_all(&self.db.pool)
        .await?;

        let total_devices: i64 = device_stats.iter().map(|d| d.1).sum();
        let device_distribution: Vec<DeviceStats> = device_stats
            .into_iter()
            .map(|(device_info, count): (Option<String>, i64)| DeviceStats {
                device_type: device_info.unwrap_or_else(|| "Unknown".to_string()),
                count,
                percentage: if total_devices > 0 {
                    (count as f64 / total_devices as f64) * 100.0
                } else {
                    0.0
                },
            })
            .collect();

        // Hourly activity (simplified approach)
        let mut hourly_activity = Vec::new();
        for hour in 0..24 {
            let login_count = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM activity.user_login_history WHERE EXTRACT(HOUR FROM login_timestamp) = $1 AND login_timestamp >= NOW() - INTERVAL '24 hours' AND success = true"
            )
            .bind(hour as f64)
            .fetch_one(&self.db.pool)
            .await?;

            let view_count = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM activity.user_viewing_history WHERE EXTRACT(HOUR FROM start_timestamp) = $1 AND start_timestamp >= NOW() - INTERVAL '24 hours'"
            )
            .bind(hour as f64)
            .fetch_one(&self.db.pool)
            .await?;

            hourly_activity.push(HourlyActivity {
                hour,
                login_count,
                view_count,
            });
        }

        // Users with multiple devices (last 30 days)
        let users_multiple_devices_raw = sqlx::query_as::<_, (i64, String, i64, Option<String>)>(
            r#"
            SELECT
                user_id,
                username,
                COUNT(DISTINCT device_info) as device_count,
                STRING_AGG(DISTINCT device_info, ',') as devices
            FROM activity.user_login_history
            WHERE login_timestamp >= CURRENT_DATE - INTERVAL '30 days' AND success = true AND device_info IS NOT NULL
            GROUP BY user_id, username
            HAVING COUNT(DISTINCT device_info) > 2
            ORDER BY device_count DESC
            LIMIT 20
            "#
        )
        .fetch_all(&self.db.pool)
        .await?;

        let users_multiple_devices: Vec<MultiDeviceUser> = users_multiple_devices_raw
            .into_iter()
            .map(
                |(user_id, username, device_count, devices): (i64, String, i64, Option<String>)| {
                    MultiDeviceUser {
                        user_id,
                        username,
                        device_count,
                        devices: devices
                            .unwrap_or_default()
                            .split(',')
                            .map(|s: &str| s.trim().to_string())
                            .collect(),
                    }
                },
            )
            .collect();

        Ok(DashboardMetrics {
            total_logins_today,
            unique_active_users,
            failed_login_attempts,
            total_content_views,
            most_viewed_content,
            device_distribution,
            hourly_activity,
            users_multiple_devices,
        })
    }
}
