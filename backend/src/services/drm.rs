use crate::error::AppError;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};

/// ClearKey structure for ExoPlayer
#[derive(Debug, Serialize, Deserialize)]
pub struct ClearKey {
    pub kty: String,
    pub k: String,   // Base64URL encoded key
    pub kid: String, // Base64URL encoded key ID
}

/// ClearKey JSON response structure
#[derive(Debug, Serialize, Deserialize)]
pub struct ClearKeyResponse {
    pub keys: Vec<ClearKey>,
    #[serde(rename = "type")]
    pub key_type: String,
}

/// DRM service for handling ClearKey conversions
pub struct DrmService;

impl DrmService {
    /// Convert hexadecimal key pairs to ClearKey JSON format
    /// Input format: "kid1_hex:key1_hex,kid2_hex:key2_hex"
    /// The first value is the Key ID (KID) that matches the DASH manifest default_KID,
    /// and the second value is the decryption key.
    /// Output: JSON with Base64URL encoded keys for ExoPlayer
    pub fn convert_hex_keys_to_clearkey_json(hex_keys: &str) -> Result<String, AppError> {
        let mut clear_keys = Vec::new();

        // Split by comma to handle multiple key pairs
        for key_pair in hex_keys.split(',') {
            let key_pair = key_pair.trim();
            if key_pair.is_empty() {
                continue;
            }

            // Split by colon to separate kid and key
            let parts: Vec<&str> = key_pair.split(':').collect();
            if parts.len() != 2 {
                return Err(AppError::BadRequest(format!(
                    "Invalid key format: '{}'. Expected format: 'kid_hex:key_hex'",
                    key_pair
                )));
            }

            let kid_hex = parts[0].trim();
            let key_hex = parts[1].trim();

            // Validate hex format (should be 32 characters for 128-bit keys)
            if key_hex.len() != 32 || kid_hex.len() != 32 {
                return Err(AppError::BadRequest(
                    "Invalid key length. Both key and kid should be 32 hex characters (128 bits)"
                        .to_string(),
                ));
            }

            // Convert hex to bytes
            let key_bytes = hex::decode(key_hex).map_err(|_| {
                AppError::BadRequest(format!("Invalid hex format for key: {}", key_hex))
            })?;
            let kid_bytes = hex::decode(kid_hex).map_err(|_| {
                AppError::BadRequest(format!("Invalid hex format for kid: {}", kid_hex))
            })?;

            // Convert to Base64URL (without padding)
            let key_b64url = general_purpose::URL_SAFE_NO_PAD.encode(&key_bytes);
            let kid_b64url = general_purpose::URL_SAFE_NO_PAD.encode(&kid_bytes);

            clear_keys.push(ClearKey {
                kty: "oct".to_string(),
                k: key_b64url,
                kid: kid_b64url,
            });
        }

        if clear_keys.is_empty() {
            return Err(AppError::BadRequest("No valid key pairs found".to_string()));
        }

        let response = ClearKeyResponse {
            keys: clear_keys,
            key_type: "temporary".to_string(),
        };

        serde_json::to_string(&response).map_err(|_| AppError::InternalServerError)
    }

    /// Validate hex key format
    pub fn validate_hex_keys(hex_keys: &str) -> Result<(), AppError> {
        for key_pair in hex_keys.split(',') {
            let key_pair = key_pair.trim();
            if key_pair.is_empty() {
                continue;
            }

            let parts: Vec<&str> = key_pair.split(':').collect();
            if parts.len() != 2 {
                return Err(AppError::BadRequest(format!(
                    "Invalid key format: '{}'. Expected format: 'kid_hex:key_hex'",
                    key_pair
                )));
            }

            let kid_hex = parts[0].trim();
            let key_hex = parts[1].trim();

            if key_hex.len() != 32 || kid_hex.len() != 32 {
                return Err(AppError::BadRequest(
                    "Invalid key length. Both key and kid should be 32 hex characters (128 bits)"
                        .to_string(),
                ));
            }

            // Validate hex format
            hex::decode(key_hex).map_err(|_| {
                AppError::BadRequest(format!("Invalid hex format for key: {}", key_hex))
            })?;
            hex::decode(kid_hex).map_err(|_| {
                AppError::BadRequest(format!("Invalid hex format for kid: {}", kid_hex))
            })?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_key_conversion() {
        // Format: kid_hex:key_hex
        let hex_keys = "c50f8758b7fb4bf886dd561a7cda6e84:0541856bd180caf65d26a9eaf33e0f24";
        let result = DrmService::convert_hex_keys_to_clearkey_json(hex_keys).unwrap();

        let parsed: ClearKeyResponse = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed.keys.len(), 1);
        assert_eq!(parsed.keys[0].kty, "oct");
        assert_eq!(parsed.key_type, "temporary");

        // kid = base64url(c50f8758...) , k = base64url(0541856b...)
        assert_eq!(parsed.keys[0].kid, "xQ-HWLf7S_iG3VYafNpuhA");
        assert_eq!(parsed.keys[0].k, "BUGFa9GAyvZdJqnq8z4PJA");
    }

    #[test]
    fn test_multiple_keys_conversion() {
        let hex_keys = "c50f8758b7fb4bf886dd561a7cda6e84:0541856bd180caf65d26a9eaf33e0f24,c53f8758b7fb4bf886dd561a7cda6e84:0541856bd180caf65d26a9eaf33e0f21";
        let result = DrmService::convert_hex_keys_to_clearkey_json(hex_keys).unwrap();

        let parsed: ClearKeyResponse = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed.keys.len(), 2);
    }

    #[test]
    fn test_invalid_format() {
        let hex_keys = "invalid_format";
        let result = DrmService::convert_hex_keys_to_clearkey_json(hex_keys);
        assert!(result.is_err());
    }

    #[test]
    fn test_validation() {
        let valid_keys = "c50f8758b7fb4bf886dd561a7cda6e84:0541856bd180caf65d26a9eaf33e0f24";
        assert!(DrmService::validate_hex_keys(valid_keys).is_ok());

        let invalid_keys = "short:key";
        assert!(DrmService::validate_hex_keys(invalid_keys).is_err());
    }
}
