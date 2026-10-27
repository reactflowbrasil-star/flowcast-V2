use crate::error::AppError;
use chrono::Datelike;
use regex::Regex;

pub trait Validate {
    fn validate(&self) -> Result<(), AppError>;
}

pub struct ValidationUtils;

impl ValidationUtils {
    /// Validate username
    pub fn validate_username(username: &str) -> Result<(), AppError> {
        if username.is_empty() {
            return Err(AppError::BadRequest("Username cannot be empty".to_string()));
        }
        if username.len() < 3 {
            return Err(AppError::BadRequest(
                "Username must be at least 3 characters long".to_string(),
            ));
        }
        if username.len() > 50 {
            return Err(AppError::BadRequest(
                "Username cannot exceed 50 characters".to_string(),
            ));
        }

        let username_regex = Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap();
        if !username_regex.is_match(username) {
            return Err(AppError::BadRequest(
                "Username can only contain letters, numbers, underscores, and hyphens".to_string(),
            ));
        }

        Ok(())
    }

    /// Validate password
    pub fn validate_password(password: &str) -> Result<(), AppError> {
        if password.is_empty() {
            return Err(AppError::BadRequest("Password cannot be empty".to_string()));
        }
        if password.len() < 4 {
            return Err(AppError::BadRequest(
                "Password must be at least 4 characters long".to_string(),
            ));
        }
        if password.len() > 100 {
            return Err(AppError::BadRequest(
                "Password cannot exceed 100 characters".to_string(),
            ));
        }
        Ok(())
    }

    /// Validate email
    pub fn validate_email(email: &str) -> Result<(), AppError> {
        if email.is_empty() {
            return Err(AppError::BadRequest("Email cannot be empty".to_string()));
        }

        let email_regex = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
        if !email_regex.is_match(email) {
            return Err(AppError::BadRequest("Invalid email format".to_string()));
        }

        Ok(())
    }

    /// Validate device count
    pub fn validate_device_count(count: i32) -> Result<(), AppError> {
        if count < 1 {
            return Err(AppError::BadRequest(
                "Device count must be at least 1".to_string(),
            ));
        }
        if count > 10 {
            return Err(AppError::BadRequest(
                "Device count cannot exceed 10".to_string(),
            ));
        }
        Ok(())
    }

    /// Validate string length
    pub fn validate_string_length(
        value: &str,
        field_name: &str,
        min_len: usize,
        max_len: usize,
    ) -> Result<(), AppError> {
        if value.len() < min_len {
            return Err(AppError::BadRequest(format!(
                "{} must be at least {} characters long",
                field_name, min_len
            )));
        }
        if value.len() > max_len {
            return Err(AppError::BadRequest(format!(
                "{} cannot exceed {} characters",
                field_name, max_len
            )));
        }
        Ok(())
    }

    /// Validate URL
    pub fn validate_url(url: &str, field_name: &str) -> Result<(), AppError> {
        if url.is_empty() {
            return Err(AppError::BadRequest(format!(
                "{} cannot be empty",
                field_name
            )));
        }

        let url_regex = Regex::new(r"^https?://[^\s/$.?#].[^\s]*$").unwrap();
        // Also accept internal paths (local files, API routes, metadata paths)
        let is_internal_path = url.starts_with('/') || url.starts_with("[Pending Upload]");
        if !url_regex.is_match(url) && !is_internal_path {
            return Err(AppError::BadRequest(format!(
                "Invalid {} format",
                field_name
            )));
        }

        Ok(())
    }

    /// Validate year
    pub fn validate_year(year: i32) -> Result<(), AppError> {
        let current_year = chrono::Utc::now().year();
        if year < 1900 || year > current_year + 10 {
            return Err(AppError::BadRequest(format!(
                "Year must be between 1900 and {}",
                current_year + 10
            )));
        }
        Ok(())
    }

    /// Validate event type
    pub fn validate_event_type(event_type: &str) -> Result<(), AppError> {
        if !matches!(event_type, "live" | "scheduled" | "recurring") {
            return Err(AppError::BadRequest(
                "Invalid event type. Must be 'live', 'scheduled', or 'recurring'".to_string(),
            ));
        }
        Ok(())
    }

    /// Validate configuration key
    pub fn validate_config_key(key: &str) -> Result<(), AppError> {
        match key {
            "default_connections"
            | "extra_connection_cost"
            | "tmdb_api_key"
            | "tmdb_language"
            | "tmdb_languages"
            | "tmdb_mode"
            | "tmdb_metadata_path"
            | "tmdb_preferred_format"
            | "player_engine"
            | "demo_creation_threshold"
            | "demo_ban_duration_days"
            | "demo_duration_hours"
            | "public_demo_enabled"
            | "public_redeem_enabled"
            | "hide_empty_episodes"
            | "ui_login_series_backdrops"
            | "ui_login_movies_backdrops"
            // Payment / Stripe settings (editable from Admin UI)
            | "stripe_secret_key"
            | "stripe_webhook_secret"
            | "stripe_subscription_webhook_secret"
            | "stripe_currency"
            | "stripe_success_url"
            | "stripe_cancel_url"
            | "public_base_url"
            | "content_overview_multiplier"
            | "allow_direct_registration"
            | "require_email_verification" => Ok(()),
            _ => Err(AppError::BadRequest(format!(
                "Invalid configuration key: {}",
                key
            ))),
        }
    }

    /// Keys whose values should be stored encrypted in the database.
    pub fn is_sensitive_config_key(key: &str) -> bool {
        matches!(
            key,
            "stripe_secret_key"
                | "stripe_webhook_secret"
                | "stripe_subscription_webhook_secret"
                | "tmdb_api_key"
        )
    }

    /// Validate configuration value based on key
    pub fn validate_config_value(key: &str, value: &str) -> Result<(), AppError> {
        match key {
            "player_engine" => {
                if !matches!(value, "auto" | "hlsjs" | "shaka" | "videojs" | "native") {
                    return Err(AppError::BadRequest(
                        "Player engine must be one of auto, hlsjs, shaka, videojs, or native".to_string(),
                    ));
                }
            }
            "default_connections" => {
                let connections = value.parse::<i32>().map_err(|_| {
                    AppError::BadRequest("Default connections must be a valid integer".to_string())
                })?;
                ValidationService::validate_positive_integer(connections, "Default connections")?;
            }
            "extra_connection_cost" => {
                let cost = value.parse::<f64>().map_err(|_| {
                    AppError::BadRequest("Extra connection cost must be a valid number".to_string())
                })?;
                ValidationService::validate_positive_number(cost, "Extra connection cost")?;
            }
            "demo_creation_threshold" => {
                let threshold = value.parse::<i32>().map_err(|_| {
                    AppError::BadRequest(
                        "Demo creation threshold must be a valid integer".to_string(),
                    )
                })?;
                ValidationService::validate_positive_integer(threshold, "Demo creation threshold")?;
            }
            "demo_ban_duration_days" => {
                let days = value.parse::<i32>().map_err(|_| {
                    AppError::BadRequest(
                        "Demo ban duration must be a valid integer (days)".to_string(),
                    )
                })?;
                ValidationService::validate_positive_integer(days, "Demo ban duration days")?;
            }
            "demo_duration_hours" => {
                let hours = value.parse::<i32>().map_err(|_| {
                    AppError::BadRequest(
                        "Demo duration must be a valid integer (hours)".to_string(),
                    )
                })?;
                if !(1..=168).contains(&hours) {
                    return Err(AppError::BadRequest(
                        "Demo duration must be between 1 and 168 hours (7 days)".to_string(),
                    ));
                }
            }
            "tmdb_api_key" => {
                // TMDB API key can be any string (including empty)
                if value.len() > 255 {
                    return Err(AppError::BadRequest(
                        "TMDB API key cannot exceed 255 characters".to_string(),
                    ));
                }
            }
            "ui_login_series_backdrops" | "ui_login_movies_backdrops" => {
                // Comma/newline-separated URLs or /public paths.
                // Keep this permissive but bounded.
                if value.len() > 8000 {
                    return Err(AppError::BadRequest(
                        "Backdrop list is too long (max 8000 characters)".to_string(),
                    ));
                }
            }
            "tmdb_language" => {
                // TMDB language should be a valid language code
                if value.is_empty() {
                    return Err(AppError::BadRequest(
                        "TMDB language cannot be empty".to_string(),
                    ));
                }
                if value.len() > 10 {
                    return Err(AppError::BadRequest(
                        "TMDB language code cannot exceed 10 characters".to_string(),
                    ));
                }
                // Basic validation for language code format (e.g., "es-ES", "en-US")
                let language_regex = regex::Regex::new(r"^[a-z]{2}(-[A-Z]{2})?$").unwrap();
                if !language_regex.is_match(value) {
                    return Err(AppError::BadRequest(
                        "TMDB language must be in format 'xx' or 'xx-XX' (e.g., 'es', 'es-ES')"
                            .to_string(),
                    ));
                }
            }
            "tmdb_languages" => {
                // Comma-separated list of language codes (e.g., "es-ES,en-US,pt-BR")
                if value.is_empty() {
                    return Err(AppError::BadRequest(
                        "TMDB languages cannot be empty".to_string(),
                    ));
                }
                if value.len() > 200 {
                    return Err(AppError::BadRequest(
                        "TMDB languages list is too long".to_string(),
                    ));
                }
                let language_regex = regex::Regex::new(r"^[a-z]{2}(-[A-Z]{2})?$").unwrap();
                for lang in value.split(',') {
                    let lang = lang.trim();
                    if !language_regex.is_match(lang) {
                        return Err(AppError::BadRequest(
                            format!("Invalid language code '{}'. Must be 'xx' or 'xx-XX' (e.g., 'es-ES')", lang),
                        ));
                    }
                }
            }
            "tmdb_mode" => {
                if value.is_empty() {
                    return Err(AppError::BadRequest(
                        "TMDB mode cannot be empty".to_string(),
                    ));
                }
                match value {
                    "tmdb" | "local" => {}
                    _ => {
                        return Err(AppError::BadRequest(
                            "TMDB mode must be either 'tmdb' or 'local'".to_string(),
                        ))
                    }
                }
            }
            "tmdb_metadata_path" => {
                if value.is_empty() {
                    return Err(AppError::BadRequest(
                        "TMDB metadata path cannot be empty".to_string(),
                    ));
                }
                if value.len() > 255 {
                    return Err(AppError::BadRequest(
                        "TMDB metadata path cannot exceed 255 characters".to_string(),
                    ));
                }
                if value.contains("..") {
                    return Err(AppError::BadRequest(
                        "TMDB metadata path cannot contain traversals (..).".to_string(),
                    ));
                }
            }
            "tmdb_preferred_format" => {
                let format = value.to_lowercase();
                let valid = matches!(
                    format.as_str(),
                    "original" | "source" | "jpg" | "jpeg" | "png" | "webp"
                );
                if !valid {
                    return Err(AppError::BadRequest(
                        "TMDB preferred format must be one of: original, jpg, png, webp"
                            .to_string(),
                    ));
                }
            }
            "public_demo_enabled" | "public_redeem_enabled" | "hide_empty_episodes"
            | "allow_direct_registration" | "require_email_verification" => {
                let v = value.to_lowercase();
                if !matches!(v.as_str(), "true" | "false" | "1" | "0" | "yes" | "no") {
                    return Err(AppError::BadRequest(format!(
                        "{} must be a boolean value (true/false)",
                        key
                    )));
                }
            }
            // Stripe keys/secrets: allow any non-empty string up to 255 chars
            "stripe_secret_key" | "stripe_webhook_secret" | "stripe_subscription_webhook_secret" => {
                if value.len() > 255 {
                    return Err(AppError::BadRequest(
                        format!("{} cannot exceed 255 characters", key),
                    ));
                }
            }
            "stripe_currency" => {
                let c = value.to_lowercase();
                if c.len() != 3 || !c.chars().all(|ch| ch.is_ascii_lowercase()) {
                    return Err(AppError::BadRequest(
                        "Stripe currency must be a 3-letter code (e.g. 'usd', 'eur')".to_string(),
                    ));
                }
            }
            "stripe_success_url" | "stripe_cancel_url" | "public_base_url" => {
                if value.len() > 500 {
                    return Err(AppError::BadRequest(
                        format!("{} cannot exceed 500 characters", key),
                    ));
                }
                // Allow URLs and relative paths
                if !value.starts_with("http://") && !value.starts_with("https://") && !value.starts_with('/') {
                    return Err(AppError::BadRequest(
                        format!("{} must be a valid URL or path", key),
                    ));
                }
            }
            "content_overview_multiplier" => {
                let trimmed = value.trim();
                let numeric = trimmed.strip_prefix(|c| matches!(c, 'x' | 'X')).unwrap_or(trimmed);
                if numeric.parse::<f64>().is_err() {
                    return Err(AppError::BadRequest(
                        "Content overview multiplier must be a number (e.g. '1', 'x2', '0.5')".to_string(),
                    ));
                }
            }
            _ => {
                return Err(AppError::BadRequest(format!(
                    "Unknown configuration key: {}",
                    key
                )))
            }
        }
        Ok(())
    }
}

pub struct ValidationService;

impl ValidationService {
    /// Validate that an integer is positive
    pub fn validate_positive_integer(value: i32, field_name: &str) -> Result<(), AppError> {
        if value <= 0 {
            return Err(AppError::BadRequest(format!(
                "{} must be positive",
                field_name
            )));
        }
        Ok(())
    }

    /// Validate that a number is positive
    pub fn validate_positive_number(value: f64, field_name: &str) -> Result<(), AppError> {
        if value <= 0.0 {
            return Err(AppError::BadRequest(format!(
                "{} must be positive",
                field_name
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_username() {
        assert!(ValidationUtils::validate_username("validuser").is_ok());
        assert!(ValidationUtils::validate_username("user123").is_ok());
        assert!(ValidationUtils::validate_username("user_name").is_ok());
        assert!(ValidationUtils::validate_username("user-name").is_ok());

        assert!(ValidationUtils::validate_username("").is_err());
        assert!(ValidationUtils::validate_username("ab").is_err());
        assert!(ValidationUtils::validate_username("user@name").is_err());
    }

    #[test]
    fn test_validate_password() {
        assert!(ValidationUtils::validate_password("password123").is_ok());
        assert!(ValidationUtils::validate_password("123456").is_ok());
        assert!(ValidationUtils::validate_password("1234").is_ok()); // Minimum 4 characters

        assert!(ValidationUtils::validate_password("").is_err());
        assert!(ValidationUtils::validate_password("123").is_err()); // Less than 4 characters
    }

    #[test]
    fn test_validate_email() {
        assert!(ValidationUtils::validate_email("test@example.com").is_ok());
        assert!(ValidationUtils::validate_email("user.name@domain.co.uk").is_ok());

        assert!(ValidationUtils::validate_email("").is_err());
        assert!(ValidationUtils::validate_email("invalid-email").is_err());
        assert!(ValidationUtils::validate_email("@domain.com").is_err());
    }

    #[test]
    fn test_validate_config_key() {
        assert!(ValidationUtils::validate_config_key("default_connections").is_ok());
        assert!(ValidationUtils::validate_config_key("extra_connection_cost").is_ok());
        assert!(ValidationUtils::validate_config_key("tmdb_api_key").is_ok());
        assert!(ValidationUtils::validate_config_key("tmdb_language").is_ok());
        assert!(ValidationUtils::validate_config_key("tmdb_languages").is_ok());
        assert!(ValidationUtils::validate_config_key("tmdb_mode").is_ok());
        assert!(ValidationUtils::validate_config_key("tmdb_metadata_path").is_ok());
        assert!(ValidationUtils::validate_config_key("tmdb_preferred_format").is_ok());
        assert!(ValidationUtils::validate_config_key("player_engine").is_ok());
        assert!(ValidationUtils::validate_config_key("invalid_key").is_err());
    }

    #[test]
    fn test_validate_player_engine() {
        for engine in ["auto", "hlsjs", "shaka", "videojs", "native"] {
            assert!(ValidationUtils::validate_config_value("player_engine", engine).is_ok());
        }
        assert!(ValidationUtils::validate_config_value("player_engine", "unknown").is_err());
    }

    #[test]
    fn test_validate_tmdb_language() {
        assert!(ValidationUtils::validate_config_value("tmdb_language", "es-ES").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_language", "en-US").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_language", "fr-FR").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_language", "es").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_language", "en").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_language", "").is_err());
        assert!(ValidationUtils::validate_config_value("tmdb_language", "invalid").is_err());
        assert!(ValidationUtils::validate_config_value("tmdb_language", "es-es").is_err()); // lowercase country
        assert!(ValidationUtils::validate_config_value("tmdb_language", "ESP-ES").is_err());
        // too long language
    }

    #[test]
    fn test_validate_tmdb_languages_multi() {
        assert!(ValidationUtils::validate_config_value("tmdb_languages", "es-ES,en-US").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_languages", "es-ES,en-US,pt-BR").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_languages", "es").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_languages", "").is_err());
        assert!(ValidationUtils::validate_config_value("tmdb_languages", "invalid").is_err());
        assert!(ValidationUtils::validate_config_value("tmdb_languages", "es-ES,invalid").is_err());
    }

    #[test]
    fn test_validate_tmdb_mode_and_metadata() {
        assert!(ValidationUtils::validate_config_value("tmdb_mode", "tmdb").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_mode", "local").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_mode", "invalid").is_err());

        assert!(ValidationUtils::validate_config_value("tmdb_metadata_path", "metadata").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_metadata_path", "cache/tmdb").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_metadata_path", "../etc").is_err());

        assert!(
            ValidationUtils::validate_config_value("tmdb_preferred_format", "original").is_ok()
        );
        assert!(ValidationUtils::validate_config_value("tmdb_preferred_format", "webp").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_preferred_format", "png").is_ok());
        assert!(ValidationUtils::validate_config_value("tmdb_preferred_format", "gif").is_err());
    }

    // ─── Phase 14: Stripe / Payment config keys ────────────

    #[test]
    fn test_payment_config_keys_are_whitelisted() {
        let payment_keys = [
            "stripe_secret_key",
            "stripe_webhook_secret",
            "stripe_subscription_webhook_secret",
            "stripe_currency",
            "stripe_success_url",
            "stripe_cancel_url",
            "public_base_url",
            "content_overview_multiplier",
        ];
        for key in payment_keys {
            assert!(
                ValidationUtils::validate_config_key(key).is_ok(),
                "Key '{}' should be whitelisted",
                key
            );
        }
    }

    #[test]
    fn test_is_sensitive_config_key() {
        // Positive cases
        assert!(ValidationUtils::is_sensitive_config_key("stripe_secret_key"));
        assert!(ValidationUtils::is_sensitive_config_key("stripe_webhook_secret"));
        assert!(ValidationUtils::is_sensitive_config_key("stripe_subscription_webhook_secret"));
        assert!(ValidationUtils::is_sensitive_config_key("tmdb_api_key"));

        // Negative cases
        assert!(!ValidationUtils::is_sensitive_config_key("stripe_currency"));
        assert!(!ValidationUtils::is_sensitive_config_key("public_base_url"));
        assert!(!ValidationUtils::is_sensitive_config_key("content_overview_multiplier"));
        assert!(!ValidationUtils::is_sensitive_config_key("default_connections"));
    }

    #[test]
    fn test_stripe_key_validation() {
        // Accept any non-empty string up to 255 chars
        assert!(ValidationUtils::validate_config_value("stripe_secret_key", "sk_live_abc123").is_ok());
        assert!(ValidationUtils::validate_config_value("stripe_secret_key", "").is_ok()); // empty is allowed
        assert!(ValidationUtils::validate_config_value("stripe_webhook_secret", "whsec_test").is_ok());

        // Over 255 chars should fail
        let long = "a".repeat(256);
        assert!(ValidationUtils::validate_config_value("stripe_secret_key", &long).is_err());
        assert!(ValidationUtils::validate_config_value("stripe_webhook_secret", &long).is_err());
        assert!(ValidationUtils::validate_config_value("stripe_subscription_webhook_secret", &long).is_err());
    }

    #[test]
    fn test_stripe_currency_validation() {
        assert!(ValidationUtils::validate_config_value("stripe_currency", "usd").is_ok());
        assert!(ValidationUtils::validate_config_value("stripe_currency", "eur").is_ok());
        assert!(ValidationUtils::validate_config_value("stripe_currency", "gbp").is_ok());

        // Wrong format
        assert!(ValidationUtils::validate_config_value("stripe_currency", "US").is_err()); // 2 chars
        assert!(ValidationUtils::validate_config_value("stripe_currency", "usdx").is_err()); // 4 chars
        assert!(ValidationUtils::validate_config_value("stripe_currency", "USD").is_ok()); // lowercased internally
        assert!(ValidationUtils::validate_config_value("stripe_currency", "").is_err());
    }

    #[test]
    fn test_url_validation_for_stripe_and_public() {
        // Valid URLs
        assert!(ValidationUtils::validate_config_value("stripe_success_url", "https://example.com/success").is_ok());
        assert!(ValidationUtils::validate_config_value("stripe_cancel_url", "https://example.com/cancel").is_ok());
        assert!(ValidationUtils::validate_config_value("public_base_url", "https://api.example.com").is_ok());
        assert!(ValidationUtils::validate_config_value("public_base_url", "http://localhost:3000").is_ok());
        assert!(ValidationUtils::validate_config_value("stripe_success_url", "/credits/success").is_ok()); // relative path

        // Invalid
        assert!(ValidationUtils::validate_config_value("stripe_success_url", "ftp://invalid.com").is_err());
        assert!(ValidationUtils::validate_config_value("public_base_url", "not-a-url").is_err());

        // Over 500 chars
        let long_url = format!("https://example.com/{}", "a".repeat(500));
        assert!(ValidationUtils::validate_config_value("public_base_url", &long_url).is_err());
    }

    #[test]
    fn test_content_overview_multiplier() {
        assert!(ValidationUtils::validate_config_value("content_overview_multiplier", "1").is_ok());
        assert!(ValidationUtils::validate_config_value("content_overview_multiplier", "x2").is_ok());
        assert!(ValidationUtils::validate_config_value("content_overview_multiplier", "X3").is_ok());
        assert!(ValidationUtils::validate_config_value("content_overview_multiplier", "0.5").is_ok());

        // Invalid
        assert!(ValidationUtils::validate_config_value("content_overview_multiplier", "abc").is_err());
        assert!(ValidationUtils::validate_config_value("content_overview_multiplier", "xabc").is_err());
    }
}
