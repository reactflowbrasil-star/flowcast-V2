use axum::{extract::State, Extension, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{error::AppError, services::Claims, AppState};

/// Encrypt a password using AES-256-GCM if STREAMCORE_SMTP_KEY is set,
/// otherwise fall back to Base64 encoding with a warning.
fn encrypt_smtp_password(password: &str) -> String {
    if let Ok(hex_key) = std::env::var("STREAMCORE_SMTP_KEY") {
        let key_bytes = match hex::decode(hex_key.trim()) {
            Ok(b) if b.len() == 32 => b,
            _ => {
                tracing::error!("STREAMCORE_SMTP_KEY must be 64 hex chars (32 bytes). Falling back to Base64.");
                return base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    password,
                );
            }
        };
        use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};
        use aes_gcm::aead::OsRng;
        use aes_gcm::Nonce;
        let cipher = Aes256Gcm::new_from_slice(&key_bytes).expect("valid 32-byte key");
        let mut nonce_bytes = [0u8; 12];
        use aes_gcm::aead::rand_core::RngCore;
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        match cipher.encrypt(nonce, password.as_bytes()) {
            Ok(ciphertext) => {
                // Prepend nonce to ciphertext, then Base64 encode the whole thing
                let mut combined = nonce_bytes.to_vec();
                combined.extend_from_slice(&ciphertext);
                format!("aes256:{}", base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    &combined,
                ))
            }
            Err(e) => {
                tracing::error!("AES-256-GCM encryption failed: {}. Falling back to Base64.", e);
                base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    password,
                )
            }
        }
    } else {
        tracing::warn!("STREAMCORE_SMTP_KEY not set. SMTP password stored with reversible Base64 encoding. Set STREAMCORE_SMTP_KEY for AES-256-GCM encryption.");
        base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            password,
        )
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SmtpConfig {
    pub enabled: bool,
    pub host: Option<String>,
    pub port: i32,
    pub username: Option<String>,
    #[serde(skip_serializing)]
    pub password: Option<String>,
    pub has_password: bool,
    pub from_name: String,
    pub from_email: Option<String>,
    pub use_tls: bool,
    pub frontend_url: String,
    pub app_name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSmtpConfigRequest {
    pub enabled: bool,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub from_name: Option<String>,
    pub from_email: Option<String>,
    pub use_tls: Option<bool>,
    pub frontend_url: Option<String>,
    pub app_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TestSmtpRequest {
    pub test_email: String,
}

#[derive(Debug, Serialize)]
pub struct TestSmtpResponse {
    pub success: bool,
    pub message: String,
}

/// Get current SMTP configuration
pub async fn get_smtp_config(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<SmtpConfig>, AppError> {
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err(AppError::Forbidden);
    }
    let row = sqlx::query_as::<
        _,
        (
            bool,
            Option<String>,
            i32,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
            bool,
            String,
            String,
        ),
    >(
        r#"
        SELECT 
            enabled, host, port, username, password_encrypted,
            from_name, from_email, use_tls, frontend_url, app_name
        FROM core.smtp_config WHERE id = 1
        "#,
    )
    .fetch_optional(&app_state.database.pool)
    .await?;

    match row {
        Some((
            enabled,
            host,
            port,
            username,
            password_encrypted,
            from_name,
            from_email,
            use_tls,
            frontend_url,
            app_name,
        )) => Ok(Json(SmtpConfig {
            enabled,
            host,
            port,
            username,
            password: None,
            has_password: password_encrypted.as_ref().is_some_and(|p| !p.is_empty()),
            from_name,
            from_email,
            use_tls,
            frontend_url,
            app_name,
        })),
        None => {
            // Return default config
            Ok(Json(SmtpConfig {
                enabled: false,
                host: None,
                port: 587,
                username: None,
                password: None,
                has_password: false,
                from_name: "StreamCore".to_string(),
                from_email: None,
                use_tls: true,
                frontend_url: "http://localhost:5000".to_string(),
                app_name: "StreamCore".to_string(),
            }))
        }
    }
}

/// Update SMTP configuration
pub async fn update_smtp_config(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<UpdateSmtpConfigRequest>,
) -> Result<Json<SmtpConfig>, AppError> {
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err(AppError::Forbidden);
    }
    let user_id: i64 = claims
        .sub
        .parse()
        .map_err(|_| AppError::AuthenticationFailed)?;

    // Encrypt password if provided
    let password_to_store = if let Some(ref pwd) = payload.password {
        if pwd.is_empty() {
            None
        } else {
            // Encrypt using AES-256-GCM if key available, else Base64
            Some(encrypt_smtp_password(pwd))
        }
    } else {
        // Keep existing password if not provided
        let existing: Option<String> =
            sqlx::query_scalar("SELECT password_encrypted FROM core.smtp_config WHERE id = 1")
                .fetch_optional(&app_state.database.pool)
                .await?
                .flatten();
        existing
    };

    sqlx::query(
        r#"
        INSERT INTO core.smtp_config (id, enabled, host, port, username, password_encrypted, from_name, from_email, use_tls, frontend_url, app_name, updated_at, updated_by)
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT(id) DO UPDATE SET
            enabled = excluded.enabled,
            host = excluded.host,
            port = excluded.port,
            username = excluded.username,
            password_encrypted = CASE WHEN excluded.password_encrypted IS NOT NULL THEN excluded.password_encrypted ELSE smtp_config.password_encrypted END,
            from_name = excluded.from_name,
            from_email = excluded.from_email,
            use_tls = excluded.use_tls,
            frontend_url = excluded.frontend_url,
            app_name = excluded.app_name,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by
        "#,
    )
    .bind(payload.enabled)
    .bind(&payload.host)
    .bind(payload.port.unwrap_or(587))
    .bind(&payload.username)
    .bind(&password_to_store)
    .bind(payload.from_name.as_deref().unwrap_or("StreamCore"))
    .bind(&payload.from_email)
    .bind(payload.use_tls.unwrap_or(true))
    .bind(payload.frontend_url.as_deref().unwrap_or("http://localhost:5000"))
    .bind(payload.app_name.as_deref().unwrap_or("StreamCore"))
    .bind(Utc::now())
    .bind(user_id)
    .execute(&app_state.database.pool)
    .await?;

    tracing::info!(user_id = user_id, "SMTP configuration updated");

    // Reload email service config
    if let Err(e) = app_state
        .email_service
        .reload_config(&app_state.database.pool)
        .await
    {
        tracing::error!(error = %e, "Failed to reload email config");
    }

    // Return updated config
    get_smtp_config(State(app_state), Extension(claims)).await
}

/// Test SMTP connection by sending a test email
pub async fn test_smtp_connection(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<TestSmtpRequest>,
) -> Result<Json<TestSmtpResponse>, AppError> {
    if !matches!(claims.role, crate::models::user::UserRole::Admin | crate::models::user::UserRole::System) {
        return Err(AppError::Forbidden);
    }
    // Validate email format
    if !payload.test_email.contains('@') {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }

    // Reload config first
    if let Err(e) = app_state
        .email_service
        .reload_config(&app_state.database.pool)
        .await
    {
        tracing::error!(error = %e, "Failed to reload email config");
    }

    if !app_state.email_service.is_configured() {
        return Ok(Json(TestSmtpResponse {
            success: false,
            message: "SMTP is not configured. Please fill in all required fields.".to_string(),
        }));
    }

    // Try to send test email
    match app_state
        .email_service
        .send_test_email(&payload.test_email)
        .await
    {
        Ok(_) => {
            tracing::info!(email = payload.test_email, "Test email sent successfully");
            Ok(Json(TestSmtpResponse {
                success: true,
                message: format!("Test email sent successfully to {}", payload.test_email),
            }))
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to send test email");
            Ok(Json(TestSmtpResponse {
                success: false,
                message: format!("Failed to send email: {}", e),
            }))
        }
    }
}
