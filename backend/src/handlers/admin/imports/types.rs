use crate::services::sqlite_import::SqliteImportSummary;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ImportSqliteRequest {
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportTaskQuery {
    #[serde(rename = "async")]
    pub async_: Option<bool>,
    pub webhook_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportTaskStartResponse {
    pub task_id: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum ImportSqliteResponse {
    Completed { summary: SqliteImportSummary },
    Started(ImportTaskStartResponse),
}

#[derive(Debug, Deserialize)]
pub struct ImportPostgresQuery {
    pub mode: Option<String>,
    #[serde(rename = "async")]
    pub async_: Option<bool>,
    pub webhook_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportPostgresResponse {
    pub file_name: String,
    pub download_url: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum ImportPostgresResponse {
    Completed { status: String },
    Started(ImportTaskStartResponse),
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportTask {
    pub id: String,
    pub status: String,
    pub kind: String,
    pub mode: Option<String>,
    pub source: String,
    pub start_time: u64,
    pub end_time: Option<u64>,
    pub stage: Option<String>,
    pub current_table: Option<String>,
    pub current_table_index: i32,
    pub total_tables: i32,
    pub rows_seen: i64,
    pub rows_inserted: i64,
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<SqliteImportSummary>,
    #[serde(skip_serializing)]
    pub webhook_url: Option<String>,
}
