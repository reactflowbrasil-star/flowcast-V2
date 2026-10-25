use anyhow::Result;
use lettre::{
    message::{header::ContentType, Mailbox},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use sqlx::{Pool, Postgres};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct EmailConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_name: String,
    pub from_email: String,
    pub use_tls: bool,
    pub frontend_url: String,
    pub app_name: String,
}

impl EmailConfig {
    pub async fn from_db(pool: &Pool<Postgres>) -> Option<Self> {
        #[derive(sqlx::FromRow)]
        struct SmtpConfigRow {
            enabled: bool,
            host: Option<String>,
            port: i32,
            username: Option<String>,
            password_encrypted: Option<String>,
            from_name: String,
            from_email: Option<String>,
            use_tls: bool,
            frontend_url: String,
            app_name: String,
        }

        let row: SmtpConfigRow = sqlx::query_as(
            r#"
            SELECT 
                enabled, host, port, username, password_encrypted,
                from_name, from_email, use_tls, frontend_url, app_name
            FROM core.smtp_config WHERE id = 1
            "#,
        )
        .fetch_optional(pool)
        .await
        .ok()??;

        let SmtpConfigRow {
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
        } = row;

        if !enabled {
            return None;
        }

        let host = host?;
        let username = username?;
        let from_email = from_email?;

        // Decrypt password: supports AES-256-GCM (aes256: prefix) and legacy Base64
        let password = password_encrypted
            .as_ref()
            .and_then(|p: &String| {
                if let Some(encoded) = p.strip_prefix("aes256:") {
                    // AES-256-GCM encrypted: decode Base64, extract nonce (first 12 bytes), decrypt
                    // strip "aes256:" prefix
                    let combined = base64::Engine::decode(
                        &base64::engine::general_purpose::STANDARD, encoded
                    ).ok()?;
                    if combined.len() < 12 {
                        tracing::error!("SMTP password: AES ciphertext too short");
                        return None;
                    }
                    let hex_key = std::env::var("STREAMCORE_SMTP_KEY").ok()?;
                    let key_bytes = hex::decode(hex_key.trim()).ok()?;
                    if key_bytes.len() != 32 {
                        tracing::error!("STREAMCORE_SMTP_KEY must be 64 hex chars (32 bytes)");
                        return None;
                    }
                    use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead, Nonce};
                    let cipher = Aes256Gcm::new_from_slice(&key_bytes).ok()?;
                    let nonce = Nonce::from_slice(&combined[..12]);
                    let plaintext = cipher.decrypt(nonce, &combined[12..]).ok()?;
                    String::from_utf8(plaintext).ok()
                } else {
                    // Legacy Base64 decode
                    base64::Engine::decode(&base64::engine::general_purpose::STANDARD, p)
                        .ok()
                        .and_then(|bytes| String::from_utf8(bytes).ok())
                }
            })?;

        Some(Self {
            enabled,
            host,
            port: port as u16,
            username,
            password,
            from_name,
            from_email,
            use_tls,
            frontend_url,
            app_name,
        })
    }
}

#[derive(Clone)]
pub struct EmailService {
    config: Arc<RwLock<Option<EmailConfig>>>,
}

impl EmailService {
    pub fn new(config: Option<EmailConfig>) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
        }
    }

    pub async fn reload_config(&self, pool: &Pool<Postgres>) -> Result<()> {
        let new_config = EmailConfig::from_db(pool).await;
        let mut config = self.config.write().await;
        *config = new_config;

        if config.is_some() {
            tracing::info!("📧 SMTP configuration reloaded from database");
        } else {
            tracing::info!("📧 SMTP disabled or not configured");
        }

        Ok(())
    }

    pub fn is_configured(&self) -> bool {
        // Use blocking read for sync check
        if let Ok(config) = self.config.try_read() {
            config.is_some()
        } else {
            false
        }
    }

    pub async fn is_configured_async(&self) -> bool {
        let config = self.config.read().await;
        config.is_some()
    }

    async fn get_config(&self) -> Option<EmailConfig> {
        let config = self.config.read().await;
        config.clone()
    }

    async fn send_email(&self, to_email: &str, subject: &str, html_body: &str) -> Result<()> {
        let config = self.get_config().await.ok_or_else(|| {
            anyhow::anyhow!("SMTP not configured. Configure it in Admin > Settings > Email.")
        })?;

        let from_mailbox: Mailbox = format!("{} <{}>", config.from_name, config.from_email)
            .parse()
            .map_err(|e| anyhow::anyhow!("Invalid from email: {}", e))?;

        let to_mailbox: Mailbox = to_email
            .parse()
            .map_err(|e| anyhow::anyhow!("Invalid to email: {}", e))?;

        let email = Message::builder()
            .from(from_mailbox)
            .to(to_mailbox)
            .subject(subject)
            .header(ContentType::TEXT_HTML)
            .body(html_body.to_string())
            .map_err(|e| anyhow::anyhow!("Failed to build email: {}", e))?;

        let creds = Credentials::new(config.username.clone(), config.password.clone());

        let mailer: AsyncSmtpTransport<Tokio1Executor> = if config.use_tls {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)?
                .port(config.port)
                .credentials(creds)
                .build()
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host)
                .port(config.port)
                .credentials(creds)
                .build()
        };

        mailer.send(email).await?;

        tracing::info!(
            to = to_email,
            subject = subject,
            "📧 Email sent successfully"
        );
        Ok(())
    }

    pub async fn send_test_email(&self, to_email: &str) -> Result<()> {
        let config = self
            .get_config()
            .await
            .ok_or_else(|| anyhow::anyhow!("SMTP not configured"))?;

        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">✅ SMTP Test Successful</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Congratulations! Your SMTP configuration is working correctly.
                            </p>
                            <div style="background-color: #0f172a; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                <p style="color: #94a3b8; font-size: 14px; margin: 0;">
                                    <strong style="color: #10b981;">SMTP Host:</strong> {host}<br><br>
                                    <strong style="color: #10b981;">From:</strong> {from_name} &lt;{from_email}&gt;<br><br>
                                    <strong style="color: #10b981;">TLS:</strong> {tls}
                                </p>
                            </div>
                            <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 20px 0 0;">
                                This is a test email sent from {app_name}. You can now use email features like password reset and 2FA notifications.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0f172a; padding: 20px; text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2024 {app_name} · Email Configuration Test
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"#,
            host = config.host,
            from_name = config.from_name,
            from_email = config.from_email,
            tls = if config.use_tls {
                "Enabled"
            } else {
                "Disabled"
            },
            app_name = config.app_name
        );

        self.send_email(
            to_email,
            &format!("{} - SMTP Test", config.app_name),
            &html_body,
        )
        .await
    }

    pub async fn send_password_reset(
        &self,
        to_email: &str,
        username: &str,
        token: &str,
    ) -> Result<()> {
        let config = self
            .get_config()
            .await
            .ok_or_else(|| anyhow::anyhow!("SMTP not configured"))?;

        let reset_url = format!("{}/reset-password?token={}", config.frontend_url, token);

        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🔐 Password Reset</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hello <strong style="color: #a5b4fc;">{username}</strong>,
                            </p>
                            <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                                We received a request to reset your password. Click the button below to create a new password:
                            </p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="{reset_url}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 30px 0 0;">
                                This link will expire in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.
                            </p>
                            <hr style="border: none; border-top: 1px solid #334155; margin: 30px 0;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                If the button doesn't work, copy and paste this URL into your browser:<br>
                                <a href="{reset_url}" style="color: #6366f1; word-break: break-all;">{reset_url}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0f172a; padding: 20px; text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2024 {app_name} · Secure Access
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"#,
            username = username,
            reset_url = reset_url,
            app_name = config.app_name
        );

        self.send_email(
            to_email,
            &format!("Reset Your Password - {}", config.app_name),
            &html_body,
        )
        .await
    }

    pub async fn send_2fa_enabled(&self, to_email: &str, username: &str) -> Result<()> {
        let config = self
            .get_config()
            .await
            .ok_or_else(|| anyhow::anyhow!("SMTP not configured"))?;

        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🛡️ 2FA Enabled</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hello <strong style="color: #6ee7b7;">{username}</strong>,
                            </p>
                            <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Two-Factor Authentication has been <strong style="color: #10b981;">successfully enabled</strong> on your account.
                            </p>
                            <div style="background-color: #0f172a; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                <p style="color: #94a3b8; font-size: 14px; margin: 0;">
                                    ✅ Your account is now protected with an additional layer of security.<br><br>
                                    📱 You'll need your authenticator app to sign in from now on.<br><br>
                                    🔑 Make sure to keep your backup codes in a safe place.
                                </p>
                            </div>
                            <p style="color: #f87171; font-size: 14px; line-height: 1.6; margin: 20px 0 0;">
                                ⚠️ If you didn't enable 2FA, please contact support immediately.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0f172a; padding: 20px; text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2024 {app_name} · Secure Access
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"#,
            username = username,
            app_name = config.app_name
        );

        self.send_email(
            to_email,
            &format!("Two-Factor Authentication Enabled - {}", config.app_name),
            &html_body,
        )
        .await
    }

    pub async fn send_2fa_disabled(&self, to_email: &str, username: &str) -> Result<()> {
        let config = self
            .get_config()
            .await
            .ok_or_else(|| anyhow::anyhow!("SMTP not configured"))?;

        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">⚠️ 2FA Disabled</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hello <strong style="color: #fcd34d;">{username}</strong>,
                            </p>
                            <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Two-Factor Authentication has been <strong style="color: #f59e0b;">disabled</strong> on your account.
                            </p>
                            <div style="background-color: #0f172a; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                <p style="color: #94a3b8; font-size: 14px; margin: 0;">
                                    🔓 Your account no longer requires a second factor to sign in.<br><br>
                                    We recommend keeping 2FA enabled for maximum security.
                                </p>
                            </div>
                            <p style="color: #f87171; font-size: 14px; line-height: 1.6; margin: 20px 0 0;">
                                ⚠️ If you didn't disable 2FA, please secure your account immediately and contact support.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0f172a; padding: 20px; text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2024 {app_name} · Secure Access
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"#,
            username = username,
            app_name = config.app_name
        );

        self.send_email(
            to_email,
            &format!("Two-Factor Authentication Disabled - {}", config.app_name),
            &html_body,
        )
        .await
    }

    pub async fn send_verification_email(
        &self,
        to_email: &str,
        username: &str,
        verify_url: &str,
    ) -> Result<()> {
        let config = self
            .get_config()
            .await
            .ok_or_else(|| anyhow::anyhow!("SMTP not configured"))?;

        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">📧 Verify Your Email</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hello <strong style="color: #93c5fd;">{username}</strong>,
                            </p>
                            <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                                Welcome to {app_name}! Please verify your email address by clicking the button below:
                            </p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="{verify_url}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);">
                                            Verify Email
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 30px 0 0;">
                                This link will expire in <strong>24 hours</strong>. If you didn't create this account, you can safely ignore this email.
                            </p>
                            <hr style="border: none; border-top: 1px solid #334155; margin: 30px 0;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                If the button doesn't work, copy and paste this URL into your browser:<br>
                                <a href="{verify_url}" style="color: #3b82f6; word-break: break-all;">{verify_url}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0f172a; padding: 20px; text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2024 {app_name} · Email Verification
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"#,
            username = username,
            verify_url = verify_url,
            app_name = config.app_name
        );

        self.send_email(
            to_email,
            &format!("Verify Your Email - {}", config.app_name),
            &html_body,
        )
        .await
    }
}
