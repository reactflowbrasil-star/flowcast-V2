use axum::{extract::State, Extension, Json};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use totp_rs::{Algorithm, Secret, TOTP};

use crate::{error::AppError, models::user::UserRole, services::Claims, AppState};

/// Get app name from core.smtp_config table (Admin Panel setting)
async fn get_app_name(pool: &Pool<Postgres>) -> String {
    sqlx::query_scalar::<_, String>("SELECT app_name FROM core.smtp_config WHERE id = 1")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "StreamCore".to_string())
}

/// Check if user role allows 2FA (only admin and reseller)
fn can_use_2fa(role: &UserRole) -> bool {
    matches!(role, UserRole::Admin | UserRole::Reseller)
}

#[derive(Debug, Serialize)]
pub struct Setup2FAResponse {
    pub secret: String,
    pub qr_code: String,
    pub backup_codes: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct Verify2FARequest {
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct Verify2FAResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct Disable2FARequest {
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct TwoFactorStatus {
    pub enabled: bool,
    pub has_backup_codes: bool,
}

/// Get 2FA status for current user (admin/reseller only)
pub async fn get_2fa_status(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<TwoFactorStatus>, AppError> {
    // Only admin and reseller can use 2FA
    if !can_use_2fa(&claims.role) {
        return Ok(Json(TwoFactorStatus {
            enabled: false,
            has_backup_codes: false,
        }));
    }

    let user_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    let result = sqlx::query_as::<_, (bool, Option<String>)>(
        "SELECT COALESCE(totp_enabled, false), totp_backup_codes FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&app_state.database.pool)
    .await?;

    match result {
        Some((enabled, backup_codes)) => Ok(Json(TwoFactorStatus {
            enabled,
            has_backup_codes: backup_codes.map(|c| !c.is_empty()).unwrap_or(false),
        })),
        None => Err(AppError::UserNotFound),
    }
}

/// Setup 2FA - Generate secret and QR code (admin/reseller only)
pub async fn setup_2fa(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Setup2FAResponse>, AppError> {
    // Only admin and reseller can use 2FA
    if !can_use_2fa(&claims.role) {
        return Err(AppError::BadRequest(
            "Two-factor authentication is only available for admin and reseller accounts."
                .to_string(),
        ));
    }

    let user_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Check if 2FA is already enabled
    let existing = sqlx::query_as::<_, (bool,)>(
        "SELECT COALESCE(totp_enabled, false) FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&app_state.database.pool)
    .await?;

    if let Some((true,)) = existing {
        return Err(AppError::BadRequest(
            "2FA is already enabled. Disable it first to set up a new one.".to_string(),
        ));
    }

    // Generate a new secret
    let secret = Secret::generate_secret();
    let secret_base32 = secret.to_encoded().to_string();

    // Get username for the TOTP label
    let username = sqlx::query_scalar::<_, String>("SELECT username FROM auth.users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&app_state.database.pool)
        .await?;

    // Create TOTP instance with all required parameters
    let issuer = get_app_name(&app_state.database.pool).await;
    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret
            .to_bytes()
            .map_err(|e| AppError::InternalError(format!("Failed to generate secret: {}", e)))?,
        Some(issuer.clone()),
        username.clone(),
    )
    .map_err(|e| AppError::InternalError(format!("Failed to create TOTP: {}", e)))?;

    // Generate QR code as base64 data URI
    let qr_code = totp
        .get_qr_base64()
        .map_err(|e| AppError::InternalError(format!("Failed to generate QR code: {}", e)))?;

    // Generate backup codes
    let backup_codes: Vec<String> = (0..8)
        .map(|_| {
            let code: u32 = rand::random::<u32>() % 100_000_000;
            format!("{:08}", code)
        })
        .collect();

    let backup_codes_json = serde_json::to_string(&backup_codes)
        .map_err(|e| AppError::InternalError(format!("Failed to serialize backup codes: {}", e)))?;

    // Store the secret and backup codes (but don't enable yet)
    sqlx::query("UPDATE auth.users SET totp_secret = $1, totp_backup_codes = $2 WHERE id = $3")
        .bind(&secret_base32)
        .bind(&backup_codes_json)
        .bind(user_id)
        .execute(&app_state.database.pool)
        .await?;

    tracing::info!(user_id = user_id, "2FA setup initiated");

    Ok(Json(Setup2FAResponse {
        secret: secret_base32,
        qr_code: format!("data:image/png;base64,{}", qr_code),
        backup_codes,
    }))
}

/// Verify 2FA code and enable 2FA (admin/reseller only)
pub async fn verify_and_enable_2fa(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<Verify2FARequest>,
) -> Result<Json<Verify2FAResponse>, AppError> {
    // Only admin and reseller can use 2FA
    if !can_use_2fa(&claims.role) {
        return Err(AppError::BadRequest(
            "Two-factor authentication is only available for admin and reseller accounts."
                .to_string(),
        ));
    }

    let user_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get the stored secret
    let (secret, email, username) = sqlx::query_as::<_, (Option<String>, Option<String>, String)>(
        "SELECT totp_secret, email, username FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&app_state.database.pool)
    .await?
    .ok_or(AppError::UserNotFound)?;

    let secret = secret.ok_or_else(|| {
        AppError::BadRequest("2FA setup not initiated. Call /api/auth/2fa/setup first.".to_string())
    })?;

    // Get app name for TOTP issuer
    let issuer = get_app_name(&app_state.database.pool).await;

    // Verify the code
    if !verify_totp_code(&secret, &payload.code, &username, &issuer)? {
        return Ok(Json(Verify2FAResponse {
            success: false,
            message: "Invalid verification code".to_string(),
        }));
    }

    // Enable 2FA
    sqlx::query("UPDATE auth.users SET totp_enabled = true WHERE id = $1")
        .bind(user_id)
        .execute(&app_state.database.pool)
        .await?;

    // Send confirmation email if configured
    if let Some(email) = email {
        if app_state.email_service.is_configured() {
            if let Err(e) = app_state
                .email_service
                .send_2fa_enabled(&email, &username)
                .await
            {
                tracing::warn!(error = %e, "Failed to send 2FA enabled email");
            }
        }
    }

    tracing::info!(user_id = user_id, "2FA enabled successfully");

    Ok(Json(Verify2FAResponse {
        success: true,
        message: "Two-factor authentication has been enabled successfully.".to_string(),
    }))
}

/// Disable 2FA (admin/reseller only)
pub async fn disable_2fa(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<Disable2FARequest>,
) -> Result<Json<Verify2FAResponse>, AppError> {
    // Only admin and reseller can use 2FA
    if !can_use_2fa(&claims.role) {
        return Err(AppError::BadRequest(
            "Two-factor authentication is only available for admin and reseller accounts."
                .to_string(),
        ));
    }

    let user_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Get the stored secret and verify 2FA is enabled
    let (secret, totp_enabled, email, username) = sqlx::query_as::<
        _,
        (Option<String>, bool, Option<String>, String),
    >(
        "SELECT totp_secret, COALESCE(totp_enabled, false), email, username FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&app_state.database.pool)
    .await?
    .ok_or(AppError::UserNotFound)?;

    if !totp_enabled {
        return Err(AppError::BadRequest("2FA is not enabled.".to_string()));
    }

    let secret =
        secret.ok_or_else(|| AppError::InternalError("2FA secret not found".to_string()))?;

    // Get app name for TOTP issuer
    let issuer = get_app_name(&app_state.database.pool).await;

    // Verify the code (or check backup code)
    let code_valid = verify_totp_code(&secret, &payload.code, &username, &issuer)?
        || verify_backup_code(&app_state, user_id, &payload.code).await?;

    if !code_valid {
        return Ok(Json(Verify2FAResponse {
            success: false,
            message: "Invalid verification code".to_string(),
        }));
    }

    // Disable 2FA
    sqlx::query(
        "UPDATE auth.users SET totp_enabled = false, totp_secret = NULL, totp_backup_codes = NULL WHERE id = $1",
    )
    .bind(user_id)
    .execute(&app_state.database.pool)
    .await?;

    // Send confirmation email if configured
    if let Some(email) = email {
        if app_state.email_service.is_configured() {
            if let Err(e) = app_state
                .email_service
                .send_2fa_disabled(&email, &username)
                .await
            {
                tracing::warn!(error = %e, "Failed to send 2FA disabled email");
            }
        }
    }

    tracing::info!(user_id = user_id, "2FA disabled");

    Ok(Json(Verify2FAResponse {
        success: true,
        message: "Two-factor authentication has been disabled.".to_string(),
    }))
}

/// Regenerate backup codes (admin/reseller only)
pub async fn regenerate_backup_codes(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<Verify2FARequest>,
) -> Result<Json<Vec<String>>, AppError> {
    // Only admin and reseller can use 2FA
    if !can_use_2fa(&claims.role) {
        return Err(AppError::BadRequest(
            "Two-factor authentication is only available for admin and reseller accounts."
                .to_string(),
        ));
    }

    let user_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Verify 2FA is enabled and code is valid
    let (secret, totp_enabled, username) = sqlx::query_as::<_, (Option<String>, bool, String)>(
        "SELECT totp_secret, COALESCE(totp_enabled, false), username FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&app_state.database.pool)
    .await?
    .ok_or(AppError::UserNotFound)?;

    if !totp_enabled {
        return Err(AppError::BadRequest("2FA is not enabled.".to_string()));
    }

    let secret =
        secret.ok_or_else(|| AppError::InternalError("2FA secret not found".to_string()))?;

    // Get app name for TOTP issuer
    let issuer = get_app_name(&app_state.database.pool).await;

    // Verify the code
    if !verify_totp_code(&secret, &payload.code, &username, &issuer)? {
        return Err(AppError::BadRequest(
            "Invalid verification code".to_string(),
        ));
    }

    // Generate new backup codes
    let backup_codes: Vec<String> = (0..8)
        .map(|_| {
            let code: u32 = rand::random::<u32>() % 100_000_000;
            format!("{:08}", code)
        })
        .collect();

    let backup_codes_json = serde_json::to_string(&backup_codes)
        .map_err(|e| AppError::InternalError(format!("Failed to serialize backup codes: {}", e)))?;

    // Store new backup codes
    sqlx::query("UPDATE auth.users SET totp_backup_codes = $1 WHERE id = $2")
        .bind(&backup_codes_json)
        .bind(user_id)
        .execute(&app_state.database.pool)
        .await?;

    tracing::info!(user_id = user_id, "Backup codes regenerated");

    Ok(Json(backup_codes))
}

/// Helper function to verify TOTP code
pub fn verify_totp_code(
    secret_base32: &str,
    code: &str,
    account_name: &str,
    issuer: &str,
) -> Result<bool, AppError> {
    let secret = Secret::Encoded(secret_base32.to_string());

    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret
            .to_bytes()
            .map_err(|e| AppError::InternalError(format!("Failed to decode secret: {}", e)))?,
        Some(issuer.to_string()),
        account_name.to_string(),
    )
    .map_err(|e| AppError::InternalError(format!("Failed to create TOTP: {}", e)))?;

    Ok(totp.check_current(code).unwrap_or(false))
}

/// Helper function to verify and consume a backup code
async fn verify_backup_code(
    app_state: &AppState,
    user_id: i64,
    code: &str,
) -> Result<bool, AppError> {
    let backup_codes_json: Option<String> =
        sqlx::query_scalar("SELECT totp_backup_codes FROM auth.users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&app_state.database.pool)
            .await?
            .flatten();

    let Some(json) = backup_codes_json else {
        return Ok(false);
    };

    let mut codes: Vec<String> = serde_json::from_str(&json).unwrap_or_default();

    if let Some(pos) = codes.iter().position(|c| c == code) {
        // Remove the used backup code
        codes.remove(pos);

        let new_json = serde_json::to_string(&codes).map_err(|e| {
            AppError::InternalError(format!("Failed to serialize backup codes: {}", e))
        })?;

        sqlx::query("UPDATE auth.users SET totp_backup_codes = $1 WHERE id = $2")
            .bind(&new_json)
            .bind(user_id)
            .execute(&app_state.database.pool)
            .await?;

        tracing::info!(user_id = user_id, "Backup code used");
        return Ok(true);
    }

    Ok(false)
}

/// Verify 2FA code during login (called from auth handler)
pub async fn verify_2fa_for_login(
    app_state: &AppState,
    user_id: i64,
    code: &str,
) -> Result<bool, AppError> {
    let (secret, _totp_enabled, username) = sqlx::query_as::<_, (Option<String>, bool, String)>(
        "SELECT totp_secret, COALESCE(totp_enabled, false), username FROM auth.users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&app_state.database.pool)
    .await?
    .ok_or(AppError::UserNotFound)?;

    let Some(secret) = secret else {
        return Ok(false);
    };

    // Get app name for TOTP issuer
    let issuer = get_app_name(&app_state.database.pool).await;

    // Try TOTP code first, then backup code
    if verify_totp_code(&secret, code, &username, &issuer)? {
        return Ok(true);
    }

    verify_backup_code(app_state, user_id, code).await
}
