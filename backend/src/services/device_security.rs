use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct DeviceSecurityService {
    db: PgPool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceSecurityInfo {
    pub device_id: String,
    pub user_id: i64,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub is_emulator: bool,
    pub emulator_type: Option<String>,
    pub hardware_fingerprint: String,
    pub risk_score: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SecurityValidationResult {
    pub is_valid: bool,
    pub risk_score: i32,
    pub warnings: Vec<String>,
    pub should_block: bool,
    pub reason: Option<String>,
}

/// Input for storing device security information.
struct DeviceSecurityInput<'a> {
    user_id: i64,
    device_id: &'a str,
    ip_address: Option<&'a str>,
    user_agent: Option<&'a str>,
    is_emulator: bool,
    hardware_fingerprint: &'a str,
    risk_score: i32,
    device_info: &'a HashMap<String, String>,
}

impl DeviceSecurityService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    /// Initialize device security tables
    pub async fn initialize(&self) -> Result<()> {
        // Create device security tracking table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS device_security (
                id SERIAL PRIMARY KEY,
                device_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                is_emulator BOOLEAN NOT NULL DEFAULT false,
                emulator_type TEXT,
                hardware_fingerprint TEXT NOT NULL,
                risk_score INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(device_id, user_id)
            )
            "#,
        )
        .execute(&self.db)
        .await?;

        // Create IP tracking table for abuse detection
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS ip_device_tracking (
                id SERIAL PRIMARY KEY,
                ip_address TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                device_count INTEGER NOT NULL DEFAULT 1,
                first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_suspicious BOOLEAN NOT NULL DEFAULT false,
                UNIQUE(ip_address, user_id, device_id)
            )
            "#,
        )
        .execute(&self.db)
        .await?;

        // Create emulator detection table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS emulator_detection (
                id SERIAL PRIMARY KEY,
                device_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                emulator_indicators TEXT NOT NULL,
                confidence_score INTEGER NOT NULL,
                detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(device_id, user_id)
            )
            "#,
        )
        .execute(&self.db)
        .await?;

        Ok(())
    }

    /// Validate device registration and detect potential security issues
    pub async fn validate_device_registration(
        &self,
        user_id: i64,
        device_id: &str,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
        device_info: &HashMap<String, String>,
    ) -> Result<SecurityValidationResult> {
        let mut warnings = Vec::new();
        let mut risk_score = 0;
        let mut should_block = false;
        let mut block_reason = None;

        // 1. Check for emulator indicators (informational only, no blocking)
        let is_emulator = self.detect_emulator(device_info).await?;
        if is_emulator {
            risk_score += 10; // Lower score since we don't block emulators
            warnings.push("Emulator detected".to_string());
        }

        // 2. Check IP-based abuse patterns
        if let Some(ip) = ip_address {
            let ip_risk = self.analyze_ip_patterns(user_id, device_id, ip).await?;
            risk_score += ip_risk.risk_score;
            warnings.extend(ip_risk.warnings);

            if ip_risk.should_block {
                should_block = true;
                block_reason = Some(
                    ip_risk
                        .reason
                        .unwrap_or("IP-based abuse detected".to_string()),
                );
            }
        }

        // 3. Check hardware fingerprint for cloning
        let hardware_fingerprint = self.generate_hardware_fingerprint(device_info);
        let cloning_risk = self
            .detect_device_cloning(user_id, device_id, &hardware_fingerprint)
            .await?;
        risk_score += cloning_risk.risk_score;
        warnings.extend(cloning_risk.warnings);

        // 4. Check device registration frequency
        let frequency_risk = self.check_registration_frequency(user_id).await?;
        risk_score += frequency_risk;
        if frequency_risk > 50 {
            warnings.push("High device registration frequency detected".to_string());
        }

        // 5. Store security information
        self.store_device_security_info(DeviceSecurityInput {
            user_id,
            device_id,
            ip_address,
            user_agent,
            is_emulator,
            hardware_fingerprint: &hardware_fingerprint,
            risk_score,
            device_info,
        })
        .await?;

        Ok(SecurityValidationResult {
            is_valid: !should_block,
            risk_score,
            warnings,
            should_block,
            reason: block_reason,
        })
    }

    /// Detect if device is an emulator based on device info
    async fn detect_emulator(&self, device_info: &HashMap<String, String>) -> Result<bool> {
        let mut emulator_indicators = 0;
        let mut total_checks = 0;

        // Check common emulator indicators
        if let Some(fingerprint) = device_info.get("fingerprint") {
            total_checks += 1;
            if fingerprint.contains("generic") || fingerprint.contains("emulator") {
                emulator_indicators += 1;
            }
        }

        if let Some(model) = device_info.get("model") {
            total_checks += 1;
            if model.contains("SDK") || model.contains("Emulator") || model.contains("BlueStacks") {
                emulator_indicators += 1;
            }
        }

        if let Some(manufacturer) = device_info.get("manufacturer") {
            total_checks += 1;
            if manufacturer.contains("Genymotion") || manufacturer.contains("BlueStacks") {
                emulator_indicators += 1;
            }
        }

        if let Some(brand) = device_info.get("brand") {
            total_checks += 1;
            if brand.contains("generic") || brand.contains("google") {
                emulator_indicators += 1;
            }
        }

        // Consider it an emulator if more than 50% of indicators match
        Ok(total_checks > 0 && (emulator_indicators as f32 / total_checks as f32) > 0.5)
    }

    /// Analyze IP patterns for abuse detection
    async fn analyze_ip_patterns(
        &self,
        user_id: i64,
        device_id: &str,
        ip_address: &str,
    ) -> Result<SecurityValidationResult> {
        let mut warnings = Vec::new();
        let mut risk_score = 0;
        let mut should_block = false;
        let mut reason = None;

        // Count devices from this IP for this user
        let device_count_for_user = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT device_id) FROM ip_device_tracking WHERE ip_address = $1 AND user_id = $2"
        )
        .bind(ip_address)
        .bind(user_id)
        .fetch_one(&self.db)
        .await?;

        // Count total devices from this IP (all users)
        let total_device_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT device_id) FROM ip_device_tracking WHERE ip_address = $1",
        )
        .bind(ip_address)
        .fetch_one(&self.db)
        .await?;

        // Count unique users from this IP
        let user_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT user_id) FROM ip_device_tracking WHERE ip_address = $1",
        )
        .bind(ip_address)
        .fetch_one(&self.db)
        .await?;

        // Risk analysis
        if device_count_for_user > 5 {
            risk_score += 40;
            warnings.push(format!(
                "High device count from IP for user: {}",
                device_count_for_user
            ));
        }

        if total_device_count > 20 {
            risk_score += 30;
            warnings.push(format!(
                "High total device count from IP: {}",
                total_device_count
            ));
        }

        if user_count > 10 {
            risk_score += 25;
            warnings.push(format!("High user count from IP: {}", user_count));
        }

        // Block if too many devices from same IP
        if device_count_for_user > 10 {
            should_block = true;
            reason = Some(format!(
                "Too many devices ({}) from same IP address",
                device_count_for_user
            ));
        }

        // Update IP tracking
        sqlx::query(
            r#"
            INSERT INTO ip_device_tracking 
            (ip_address, user_id, device_id, device_count, first_seen, last_seen, is_suspicious)
            VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)
            ON CONFLICT (ip_address, user_id, device_id) 
            DO UPDATE SET 
                device_count = ip_device_tracking.device_count + 1,
                last_seen = CURRENT_TIMESTAMP,
                is_suspicious = EXCLUDED.is_suspicious
            "#,
        )
        .bind(ip_address)
        .bind(user_id)
        .bind(device_id)
        .bind(risk_score > 50)
        .execute(&self.db)
        .await?;

        Ok(SecurityValidationResult {
            is_valid: !should_block,
            risk_score,
            warnings,
            should_block,
            reason,
        })
    }

    /// Generate hardware fingerprint for device cloning detection
    fn generate_hardware_fingerprint(&self, device_info: &HashMap<String, String>) -> String {
        let mut fingerprint_parts = Vec::new();

        // Use stable hardware characteristics
        if let Some(val) = device_info.get("fingerprint") {
            fingerprint_parts.push(val.clone());
        }
        if let Some(val) = device_info.get("serial") {
            fingerprint_parts.push(val.clone());
        }
        if let Some(val) = device_info.get("android_id") {
            fingerprint_parts.push(val.clone());
        }
        if let Some(val) = device_info.get("board") {
            fingerprint_parts.push(val.clone());
        }
        if let Some(val) = device_info.get("brand") {
            fingerprint_parts.push(val.clone());
        }
        if let Some(val) = device_info.get("device") {
            fingerprint_parts.push(val.clone());
        }
        if let Some(val) = device_info.get("model") {
            fingerprint_parts.push(val.clone());
        }
        if let Some(val) = device_info.get("manufacturer") {
            fingerprint_parts.push(val.clone());
        }

        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(fingerprint_parts.join("_"));
        format!("{:x}", hasher.finalize())
    }

    /// Detect potential device cloning
    async fn detect_device_cloning(
        &self,
        user_id: i64,
        device_id: &str,
        hardware_fingerprint: &str,
    ) -> Result<SecurityValidationResult> {
        let mut warnings = Vec::new();
        let mut risk_score = 0;

        // Check if same hardware fingerprint is used by multiple device IDs
        let similar_devices = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT device_id) FROM device_security WHERE hardware_fingerprint = $1 AND device_id != $2"
        )
        .bind(hardware_fingerprint)
        .bind(device_id)
        .fetch_one(&self.db)
        .await?;

        if similar_devices > 0 {
            risk_score += 50;
            warnings.push(format!(
                "Hardware fingerprint matches {} other devices",
                similar_devices
            ));
        }

        // Check if same hardware is used by multiple users
        let users_with_same_hardware = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT user_id) FROM device_security WHERE hardware_fingerprint = $1 AND user_id != $2"
        )
        .bind(hardware_fingerprint)
        .bind(user_id)
        .fetch_one(&self.db)
        .await?;

        if users_with_same_hardware > 0 {
            risk_score += 30;
            warnings.push(format!(
                "Hardware fingerprint used by {} other users",
                users_with_same_hardware
            ));
        }

        Ok(SecurityValidationResult {
            is_valid: true,
            risk_score,
            warnings,
            should_block: false,
            reason: None,
        })
    }

    /// Check device registration frequency for abuse detection
    async fn check_registration_frequency(&self, user_id: i64) -> Result<i32> {
        // Count device registrations in last 24 hours
        let recent_registrations = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM device_security WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'"
        )
        .bind(user_id)
        .fetch_one(&self.db)
        .await?;

        // Count device registrations in last week
        let weekly_registrations = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM device_security WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'"
        )
        .bind(user_id)
        .fetch_one(&self.db)
        .await?;

        let mut risk_score = 0;

        if recent_registrations > 5 {
            risk_score += 40;
        } else if recent_registrations > 3 {
            risk_score += 20;
        }

        if weekly_registrations > 15 {
            risk_score += 30;
        } else if weekly_registrations > 10 {
            risk_score += 15;
        }

        Ok(risk_score)
    }


    /// Store device security information
    async fn store_device_security_info(
        &self,
        input: DeviceSecurityInput<'_>,
    ) -> Result<()> {
        let emulator_type = if input.is_emulator {
            input.device_info.get("emulator_type").cloned()
        } else {
            None
        };

        sqlx::query(
            r#"
            INSERT INTO device_security 
            (device_id, user_id, ip_address, user_agent, is_emulator, emulator_type, hardware_fingerprint, risk_score, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
            ON CONFLICT (device_id, user_id) 
            DO UPDATE SET 
                ip_address = EXCLUDED.ip_address,
                user_agent = EXCLUDED.user_agent,
                is_emulator = EXCLUDED.is_emulator,
                emulator_type = EXCLUDED.emulator_type,
                hardware_fingerprint = EXCLUDED.hardware_fingerprint,
                risk_score = EXCLUDED.risk_score,
                updated_at = CURRENT_TIMESTAMP
            "#
        )
        .bind(input.device_id)
        .bind(input.user_id)
        .bind(input.ip_address)
        .bind(input.user_agent)
        .bind(input.is_emulator)
        .bind(emulator_type)
        .bind(input.hardware_fingerprint)
        .bind(input.risk_score)
        .execute(&self.db)
        .await?;

        // Store emulator detection details if it's an emulator
        if input.is_emulator {
            let emulator_indicators = input.device_info
                .get("emulator_indicators")
                .unwrap_or(&"unknown".to_string())
                .clone();

            sqlx::query(
                r#"
                INSERT INTO emulator_detection 
                (device_id, user_id, emulator_indicators, confidence_score, detected_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (device_id, user_id) 
                DO UPDATE SET 
                    emulator_indicators = EXCLUDED.emulator_indicators,
                    confidence_score = EXCLUDED.confidence_score,
                    detected_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(input.device_id)
            .bind(input.user_id)
            .bind(emulator_indicators)
            .bind(if input.risk_score > 50 { 90 } else { 60 })
            .execute(&self.db)
            .await?;
        }

        Ok(())
    }

    /// Get security statistics for admin dashboard
    pub async fn get_security_stats(&self) -> Result<serde_json::Value> {
        let total_devices = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM device_security")
            .fetch_one(&self.db)
            .await?;

        let emulator_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM device_security WHERE is_emulator = true",
        )
        .fetch_one(&self.db)
        .await?;

        let high_risk_devices = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM device_security WHERE risk_score > 50",
        )
        .fetch_one(&self.db)
        .await?;

        let suspicious_ips = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(DISTINCT ip_address) FROM ip_device_tracking WHERE is_suspicious = true",
        )
        .fetch_one(&self.db)
        .await?;

        Ok(serde_json::json!({
            "total_devices": total_devices,
            "emulator_count": emulator_count,
            "emulator_percentage": if total_devices > 0 { (emulator_count as f64 / total_devices as f64) * 100.0 } else { 0.0 },
            "high_risk_devices": high_risk_devices,
            "suspicious_ips": suspicious_ips
        }))
    }
}
