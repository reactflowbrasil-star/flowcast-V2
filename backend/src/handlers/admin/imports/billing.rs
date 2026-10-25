use axum::{
    extract::{Query, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};


use crate::error::AppError;
use crate::models::user::UserRole;
use crate::services::Claims;


// ========================================
// ===== Stripe Credits Pricing Config (Admin) =====

#[derive(Debug, Deserialize)]
pub struct PricingConfigPayload {
    pub base_price_usd: f64,
    pub tiers: Vec<crate::services::Tier>,
}

// GET /api/admin/credits/pricing-config - Get current pricing config
pub async fn get_pricing_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<crate::services::PricingConfig>, AppError> {
    // Only admins can access pricing configuration
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let pricing_service = crate::services::PricingService::new(app_state.database.clone());
    let cfg = pricing_service.load_config().await?;
    Ok(Json(cfg))
}

// PUT /api/admin/credits/pricing-config - Update pricing config (base price + tiers)
pub async fn update_pricing_config(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<PricingConfigPayload>,
) -> Result<Json<crate::services::PricingConfig>, AppError> {
    // Only admins can update pricing configuration
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Validate input
    if payload.base_price_usd <= 0.0 {
        return Err(AppError::BadRequest(
            "base_price_usd must be > 0".to_string(),
        ));
    }
    if payload.tiers.len() > 50 {
        return Err(AppError::BadRequest("Too many tiers (max 50)".to_string()));
    }

    // Validate tiers: min_qty > 0, percent between [0, 100], ascending by min_qty
    let mut last_min = 0i32;
    for (idx, t) in payload.tiers.iter().enumerate() {
        if t.min_qty <= 0 {
            return Err(AppError::BadRequest(format!(
                "tiers[{}].min_qty must be > 0",
                idx
            )));
        }
        if !(0.0..=100.0).contains(&t.percent) {
            return Err(AppError::BadRequest(format!(
                "tiers[{}].percent must be between 0 and 100",
                idx
            )));
        }
        if t.min_qty <= last_min {
            return Err(AppError::BadRequest(
                "tiers must be in strictly ascending order by min_qty".to_string(),
            ));
        }
        last_min = t.min_qty;
    }

    let cfg = crate::services::PricingConfig {
        base_price_usd: payload.base_price_usd,
        tiers: payload.tiers,
    };

    let pricing_service = crate::services::PricingService::new(app_state.database.clone());
    pricing_service.save_config(&cfg).await?;

    Ok(Json(cfg))
}

// ====== Billing (Admin) ======

#[derive(Debug, Deserialize, Serialize)]
pub struct BillingOverview {
    pub currency: String,
    pub online_amount_cents: i64,
    pub offline_amount_cents: i64,
    pub adjustments_amount_cents: i64,
    pub total_amount_cents: i64,
    pub credits_from_online: i64,
    pub credits_from_offline: i64,
    pub credits_from_adjustments: i64,
    pub total_credits: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateOfflinePaymentRequest {
    pub reseller_id: i64,
    pub amount_cents: i32, // positive
    pub currency: Option<String>,
    pub credits_qty: i32,          // positive
    pub method: Option<String>,    // cash/bank/other
    pub reference: Option<String>, // invoice number, etc.
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BillingTransactionResponse {
    pub id: i64,
    pub reseller_id: i64,
    pub reseller_username: String,
    pub source: String,
    pub method: Option<String>,
    pub reference: Option<String>,
    pub amount_cents: i32,
    pub currency: String,
    pub credits_qty: i32,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub created_by: Option<i64>,
}

/// GET /api/admin/billing/overview
pub async fn get_billing_overview(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<BillingOverview>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    // Sums from billing.credit_purchases (Stripe)
    let online_amount_from_purchases = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT SUM(amount_total_cents) FROM billing.credit_purchases WHERE status = 'completed'",
    )
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(None);

    let credits_from_purchases: Option<i64> =
        sqlx::query_scalar("SELECT SUM(quantity) FROM billing.credit_purchases WHERE status = 'completed'")
            .fetch_one(&app_state.database.pool)
            .await
            .unwrap_or(None);

    // Sums from unified billing_transactions table (only offline/adjustment for overview).
    // NOTE: Stripe purchases are already fully represented in credit_purchases.
    // To avoid double counting, we intentionally EXCLUDE source='stripe' here.

    let offline_amount_bt: Option<i64> = sqlx::query_scalar(
        "SELECT SUM(amount_cents) FROM billing.billing_transactions WHERE source = 'offline' AND status = 'completed'",
    )
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(None);

    let adjustments_amount_bt: Option<i64> = sqlx::query_scalar(
        "SELECT SUM(amount_cents) FROM billing.billing_transactions WHERE source = 'adjustment' AND status = 'completed'",
    )
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(None);

    let credits_from_bt_offline: Option<i64> = sqlx::query_scalar(
        "SELECT SUM(credits_qty) FROM billing.billing_transactions WHERE source = 'offline' AND status = 'completed'",
    )
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(None);
    let credits_from_bt_adj: Option<i64> = sqlx::query_scalar(
        "SELECT SUM(credits_qty) FROM billing.billing_transactions WHERE source = 'adjustment' AND status = 'completed'",
    )
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(None);

    // Online (Stripe) revenue exclusively from billing.credit_purchases to prevent double counting
    let online_amount_cents = online_amount_from_purchases.unwrap_or(0);
    let offline_amount_cents = offline_amount_bt.unwrap_or(0);
    let adjustments_amount_cents = adjustments_amount_bt.unwrap_or(0);
    let total_amount_cents = online_amount_cents + offline_amount_cents + adjustments_amount_cents;

    // Online (Stripe) credits exclusively from billing.credit_purchases to prevent double counting
    let credits_from_online = credits_from_purchases.unwrap_or(0);
    let credits_from_offline = credits_from_bt_offline.unwrap_or(0);
    let credits_from_adjustments = credits_from_bt_adj.unwrap_or(0);
    let total_credits = credits_from_online + credits_from_offline + credits_from_adjustments;

    let currency = crate::config::get_dynamic_config_value(
        &app_state.database.pool, "stripe_currency", &app_state.config.stripe_currency,
    ).await;

    Ok(Json(BillingOverview {
        currency,
        online_amount_cents,
        offline_amount_cents,
        adjustments_amount_cents,
        total_amount_cents,
        credits_from_online,
        credits_from_offline,
        credits_from_adjustments,
        total_credits,
    }))
}

#[derive(Debug, Deserialize, Default)]
pub struct BillingTransactionsQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub source: Option<String>, // stripe | offline | adjustment
    pub status: Option<String>, // completed | pending | refunded | failed
    pub method: Option<String>, // card | cash | bank | other
    pub reseller_id: Option<i64>,
    pub reference: Option<String>, // substring match (includes username)
    pub start_date: Option<String>, // ISO8601 or 'YYYY-MM-DD'
    pub end_date: Option<String>,  // ISO8601 or 'YYYY-MM-DD'
    pub min_amount_cents: Option<i32>,
    pub max_amount_cents: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct BillingRow {
    id: i64,
    reseller_id: i64,
    reseller_username: String,
    source: String,
    method: Option<String>,
    reference: Option<String>,
    amount_cents: i32,
    currency: String,
    credits_qty: i32,
    status: String,
    notes: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    created_by: Option<i64>,
}

/// GET /api/admin/billing/transactions (paginated + filters)
pub async fn list_billing_transactions(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(q): Query<BillingTransactionsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.unwrap_or(25).clamp(1, 100);
    let offset = (page - 1) * per_page;

    // Build SELECT with filters
    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
            bt.id,
            bt.reseller_id,
            u.username AS reseller_username,
            bt.source,
            bt.method,
            bt.reference,
            bt.amount_cents,
            bt.currency,
            bt.credits_qty,
            bt.status,
            bt.notes,
            bt.created_at,
            bt.created_by
        FROM billing.billing_transactions bt
        JOIN auth.users u ON u.id = bt.reseller_id
        WHERE 1=1
        "#,
    );

    if let Some(ref source) = q.source {
        qb.push(" AND bt.source = ").push_bind(source);
    }
    if let Some(ref status) = q.status {
        qb.push(" AND bt.status = ").push_bind(status);
    }
    if let Some(ref method) = q.method {
        qb.push(" AND bt.method = ").push_bind(method);
    }
    if let Some(reseller_id) = q.reseller_id {
        qb.push(" AND bt.reseller_id = ").push_bind(reseller_id);
    }
    if let Some(ref reference) = q.reference {
        let like = format!("%{}%", reference);
        qb.push(" AND (bt.reference LIKE ")
            .push_bind(like.clone())
            .push(" OR u.username LIKE ")
            .push_bind(like)
            .push(")");
    }
    if let Some(ref start_date) = q.start_date {
        qb.push(" AND bt.created_at >= ").push_bind(start_date);
    }
    if let Some(ref end_date) = q.end_date {
        qb.push(" AND bt.created_at <= ").push_bind(end_date);
    }
    if let Some(min_amount) = q.min_amount_cents {
        qb.push(" AND bt.amount_cents >= ").push_bind(min_amount);
    }
    if let Some(max_amount) = q.max_amount_cents {
        qb.push(" AND bt.amount_cents <= ").push_bind(max_amount);
    }

    qb.push(" ORDER BY bt.created_at DESC LIMIT ")
        .push_bind(per_page)
        .push(" OFFSET ")
        .push_bind(offset);

    let rows: Vec<BillingRow> = qb
        .build_query_as::<BillingRow>()
        .fetch_all(&app_state.database.pool)
        .await
        .map_err(AppError::DatabaseError)?;

    // Build COUNT(*) with the same filters
    let mut cb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT COUNT(*) AS count
        FROM billing.billing_transactions bt
        JOIN auth.users u ON u.id = bt.reseller_id
        WHERE 1=1
        "#,
    );
    if let Some(ref source) = q.source {
        cb.push(" AND bt.source = ").push_bind(source);
    }
    if let Some(ref status) = q.status {
        cb.push(" AND bt.status = ").push_bind(status);
    }
    if let Some(ref method) = q.method {
        cb.push(" AND bt.method = ").push_bind(method);
    }
    if let Some(reseller_id) = q.reseller_id {
        cb.push(" AND bt.reseller_id = ").push_bind(reseller_id);
    }
    if let Some(ref reference) = q.reference {
        let like = format!("%{}%", reference);
        cb.push(" AND (bt.reference LIKE ")
            .push_bind(like.clone())
            .push(" OR u.username LIKE ")
            .push_bind(like)
            .push(")");
    }
    if let Some(ref start_date) = q.start_date {
        cb.push(" AND bt.created_at >= ").push_bind(start_date);
    }
    if let Some(ref end_date) = q.end_date {
        cb.push(" AND bt.created_at <= ").push_bind(end_date);
    }
    if let Some(min_amount) = q.min_amount_cents {
        cb.push(" AND bt.amount_cents >= ").push_bind(min_amount);
    }
    if let Some(max_amount) = q.max_amount_cents {
        cb.push(" AND bt.amount_cents <= ").push_bind(max_amount);
    }

    let total: i64 = cb
        .build_query_scalar::<i64>()
        .fetch_one(&app_state.database.pool)
        .await
        .unwrap_or(0);

    let items = rows
        .into_iter()
        .map(|r| BillingTransactionResponse {
            id: r.id,
            reseller_id: r.reseller_id,
            reseller_username: r.reseller_username,
            source: r.source,
            method: r.method,
            reference: r.reference,
            amount_cents: r.amount_cents,
            currency: r.currency,
            credits_qty: r.credits_qty,
            status: r.status,
            notes: r.notes,
            created_at: r.created_at.to_rfc3339(),
            created_by: r.created_by,
        })
        .collect::<Vec<_>>();

    let has_more = page.saturating_mul(per_page) < total;

    Ok(Json(serde_json::json!({
        "items": items,
        "page": page,
        "per_page": per_page,
        "total": total,
        "has_more": has_more
    })))
}

/// POST /api/admin/billing/transactions/offline-payment
pub async fn create_offline_payment(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateOfflinePaymentRequest>,
) -> Result<Json<BillingTransactionResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    if req.reseller_id <= 0 {
        return Err(AppError::BadRequest("Invalid reseller_id".into()));
    }
    if req.amount_cents <= 0 {
        return Err(AppError::BadRequest("amount_cents must be > 0".into()));
    }
    if req.credits_qty <= 0 {
        return Err(AppError::BadRequest("credits_qty must be > 0".into()));
    }

    // Ensure reseller exists and is reseller
    let role: Option<String> = sqlx::query_scalar("SELECT role FROM auth.users WHERE id = $1")
        .bind(req.reseller_id)
        .fetch_one(&app_state.database.pool)
        .await
        .unwrap_or(None);
    if role.as_deref() != Some("reseller") {
        return Err(AppError::BadRequest("Target user is not a reseller".into()));
    }

    let currency = match req.currency {
        Some(c) => c,
        None => crate::config::get_dynamic_config_value(
            &app_state.database.pool, "stripe_currency", &app_state.config.stripe_currency,
        ).await,
    };
    let created_by = claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Insert billing transaction
    let rec = sqlx::query_as::<_, (i64, chrono::DateTime<chrono::Utc>)>(
        r#"
        INSERT INTO billing.billing_transactions
            (reseller_id, source, method, reference, amount_cents, currency, credits_qty, status, notes, metadata, created_by)
        VALUES
            ($1, 'offline', $2, $3, $4, $5, $6, 'completed', $7, NULL, $8)
        RETURNING 
            id,
            created_at
        "#,
    )
    .bind(req.reseller_id)
    .bind(&req.method)
    .bind(&req.reference)
    .bind(req.amount_cents)
    .bind(&currency)
    .bind(req.credits_qty)
    .bind(&req.notes)
    .bind(created_by)
    .fetch_one(&app_state.database.pool)
    .await
    .map_err(AppError::DatabaseError)?;

    // Add credits to reseller
    app_state
        .user_service
        .add_credits(req.reseller_id, req.credits_qty as f64)
        .await?;

    // Resolve reseller username
    let reseller_username: Option<String> =
        sqlx::query_scalar("SELECT username FROM auth.users WHERE id = $1")
            .bind(req.reseller_id)
            .fetch_one(&app_state.database.pool)
            .await
            .unwrap_or(None);

    Ok(Json(BillingTransactionResponse {
        id: rec.0,
        reseller_id: req.reseller_id,
        reseller_username: reseller_username.unwrap_or_default(),
        source: "offline".to_string(),
        method: req.method,
        reference: req.reference,
        amount_cents: req.amount_cents,
        currency,
        credits_qty: req.credits_qty,
        status: "completed".to_string(),
        notes: req.notes,
        created_at: rec.1.to_rfc3339(),
        created_by: Some(created_by),
    }))
}
