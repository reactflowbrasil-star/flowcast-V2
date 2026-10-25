use axum::{extract::State, Extension, Json};
use serde::Serialize;

use crate::error::AppError;
use crate::models::user::{User, UserRole};
use crate::AppState;

#[derive(Debug, Serialize, Clone)]
pub struct Notification {
    pub id: String,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    pub count: Option<i64>,
    pub priority: String, // high, medium, low
    pub created_at: String,
    pub action_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NotificationsResponse {
    pub notifications: Vec<Notification>,
    pub total_count: i64,
    pub unread_count: i64,
}

// Reseller Notifications
pub async fn get_reseller_notifications(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<Json<NotificationsResponse>, AppError> {
    if user.role != UserRole::Reseller {
        return Err(AppError::Forbidden);
    }
    let mut notifications = Vec::new();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 1. Users expiring soon (next 7 days)
    let expiring_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM auth.users 
        WHERE created_by = $1 
        AND role = 'end_user' 
        AND active = true
        AND expires_at IS NOT NULL 
        AND expires_at > NOW() 
        AND expires_at <= NOW() + INTERVAL '7 days'
        "#,
    )
    .bind(user.id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    if expiring_count > 0 {
        notifications.push(Notification {
            id: "expiring_users".to_string(),
            notification_type: "warning".to_string(),
            title: "Users Expiring Soon".to_string(),
            message: format!("{} user(s) will expire in the next 7 days", expiring_count),
            count: Some(expiring_count),
            priority: "high".to_string(),
            created_at: now.clone(),
            action_url: Some("/reseller?tab=expiring".to_string()),
        });
    }

    // 2. Already expired users (last 30 days)
    let expired_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM auth.users 
        WHERE created_by = $1 
        AND role = 'end_user' 
        AND expires_at IS NOT NULL 
        AND expires_at <= NOW()
        AND expires_at >= NOW() - INTERVAL '30 days'
        "#,
    )
    .bind(user.id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    if expired_count > 0 {
        notifications.push(Notification {
            id: "expired_users".to_string(),
            notification_type: "error".to_string(),
            title: "Expired Subscriptions".to_string(),
            message: format!("{} user(s) have expired subscriptions", expired_count),
            count: Some(expired_count),
            priority: "high".to_string(),
            created_at: now.clone(),
            action_url: Some("/reseller?tab=users&status=expired".to_string()),
        });
    }

    // 3. Low credits warning
    let credits: f64 = sqlx::query_scalar("SELECT credits FROM auth.users WHERE id = $1")
        .bind(user.id)
        .fetch_one(&app_state.database.pool)
        .await
        .unwrap_or(0.0);

    if credits < 10.0 {
        notifications.push(Notification {
            id: "low_credits".to_string(),
            notification_type: if credits < 5.0 { "error" } else { "warning" }.to_string(),
            title: "Low Credit Balance".to_string(),
            message: format!(
                "Your credit balance is low: {:.1} credits remaining",
                credits
            ),
            count: None,
            priority: if credits < 5.0 { "high" } else { "medium" }.to_string(),
            created_at: now.clone(),
            action_url: Some("/reseller?tab=credits".to_string()),
        });
    }

    // 4. API Key activity (keys used in last 24h)
    let active_keys: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM auth.reseller_api_keys 
        WHERE reseller_id = $1 
        AND is_active = true
        AND last_used_at >= NOW() - INTERVAL '24 hours'
        "#,
    )
    .bind(user.id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    if active_keys > 0 {
        notifications.push(Notification {
            id: "api_activity".to_string(),
            notification_type: "info".to_string(),
            title: "API Activity".to_string(),
            message: format!("{} API key(s) used in the last 24 hours", active_keys),
            count: Some(active_keys),
            priority: "low".to_string(),
            created_at: now.clone(),
            action_url: Some("/reseller?tab=api-keys".to_string()),
        });
    }

    // 5. Pending support tickets
    let pending_tickets: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM core.support_tickets 
        WHERE user_id = $1 
        AND status IN ('open', 'in_progress')
        "#,
    )
    .bind(user.id)
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    if pending_tickets > 0 {
        notifications.push(Notification {
            id: "pending_tickets".to_string(),
            notification_type: "info".to_string(),
            title: "Support Tickets".to_string(),
            message: format!("{} open support ticket(s)", pending_tickets),
            count: Some(pending_tickets),
            priority: "medium".to_string(),
            created_at: now.clone(),
            action_url: Some("/reseller?tab=tickets".to_string()),
        });
    }

    let total_count = notifications.len() as i64;
    let unread_count = notifications
        .iter()
        .filter(|n| n.priority == "high")
        .count() as i64;

    Ok(Json(NotificationsResponse {
        notifications,
        total_count,
        unread_count,
    }))
}

// Admin Notifications
pub async fn get_admin_notifications(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<Json<NotificationsResponse>, AppError> {
    if !matches!(user.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let mut notifications = Vec::new();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    #[derive(sqlx::FromRow, Default)]
    struct AdminNotificationMetrics {
        recent_purchases: i64,
        recent_credits: i64,
        new_resellers: i64,
        pending_tickets: i64,
        expiring_soon: i64,
        failed_logins: i64,
        total_content: i64,
        total_users: i64,
    }

    let metrics = match sqlx::query_as::<_, AdminNotificationMetrics>(
        r#"
        SELECT
            (SELECT COUNT(*) FROM billing.billing_transactions
             WHERE status = 'completed'
             AND created_at >= NOW() - INTERVAL '24 hours') AS recent_purchases,
            (SELECT COALESCE(SUM(credits_qty), 0) FROM billing.billing_transactions
             WHERE status = 'completed'
             AND created_at >= NOW() - INTERVAL '24 hours') AS recent_credits,
            (SELECT COUNT(*) FROM auth.users
             WHERE role = 'reseller'
             AND created_at >= NOW() - INTERVAL '7 days') AS new_resellers,
            (SELECT COUNT(*) FROM core.support_tickets WHERE status = 'open') AS pending_tickets,
            (SELECT COUNT(*) FROM auth.users
             WHERE role = 'end_user'
             AND active = true
             AND expires_at IS NOT NULL
             AND expires_at > NOW()
             AND expires_at <= NOW() + INTERVAL '3 days') AS expiring_soon,
            (SELECT COUNT(*) FROM auth.security_incidents
             WHERE incident_type = 'failed_login'
             AND created_at >= NOW() - INTERVAL '24 hours') AS failed_logins,
            (SELECT COUNT(*) FROM content.media_content) AS total_content,
            (SELECT COUNT(*) FROM auth.users WHERE role = 'end_user') AS total_users
        "#,
    )
    .fetch_one(&app_state.database.pool)
    .await
    {
        Ok(row) => row,
        Err(err) => {
            tracing::warn!(error = %err, "Failed to load admin notification metrics");
            AdminNotificationMetrics::default()
        }
    };

    // 1. Recent credit purchases (last 24h)
    let recent_purchases = metrics.recent_purchases;

    if recent_purchases > 0 {
        let total_credits = metrics.recent_credits;

        notifications.push(Notification {
            id: "recent_purchases".to_string(),
            notification_type: "success".to_string(),
            title: "New Credit Purchases".to_string(),
            message: format!(
                "{} purchase(s) totaling {} credits in last 24h",
                recent_purchases, total_credits
            ),
            count: Some(recent_purchases),
            priority: "medium".to_string(),
            created_at: now.clone(),
            action_url: Some("/admin?tab=billing".to_string()),
        });
    }

    // 2. New resellers (last 7 days)
    let new_resellers = metrics.new_resellers;

    if new_resellers > 0 {
        notifications.push(Notification {
            id: "new_resellers".to_string(),
            notification_type: "info".to_string(),
            title: "New Resellers".to_string(),
            message: format!("{} new reseller(s) registered this week", new_resellers),
            count: Some(new_resellers),
            priority: "low".to_string(),
            created_at: now.clone(),
            action_url: Some("/admin?tab=resellers".to_string()),
        });
    }

    // 3. Pending support tickets
    let pending_tickets = metrics.pending_tickets;

    if pending_tickets > 0 {
        notifications.push(Notification {
            id: "pending_tickets".to_string(),
            notification_type: if pending_tickets > 5 {
                "warning"
            } else {
                "info"
            }
            .to_string(),
            title: "Open Support Tickets".to_string(),
            message: format!("{} ticket(s) awaiting response", pending_tickets),
            count: Some(pending_tickets),
            priority: if pending_tickets > 5 {
                "high"
            } else {
                "medium"
            }
            .to_string(),
            created_at: now.clone(),
            action_url: Some("/admin?tab=tickets".to_string()),
        });
    }

    // 4. Users expiring system-wide (next 3 days)
    let expiring_soon = metrics.expiring_soon;

    if expiring_soon > 0 {
        notifications.push(Notification {
            id: "expiring_users".to_string(),
            notification_type: "warning".to_string(),
            title: "Users Expiring Soon".to_string(),
            message: format!("{} user(s) expiring in the next 3 days", expiring_soon),
            count: Some(expiring_soon),
            priority: "medium".to_string(),
            created_at: now.clone(),
            action_url: Some("/admin?tab=users".to_string()),
        });
    }

    // 5. Security alerts (failed logins in last 24h)
    let failed_logins = metrics.failed_logins;

    if failed_logins > 10 {
        notifications.push(Notification {
            id: "security_alerts".to_string(),
            notification_type: "error".to_string(),
            title: "Security Alert".to_string(),
            message: format!("{} failed login attempts in last 24 hours", failed_logins),
            count: Some(failed_logins),
            priority: "high".to_string(),
            created_at: now.clone(),
            action_url: Some("/admin?tab=security".to_string()),
        });
    }

    // 6. Low storage or system alerts (placeholder)
    let total_content = metrics.total_content;
    let total_users = metrics.total_users;

    // System stats notification
    notifications.push(Notification {
        id: "system_stats".to_string(),
        notification_type: "info".to_string(),
        title: "System Overview".to_string(),
        message: format!("{} content items, {} end users", total_content, total_users),
        count: None,
        priority: "low".to_string(),
        created_at: now.clone(),
        action_url: Some("/admin".to_string()),
    });

    let total_count = notifications.len() as i64;
    let unread_count = notifications
        .iter()
        .filter(|n| n.priority == "high")
        .count() as i64;

    Ok(Json(NotificationsResponse {
        notifications,
        total_count,
        unread_count,
    }))
}
