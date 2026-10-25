use sqlx::{Pool, Postgres};
use std::env;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};
use tokio::time;

fn parse_bool_env(key: &str, default: bool) -> bool {
    match env::var(key) {
        Ok(v) => matches!(
            v.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "y" | "on"
        ),
        Err(_) => default,
    }
}

fn parse_i64_env(key: &str, default: i64) -> i64 {
    env::var(key)
        .ok()
        .and_then(|v| v.trim().parse::<i64>().ok())
        .unwrap_or(default)
}

/// Run a PostgreSQL backup using pg_dump command-line tool
async fn run_postgres_backup_once(
    db_url: &str,
    backup_dir: &str,
    retention_days: i64,
) -> anyhow::Result<()> {
    let backup_dir = backup_dir.trim();
    if backup_dir.is_empty() {
        return Ok(());
    }

    tokio::fs::create_dir_all(backup_dir).await?;

    let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("iptv_backup_{}.sql", ts);
    let mut path = PathBuf::from(backup_dir);
    path.push(&filename);

    // Use pg_dump for PostgreSQL backups
    let output = tokio::process::Command::new("pg_dump")
        .arg(db_url)
        .arg("-f")
        .arg(&path)
        .output()
        .await;

    match output {
        Ok(result) if result.status.success() => {
            tracing::info!("🗄️  Backup created: {}", path.display());
        }
        Ok(result) => {
            let stderr = String::from_utf8_lossy(&result.stderr);
            tracing::warn!("🗄️  pg_dump failed: {}", stderr);
        }
        Err(e) => {
            tracing::warn!("🗄️  Failed to run pg_dump: {}", e);
        }
    }

    // Cleanup old backups created by this task only (prefix-based)
    if retention_days > 0 {
        let cutoff = SystemTime::now()
            .checked_sub(Duration::from_secs(
                (retention_days as u64).saturating_mul(86400),
            ))
            .unwrap_or(SystemTime::UNIX_EPOCH);

        let mut rd = tokio::fs::read_dir(backup_dir).await?;
        while let Some(entry) = rd.next_entry().await? {
            let file_name = entry.file_name();
            let file_name = file_name.to_string_lossy();
            if !file_name.starts_with("iptv_backup_") || !file_name.ends_with(".sql") {
                continue;
            }
            let meta = entry.metadata().await?;
            if let Ok(modified) = meta.modified() {
                if modified < cutoff {
                    let _ = tokio::fs::remove_file(entry.path()).await;
                }
            }
        }
    }

    Ok(())
}

/// Starts an automatic PostgreSQL backup task using `pg_dump`.
///
/// For cloud providers (Neon, Supabase), backups are handled by the provider.
/// For local PostgreSQL, we use pg_dump via CLI.
///
/// Controlled via env vars:
/// - `BACKUP_ENABLED` (default: true)
/// - `BACKUP_DIR` (default: ./backups)
/// - `BACKUP_RETENTION_DAYS` (default: 30)
/// - `BACKUP_INTERVAL_HOURS` (default: 24)
pub fn spawn_postgres_backup_task(_pool: Pool<Postgres>) {
    let enabled = parse_bool_env("BACKUP_ENABLED", true);
    if !enabled {
        tracing::info!("🗄️  Backups disabled (BACKUP_ENABLED=false)");
        return;
    }

    let db_url = env::var("DATABASE_URL").unwrap_or_default();

    // Skip backups for cloud providers - they handle their own backups
    if db_url.contains("neon.tech") || db_url.contains("supabase") {
        tracing::info!("🗄️  Cloud database detected - backups handled by provider");
        return;
    }

    let backup_dir = env::var("BACKUP_DIR").unwrap_or_else(|_| "./backups".to_string());
    let retention_days = parse_i64_env("BACKUP_RETENTION_DAYS", 30);
    if retention_days <= 0 {
        tracing::info!("🗄️  Backups disabled (BACKUP_RETENTION_DAYS <= 0)");
        return;
    }

    let interval_hours = parse_i64_env("BACKUP_INTERVAL_HOURS", 24).clamp(1, 24 * 30);
    tracing::info!(
        backup_dir = %backup_dir,
        retention_days = retention_days,
        interval_hours = interval_hours,
        "🗄️  Automatic PostgreSQL backups enabled (using pg_dump)"
    );

    tokio::spawn(async move {
        // Run once at startup, then periodically.
        if let Err(e) = run_postgres_backup_once(&db_url, &backup_dir, retention_days).await {
            tracing::warn!("🗄️  Backup failed: {}", e);
        }

        let mut ticker = time::interval(Duration::from_secs((interval_hours as u64) * 3600));
        loop {
            ticker.tick().await;
            if let Err(e) = run_postgres_backup_once(&db_url, &backup_dir, retention_days).await {
                tracing::warn!("🗄️  Backup failed: {}", e);
            }
        }
    });
}
