use crate::error::AppError;
use crate::models::gift_code::*;
use crate::services::content::ContentService;
use crate::services::user::UserService;
use chrono::{Duration, Utc};
use rand::Rng;
use serde_json;
use sqlx::{PgPool, Row};
use std::collections::HashSet;

/// Service for managing gift codes
#[derive(Clone)]
pub struct GiftCodesService {
    db: PgPool,
    user_service: UserService,
    #[allow(dead_code)]
    content_service: ContentService,
}

impl GiftCodesService {
    pub fn new(db: PgPool, user_service: UserService, content_service: ContentService) -> Self {
        Self {
            db,
            user_service,
            content_service,
        }
    }

    /// Generate a semi-random 12-char alphanumeric code (uppercase)
    fn generate_code(prefix: Option<&str>) -> String {
        // Use timestamp + random to generate a reasonably unique code
        let mut rng = rand::thread_rng();
        let stamp = Utc::now().timestamp_nanos_opt().unwrap_or(0).unsigned_abs() as u128;
        let rand_u: u64 = rng.gen();
        let raw = format!("{:x}{:x}", stamp, rand_u);
        // take first 12 alnum chars from hex and uppercase
        let mut s = raw
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_uppercase();
        if s.len() < 12 {
            while s.len() < 12 {
                s.push_str(&format!("{:X}", rng.gen::<u32>()));
            }
        }
        s.truncate(12);
        if let Some(pref) = prefix {
            let p = pref.trim().to_uppercase();
            if !p.is_empty() {
                let mut with_pref = format!("{}{}", p, s);
                // keep length around 12-16 — truncate if too long
                if with_pref.len() > 16 {
                    with_pref.truncate(16);
                }
                return with_pref;
            }
        }
        s
    }

    /// Create a single gift code (admin creates)
    pub async fn create_code(
        &self,
        req: CreateGiftCodeRequest,
        admin_id: i64,
    ) -> Result<GiftCodeResponse, AppError> {
        // Convert months -> days (approximate 30 days per month)
        let months = req.duration_months.max(0);
        let duration_days = months.saturating_mul(30);
        let duration_days: i32 = i32::try_from(duration_days)
            .map_err(|_| AppError::BadRequest("duration_months too large".to_string()))?;

        let allowed_categories_json = req
            .allowed_categories
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;

        let mut tries = 0;
        loop {
            let code = if let Some(c) = &req.code {
                c.trim().to_uppercase()
            } else {
                Self::generate_code(None)
            };
            let uses_total = req.uses_total.max(1);
            let uses_total: i32 = i32::try_from(uses_total)
                .map_err(|_| AppError::BadRequest("uses_total too large".to_string()))?;
            let uses_remaining = uses_total;

            let row = sqlx::query(
                r#"
                INSERT INTO billing.gift_codes (code, duration_days, uses_total, uses_remaining, expires_at, allowed_categories, max_devices, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, code, duration_days, uses_total, uses_remaining, expires_at, allowed_categories, max_devices, created_by, created_at
                "#,
            )
            .bind(&code)
            .bind(duration_days)
            .bind(uses_total)
            .bind(uses_remaining)
            .bind(req.expires_at)
            .bind(allowed_categories_json.clone())
            .bind(req.max_devices)
            .bind(admin_id)
            .fetch_one(&self.db)
            .await;

            match row {
                Ok(r) => {
                    let id: i64 = r.get("id");
                    let code: String = r.get("code");
                    let duration_days: i32 = r.get("duration_days");
                    let uses_total: i32 = r.get("uses_total");
                    let uses_remaining: i32 = r.get("uses_remaining");
                    let expires_at: Option<chrono::DateTime<chrono::Utc>> =
                        r.try_get("expires_at").ok().flatten();
                    let allowed_categories_raw: Option<String> =
                        r.try_get("allowed_categories").ok();
                    let max_devices: Option<i32> = r.try_get("max_devices").ok();
                    let created_by: i64 = r.get("created_by");
                    let created_at: chrono::DateTime<chrono::Utc> =
                        r.try_get("created_at").unwrap_or_else(|_| Utc::now());

                    let allowed_categories = allowed_categories_raw
                        .as_ref()
                        .and_then(|s| serde_json::from_str::<Vec<i64>>(s).ok());

                    return Ok(GiftCodeResponse {
                        id,
                        code,
                        duration_days,
                        uses_total,
                        uses_remaining,
                        expires_at,
                        allowed_categories,
                        max_devices,
                        created_by,
                        created_at,
                    });
                }
                Err(e) => {
                    let msg = format!("{}", e);
                    if msg.contains("UNIQUE") || msg.contains("unique") {
                        tries += 1;
                        if tries > 5 || req.code.is_some() {
                            return Err(AppError::DatabaseError(e));
                        }
                        continue;
                    } else {
                        return Err(AppError::DatabaseError(e));
                    }
                }
            }
        }
    }

    /// Bulk create codes
    pub async fn bulk_create(
        &self,
        req: BulkCreateGiftCodesRequest,
        admin_id: i64,
    ) -> Result<Vec<GiftCodeResponse>, AppError> {
        let mut out = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let allowed_categories_json = req
            .allowed_categories
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let duration_days = (req.duration_months.max(0)).saturating_mul(30);
        let duration_days: i32 = i32::try_from(duration_days)
            .map_err(|_| AppError::BadRequest("duration_months too large".to_string()))?;
        let uses_total = req.uses_total.max(1);
        let uses_total: i32 = i32::try_from(uses_total)
            .map_err(|_| AppError::BadRequest("uses_total too large".to_string()))?;
        let expires_at_val = req.expires_at;

        let count = req.count.max(1);
        for _ in 0..count {
            let mut tries = 0;
            loop {
                let candidate = Self::generate_code(req.prefix.as_deref());
                if seen.contains(&candidate) {
                    tries += 1;
                    if tries > 10 {
                        return Err(AppError::BadRequest(
                            "Failed to generate unique codes after several attempts".to_string(),
                        ));
                    }
                    continue;
                }
                let row = sqlx::query(
                    r#"
                    INSERT INTO billing.gift_codes (code, duration_days, uses_total, uses_remaining, expires_at, allowed_categories, max_devices, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id, code, duration_days, uses_total, uses_remaining, expires_at, allowed_categories, max_devices, created_by, created_at
                    "#,
                )
                .bind(&candidate)
                .bind(duration_days)
                .bind(uses_total)
                .bind(uses_total)
                .bind(expires_at_val)
                .bind(allowed_categories_json.clone())
                .bind(req.max_devices)
                .bind(admin_id)
                .fetch_one(&self.db)
                .await;

                match row {
                    Ok(r) => {
                        let id: i64 = r.get("id");
                        let code: String = r.get("code");
                        let duration_days: i32 = r.get("duration_days");
                        let uses_total: i32 = r.get("uses_total");
                        let uses_remaining: i32 = r.get("uses_remaining");
                        let expires_at: Option<chrono::DateTime<chrono::Utc>> =
                            r.try_get("expires_at").ok().flatten();
                        let allowed_categories_raw: Option<String> =
                            r.try_get("allowed_categories").ok();
                        let max_devices: Option<i32> = r.try_get("max_devices").ok();
                        let created_by: i64 = r.get("created_by");
                        let created_at: chrono::DateTime<chrono::Utc> =
                            r.try_get("created_at").unwrap_or_else(|_| Utc::now());

                        let allowed_categories = allowed_categories_raw
                            .as_ref()
                            .and_then(|s| serde_json::from_str::<Vec<i64>>(s).ok());

                        out.push(GiftCodeResponse {
                            id,
                            code,
                            duration_days,
                            uses_total,
                            uses_remaining,
                            expires_at,
                            allowed_categories,
                            max_devices,
                            created_by,
                            created_at,
                        });
                        seen.insert(candidate);
                        break;
                    }
                    Err(e) => {
                        let msg = format!("{}", e);
                        if msg.contains("UNIQUE") || msg.contains("unique") {
                            tries += 1;
                            if tries > 10 {
                                return Err(AppError::DatabaseError(e));
                            }
                            continue;
                        } else {
                            return Err(AppError::DatabaseError(e));
                        }
                    }
                }
            }
        }
        Ok(out)
    }

    /// List all gift codes (admin)
    pub async fn list_all(&self) -> Result<Vec<GiftCode>, AppError> {
        let rows =
            sqlx::query_as::<_, GiftCode>("SELECT * FROM billing.gift_codes ORDER BY created_at DESC")
                .fetch_all(&self.db)
                .await?;
        Ok(rows)
    }

    /// Delete multiple gift codes by id (admin)
    pub async fn delete_bulk(&self, ids: &[i64]) -> Result<u64, AppError> {
        if ids.is_empty() {
            return Ok(0);
        }
        // Build IN (...) clause safely for numeric ids
        let placeholders = (1..=ids.len())
            .map(|i| format!("${}", i))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("DELETE FROM billing.gift_codes WHERE id IN ({})", placeholders);
        let mut q = sqlx::query(&sql);
        for id in ids {
            q = q.bind(id);
        }
        let res = q.execute(&self.db).await?;
        Ok(res.rows_affected())
    }

    /// Redeem a code by creating a new user (simple flow).
    ///
    /// NOTE: For simplicity this handler expects the caller to provide account creation fields
    /// (username/password/email). It will create the end user using system admin (user id 1).
    pub async fn redeem_and_create_user(
        &self,
        code: &str,
        username: &str,
        password: &str,
        email: Option<&str>,
    ) -> Result<GiftCodeRedemption, AppError> {
        let mut tx = self.db.begin().await?;

        // Lookup code and validate
        let row_opt = sqlx::query(
            r#"
            SELECT id, duration_days, uses_remaining, expires_at, allowed_categories, max_devices
            FROM billing.gift_codes
            WHERE UPPER(code) = UPPER($1) 
            FOR UPDATE
            "#,
        )
        .bind(code)
        .fetch_optional(&mut *tx)
        .await?;

        let row = row_opt.ok_or_else(|| AppError::BadRequest("Invalid gift code".to_string()))?;

        let id: i64 = row.get("id");
        let duration_days: i32 = row.get("duration_days");
        let uses_remaining: i32 = row.get("uses_remaining");
        let expires_at_raw: Option<chrono::DateTime<chrono::Utc>> =
            row.try_get("expires_at").ok().flatten();
        let allowed_categories_raw: Option<String> = row.try_get("allowed_categories").ok();
        let max_devices: Option<i32> = row.try_get("max_devices").ok();

        if uses_remaining <= 0 {
            return Err(AppError::BadRequest(
                "Gift code already used up".to_string(),
            ));
        }

        if let Some(exp) = expires_at_raw {
            if exp < Utc::now() {
                return Err(AppError::BadRequest("Gift code expired".to_string()));
            }
        }

        // Determine an admin actor to own the creation (do not assume id=1)
        let admin_id_opt = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM auth.users WHERE role = 'admin' ORDER BY id LIMIT 1",
        )
        .fetch_optional(&mut *tx)
        .await?;
        let admin_id = match admin_id_opt {
            Some(id) => id,
            None => {
                // No admin found; cannot proceed safely
                return Err(AppError::BadRequest(
                    "No admin user found to perform account creation. Please create an admin user first."
                        .to_string(),
                ));
            }
        };

        // Normalize max_devices from gift code: treat 0 or negative as undefined to use service default (>=1)
        let resolved_max_devices: Option<i32> =
            max_devices.and_then(|d| if d >= 1 { Some(d) } else { None });

        // Create the end user within the same DB transaction to avoid partial commits
        let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)
            .map_err(|_| AppError::InternalServerError)?;
        let max_devices_val: i32 = resolved_max_devices.unwrap_or(3);
        let user_row = match sqlx::query(
            r#"
            INSERT INTO auth.users (username, email, password_hash, role, active, created_by, max_devices, expires_at, is_demo)
            VALUES ($1, $2, $3, 'end_user', true, $4, $5, NULL, false)
            RETURNING id, username, email
            "#
        )
        .bind(username)
        .bind(email)
        .bind(&password_hash)
        .bind(admin_id)
        .bind(max_devices_val)
        .fetch_one(&mut *tx)
        .await {
            Ok(row) => row,
            Err(e) => {
                match e {
                    sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                        return Err(AppError::BadRequest("Username already exists".to_string()));
                    }
                    _ => return Err(AppError::DatabaseError(e)),
                }
            }
        };
        let user_id: i64 = user_row.get("id");
        let user_username: String = user_row.get("username");
        let user_email: Option<String> = user_row.try_get("email").ok();

        // Compute new expiry: add duration_days to now
        let duration = Duration::days(duration_days as i64);
        let new_expiry = Utc::now() + duration;

        sqlx::query("UPDATE auth.users SET expires_at = $1 WHERE id = $2")
            .bind(new_expiry)
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        // If allowed_categories present, set user subscriptions (filter out invalid category ids)
        if let Some(ref allowed_json) = allowed_categories_raw {
            if let Ok(cat_ids) = serde_json::from_str::<Vec<i64>>(allowed_json) {
                if !cat_ids.is_empty() {
                    // Build a dynamic IN clause to validate existing categories in a single query
                    let placeholders = (1..=cat_ids.len())
                        .map(|i| format!("${}", i))
                        .collect::<Vec<_>>()
                        .join(",");
                    let sql = format!("SELECT id FROM content.categories WHERE id IN ({})", placeholders);
                    let mut q = sqlx::query_scalar::<_, i64>(&sql);
                    for cid in &cat_ids {
                        q = q.bind(cid);
                    }
                    // Use the same transaction connection to avoid write-lock conflicts in SQLite
                    let valid_ids = q.fetch_all(&mut *tx).await.unwrap_or_default();
                    if !valid_ids.is_empty() {
                        // Replace subscriptions inside the same tx to avoid nested write locks
                        sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1")
                            .bind(user_id)
                            .execute(&mut *tx)
                            .await?;
                        for cid in &valid_ids {
                            sqlx::query(
                                "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2)
                                 ON CONFLICT (user_id, category_id) DO NOTHING",
                            )
                            .bind(user_id)
                            .bind(cid)
                            .execute(&mut *tx)
                            .await?;
                        }
                    }
                    // If none are valid, skip setting subscriptions (fallback to default access rules)
                }
            }
        }

        // Decrement uses_remaining
        sqlx::query("UPDATE billing.gift_codes SET uses_remaining = uses_remaining - 1 WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // Insert redemption record
        let granted_categories_snapshot = allowed_categories_raw.clone();
        let created = sqlx::query(
            r#"
            INSERT INTO billing.gift_code_redemptions (gift_code_id, redeemer_user_id, redeemer_username, redeemer_email, duration_days_granted, granted_categories, granted_max_devices)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, gift_code_id, redeemer_user_id, redeemer_username, redeemer_email, redeemed_at, duration_days_granted, granted_categories, granted_max_devices
            "#,
        )
        .bind(id)
        .bind(user_id)
        .bind(&user_username)
        .bind(&user_email)
        .bind(duration_days)
        .bind(granted_categories_snapshot.clone())
        .bind(max_devices)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        let redeemed_at = created
            .try_get::<chrono::DateTime<chrono::Utc>, _>("redeemed_at")
            .unwrap_or_else(|_| Utc::now());

        Ok(GiftCodeRedemption {
            id: created.get("id"),
            gift_code_id: created.get("gift_code_id"),
            redeemer_user_id: created.try_get("redeemer_user_id").ok(),
            redeemer_username: created.try_get("redeemer_username").ok(),
            redeemer_email: created.try_get("redeemer_email").ok(),
            redeemed_at,
            duration_days_granted: created.get("duration_days_granted"),
            granted_categories: created.try_get("granted_categories").ok(),
            granted_max_devices: created.try_get("granted_max_devices").ok(),
        })
    }

    /// Validate a gift code without consuming it.
    pub async fn validate_code(
        &self,
        code: &str,
    ) -> Result<crate::models::gift_code::GiftCodeValidation, AppError> {
        let row_opt = sqlx::query(
            r#"
            SELECT code, duration_days, uses_remaining, expires_at, allowed_categories, max_devices
            FROM billing.gift_codes
            WHERE UPPER(code) = UPPER($1)
            LIMIT 1
            "#,
        )
        .bind(code)
        .fetch_optional(&self.db)
        .await?;

        let row = row_opt.ok_or_else(|| AppError::BadRequest("Invalid gift code".to_string()))?;

        let code_s: String = row.get("code");
        let duration_days: i32 = row.get("duration_days");
        let uses_remaining: i32 = row.get("uses_remaining");
        let expires_at: Option<chrono::DateTime<chrono::Utc>> =
            row.try_get("expires_at").ok().flatten();
        let allowed_categories_raw: Option<String> = row.try_get("allowed_categories").ok();
        let max_devices: Option<i32> = row.try_get("max_devices").ok();

        let allowed_categories = allowed_categories_raw
            .as_ref()
            .and_then(|s| serde_json::from_str::<Vec<i64>>(s).ok());

        Ok(crate::models::gift_code::GiftCodeValidation {
            code: code_s,
            duration_days,
            uses_remaining,
            expires_at,
            allowed_categories,
            max_devices,
        })
    }

    /// Redeem a code to extend an existing user account (do not create a user).
    pub async fn redeem_and_extend_user(
        &self,
        code: &str,
        username: &str,
    ) -> Result<GiftCodeRedemption, AppError> {
        let mut tx = self.db.begin().await?;

        // Lookup code and validate
        let row_opt = sqlx::query(
            r#"
            SELECT id, duration_days, uses_remaining, expires_at, allowed_categories, max_devices
            FROM billing.gift_codes
            WHERE UPPER(code) = UPPER($1)
            FOR UPDATE
            "#,
        )
        .bind(code)
        .fetch_optional(&mut *tx)
        .await?;

        let row = row_opt.ok_or_else(|| AppError::BadRequest("Invalid gift code".to_string()))?;

        let id: i64 = row.get("id");
        let duration_days: i32 = row.get("duration_days");
        let uses_remaining: i32 = row.get("uses_remaining");
        let expires_at_raw: Option<chrono::DateTime<chrono::Utc>> =
            row.try_get("expires_at").ok().flatten();
        let allowed_categories_raw: Option<String> = row.try_get("allowed_categories").ok();
        let max_devices: Option<i32> = row.try_get("max_devices").ok();

        if uses_remaining <= 0 {
            return Err(AppError::BadRequest(
                "Gift code already used up".to_string(),
            ));
        }

        if let Some(exp) = expires_at_raw {
            if exp < Utc::now() {
                return Err(AppError::BadRequest("Gift code expired".to_string()));
            }
        }

        // Find existing user by username
        let user = self
            .user_service
            .get_user_by_username(username)
            .await
            .map_err(|e| AppError::BadRequest(format!("User not found: {}", e)))?;

        // Compute new expiry: add duration_days to now or current expiry
        let duration = Duration::days(duration_days as i64);
        let new_expiry = match user.expires_at {
            Some(existing) => existing + duration,
            None => Utc::now() + duration,
        };

        // Update user's expiry
        sqlx::query("UPDATE auth.users SET expires_at = $1 WHERE id = $2")
            .bind(new_expiry)
            .bind(user.id)
            .execute(&mut *tx)
            .await?;

        // If allowed_categories present, set user subscriptions (filter out invalid category ids)
        if let Some(ref allowed_json) = allowed_categories_raw {
            if let Ok(cat_ids) = serde_json::from_str::<Vec<i64>>(allowed_json) {
                if !cat_ids.is_empty() {
                    let placeholders = (1..=cat_ids.len())
                        .map(|i| format!("${}", i))
                        .collect::<Vec<_>>()
                        .join(",");
                    let sql = format!("SELECT id FROM content.categories WHERE id IN ({})", placeholders);
                    let mut q = sqlx::query_scalar::<_, i64>(&sql);
                    for cid in &cat_ids {
                        q = q.bind(cid);
                    }
                    // Use same tx to avoid nested write locks
                    let valid_ids = q.fetch_all(&mut *tx).await.unwrap_or_default();
                    if !valid_ids.is_empty() {
                        sqlx::query("DELETE FROM billing.user_subscriptions WHERE user_id = $1")
                            .bind(user.id)
                            .execute(&mut *tx)
                            .await?;
                        for cid in &valid_ids {
                            sqlx::query(
                                "INSERT INTO billing.user_subscriptions (user_id, category_id) VALUES ($1, $2)
                                 ON CONFLICT (user_id, category_id) DO NOTHING",
                            )
                            .bind(user.id)
                            .bind(cid)
                            .execute(&mut *tx)
                            .await?;
                        }
                    }
                }
            }
        }

        // Decrement uses_remaining
        sqlx::query("UPDATE billing.gift_codes SET uses_remaining = uses_remaining - 1 WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // Insert redemption record
        let granted_categories_snapshot = allowed_categories_raw.clone();
        let created = sqlx::query(
            r#"
            INSERT INTO billing.gift_code_redemptions (gift_code_id, redeemer_user_id, redeemer_username, redeemer_email, duration_days_granted, granted_categories, granted_max_devices)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, gift_code_id, redeemer_user_id, redeemer_username, redeemer_email, redeemed_at, duration_days_granted, granted_categories, granted_max_devices
            "#,
        )
        .bind(id)
        .bind(user.id)
        .bind(&user.username)
        .bind(&user.email)
        .bind(duration_days)
        .bind(granted_categories_snapshot.clone())
        .bind(max_devices)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        let redeemed_at = created
            .try_get::<chrono::DateTime<chrono::Utc>, _>("redeemed_at")
            .unwrap_or_else(|_| Utc::now());

        Ok(GiftCodeRedemption {
            id: created.get("id"),
            gift_code_id: created.get("gift_code_id"),
            redeemer_user_id: created.try_get("redeemer_user_id").ok(),
            redeemer_username: created.try_get("redeemer_username").ok(),
            redeemer_email: created.try_get("redeemer_email").ok(),
            redeemed_at,
            duration_days_granted: created.get("duration_days_granted"),
            granted_categories: created.try_get("granted_categories").ok(),
            granted_max_devices: created.try_get("granted_max_devices").ok(),
        })
    }
}
