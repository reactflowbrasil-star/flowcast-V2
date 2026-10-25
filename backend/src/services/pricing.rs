use crate::database::Database;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use sqlx::Row;

const PRICING_CONFIG_KEY: &str = "credit_pricing_config";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tier {
    pub min_qty: i32, // minimum quantity threshold (inclusive)
    pub percent: f64, // discount percentage (e.g., 5.0 = 5%)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingConfig {
    pub base_price_usd: f64, // base price per credit in USD
    pub tiers: Vec<Tier>,
}

impl Default for PricingConfig {
    fn default() -> Self {
        // Defaults from user confirmation:
        // $1.00 per credit (USD); tiers: 100=5%, 250=7%, 500=10%, 1000=15%
        Self {
            base_price_usd: 1.0,
            tiers: vec![
                Tier {
                    min_qty: 100,
                    percent: 5.0,
                },
                Tier {
                    min_qty: 250,
                    percent: 7.0,
                },
                Tier {
                    min_qty: 500,
                    percent: 10.0,
                },
                Tier {
                    min_qty: 1000,
                    percent: 15.0,
                },
            ],
        }
    }
}

#[derive(Clone)]
pub struct PricingService {
    db: Database,
}

impl PricingService {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    // Load pricing config from DB config table (JSON in key=credit_pricing_config), fallback to defaults
    pub async fn load_config(&self) -> Result<PricingConfig, AppError> {
        if let Some(value) = self.get_config_value(PRICING_CONFIG_KEY).await? {
            match serde_json::from_str::<PricingConfig>(&value) {
                Ok(cfg) => Ok(cfg),
                Err(e) => {
                    tracing::warn!(error = ?e, "Invalid pricing config JSON, falling back to defaults");
                    Ok(PricingConfig::default())
                }
            }
        } else {
            Ok(PricingConfig::default())
        }
    }

    // Persist pricing config into DB config table as JSON
    pub async fn save_config(&self, config: &PricingConfig) -> Result<(), AppError> {
        let json = serde_json::to_string(config)
            .map_err(|_| AppError::ValidationError("Invalid pricing config".into()))?;

        sqlx::query(
            "INSERT INTO core.config (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(PRICING_CONFIG_KEY)
        .bind(json)
        .execute(&self.db.pool)
        .await
        .map_err(AppError::DatabaseError)?;

        Ok(())
    }

    // Determine discount percent for a given quantity based on the highest tier whose min_qty ≤ qty
    pub fn get_discount_for_qty(&self, qty: i32, config: &PricingConfig) -> f64 {
        discount_for_qty(qty, config)
    }

    // Compute unit amount in cents with discount applied, minimum of 1 cent
    pub fn compute_unit_amount_cents(&self, base_price_usd: f64, discount_percent: f64) -> i64 {
        unit_amount_cents(base_price_usd, discount_percent)
    }

    // Compute total amount in cents for qty
    pub fn compute_total_amount_cents(
        &self,
        qty: i32,
        base_price_usd: f64,
        discount_percent: f64,
    ) -> i64 {
        total_amount_cents(qty, base_price_usd, discount_percent)
    }

    async fn get_config_value(&self, key: &str) -> Result<Option<String>, AppError> {
        let row = sqlx::query("SELECT value FROM core.config WHERE key = $1")
            .bind(key)
            .fetch_optional(&self.db.pool)
            .await
            .map_err(AppError::DatabaseError)?;

        Ok(row.map(|r| r.get::<String, _>("value")))
    }
}

fn discount_for_qty(qty: i32, config: &PricingConfig) -> f64 {
    if qty <= 0 {
        return 0.0;
    }
    let mut best: f64 = 0.0;
    for tier in &config.tiers {
        if qty >= tier.min_qty && tier.percent > best {
            best = tier.percent;
        }
    }
    best
}

fn unit_amount_cents(base_price_usd: f64, discount_percent: f64) -> i64 {
    let base_cents = (base_price_usd * 100.0).round();
    let discounted = base_cents * (1.0 - (discount_percent / 100.0));
    let cents = discounted.round() as i64;
    cents.max(1)
}

fn total_amount_cents(qty: i32, base_price_usd: f64, discount_percent: f64) -> i64 {
    if qty <= 0 {
        return 0;
    }
    let unit = unit_amount_cents(base_price_usd, discount_percent);
    unit.saturating_mul(qty as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config() -> PricingConfig {
        PricingConfig {
            base_price_usd: 1.0,
            tiers: vec![
                Tier {
                    min_qty: 500,
                    percent: 10.0,
                },
                Tier {
                    min_qty: 100,
                    percent: 5.0,
                },
                Tier {
                    min_qty: 1000,
                    percent: 15.0,
                },
            ],
        }
    }

    #[test]
    fn discount_qty_boundaries_and_non_positive() {
        let cfg = sample_config();
        assert_eq!(discount_for_qty(0, &cfg), 0.0);
        assert_eq!(discount_for_qty(-5, &cfg), 0.0);
        assert_eq!(discount_for_qty(99, &cfg), 0.0);
        assert_eq!(discount_for_qty(100, &cfg), 5.0);
        assert_eq!(discount_for_qty(500, &cfg), 10.0);
        assert_eq!(discount_for_qty(1000, &cfg), 15.0);
    }

    #[test]
    fn discount_uses_highest_percent_when_multiple_tiers_match() {
        let cfg = PricingConfig {
            base_price_usd: 1.0,
            tiers: vec![
                Tier {
                    min_qty: 200,
                    percent: 20.0,
                },
                Tier {
                    min_qty: 100,
                    percent: 5.0,
                },
                Tier {
                    min_qty: 150,
                    percent: 7.0,
                },
            ],
        };

        assert_eq!(discount_for_qty(250, &cfg), 20.0);
    }

    #[test]
    fn unit_amount_rounding_and_floor() {
        assert_eq!(unit_amount_cents(0.995, 0.0), 100);
        assert_eq!(unit_amount_cents(1.00, 5.0), 95);
        assert_eq!(unit_amount_cents(0.0, 0.0), 1);
        assert_eq!(unit_amount_cents(-3.0, 0.0), 1);
        assert_eq!(unit_amount_cents(1.0, 200.0), 1);
    }

    #[test]
    fn total_amount_handles_non_positive_and_saturates() {
        assert_eq!(total_amount_cents(0, 1.0, 0.0), 0);
        assert_eq!(total_amount_cents(-1, 1.0, 0.0), 0);
        assert_eq!(total_amount_cents(3, 1.0, 5.0), 285);

        let saturated = total_amount_cents(i32::MAX, 1e30, 0.0);
        assert_eq!(saturated, i64::MAX);
    }
}
