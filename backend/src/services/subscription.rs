use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};

use crate::models::subscription_plan::*;

// ─── Package CRUD ───

pub async fn list_active_packages(pool: &Pool<Postgres>) -> Result<Vec<Package>> {
    let packages = sqlx::query_as::<_, Package>(
        "SELECT * FROM billing.packages WHERE active = true ORDER BY sort_order ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(packages)
}

pub async fn list_all_packages(pool: &Pool<Postgres>) -> Result<Vec<Package>> {
    let packages = sqlx::query_as::<_, Package>(
        "SELECT * FROM billing.packages ORDER BY sort_order ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(packages)
}

pub async fn get_package(pool: &Pool<Postgres>, id: i64) -> Result<Option<Package>> {
    let package =
        sqlx::query_as::<_, Package>("SELECT * FROM billing.packages WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    Ok(package)
}

pub async fn create_package(
    pool: &Pool<Postgres>,
    req: &CreatePackageRequest,
) -> Result<Package> {
    let currency = req.currency.as_deref().unwrap_or("usd");
    let max_devices = req.max_devices.unwrap_or(1);
    let sort_order = req.sort_order.unwrap_or(0);
    let category_ids_json = serde_json::to_value(&req.category_ids)?;

    let package = sqlx::query_as::<_, Package>(
        r#"
        INSERT INTO billing.packages
            (name, description, price_cents, currency, billing_mode, billing_interval,
             duration_days, max_devices, category_ids, features, stripe_price_id,
             badge_text, badge_color, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
        "#,
    )
    .bind(&req.name)
    .bind(&req.description)
    .bind(req.price_cents)
    .bind(currency)
    .bind(&req.billing_mode)
    .bind(&req.billing_interval)
    .bind(req.duration_days)
    .bind(max_devices)
    .bind(&category_ids_json)
    .bind(&req.features)
    .bind(&req.stripe_price_id)
    .bind(&req.badge_text)
    .bind(&req.badge_color)
    .bind(sort_order)
    .fetch_one(pool)
    .await?;

    Ok(package)
}

pub async fn update_package(
    pool: &Pool<Postgres>,
    id: i64,
    req: &UpdatePackageRequest,
) -> Result<Option<Package>> {
    // Fetch current package first
    let current = match get_package(pool, id).await? {
        Some(p) => p,
        None => return Ok(None),
    };

    let name = req.name.as_deref().unwrap_or(&current.name);
    let description = req.description.as_deref().or(current.description.as_deref());
    let price_cents = req.price_cents.unwrap_or(current.price_cents);
    let currency = req.currency.as_deref().unwrap_or(&current.currency);
    let billing_mode = req.billing_mode.as_deref().unwrap_or(&current.billing_mode);
    let billing_interval = req
        .billing_interval
        .as_deref()
        .or(current.billing_interval.as_deref());
    let duration_days = req.duration_days.or(current.duration_days);
    let max_devices = req.max_devices.unwrap_or(current.max_devices);
    let category_ids = match &req.category_ids {
        Some(ids) => serde_json::to_value(ids)?,
        None => current.category_ids.clone(),
    };
    let features = req.features.as_ref().or(current.features.as_ref());
    let stripe_price_id = req
        .stripe_price_id
        .as_deref()
        .or(current.stripe_price_id.as_deref());
    let badge_text = req.badge_text.as_deref().or(current.badge_text.as_deref());
    let badge_color = req.badge_color.as_deref().or(current.badge_color.as_deref());
    let active = req.active.unwrap_or(current.active);
    let sort_order = req.sort_order.unwrap_or(current.sort_order);

    let package = sqlx::query_as::<_, Package>(
        r#"
        UPDATE billing.packages SET
            name = $1, description = $2, price_cents = $3, currency = $4,
            billing_mode = $5, billing_interval = $6, duration_days = $7,
            max_devices = $8, category_ids = $9, features = $10,
            stripe_price_id = $11, badge_text = $12, badge_color = $13,
            active = $14, sort_order = $15, updated_at = NOW()
        WHERE id = $16
        RETURNING *
        "#,
    )
    .bind(name)
    .bind(description)
    .bind(price_cents)
    .bind(currency)
    .bind(billing_mode)
    .bind(billing_interval)
    .bind(duration_days)
    .bind(max_devices)
    .bind(&category_ids)
    .bind(features)
    .bind(stripe_price_id)
    .bind(badge_text)
    .bind(badge_color)
    .bind(active)
    .bind(sort_order)
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(package)
}

pub async fn deactivate_package(pool: &Pool<Postgres>, id: i64) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE billing.packages SET active = false, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn delete_package(pool: &Pool<Postgres>, id: i64) -> Result<bool> {
    // Check for active subscriptions referencing this package
    let active_subs: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM billing.direct_subscriptions WHERE package_id = $1 AND status IN ('active', 'pending', 'past_due')",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    if active_subs > 0 {
        anyhow::bail!("Cannot delete package: {} active subscription(s) still reference it. Deactivate subscriptions first.", active_subs);
    }

    // Delete any expired/canceled subscriptions referencing this package first
    sqlx::query("DELETE FROM billing.direct_subscriptions WHERE package_id = $1")
        .bind(id)
        .execute(pool)
        .await?;

    // Now delete the package itself
    let result = sqlx::query("DELETE FROM billing.packages WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

// ─── Direct Subscription management ───

pub async fn get_user_subscription(
    pool: &Pool<Postgres>,
    user_id: i64,
) -> Result<Option<DirectSubscription>> {
    let sub = sqlx::query_as::<_, DirectSubscription>(
        "SELECT * FROM billing.direct_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(sub)
}

pub async fn create_direct_subscription(
    pool: &Pool<Postgres>,
    user_id: i64,
    package_id: i64,
    stripe_session_id: &str,
    stripe_customer_id: Option<&str>,
) -> Result<DirectSubscription> {
    let sub = sqlx::query_as::<_, DirectSubscription>(
        r#"
        INSERT INTO billing.direct_subscriptions
            (user_id, package_id, stripe_session_id, stripe_customer_id, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(package_id)
    .bind(stripe_session_id)
    .bind(stripe_customer_id)
    .fetch_one(pool)
    .await?;
    Ok(sub)
}

pub async fn activate_subscription(
    pool: &Pool<Postgres>,
    user_id: i64,
    package: &Package,
    stripe_subscription_id: Option<&str>,
    stripe_customer_id: Option<&str>,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
) -> Result<()> {
    let mut tx = pool.begin().await?;

    // Update subscription record
    sqlx::query(
        r#"
        UPDATE billing.direct_subscriptions
        SET status = 'active',
            stripe_subscription_id = COALESCE($2, stripe_subscription_id),
            stripe_customer_id = COALESCE($3, stripe_customer_id),
            current_period_start = $4,
            current_period_end = $5,
            updated_at = NOW()
        WHERE user_id = $1 AND status IN ('pending', 'active', 'past_due')
        "#,
    )
    .bind(user_id)
    .bind(stripe_subscription_id)
    .bind(stripe_customer_id)
    .bind(period_start)
    .bind(period_end)
    .execute(&mut *tx)
    .await?;

    // Activate user and set expiry/devices
    sqlx::query(
        r#"
        UPDATE auth.users
        SET active = true,
            expires_at = $2,
            max_devices = $3,
            subscription_source = 'direct',
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .bind(period_end)
    .bind(package.max_devices)
    .execute(&mut *tx)
    .await?;

    // Set user category subscriptions from the package
    let category_ids: Vec<i64> = serde_json::from_value(package.category_ids.clone())
        .unwrap_or_default();

    // Clear existing subscriptions
    sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    // Insert new subscriptions
    for cat_id in &category_ids {
        sqlx::query(
            "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2)
             ON CONFLICT (user_id, category_id) DO NOTHING",
        )
        .bind(user_id)
        .bind(*cat_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    tracing::info!(
        user_id = user_id,
        package_id = package.id,
        "✅ Direct subscription activated"
    );
    Ok(())
}

pub async fn mark_subscription_status(
    pool: &Pool<Postgres>,
    stripe_subscription_id: &str,
    status: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE billing.direct_subscriptions SET status = $1, updated_at = NOW() WHERE stripe_subscription_id = $2",
    )
    .bind(status)
    .bind(stripe_subscription_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_subscription_period(
    pool: &Pool<Postgres>,
    stripe_subscription_id: &str,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
) -> Result<()> {
    // Update the subscription record
    sqlx::query(
        r#"
        UPDATE billing.direct_subscriptions
        SET current_period_start = $1, current_period_end = $2,
            status = 'active', updated_at = NOW()
        WHERE stripe_subscription_id = $3
        "#,
    )
    .bind(period_start)
    .bind(period_end)
    .bind(stripe_subscription_id)
    .execute(pool)
    .await?;

    // Also update user expires_at
    sqlx::query(
        r#"
        UPDATE auth.users SET expires_at = $1, active = true, updated_at = NOW()
        WHERE id = (
            SELECT user_id FROM billing.direct_subscriptions
            WHERE stripe_subscription_id = $2
        )
        "#,
    )
    .bind(period_end)
    .bind(stripe_subscription_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn cancel_subscription_at_period_end(
    pool: &Pool<Postgres>,
    user_id: i64,
) -> Result<Option<DirectSubscription>> {
    let sub = sqlx::query_as::<_, DirectSubscription>(
        r#"
        UPDATE billing.direct_subscriptions
        SET cancel_at_period_end = true, updated_at = NOW()
        WHERE user_id = $1 AND status = 'active'
        RETURNING *
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(sub)
}

#[allow(dead_code)]
pub async fn get_subscription_by_stripe_id(
    pool: &Pool<Postgres>,
    stripe_subscription_id: &str,
) -> Result<Option<DirectSubscription>> {
    let sub = sqlx::query_as::<_, DirectSubscription>(
        "SELECT * FROM billing.direct_subscriptions WHERE stripe_subscription_id = $1",
    )
    .bind(stripe_subscription_id)
    .fetch_optional(pool)
    .await?;
    Ok(sub)
}

#[allow(dead_code)]
pub async fn get_subscription_by_session_id(
    pool: &Pool<Postgres>,
    session_id: &str,
) -> Result<Option<DirectSubscription>> {
    let sub = sqlx::query_as::<_, DirectSubscription>(
        "SELECT * FROM billing.direct_subscriptions WHERE stripe_session_id = $1",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    Ok(sub)
}

// ─── Admin stats ───

pub async fn get_subscription_stats(pool: &Pool<Postgres>) -> Result<DirectSubscriptionStats> {
    let total_active: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM billing.direct_subscriptions WHERE status = 'active'",
    )
    .fetch_one(pool)
    .await?;

    let total_canceled: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM billing.direct_subscriptions WHERE status = 'canceled'",
    )
    .fetch_one(pool)
    .await?;

    let total_expired: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM billing.direct_subscriptions WHERE status = 'expired'",
    )
    .fetch_one(pool)
    .await?;

    // This is the sum of package prices for active subs (approximation)
    let total_revenue_cents: i64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(p.price_cents), 0)
        FROM billing.direct_subscriptions ds
        JOIN billing.packages p ON ds.package_id = p.id
        WHERE ds.status = 'active'
        "#,
    )
    .fetch_one(pool)
    .await?;

    let new_this_month: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM billing.direct_subscriptions WHERE created_at >= date_trunc('month', NOW())",
    )
    .fetch_one(pool)
    .await?;

    Ok(DirectSubscriptionStats {
        total_active,
        total_canceled,
        total_expired,
        total_revenue_cents,
        new_this_month,
    })
}

// ─── Email verification helpers ───

pub async fn generate_email_verify_token(
    pool: &Pool<Postgres>,
    user_id: i64,
) -> Result<String> {
    use rand::{distributions::Alphanumeric, Rng};
    
    // Generate cryptographically secure random token (C-05)
    let token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();

    let expires = Utc::now() + chrono::Duration::hours(24);

    sqlx::query(
        "UPDATE auth.users SET email_verify_token = $1, email_verify_expires = $2 WHERE id = $3",
    )
    .bind(&token)
    .bind(expires)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(token)
}

pub async fn verify_email_token(
    pool: &Pool<Postgres>,
    token: &str,
) -> Result<Option<i64>> {
    let user_id: Option<i64> = sqlx::query_scalar(
        r#"
        UPDATE auth.users
        SET email_verified = true,
            email_verify_token = NULL,
            email_verify_expires = NULL
        WHERE email_verify_token = $1
          AND email_verify_expires > NOW()
        RETURNING id
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;

    Ok(user_id)
}

// ─── Config helpers ───

pub async fn is_direct_registration_enabled(pool: &Pool<Postgres>) -> bool {
    sqlx::query_scalar::<_, String>(
        "SELECT value FROM core.config WHERE key = 'allow_direct_registration'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|v| v == "true")
    .unwrap_or(false)
}

pub async fn is_email_verification_required(pool: &Pool<Postgres>) -> bool {
    sqlx::query_scalar::<_, String>(
        "SELECT value FROM core.config WHERE key = 'require_email_verification'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|v| v == "true")
    .unwrap_or(false)
}
