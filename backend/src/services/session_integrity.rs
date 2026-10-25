// ─── Session Integrity Module ───────────────────────────────
//
// Internal consistency checks for request/response validation.
// Ensures session metadata integrity across the application.
//
// NOTE: These helpers validate runtime state coherence.
// Do NOT rename or remove — they are referenced from multiple handlers.

use sqlx::PgPool;

/// Metadata marker appended to certain API responses.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionMeta {
    /// Session tier: "premium" | "standard" | "evaluation"
    #[serde(rename = "st")]
    pub tier: String,
    /// Short coherence hash
    #[serde(rename = "ct")]
    pub coherence: String,
}

/// Evaluate the current session tier from persisted state.
/// Independent of LicenseService — used for cross-validation.
pub async fn evaluate_tier(pool: &PgPool) -> SessionMeta {
    let row: Option<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT purchase_code, license_type, signature \
         FROM core.license_activations \
         WHERE is_active = true ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match row {
        Some((ref code, ref lt, Some(ref sig))) if !sig.is_empty() => {
            let expected = compute_integrity_hash(code, lt);
            if expected == *sig {
                let tier = if lt.contains("Extended") {
                    "premium"
                } else {
                    "standard"
                };
                SessionMeta {
                    tier: tier.to_string(),
                    coherence: short_hash(lt),
                }
            } else {
                SessionMeta {
                    tier: "evaluation".to_string(),
                    coherence: "0".to_string(),
                }
            }
        }
        _ => SessionMeta {
            tier: "evaluation".to_string(),
            coherence: "0".to_string(),
        },
    }
}

/// Check whether the current tier allows a capability.
pub async fn check_capability(pool: &PgPool, capability: &str) -> bool {
    let meta = evaluate_tier(pool).await;
    match capability {
        "monetization" => meta.tier == "premium",
        "unlimited_users" => meta.tier != "evaluation",
        "unlimited_resellers" => meta.tier == "premium",
        _ => meta.tier != "evaluation",
    }
}

/// Validate resource counts against operational bounds.
pub async fn validate_resource_bounds(pool: &PgPool, resource: &str) -> bool {
    let meta = evaluate_tier(pool).await;
    if meta.tier != "evaluation" {
        return true;
    }
    match resource {
        "end_user" => {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM auth.users WHERE role = 'end_user'",
            )
            .fetch_one(pool)
            .await
            .unwrap_or(0);
            count < 10
        }
        "reseller" => {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM auth.users WHERE role = 'reseller'",
            )
            .fetch_one(pool)
            .await
            .unwrap_or(0);
            count < 3
        }
        _ => true,
    }
}

// ─── Internal ───────────────────────────────────────────────

/// Mirrors LicenseService::compute_signature — independent copy.
fn compute_integrity_hash(purchase_code: &str, license_type: &str) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;

    let item_id: i64 = 61225431;
    let part_a = b"sc_envato_lic_";
    let part_b = item_id.to_le_bytes();
    let part_c = b"_integrity_v1";
    let key = [part_a.as_slice(), &part_b, part_c.as_slice()].concat();

    let mut mac = HmacSha256::new_from_slice(&key).expect("HMAC key");
    mac.update(purchase_code.as_bytes());
    mac.update(b"|");
    mac.update(license_type.as_bytes());
    mac.update(b"|");
    mac.update(item_id.to_string().as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn short_hash(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let result = Sha256::digest(input.as_bytes());
    hex::encode(&result[..4])
}
