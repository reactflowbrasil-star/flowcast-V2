use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub server_address: String,
    pub public_base_url: String,
    pub jwt_secret: String,
    // Stripe payment settings
    pub stripe_secret_key: String,
    pub stripe_webhook_secret: String,
    pub stripe_success_url: String,
    pub stripe_cancel_url: String,
    pub stripe_currency: String,
    pub content_items_multiplier: f64,
    // Media storage settings
    pub media_storage_path: String,
    pub video_upload_max_bytes: u64,
    // API response encryption key (optional, 64-char hex = 32 bytes)
    pub api_encryption_key: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();

        let mut database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/iptv".to_string());
        if database_url.contains("-pooler.") {
            let allow_pooler = env::var("ALLOW_PG_POOLER")
                .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE"))
                .unwrap_or(false);
            if !allow_pooler {
                let direct_url = database_url.replace("-pooler.", ".");
                eprintln!(
                    "⚠️  Pooler detected in DATABASE_URL; using direct endpoint for SQLx compatibility. Set ALLOW_PG_POOLER=true to keep the pooler."
                );
                database_url = direct_url;
            }
        }

        let server_address =
            env::var("SERVER_ADDRESS").unwrap_or_else(|_| "0.0.0.0:3000".to_string());

        // Public base URL used to build absolute metadata/image URLs returned to clients
        let public_base_url =
            env::var("PUBLIC_BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());

        // Log the PUBLIC_BASE_URL being used
        eprintln!("🔧 CONFIG: PUBLIC_BASE_URL = {}", public_base_url);

        let content_items_multiplier = match env::var("CONTENT_OVERVIEW_MULTIPLIER") {
            Ok(raw) => {
                let trimmed = raw.trim();
                if trimmed.is_empty() {
                    1.0
                } else {
                    let numeric_part = trimmed
                        .strip_prefix(|c| matches!(c, 'x' | 'X'))
                        .unwrap_or(trimmed);
                    match numeric_part.parse::<f64>() {
                        Ok(value) if value.is_finite() && value > 0.0 => value,
                        Ok(_) | Err(_) => {
                            eprintln!(
                                "⚠️  Invalid CONTENT_OVERVIEW_MULTIPLIER '{}', defaulting to 1.0",
                                raw
                            );
                            1.0
                        }
                    }
                }
            }
            Err(_) => 1.0,
        };
        eprintln!(
            "🔢 CONFIG: CONTENT_OVERVIEW_MULTIPLIER = {}",
            content_items_multiplier
        );

        let jwt_secret = env::var("JWT_SECRET")
            .map_err(|_| anyhow::anyhow!("JWT_SECRET environment variable is required"))?;

        // Stripe configuration (optional - leave empty to disable payments)
        // If STRIPE_SECRET_KEY is not set, payment endpoints will fail gracefully
        let stripe_secret_key = env::var("STRIPE_SECRET_KEY").unwrap_or_default();
        let stripe_webhook_secret = env::var("STRIPE_WEBHOOK_SECRET").unwrap_or_default();
        let stripe_success_url =
            env::var("STRIPE_SUCCESS_URL").unwrap_or_else(|_| "/credits/success".to_string());
        let stripe_cancel_url =
            env::var("STRIPE_CANCEL_URL").unwrap_or_else(|_| "/credits/cancel".to_string());
        let stripe_currency = env::var("STRIPE_CURRENCY").unwrap_or_else(|_| "usd".to_string());

        // Media storage configuration
        let media_storage_path =
            env::var("MEDIA_STORAGE_PATH").unwrap_or_else(|_| "/media".to_string());
        let video_upload_max_bytes = env::var("VIDEO_UPLOAD_MAX_BYTES")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(5_368_709_120); // 5GB default
        eprintln!("📁 CONFIG: MEDIA_STORAGE_PATH = {}", media_storage_path);
        eprintln!(
            "📦 CONFIG: VIDEO_UPLOAD_MAX_BYTES = {}",
            video_upload_max_bytes
        );

        // API response encryption key (optional)
        let api_encryption_key = env::var("API_ENCRYPTION_KEY").ok().filter(|k| {
            if k.len() != 64 {
                eprintln!("⚠️  API_ENCRYPTION_KEY must be 64 hex chars (32 bytes), ignoring");
                false
            } else if hex::decode(k).is_err() {
                eprintln!("⚠️  API_ENCRYPTION_KEY is not valid hex, ignoring");
                false
            } else {
                true
            }
        });
        if api_encryption_key.is_some() {
            eprintln!("🔐 CONFIG: API_ENCRYPTION_KEY = configured (end-user responses will be encrypted)");
        } else {
            eprintln!("🔓 CONFIG: API_ENCRYPTION_KEY = not set (responses unencrypted)");
        }

        Ok(Self {
            database_url,
            server_address,
            public_base_url,
            jwt_secret,
            stripe_secret_key,
            stripe_webhook_secret,
            stripe_success_url,
            stripe_cancel_url,
            stripe_currency,
            content_items_multiplier,
            media_storage_path,
            video_upload_max_bytes,
            api_encryption_key,
        })
    }
}

// ─── Dynamic Config (DB-first, env var fallback) ─────────────

/// Read a config value from the database (`core.config` table) first,
/// falling back to the provided `env_fallback` if not found in DB.
/// For sensitive keys, the DB value is decrypted automatically.
pub async fn get_dynamic_config_value(
    pool: &sqlx::PgPool,
    key: &str,
    env_fallback: &str,
) -> String {
    match sqlx::query_scalar::<_, String>("SELECT value FROM core.config WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(db_val)) if !db_val.is_empty() => {
            // Decrypt if this is a sensitive key stored with AES prefix
            if db_val.starts_with("aes256:") {
                decrypt_config_value(&db_val).unwrap_or_else(|| {
                    tracing::warn!("Failed to decrypt config key '{}', using env fallback", key);
                    env_fallback.to_string()
                })
            } else {
                db_val
            }
        }
        _ => env_fallback.to_string(),
    }
}

/// Encrypt a config value using AES-256-GCM (same key as SMTP: `STREAMCORE_SMTP_KEY`).
/// Returns `aes256:<base64>` on success, or the plaintext value if no key is set.
pub fn encrypt_config_value(plaintext: &str) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    if let Ok(hex_key) = std::env::var("STREAMCORE_SMTP_KEY") {
        if let Ok(encrypted) = aes_encrypt(plaintext, &hex_key) {
            return format!("aes256:{}", encrypted);
        }
    }
    // No encryption key available — store as-is (same security as env var)
    plaintext.to_string()
}

/// Decrypt an `aes256:<base64>` value. Returns None on failure.
fn decrypt_config_value(stored: &str) -> Option<String> {
    let payload = stored.strip_prefix("aes256:")?;
    let hex_key = std::env::var("STREAMCORE_SMTP_KEY").ok()?;
    aes_decrypt(payload, &hex_key)
}

/// Mask a sensitive value for display (show first 4 chars + last 4 chars).
pub fn mask_sensitive_value(val: &str) -> String {
    if val.is_empty() {
        return String::new();
    }
    if val.len() <= 12 {
        return "••••••••".to_string();
    }
    format!("{}••••••••{}", &val[..4], &val[val.len()-4..])
}

// ─── AES-256-GCM helpers (shared with email.rs) ─────────────

pub fn aes_encrypt(plaintext: &str, hex_key: &str) -> Result<String, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use aes_gcm::aead::Aead;
    use base64::{Engine, engine::general_purpose::STANDARD};
    use rand::RngCore;

    let key_bytes = hex::decode(hex_key).map_err(|e| e.to_string())?;
    if key_bytes.len() != 32 {
        return Err("Key must be 32 bytes".to_string());
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).map_err(|e| e.to_string())?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(&combined))
}

pub fn aes_decrypt(b64: &str, hex_key: &str) -> Option<String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use aes_gcm::aead::Aead;
    use base64::{Engine, engine::general_purpose::STANDARD};

    let key_bytes = hex::decode(hex_key).ok()?;
    if key_bytes.len() != 32 {
        return None;
    }

    let combined = STANDARD.decode(b64).ok()?;
    if combined.len() < 12 {
        return None;
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).ok()?;
    let nonce = Nonce::from_slice(&combined[..12]);
    let plaintext = cipher.decrypt(nonce, &combined[12..]).ok()?;
    String::from_utf8(plaintext).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    // A deterministic 32-byte hex key for testing
    const TEST_KEY_HEX: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn aes_roundtrip_encrypts_and_decrypts() {
        let plaintext = "sk_live_test1234567890abcdef";
        let encrypted = aes_encrypt(plaintext, TEST_KEY_HEX).expect("encrypt should succeed");
        let decrypted = aes_decrypt(&encrypted, TEST_KEY_HEX).expect("decrypt should succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn aes_different_plaintexts_produce_different_ciphertexts() {
        let a = aes_encrypt("secret_a", TEST_KEY_HEX).unwrap();
        let b = aes_encrypt("secret_b", TEST_KEY_HEX).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn aes_same_plaintext_produces_different_ciphertexts_due_to_random_nonce() {
        let a = aes_encrypt("same_value", TEST_KEY_HEX).unwrap();
        let b = aes_encrypt("same_value", TEST_KEY_HEX).unwrap();
        assert_ne!(a, b, "random nonce should produce different ciphertexts");
        // But both should decrypt to the same plaintext
        assert_eq!(aes_decrypt(&a, TEST_KEY_HEX).unwrap(), "same_value");
        assert_eq!(aes_decrypt(&b, TEST_KEY_HEX).unwrap(), "same_value");
    }

    #[test]
    fn aes_wrong_key_fails_to_decrypt() {
        let encrypted = aes_encrypt("secret", TEST_KEY_HEX).unwrap();
        let wrong_key = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        assert!(aes_decrypt(&encrypted, wrong_key).is_none());
    }

    #[test]
    fn aes_invalid_key_length_returns_error() {
        assert!(aes_encrypt("test", "0123456789abcdef").is_err()); // 8 bytes, not 32
    }

    #[test]
    fn aes_invalid_hex_key_returns_error() {
        assert!(aes_encrypt("test", "not_a_hex_key_at_all_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx").is_err());
    }

    #[test]
    fn aes_decrypt_invalid_base64_returns_none() {
        assert!(aes_decrypt("not!valid!base64", TEST_KEY_HEX).is_none());
    }

    #[test]
    fn aes_decrypt_too_short_returns_none() {
        // Less than 12 bytes (nonce size)
        use base64::{Engine, engine::general_purpose::STANDARD};
        let short = STANDARD.encode(&[0u8; 5]);
        assert!(aes_decrypt(&short, TEST_KEY_HEX).is_none());
    }

    // ─── encrypt_config_value ─────────────────────

    #[test]
    fn encrypt_config_value_empty_returns_empty() {
        assert_eq!(encrypt_config_value(""), "");
    }

    #[test]
    fn encrypt_config_value_with_key_returns_aes_prefix() {
        std::env::set_var("STREAMCORE_SMTP_KEY", TEST_KEY_HEX);
        let result = encrypt_config_value("sk_live_abc123");
        assert!(result.starts_with("aes256:"), "should have aes256: prefix, got: {}", result);
        std::env::remove_var("STREAMCORE_SMTP_KEY");
    }

    #[test]
    fn encrypt_config_value_without_key_returns_plaintext() {
        std::env::remove_var("STREAMCORE_SMTP_KEY");
        let result = encrypt_config_value("sk_live_abc123");
        assert_eq!(result, "sk_live_abc123");
    }

    // ─── mask_sensitive_value ─────────────────────

    #[test]
    fn mask_empty_returns_empty() {
        assert_eq!(mask_sensitive_value(""), "");
    }

    #[test]
    fn mask_short_value_returns_dots() {
        assert_eq!(mask_sensitive_value("short"), "••••••••");
        assert_eq!(mask_sensitive_value("123456789012"), "••••••••"); // exactly 12
    }

    #[test]
    fn mask_long_value_shows_first_and_last_four() {
        let masked = mask_sensitive_value("sk_live_abcdefghijklmnop");
        assert!(masked.starts_with("sk_l"), "should start with first 4 chars");
        assert!(masked.ends_with("mnop"), "should end with last 4 chars");
        assert!(masked.contains("••••••••"), "should contain dots in middle");
    }

    #[test]
    fn mask_13_char_string() {
        // exactly 13 chars, just above the threshold
        let masked = mask_sensitive_value("1234567890123");
        assert_eq!(masked, "1234••••••••0123");
    }
}

