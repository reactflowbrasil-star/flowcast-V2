use axum::{
    extract::{State, Extension},
    response::Json,
};
use serde::Serialize;
use sysinfo::{System, Networks, Disks};
use tokio::sync::Mutex;
use lazy_static::lazy_static;
use std::sync::Arc;

use crate::error::AppError;
use crate::models::user::UserRole;
use crate::services::Claims;

lazy_static! {
    static ref SYSTEM: Arc<Mutex<System>> = Arc::new(Mutex::new(System::new_all()));
    static ref NETWORKS: Arc<Mutex<Networks>> = Arc::new(Mutex::new(Networks::new_with_refreshed_list()));
    static ref DISKS: Arc<Mutex<Disks>> = Arc::new(Mutex::new(Disks::new_with_refreshed_list()));
}

#[derive(Debug, Serialize)]
pub struct SystemMetricsResponse {
    pub cpu_usage: f32, // percentage 0-100
    pub ram_used: u64, // bytes
    pub ram_total: u64, // bytes
    pub net_rx: u64, // bytes/s
    pub net_tx: u64, // bytes/s
    pub disk_read: u64, // bytes/s
    pub disk_write: u64, // bytes/s
    pub active_connections: i64, 
}

pub async fn get_system_metrics(
    State(app_state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<SystemMetricsResponse>, AppError> {
    // Only admins
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let mut sys = SYSTEM.lock().await;
    sys.refresh_all();
    
    let mut networks = NETWORKS.lock().await;
    networks.refresh(true);
    let mut net_rx = 0;
    let mut net_tx = 0;
    for (_, network) in networks.iter() {
        net_rx += network.received();
        net_tx += network.transmitted();
    }
    
    // CPU average
    let cpus = sys.cpus();
    let cpu_usage = if !cpus.is_empty() {
        cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32
    } else {
        0.0
    };

    let ram_used = sys.used_memory();
    let ram_total = sys.total_memory();

    // Query active database connections as a proxy for "active connections"
    // We could also join with token tables, but pg_stat_activity gives active db connections.
    let active_connections = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active'"
    )
    .fetch_one(&app_state.database.pool)
    .await
    .unwrap_or(0);

    Ok(Json(SystemMetricsResponse {
        cpu_usage,
        ram_used,
        ram_total,
        net_rx,
        net_tx,
        disk_read: 0, // Sysinfo lacks disk IO across all platforms in new API, we keep 0 or skip
        disk_write: 0,
        active_connections,
    }))
}
