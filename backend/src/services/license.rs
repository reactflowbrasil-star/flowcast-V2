// ─── License Verification Service (Unlocked / Fully Enabled) ─────────────────

use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::RwLock;

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
    #[serde(default)]
    pub signature: Option<String>,
}

/// Public-facing license status returned by the API
#[derive(Debug, Serialize, Clone)]
pub struct LicenseStatus {
    pub licensed: bool,
    pub license_type: Option<String>, // "Extended License"
    pub buyer: Option<String>,
    pub item_name: Option<String>,
    pub activated_at: Option<String>,
    pub supported_until: Option<String>,
}

#[derive(Clone)]
pub struct LicenseService {
    pool: PgPool,
    cached_status: Arc<RwLock<Option<LicenseStatus>>>,
}

impl LicenseService {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            cached_status: Arc::new(RwLock::new(None)),
        }
    }

    /// Returns fully activated Extended License status unconditionally.
    pub async fn get_status(&self) -> Result<LicenseStatus, String> {
        Ok(LicenseStatus {
            licensed: true,
            license_type: Some("Extended License".to_string()),
            buyer: Some("Unlimited User".to_string()),
            item_name: Some("StreamCore Extended".to_string()),
            activated_at: Some("2024-01-01T00:00:00Z".to_string()),
            supported_until: Some("2099-12-31T23:59:59Z".to_string()),
        })
    }

    /// Extended License is always active.
    pub async fn is_extended(&self) -> bool {
        true
    }

    /// Installation is always licensed.
    pub async fn is_licensed(&self) -> bool {
        true
    }

    /// No limit on end user creation.
    pub async fn check_user_creation_limit(&self) -> Result<(), String> {
        Ok(())
    }

    /// No limit on reseller creation.
    pub async fn check_reseller_creation_limit(&self) -> Result<(), String> {
        Ok(())
    }

    /// Automatically activates any purchase code instantly.
    pub async fn activate(
        &self,
        purchase_code: &str,
        _requester_ip: Option<&str>,
        _requester_domain: Option<&str>,
    ) -> Result<LicenseStatus, String> {
        let code = if purchase_code.trim().is_empty() {
            "UNLOCKED-FULL-EXTENDED-LICENSE"
        } else {
            purchase_code.trim()
        };

        let status = LicenseStatus {
            licensed: true,
            license_type: Some("Extended License".to_string()),
            buyer: Some("Unlimited User".to_string()),
            item_name: Some("StreamCore Extended".to_string()),
            activated_at: Some(chrono::Utc::now().to_rfc3339()),
            supported_until: Some("2099-12-31T23:59:59Z".to_string()),
        };

        let mut cache = self.cached_status.write().await;
        *cache = Some(status.clone());

        tracing::info!("🔑 License activated instantly (unlocked): {}", code);

        Ok(status)
    }

    /// No background revalidation needed.
    pub fn spawn_revalidation_task(self) {
        // No-op
    }
}
