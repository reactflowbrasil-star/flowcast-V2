use std::collections::{HashMap, HashSet};
use std::path::Path;

use chrono::{TimeZone, Utc};
use futures::future::BoxFuture;
use futures::TryStreamExt;
use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqliteRow};
use sqlx::{Postgres, QueryBuilder, Row};

use crate::error::AppError;

const BATCH_SIZE: usize = 500;

#[derive(Debug, Serialize, Clone)]
pub struct SqliteImportProgress {
    pub current_table: Option<String>,
    pub current_table_index: usize,
    pub total_tables: usize,
    pub total_rows_seen: i64,
    pub total_rows_inserted: i64,
}

pub type SqliteImportProgressCallback =
    Box<dyn Fn(SqliteImportProgress) -> BoxFuture<'static, ()> + Send + Sync>;

#[derive(Debug, Serialize, Clone)]
pub struct TableImportSummary {
    pub table: String,
    pub rows_seen: i64,
    pub rows_inserted: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct TableImportError {
    pub table: String,
    pub error: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SqliteImportSummary {
    pub tables: Vec<TableImportSummary>,
    pub total_rows_seen: i64,
    pub total_rows_inserted: i64,
    pub errors: Vec<TableImportError>,
}

#[derive(Debug, Clone)]
struct ImportColumn {
    name: String,
    sqlite_type: String,
    pg_cast: String,
}

pub async fn import_sqlite_database(
    pg_pool: &sqlx::PgPool,
    sqlite_path: &Path,
) -> Result<SqliteImportSummary, AppError> {
    import_sqlite_database_with_progress(pg_pool, sqlite_path, None).await
}

pub async fn import_sqlite_database_with_progress(
    pg_pool: &sqlx::PgPool,
    sqlite_path: &Path,
    progress: Option<SqliteImportProgressCallback>,
) -> Result<SqliteImportSummary, AppError> {
    let sqlite_pool = open_sqlite_pool(sqlite_path).await?;
    let sqlite_tables = list_sqlite_tables(&sqlite_pool).await?;

    let mut summaries = Vec::new();
    let mut errors = Vec::new();
    let mut total_rows_seen = 0i64;
    let mut total_rows_inserted = 0i64;

    let mut import_tables = Vec::new();
    for table in import_order() {
        if !sqlite_tables.contains(table) {
            continue;
        }
        if !pg_table_exists(pg_pool, table).await? {
            continue;
        }
        import_tables.push(table);
    }

    let total_tables = import_tables.len();
    if let Some(callback) = progress.as_ref() {
        callback(SqliteImportProgress {
            current_table: None,
            current_table_index: 0,
            total_tables,
            total_rows_seen,
            total_rows_inserted,
        })
        .await;
    }

    for (index, table) in import_tables.iter().enumerate() {
        let table = *table;

        if let Some(callback) = progress.as_ref() {
            callback(SqliteImportProgress {
                current_table: Some(table.to_string()),
                current_table_index: index + 1,
                total_tables,
                total_rows_seen,
                total_rows_inserted,
            })
            .await;
        }

        tracing::info!(table = %table, "SQLite import: starting table");
        let summary = match import_table(pg_pool, &sqlite_pool, table).await {
            Ok(summary) => summary,
            Err(err) => {
                tracing::error!(table = %table, error = %err, "SQLite import failed for table");
                errors.push(TableImportError {
                    table: table.to_string(),
                    error: err.to_string(),
                });
                continue;
            }
        };
        tracing::info!(
            table = %table,
            rows_seen = summary.rows_seen,
            rows_inserted = summary.rows_inserted,
            "SQLite import: completed table"
        );
        total_rows_seen += summary.rows_seen;
        total_rows_inserted += summary.rows_inserted;
        summaries.push(summary);

        if let Some(callback) = progress.as_ref() {
            callback(SqliteImportProgress {
                current_table: Some(table.to_string()),
                current_table_index: index + 1,
                total_tables,
                total_rows_seen,
                total_rows_inserted,
            })
            .await;
        }
    }

    tracing::info!(
        total_rows_seen,
        total_rows_inserted,
        "SQLite import: completed"
    );
    Ok(SqliteImportSummary {
        tables: summaries,
        total_rows_seen,
        total_rows_inserted,
        errors,
    })
}

fn import_order() -> Vec<&'static str> {
    vec![
        "config",
        "system_config",
        "system_info",
        "categories",
        "tv_channel_categories",
        "epg_sources",
        "tv_providers",
        "events",
        "event_schedules",
        "users",
        "master_api_keys",
        "credit_purchases",
        "billing_transactions",
        "reseller_logs",
        "content",
        "series",
        "seasons",
        "episodes",
        "content_subtitles",
        "episode_subtitles",
        "gift_codes",
        "gift_code_redemptions",
        "devices",
        "user_devices",
        "user_subscriptions",
        "user_favorites",
        "blacklisted_tokens",
        "rate_limits",
        "activity_logs",
        "user_login_history",
        "user_viewing_history",
        "user_watch_progress",
        "security_incidents",
        "security_bans",
        "tickets",
        "support_tickets",
        "ticket_messages",
        "ticket_message_reads",
        "media_watch_folders",
        "password_reset_tokens",
        "reseller_api_keys",
        "reseller_api_key_usage",
        "smtp_config",
    ]
}

async fn open_sqlite_pool(sqlite_path: &Path) -> Result<SqlitePool, AppError> {
    let options = SqliteConnectOptions::new()
        .filename(sqlite_path)
        .read_only(true);
    SqlitePool::connect_with(options)
        .await
        .map_err(AppError::DatabaseError)
}

async fn list_sqlite_tables(sqlite_pool: &SqlitePool) -> Result<HashSet<String>, AppError> {
    let rows = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(sqlite_pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let mut tables = HashSet::new();
    for row in rows {
        let name: String = row.get("name");
        tables.insert(name);
    }
    Ok(tables)
}

async fn pg_table_exists(pg_pool: &sqlx::PgPool, table: &str) -> Result<bool, AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core'))",
    )
    .bind(table)
    .fetch_one(pg_pool)
    .await
    .map_err(AppError::DatabaseError)?;

    Ok(exists)
}

async fn import_table(
    pg_pool: &sqlx::PgPool,
    sqlite_pool: &SqlitePool,
    table: &str,
) -> Result<TableImportSummary, AppError> {
    ensure_safe_identifier(table)?;

    let sqlite_columns = sqlite_table_columns(sqlite_pool, table).await?;
    let pg_columns = pg_table_columns(pg_pool, table).await?;

    let mut columns = Vec::new();
    for col in sqlite_columns {
        if let Some(pg_udt) = pg_columns.get(&col.name) {
            columns.push(ImportColumn {
                name: col.name,
                sqlite_type: col.sqlite_type,
                pg_cast: pg_cast_type(pg_udt),
            });
        }
    }

    if columns.is_empty() {
        return Ok(TableImportSummary {
            table: table.to_string(),
            rows_seen: 0,
            rows_inserted: 0,
        });
    }

    let select_sql = format!(
        "SELECT {} FROM {}",
        columns
            .iter()
            .map(|c| c.name.as_str())
            .collect::<Vec<_>>()
            .join(", "),
        table
    );

    let mut rows = sqlx::query(&select_sql).fetch(sqlite_pool);
    let mut batch: Vec<Vec<Option<String>>> = Vec::with_capacity(BATCH_SIZE);
    let mut rows_seen = 0i64;
    let mut rows_inserted = 0i64;

    while let Some(row) = rows.try_next().await.map_err(AppError::DatabaseError)? {
        let mut values = Vec::with_capacity(columns.len());
        for col in &columns {
            values.push(sqlite_value_to_string(&row, col));
        }
        batch.push(values);
        rows_seen += 1;

        if batch.len() >= BATCH_SIZE {
            rows_inserted += insert_batch(pg_pool, table, &columns, &batch).await?;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        rows_inserted += insert_batch(pg_pool, table, &columns, &batch).await?;
    }

    if pg_columns.contains_key("id") {
        update_sequence(pg_pool, table).await?;
    }

    Ok(TableImportSummary {
        table: table.to_string(),
        rows_seen,
        rows_inserted,
    })
}

async fn insert_batch(
    pg_pool: &sqlx::PgPool,
    table: &str,
    columns: &[ImportColumn],
    batch: &[Vec<Option<String>>],
) -> Result<i64, AppError> {
    if batch.is_empty() {
        return Ok(0);
    }

    let column_list = columns
        .iter()
        .map(|c| c.name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let mut builder =
        QueryBuilder::<Postgres>::new(format!("INSERT INTO {} ({}) ", table, column_list));

    builder.push_values(batch, |mut row_builder, row| {
        for (idx, value) in row.iter().enumerate() {
            let normalized = normalize_pg_value(
                value,
                columns[idx].pg_cast.as_str(),
                columns[idx].name.as_str(),
            );
            row_builder.push_bind(normalized);
            let cast = columns[idx].pg_cast.as_str();
            if !cast.is_empty() {
                row_builder.push_unseparated("::");
                row_builder.push_unseparated(cast);
            }
        }
    });

    builder.push(" ON CONFLICT DO NOTHING");

    let sql_snapshot = builder.sql().to_string();
    let result = match builder.build().execute(pg_pool).await {
        Ok(result) => result,
        Err(err) => {
            tracing::error!(
                table = %table,
                error = %err,
                sql = %sql_snapshot,
                "SQLite import batch insert failed; retrying row-by-row"
            );
            return insert_batch_row_by_row(pg_pool, table, columns, batch).await;
        }
    };

    Ok(result.rows_affected() as i64)
}

async fn insert_batch_row_by_row(
    pg_pool: &sqlx::PgPool,
    table: &str,
    columns: &[ImportColumn],
    batch: &[Vec<Option<String>>],
) -> Result<i64, AppError> {
    let column_list = columns
        .iter()
        .map(|c| c.name.as_str())
        .collect::<Vec<_>>()
        .join(", ");

    let mut inserted = 0i64;
    for row in batch {
        let mut builder =
            QueryBuilder::<Postgres>::new(format!("INSERT INTO {} ({}) ", table, column_list));

        builder.push_values(std::iter::once(row), |mut row_builder, row| {
            for (idx, value) in row.iter().enumerate() {
                let normalized = normalize_pg_value(
                    value,
                    columns[idx].pg_cast.as_str(),
                    columns[idx].name.as_str(),
                );
                row_builder.push_bind(normalized);
                let cast = columns[idx].pg_cast.as_str();
                if !cast.is_empty() {
                    row_builder.push_unseparated("::");
                    row_builder.push_unseparated(cast);
                }
            }
        });

        builder.push(" ON CONFLICT DO NOTHING");
        let sql_snapshot = builder.sql().to_string();
        match builder.build().execute(pg_pool).await {
            Ok(result) => {
                inserted += result.rows_affected() as i64;
            }
            Err(err) => {
                tracing::error!(
                    table = %table,
                    error = %err,
                    sql = %sql_snapshot,
                    row = ?row,
                    "SQLite import skipped a row due to insert error"
                );
            }
        }
    }

    Ok(inserted)
}

async fn sqlite_table_columns(
    sqlite_pool: &SqlitePool,
    table: &str,
) -> Result<Vec<ImportColumn>, AppError> {
    let pragma_sql = format!("PRAGMA table_info({})", table);
    let rows = sqlx::query(&pragma_sql)
        .fetch_all(sqlite_pool)
        .await
        .map_err(AppError::DatabaseError)?;

    let mut cols = Vec::new();
    for row in rows {
        let name: String = row.get("name");
        let sqlite_type: Option<String> = row.try_get("type").ok();
        cols.push(ImportColumn {
            name,
            sqlite_type: sqlite_type.unwrap_or_default(),
            pg_cast: String::new(),
        });
    }

    Ok(cols)
}

async fn pg_table_columns(
    pg_pool: &sqlx::PgPool,
    table: &str,
) -> Result<HashMap<String, String>, AppError> {
    let rows = sqlx::query(
        "SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = $1 AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')",
    )
    .bind(table)
    .fetch_all(pg_pool)
    .await
    .map_err(AppError::DatabaseError)?;

    let mut cols = HashMap::new();
    for row in rows {
        let name: String = row.get("column_name");
        let udt_name: String = row.get("udt_name");
        cols.insert(name, udt_name);
    }
    Ok(cols)
}

fn sqlite_value_to_string(row: &SqliteRow, column: &ImportColumn) -> Option<String> {
    let decl = column.sqlite_type.to_uppercase();

    if decl.contains("BOOL") {
        if let Ok(val) = row.try_get::<Option<i64>, _>(column.name.as_str()) {
            return val.map(|v| {
                if v != 0 {
                    "true".to_string()
                } else {
                    "false".to_string()
                }
            });
        }
        if let Ok(val) = row.try_get::<Option<String>, _>(column.name.as_str()) {
            return val.map(normalize_bool_string);
        }
    }

    if decl.contains("INT") {
        if let Ok(val) = row.try_get::<Option<i64>, _>(column.name.as_str()) {
            return val.map(|v| v.to_string());
        }
    }

    if decl.contains("REAL") || decl.contains("FLOA") || decl.contains("DOUB") {
        if let Ok(val) = row.try_get::<Option<f64>, _>(column.name.as_str()) {
            return val.map(|v| v.to_string());
        }
    }

    if decl.contains("DATE") || decl.contains("TIME") {
        if let Ok(val) = row.try_get::<Option<String>, _>(column.name.as_str()) {
            return val;
        }
        if let Ok(val) = row.try_get::<Option<i64>, _>(column.name.as_str()) {
            return val.map(|v| v.to_string());
        }
        if let Ok(val) = row.try_get::<Option<f64>, _>(column.name.as_str()) {
            return val.map(|v| v.to_string());
        }
    }

    if let Ok(val) = row.try_get::<Option<String>, _>(column.name.as_str()) {
        return val;
    }
    if let Ok(val) = row.try_get::<Option<i64>, _>(column.name.as_str()) {
        return val.map(|v| v.to_string());
    }
    if let Ok(val) = row.try_get::<Option<f64>, _>(column.name.as_str()) {
        return val.map(|v| v.to_string());
    }

    None
}

fn normalize_bool_string(raw: String) -> String {
    match raw.trim().to_lowercase().as_str() {
        "1" | "true" | "t" | "yes" | "y" => "true".to_string(),
        "0" | "false" | "f" | "no" | "n" | "" => "false".to_string(),
        _ => raw,
    }
}

fn normalize_pg_value(value: &Option<String>, pg_cast: &str, column_name: &str) -> Option<String> {
    let raw = value.as_ref()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
        return None;
    }

    match pg_cast {
        "boolean" => Some(normalize_bool_string(trimmed.to_string())),
        "smallint" | "integer" | "bigint" => trimmed.parse::<i64>().ok().map(|v| v.to_string()),
        "real" | "double precision" | "numeric" => {
            trimmed.parse::<f64>().ok().map(|v| v.to_string())
        }
        "timestamptz" | "timestamp" | "date" => normalize_datetime_value(trimmed, pg_cast),
        _ => normalize_text_value(trimmed, column_name),
    }
}

fn normalize_text_value(raw: &str, column_name: &str) -> Option<String> {
    let lower_columns = [
        "role",
        "status",
        "priority",
        "category",
        "source",
        "media_type",
    ];
    if lower_columns.contains(&column_name) {
        return Some(raw.to_lowercase());
    }

    Some(raw.to_string())
}

fn normalize_datetime_value(raw: &str, pg_cast: &str) -> Option<String> {
    if raw.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(mut epoch) = raw.parse::<i64>() {
            if raw.len() > 11 {
                epoch /= 1000;
            }
            let dt = Utc.timestamp_opt(epoch, 0).single()?;
            return Some(match pg_cast {
                "date" => dt.date_naive().to_string(),
                _ => dt.to_rfc3339(),
            });
        }
        return None;
    }

    Some(raw.to_string())
}

fn pg_cast_type(udt: &str) -> String {
    match udt {
        "int2" => "smallint".to_string(),
        "int4" => "integer".to_string(),
        "int8" => "bigint".to_string(),
        "float4" => "real".to_string(),
        "float8" => "double precision".to_string(),
        "numeric" => "numeric".to_string(),
        "bool" => "boolean".to_string(),
        "varchar" | "bpchar" | "text" => "text".to_string(),
        "timestamptz" => "timestamptz".to_string(),
        "timestamp" => "timestamp".to_string(),
        "date" => "date".to_string(),
        "uuid" => "uuid".to_string(),
        other => other.to_string(),
    }
}

async fn update_sequence(pg_pool: &sqlx::PgPool, table: &str) -> Result<(), AppError> {
    let seq: Option<String> = sqlx::query_scalar("SELECT pg_get_serial_sequence($1, 'id')")
        .bind(table)
        .fetch_one(pg_pool)
        .await
        .map_err(AppError::DatabaseError)?;

    let Some(seq) = seq else {
        return Ok(());
    };

    let max_sql = format!("SELECT MAX(id) FROM {}", table);
    let max_id: Option<i64> = sqlx::query_scalar(&max_sql)
        .fetch_one(pg_pool)
        .await
        .map_err(AppError::DatabaseError)?;

    let (value, is_called) = match max_id {
        Some(max_id) if max_id > 0 => (max_id, true),
        _ => (1, false),
    };

    let seq_name = seq.replace('\'', "''");
    let setval_sql = format!("SELECT setval('{}', $1, $2)", seq_name);
    sqlx::query(&setval_sql)
        .bind(value)
        .bind(is_called)
        .execute(pg_pool)
        .await
        .map_err(AppError::DatabaseError)?;

    Ok(())
}

fn ensure_safe_identifier(name: &str) -> Result<(), AppError> {
    let ok = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    if ok {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!("Unsafe table name: {}", name)))
    }
}
