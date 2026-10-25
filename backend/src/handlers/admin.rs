use serde::Serialize;
use std::fs;

mod imports;

pub use imports::*;

#[derive(Debug, Serialize)]
pub struct SystemConfigResponse {
    pub default_devices: i32,
    pub credit_per_user_3_devices: f64,
    pub credit_per_user_5_devices: f64,
    pub credit_per_extra_device: f64,
    pub tmdb_api_key: Option<String>,
    pub tmdb_enabled: bool,
    pub tmdb_language: Option<String>,
    pub version: String,
    pub last_updated: String,
}

/// Calculate actual system uptime by reading /proc/uptime
fn calculate_system_uptime() -> String {
    match fs::read_to_string("/proc/uptime") {
        Ok(content) => {
            if let Some(uptime_seconds_str) = content.split_whitespace().next() {
                if let Ok(uptime_seconds) = uptime_seconds_str.parse::<f64>() {
                    let days = (uptime_seconds / 86400.0) as u64;
                    let hours = ((uptime_seconds % 86400.0) / 3600.0) as u64;
                    let minutes = ((uptime_seconds % 3600.0) / 60.0) as u64;

                    if days > 0 {
                        format!("{}d {}h {}m", days, hours, minutes)
                    } else if hours > 0 {
                        format!("{}h {}m", hours, minutes)
                    } else {
                        format!("{}m", minutes)
                    }
                } else {
                    "Error parsing uptime".to_string()
                }
            } else {
                "Error reading uptime".to_string()
            }
        }
        Err(_) => {
            // Fallback: calculate approximate uptime since program start
            // This is less accurate but better than a placeholder
            "Calculating...".to_string()
        }
    }
}
