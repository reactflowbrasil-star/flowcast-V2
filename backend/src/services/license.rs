// ─── License Verification Service ───────────────────────────
//
// Validates Envato purchase codes via the Syruum License Server
// (licences.drm.lat), which proxies to the Envato API.
// Persists activation state in core.license_activations.
//
// Hardening layers (no obfuscation):
//   1. HMAC-SHA256 integrity signature on every license record
//   2. Periodic background re-validation against the license server
//   3. Independent DB-level check path (verify_integrity)
//   4. Unlicensed soft limits on resource creation

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::RwLock;

// ─── Constants ──────────────────────────────────────────────

/// License server endpoint (proxies to Envato API)
const LICENSE_SERVER_URL: &str = "https://licences.drm.lat/verify";

/// Fallback license server endpoint — used when the primary URL is unreachable
const LICENSE_SERVER_FALLBACK_URL: &str = "http://141.147.175.36:5500/verify";

/// Your Envato Item ID – sent to the license server for validation
const ENVATO_ITEM_ID: i64 = 61225431;

/// HMAC key material — derived from a composite of constants so it's not a
/// single greppable string.  Anyone reading the source can see this, but the
/// point is to catch casual DB edits, not to resist a determined reverse-
/// engineer with full source access.
fn hmac_key() -> Vec<u8> {
    // Combine multiple pieces so the key isn't a trivial literal
    let part_a = b"sc_envato_lic_";                  // prefix
    let part_b = ENVATO_ITEM_ID.to_le_bytes();       // item id bytes
    let part_c = b"_integrity_v1";                   // version tag
    [part_a.as_slice(), &part_b, part_c.as_slice()].concat()
}

/// Maximum end-users when no license is active
const UNLICENSED_MAX_USERS: i64 = 10;

/// Maximum resellers when no license is active
const UNLICENSED_MAX_RESELLERS: i64 = 3;

/// Ed25519 public key of the license server — used to verify response signatures.
/// The private key lives ONLY on licences.drm.lat. Even with full source
/// access, a fake server cannot produce valid signatures.
const LICENSE_SERVER_PUBLIC_KEY: [u8; 32] = [
    0x91, 0x0a, 0xc2, 0x31, 0x3b, 0x4b, 0xb5, 0x90,
    0xb9, 0x8c, 0x31, 0x47, 0xf2, 0x60, 0x33, 0xd0,
    0x76, 0x0f, 0x9c, 0x6c, 0x4b, 0x7b, 0x96, 0x91,
    0x81, 0xac, 0xb6, 0xa0, 0x9b, 0xcc, 0x71, 0x08,
];

// ─── DTOs ───────────────────────────────────────────────────

/// Request body sent to the license server
#[derive(Debug, Serialize)]
struct LicenseServerRequest {
    pub purchase_code: String,
    pub domain: String,
    pub item_id: i64,
}

/// Response from the license server
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct LicenseServerResponse {
    pub success: bool,
    pub license_type: Option<String>,
    pub buyer: Option<String>,
    pub item_name: Option<String>,
    pub supported_until: Option<String>,
    pub activated_at: Option<String>,
    pub error: Option<String>,
    /// Ed25519 signature (hex) over canonical response fields
    pub signature: Option<String>,
}

/// Row stored in `core.license_activations`
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LicenseActivation {
    pub id: i32,
    pub purchase_code: String,
    pub license_type: String,
    pub buyer_username: Option<String>,
    pub item_id: Option<String>,
    pub item_name: Option<String>,
    pub supported_until: Option<String>,
    pub domain: Option<String>,
    pub server_ip: Option<String>,
    pub activated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_verified: Option<chrono::DateTime<chrono::Utc>>,
    pub is_active: bool,
    /// HMAC-SHA256 signature of (purchase_code || license_type || item_id)
    #[serde(default)]
    pub signature: Option<String>,
}

/// Public-facing license status returned by the API
#[derive(Debug, Serialize, Clone)]
pub struct LicenseStatus {
    pub licensed: bool,
    pub license_type: Option<String>,  // "Regular License" | "Extended License"
    pub buyer: Option<String>,
    pub item_name: Option<String>,
    pub activated_at: Option<String>,
    pub supported_until: Option<String>,
}

// ─── Service ────────────────────────────────────────────────

#[derive(Clone)]
pub struct LicenseService {
    pool: PgPool,
    /// Cached status to avoid DB hits on every request. Invalidated on
    /// activation and by the background re-validator.
    cached_status: Arc<RwLock<Option<LicenseStatus>>>,
}

impl LicenseService {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            cached_status: Arc::new(RwLock::new(None)),
        }
    }

    // ─── Integrity helpers ─────────────────────────────────

    /// Compute HMAC-SHA256 signature for a license record.
    fn compute_signature(purchase_code: &str, license_type: &str) -> String {
        type HmacSha256 = Hmac<Sha256>;
        let key = hmac_key();
        let mut mac = HmacSha256::new_from_slice(&key)
            .expect("HMAC accepts any key length");
        // Feed the fields in a deterministic order
        mac.update(purchase_code.as_bytes());
        mac.update(b"|");
        mac.update(license_type.as_bytes());
        mac.update(b"|");
        mac.update(ENVATO_ITEM_ID.to_string().as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    /// Verify that a stored signature matches the record fields.
    fn verify_signature(activation: &LicenseActivation) -> bool {
        match &activation.signature {
            Some(stored_sig) => {
                let expected = Self::compute_signature(
                    &activation.purchase_code,
                    &activation.license_type,
                );
                stored_sig == &expected
            }
            None => false, // No signature = tampered or legacy record
        }
    }

    /// Verify the Ed25519 signature on a license server response.
    /// This prevents server emulation — a fake server cannot produce
    /// valid signatures without the private key.
    fn verify_server_signature(response: &LicenseServerResponse) -> bool {
        let sig_hex = match &response.signature {
            Some(s) if !s.is_empty() => s,
            _ => {
                tracing::warn!("License server response missing signature");
                return false;
            }
        };

        let sig_bytes = match hex::decode(sig_hex) {
            Ok(b) if b.len() == 64 => b,
            _ => {
                tracing::warn!("Invalid signature format from license server");
                return false;
            }
        };

        // Reconstruct canonical message (must match Go server's format exactly)
        let canonical = format!(
            "{}|{}|{}|{}|{}",
            response.success,
            response.license_type.as_deref().unwrap_or(""),
            response.buyer.as_deref().unwrap_or(""),
            response.item_name.as_deref().unwrap_or(""),
            response.activated_at.as_deref().unwrap_or(""),
        );

        use ed25519_dalek::{Signature, VerifyingKey};
        use ed25519_dalek::Verifier;

        let verifying_key = match VerifyingKey::from_bytes(&LICENSE_SERVER_PUBLIC_KEY) {
            Ok(k) => k,
            Err(_) => return false,
        };

        let signature = match Signature::from_slice(&sig_bytes) {
            Ok(s) => s,
            Err(_) => return false,
        };

        verifying_key.verify(canonical.as_bytes(), &signature).is_ok()
    }

    // ─── Read current activation status ────────────────────

    /// Get the current license status from the database.
    /// Uses an in-memory cache (invalidated on activation and by the
    /// background re-validator) to avoid a DB round-trip on every request.
    pub async fn get_status(&self) -> Result<LicenseStatus, String> {
        // Fast path: check cache
        {
            let cache = self.cached_status.read().await;
            if let Some(ref status) = *cache {
                return Ok(status.clone());
            }
        }

        // Cache miss: query DB
        let status = self.query_status_from_db().await?;

        // Populate cache
        {
            let mut cache = self.cached_status.write().await;
            *cache = Some(status.clone());
        }

        Ok(status)
    }

    /// Direct DB query — used by get_status internally and by verify_integrity.
    async fn query_status_from_db(&self) -> Result<LicenseStatus, String> {
        let row = sqlx::query_as::<_, LicenseActivation>(
            "SELECT id, purchase_code, license_type, buyer_username, item_id, item_name, \
             supported_until, domain, server_ip, activated_at, last_verified, is_active, signature \
             FROM core.license_activations WHERE is_active = true ORDER BY id DESC LIMIT 1"
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("DB error: {}", e))?;

        match row {
            Some(activation) => {
                // ── Integrity check: verify HMAC signature ──
                if !Self::verify_signature(&activation) {
                    tracing::warn!(
                        "⚠️  License record signature mismatch for purchase_code={}. \
                         Record may have been tampered with.",
                        &activation.purchase_code[..8]
                    );
                    return Ok(LicenseStatus {
                        licensed: false,
                        license_type: None,
                        buyer: None,
                        item_name: None,
                        activated_at: None,
                        supported_until: None,
                    });
                }

                Ok(LicenseStatus {
                    licensed: true,
                    license_type: Some(activation.license_type),
                    buyer: activation.buyer_username,
                    item_name: activation.item_name,
                    activated_at: activation.activated_at.map(|d| d.to_rfc3339()),
                    supported_until: activation.supported_until,
                })
            }
            None => Ok(LicenseStatus {
                licensed: false,
                license_type: None,
                buyer: None,
                item_name: None,
                activated_at: None,
                supported_until: None,
            }),
        }
    }

    /// Quick helper: is this an Extended License?
    pub async fn is_extended(&self) -> bool {
        let status = self.get_status().await.unwrap_or(LicenseStatus {
            licensed: false,
            license_type: None,
            buyer: None,
            item_name: None,
            activated_at: None,
            supported_until: None,
        });
        matches!(status.license_type.as_deref(), Some("Extended License"))
    }

    /// Quick helper: is any license active?
    pub async fn is_licensed(&self) -> bool {
        let status = self.get_status().await.unwrap_or(LicenseStatus {
            licensed: false,
            license_type: None,
            buyer: None,
            item_name: None,
            activated_at: None,
            supported_until: None,
        });
        status.licensed
    }

    // ─── Unlicensed Limits ─────────────────────────────────

    /// Check if unlicensed user creation limit has been reached.
    /// Returns Ok(()) if allowed, Err(message) if limit reached.
    pub async fn check_user_creation_limit(&self) -> Result<(), String> {
        if self.is_licensed().await {
            return Ok(());
        }
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM auth.users WHERE role = 'end_user'"
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("DB error: {}", e))?;

        if count >= UNLICENSED_MAX_USERS {
            Err(format!(
                "Unlicensed installation limit: maximum {} end users. \
                 Activate your Envato purchase code to remove this limit.",
                UNLICENSED_MAX_USERS
            ))
        } else {
            Ok(())
        }
    }

    /// Check if unlicensed reseller creation limit has been reached.
    /// Returns Ok(()) if allowed, Err(message) if limit reached.
    pub async fn check_reseller_creation_limit(&self) -> Result<(), String> {
        if self.is_licensed().await {
            return Ok(());
        }
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM auth.users WHERE role = 'reseller'"
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("DB error: {}", e))?;

        if count >= UNLICENSED_MAX_RESELLERS {
            Err(format!(
                "Unlicensed installation limit: maximum {} resellers. \
                 Activate your Envato purchase code to remove this limit.",
                UNLICENSED_MAX_RESELLERS
            ))
        } else {
            Ok(())
        }
    }

    // ─── Activate a purchase code ──────────────────────────

    /// Validate a purchase code via the Syruum License Server and persist it.
    pub async fn activate(
        &self,
        purchase_code: &str,
        requester_ip: Option<&str>,
        requester_domain: Option<&str>,
    ) -> Result<LicenseStatus, String> {
        // 1. Basic format check
        let code = purchase_code.trim();
        let re = regex::Regex::new(r"^[a-f0-9\-]{30,50}$")
            .map_err(|e| format!("Regex error: {}", e))?;
        if !re.is_match(code) {
            return Err("Invalid purchase code format.".to_string());
        }

        // 2. Call the license server (which proxies to Envato API)
        //    Try primary URL first; fall back to direct IP if it fails.
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| format!("HTTP client error: {}", e))?;

        let payload = LicenseServerRequest {
            purchase_code: code.to_string(),
            domain: requester_domain.unwrap_or("").to_string(),
            item_id: ENVATO_ITEM_ID,
        };

        let urls = [LICENSE_SERVER_URL, LICENSE_SERVER_FALLBACK_URL];
        let mut ls_response: Option<LicenseServerResponse> = None;
        let mut last_error = String::new();

        for (i, url) in urls.iter().enumerate() {
            let is_fallback = i > 0;
            if is_fallback {
                tracing::warn!(
                    "⚠️  Primary license server failed ({}), trying fallback: {}",
                    last_error, url
                );
            }

            let send_result = client
                .post(*url)
                .json(&payload)
                .send()
                .await;

            match send_result {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        let status = resp.status().as_u16();
                        let body = resp.text().await.unwrap_or_default();
                        last_error = format!("HTTP {} — {}", status, body);
                        continue; // try fallback
                    }
                    match resp.json::<LicenseServerResponse>().await {
                        Ok(parsed) => {
                            if is_fallback {
                                tracing::info!("✅ Fallback license server responded successfully");
                            }
                            ls_response = Some(parsed);
                            break;
                        }
                        Err(e) => {
                            last_error = format!("parse error: {}", e);
                            continue; // try fallback
                        }
                    }
                }
                Err(e) => {
                    last_error = format!("{}", e);
                    continue; // try fallback
                }
            }
        }

        let ls_response = ls_response.ok_or_else(|| {
            format!(
                "Failed to contact license server (primary + fallback): {}",
                last_error
            )
        })?;

        if !ls_response.success {
            return Err(ls_response.error.unwrap_or_else(|| "License verification failed".to_string()));
        }

        // 2b. Verify Ed25519 signature from license server
        if !Self::verify_server_signature(&ls_response) {
            tracing::warn!("⚠️  License server response signature verification failed");
            return Err("License verification failed: invalid server signature.".to_string());
        }

        let license_type = ls_response.license_type.unwrap_or_default();
        if license_type.is_empty() {
            return Err("Could not determine license type.".to_string());
        }

        let buyer = ls_response.buyer;
        let item_name = ls_response.item_name;
        let supported_until = ls_response.supported_until;
        let now = chrono::Utc::now();

        // 3. Compute HMAC integrity signature
        let signature = Self::compute_signature(code, &license_type);

        // 4. Upsert into database (one active license per installation)
        sqlx::query("UPDATE core.license_activations SET is_active = false")
            .execute(&self.pool)
            .await
            .map_err(|e| format!("DB error deactivating old license: {}", e))?;

        sqlx::query(
            r#"
            INSERT INTO core.license_activations
                (purchase_code, license_type, buyer_username, item_id, item_name, supported_until, domain, server_ip, activated_at, last_verified, is_active, signature)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, true, $10)
            ON CONFLICT (purchase_code) DO UPDATE SET
                license_type    = EXCLUDED.license_type,
                buyer_username  = EXCLUDED.buyer_username,
                item_name       = EXCLUDED.item_name,
                supported_until = EXCLUDED.supported_until,
                domain          = EXCLUDED.domain,
                server_ip       = EXCLUDED.server_ip,
                last_verified   = EXCLUDED.last_verified,
                is_active       = true,
                signature       = EXCLUDED.signature
            "#,
        )
        .bind(code)
        .bind(&license_type)
        .bind(&buyer)
        .bind(ENVATO_ITEM_ID.to_string())
        .bind(&item_name)
        .bind(&supported_until)
        .bind(requester_domain)
        .bind(requester_ip)
        .bind(now)
        .bind(&signature)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("DB error saving activation: {}", e))?;

        tracing::info!(
            "🔑 License activated: {} (buyer: {}, type: {})",
            code,
            buyer.as_deref().unwrap_or("unknown"),
            license_type
        );

        let status = LicenseStatus {
            licensed: true,
            license_type: Some(license_type),
            buyer,
            item_name,
            activated_at: Some(now.to_rfc3339()),
            supported_until,
        };

        // Invalidate cache
        {
            let mut cache = self.cached_status.write().await;
            *cache = Some(status.clone());
        }

        Ok(status)
    }

    // ─── Background Integrity Monitor ───────────────────────

    /// Spawn a background task that periodically verifies the HMAC
    /// integrity of the stored license record.  This catches DB tampering
    /// without contacting the remote server (Envato TOS: single activation).
    pub fn spawn_revalidation_task(self) {
        tokio::spawn(async move {
            // Wait for app startup
            tokio::time::sleep(std::time::Duration::from_secs(120)).await;
            loop {
                if let Err(e) = self.verify_local_integrity().await {
                    tracing::warn!("License integrity check failed: {}", e);
                }
                // Check every 6 hours
                tokio::time::sleep(std::time::Duration::from_secs(6 * 60 * 60)).await;
            }
        });
    }

    /// Verify the HMAC signature of the active license record.
    /// No remote calls — only checks local DB integrity.
    async fn verify_local_integrity(&self) -> Result<(), String> {
        let row = sqlx::query_as::<_, LicenseActivation>(
            "SELECT id, purchase_code, license_type, buyer_username, item_id, item_name, \
             supported_until, domain, server_ip, activated_at, last_verified, is_active, signature \
             FROM core.license_activations WHERE is_active = true ORDER BY id DESC LIMIT 1"
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("DB error: {}", e))?;

        let activation = match row {
            Some(a) => a,
            None => return Ok(()), // No active license
        };

        if !Self::verify_signature(&activation) {
            tracing::warn!(
                "⚠️  Integrity check: HMAC mismatch on license {}. Deactivating.",
                &activation.purchase_code[..8]
            );
            self.deactivate_license(activation.id).await?;
            return Ok(());
        }

        tracing::debug!("✅ License integrity check passed");
        Ok(())
    }

    /// Mark a license record as inactive.
    async fn deactivate_license(&self, id: i32) -> Result<(), String> {
        sqlx::query("UPDATE core.license_activations SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("DB error deactivating license: {}", e))?;

        // Invalidate cache
        let mut cache = self.cached_status.write().await;
        *cache = None;
        Ok(())
    }
}
