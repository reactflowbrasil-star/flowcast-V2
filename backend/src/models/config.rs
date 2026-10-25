use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SystemConfig {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigValues {
    pub default_connections: i32,
    pub extra_connection_cost: f64,
    pub tmdb_api_key: Option<String>,
    pub tmdb_language: Option<String>,
}
