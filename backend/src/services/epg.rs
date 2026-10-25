use crate::error::AppError;
use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use regex::Regex;
use reqwest::Client;
use sqlx::{PgPool, Row};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct EpgSource {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub timezone: String,
    pub cache_ttl_minutes: i32,
    pub is_active: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct EpgChannelInfo {
    pub id: String,           // XMLTV channel-id
    pub display_name: String, // first display-name
    pub icon: Option<String>, // icon src
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct EpgProgramDto {
    pub channel_id: String,
    pub title: String,
    pub description: Option<String>,
    pub start: String, // ISO-8601 UTC
    pub end: String,   // ISO-8601 UTC
    pub category: Option<String>,
}

/// Cache entry: (fetched_at, xml_content, ttl_minutes)
type EpgCacheEntry = (Instant, String, i32);
/// EPG cache: source_id -> cache entry
type EpgCache = Arc<Mutex<HashMap<i64, EpgCacheEntry>>>;

#[derive(Clone)]
pub struct EpgService {
    client: Client,
    db: PgPool,
    cache: EpgCache,
}

impl EpgService {
    pub fn new(db: PgPool) -> Self {
        // Create HTTP client with extended timeout for long EPG operations
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 minutes timeout
            .build()
            .unwrap_or_else(|_| Client::new()); // Fallback to default if builder fails

        Self {
            client,
            db,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn get_sources(&self) -> Result<Vec<EpgSource>, AppError> {
        let rows = sqlx::query(
            "SELECT id, name, url, timezone, cache_ttl_minutes, is_active FROM activity.epg_sources ORDER BY name"
        )
        .fetch_all(&self.db)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| EpgSource {
                id: r.get("id"),
                name: r.get("name"),
                url: r.get("url"),
                timezone: r.get::<String, _>("timezone"),
                cache_ttl_minutes: r.get::<i32, _>("cache_ttl_minutes"),
                is_active: r.get::<bool, _>("is_active"),
            })
            .collect())
    }

    pub async fn get_source(&self, id: i64) -> Result<EpgSource, AppError> {
        let row = sqlx::query(
            "SELECT id, name, url, timezone, cache_ttl_minutes, is_active FROM activity.epg_sources WHERE id = $1"
        ).bind(id).fetch_one(&self.db).await?;
        Ok(EpgSource {
            id: row.get("id"),
            name: row.get("name"),
            url: row.get("url"),
            timezone: row.get("timezone"),
            cache_ttl_minutes: row.get::<i32, _>("cache_ttl_minutes"),
            is_active: row.get::<bool, _>("is_active"),
        })
    }

    pub async fn create_source(
        &self,
        name: &str,
        url: &str,
        timezone: &str,
        ttl: i32,
        active: bool,
    ) -> Result<i64, AppError> {
        let id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO activity.epg_sources (name, url, timezone, cache_ttl_minutes, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id"
        )
        .bind(name)
        .bind(url)
        .bind(timezone)
        .bind(ttl)
        .bind(active)
        .fetch_one(&self.db)
        .await?;
        Ok(id)
    }

    pub async fn update_source(
        &self,
        id: i64,
        name: &str,
        url: &str,
        timezone: &str,
        ttl: i32,
        active: bool,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE activity.epg_sources SET name=$1, url=$2, timezone=$3, cache_ttl_minutes=$4, is_active=$5 WHERE id=$6")
            .bind(name)
            .bind(url)
            .bind(timezone)
            .bind(ttl)
            .bind(active)
            .bind(id)
            .execute(&self.db)
            .await?;
        // Invalidate cache
        if let Ok(mut m) = self.cache.lock() {
            m.remove(&id);
        }
        Ok(())
    }

    pub async fn delete_source(&self, id: i64) -> Result<(), AppError> {
        sqlx::query("DELETE FROM activity.epg_sources WHERE id=$1")
            .bind(id)
            .execute(&self.db)
            .await?;
        if let Ok(mut m) = self.cache.lock() {
            m.remove(&id);
        }
        Ok(())
    }

    async fn fetch_xml(&self, source: &EpgSource) -> Result<String, AppError> {
        // Check cache
        if let Ok(mut m) = self.cache.lock() {
            if let Some((at, xml, ttl)) = m.get(&source.id).cloned() {
                let ttl_minutes = ttl.max(1) as u64;
                if at.elapsed() < Duration::from_secs(ttl_minutes * 60) {
                    return Ok(xml);
                } else {
                    m.remove(&source.id);
                }
            }
        }
        // Fetch
        let res = self
            .client
            .get(&source.url)
            .send()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("EPG fetch failed: {}", e)))?;
        if !res.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "EPG returned status {}",
                res.status()
            )));
        }
        let text = res
            .text()
            .await
            .map_err(|e| AppError::ExternalServiceError(format!("EPG read body failed: {}", e)))?;
        if let Ok(mut m) = self.cache.lock() {
            m.insert(
                source.id,
                (Instant::now(), text.clone(), source.cache_ttl_minutes),
            );
        }
        Ok(text)
    }

    pub async fn discover_channels(&self, source_id: i64) -> Result<Vec<EpgChannelInfo>, AppError> {
        let source = self.get_source(source_id).await?;
        let xml = self.fetch_xml(&source).await?;
        Ok(parse_channels(&xml))
    }

    pub async fn get_programs_window(
        &self,
        channel_mappings: Vec<(i64, String, i64)>,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<EpgProgramDto>, AppError> {
        tracing::info!(
            "EPG: Getting programs for {} channels, time range: {} to {}",
            channel_mappings.len(),
            start,
            end
        );

        // Group by source_id
        use std::collections::BTreeMap;
        let mut by_source: BTreeMap<i64, Vec<(String, i64)>> = BTreeMap::new();
        for (source_id, chan_id, offset) in channel_mappings {
            tracing::debug!(
                "EPG: Mapping found - source_id: {}, channel_id: {}, offset: {}",
                source_id,
                chan_id,
                offset
            );
            by_source
                .entry(source_id)
                .or_default()
                .push((chan_id, offset));
        }

        let mut out = Vec::new();
        for (source_id, items) in by_source {
            tracing::info!(
                "EPG: Processing source_id: {} with {} channels",
                source_id,
                items.len()
            );
            let source = self.get_source(source_id).await?;
            let xml = self.fetch_xml(&source).await?;
            tracing::info!("EPG: Downloaded XML of {} bytes", xml.len());

            for (chan_id, offset) in items {
                tracing::info!("EPG: Parsing programs for channel: {}", chan_id);
                let programs = parse_programs_for_channel(&xml, &chan_id)?;
                tracing::info!(
                    "EPG: Found {} programs for channel {}",
                    programs.len(),
                    chan_id
                );

                for mut p in programs {
                    // Apply offset minutes
                    if offset != 0 {
                        p.start += chrono::Duration::minutes(offset);
                        p.end += chrono::Duration::minutes(offset);
                        tracing::debug!(
                            "EPG: Applied offset {} minutes to program: {}",
                            offset,
                            p.title
                        );
                    }

                    tracing::debug!(
                        "EPG: Checking program '{}' from {} to {} against range {} to {}",
                        p.title,
                        p.start,
                        p.end,
                        start,
                        end
                    );

                    if p.end <= start || p.start >= end {
                        tracing::debug!(
                            "EPG: Program '{}' is outside time range, skipping",
                            p.title
                        );
                        continue;
                    }

                    tracing::info!("EPG: Adding program '{}' to results", p.title);
                    // Use ISO-8601 with 'Z' suffix to ensure Android Instant.parse compatibility
                    out.push(EpgProgramDto {
                        channel_id: chan_id.clone(),
                        title: p.title,
                        description: p.description,
                        start: p.start.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                        end: p.end.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                        category: p.category,
                    });
                }
            }
        }

        tracing::info!("EPG: Returning {} total programs", out.len());
        Ok(out)
    }
}

#[derive(Debug, Clone)]
struct ParsedProgram {
    title: String,
    description: Option<String>,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    category: Option<String>,
}

fn parse_channels(xml: &str) -> Vec<EpgChannelInfo> {
    let mut out = Vec::new();
    let re_channel = match Regex::new(r#"(?s)<channel[^>]*id=\"([^\"]+)\"[^>]*>(.*?)</channel>"#) {
        Ok(r) => r,
        Err(_) => return out,
    };
    let re_disp = match Regex::new(r#"<display-name[^>]*>([^<]+)</display-name>"#) {
        Ok(r) => r,
        Err(_) => return out,
    };
    let re_icon = match Regex::new(r#"<icon[^>]*src=\"([^\"]+)\"[^>]*/?>"#) {
        Ok(r) => r,
        Err(_) => return out,
    };
    for cap in re_channel.captures_iter(xml) {
        let id = cap
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let inner = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        let name = re_disp
            .captures(inner)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| id.clone());
        let icon = re_icon
            .captures(inner)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string());
        out.push(EpgChannelInfo {
            id,
            display_name: name,
            icon,
        });
    }
    out
}

fn parse_programs_for_channel(xml: &str, channel_id: &str) -> Result<Vec<ParsedProgram>, AppError> {
    tracing::info!("EPG Parser: Parsing programs for channel: {}", channel_id);

    // Extract programme blocks for this channel id (simple scan to limit large regex work)
    let re_prog = match Regex::new(&format!(
        r#"(?s)<programme[^>]*channel=\"{}\"[^>]*>(.*?)</programme>"#,
        regex::escape(channel_id)
    )) {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("EPG Parser: Failed to compile programme regex: {}", e);
            return Ok(Vec::new());
        }
    };
    let re_title = match Regex::new(r#"<title[^>]*>([^<]+)</title>"#) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };
    let re_desc = match Regex::new(r#"<desc[^>]*>([^<]+)</desc>"#) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };
    let re_cat = match Regex::new(r#"<category[^>]*>([^<]+)</category>"#) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };
    // capture attributes start/stop from the programme tag
    let re_attrs = match Regex::new(r#"start=\"([^\"]+)\"[^>]*stop=\"([^\"]+)\""#) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };

    tracing::debug!(
        "EPG Parser: Regex pattern: {}",
        format!(
            r#"(?s)<programme[^>]*channel=\"{}\"[^>]*>(.*?)</programme>"#,
            regex::escape(channel_id)
        )
    );
    tracing::debug!(
        "EPG Parser: Attrs regex pattern: {}",
        "start=\"([^\"]+)\"[^>]*stop=\"([^\"]+)\""
    );

    let mut out = Vec::new();
    let mut matches_found = 0;

    for m in re_prog.captures_iter(xml) {
        matches_found += 1;
        let block = match m.get(0) {
            Some(b) => b.as_str(),
            None => continue,
        };
        let inner = m.get(1).map(|x| x.as_str()).unwrap_or("");

        tracing::debug!(
            "EPG Parser: Found match #{} for channel {}",
            matches_found,
            channel_id
        );

        if let Some(attrs) = re_attrs.captures(block) {
            let start_raw = attrs.get(1).map(|x| x.as_str()).unwrap_or("");
            let stop_raw = attrs.get(2).map(|x| x.as_str()).unwrap_or("");

            tracing::debug!(
                "EPG Parser: Raw start: '{}', stop: '{}'",
                start_raw,
                stop_raw
            );

            if let (Some(start), Some(end)) = (
                parse_xmltv_datetime(start_raw),
                parse_xmltv_datetime(stop_raw),
            ) {
                tracing::debug!("EPG Parser: Parsed start: {}, end: {}", start, end);

                let title = re_title
                    .captures(inner)
                    .and_then(|c| c.get(1))
                    .map(|x| x.as_str().to_string())
                    .unwrap_or_else(|| "Untitled".to_string());
                let description = re_desc
                    .captures(inner)
                    .and_then(|c| c.get(1))
                    .map(|x| x.as_str().to_string());
                let category = re_cat
                    .captures(inner)
                    .and_then(|c| c.get(1))
                    .map(|x| x.as_str().to_string());

                tracing::info!("EPG Parser: Successfully parsed program: '{}'", title);
                out.push(ParsedProgram {
                    title,
                    description,
                    start,
                    end,
                    category,
                });
            } else {
                tracing::warn!("EPG Parser: Failed to parse dates for program block");
            }
        } else {
            tracing::warn!(
                "EPG Parser: Could not extract start/stop attributes from program block"
            );
        }
    }

    tracing::info!(
        "EPG Parser: Found {} regex matches, successfully parsed {} programs for channel {}",
        matches_found,
        out.len(),
        channel_id
    );
    Ok(out)
}

fn parse_xmltv_datetime(s: &str) -> Option<DateTime<Utc>> {
    // Examples: 20240101 120000 +0000 or 20240101120000 +0000 or 20240101120000 +0300
    // We'll strip non-digits and split
    let digits: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '+' || *c == '-')
        .collect();
    // Expect form YYYYMMDDHHMMSS+ZZZZ or without seconds
    let (dt_part, offset_part) = if let Some(pos) = digits
        .find('+')
        .or_else(|| digits[1..].find('-').map(|p| p + 1))
    {
        (&digits[..pos], &digits[pos..])
    } else {
        (&digits[..], "+0000")
    };
    let (year, month, day, hour, min, sec) = if dt_part.len() >= 14 {
        (
            &dt_part[0..4],
            &dt_part[4..6],
            &dt_part[6..8],
            &dt_part[8..10],
            &dt_part[10..12],
            &dt_part[12..14],
        )
    } else if dt_part.len() >= 12 {
        (
            &dt_part[0..4],
            &dt_part[4..6],
            &dt_part[6..8],
            &dt_part[8..10],
            &dt_part[10..12],
            "00",
        )
    } else {
        return None;
    };
    let ndt = NaiveDateTime::parse_from_str(
        &format!("{}-{}-{} {}:{}:{}", year, month, day, hour, min, sec),
        "%Y-%m-%d %H:%M:%S",
    )
    .ok()?;
    // offset like +0300
    let utc_offset = FixedOffset::east_opt(0).unwrap_or_else(|| FixedOffset::east_opt(0).expect("UTC offset is always valid"));
    let offset = if offset_part.len() >= 5 {
        let sign = &offset_part[0..1];
        let hh: i32 = offset_part[1..3].parse().unwrap_or(0);
        let mm: i32 = offset_part[3..5].parse().unwrap_or(0);
        let minutes = hh * 60 + mm;
        let minutes = if sign == "-" { -minutes } else { minutes };
        FixedOffset::east_opt(minutes * 60).unwrap_or(utc_offset)
    } else {
        utc_offset
    };
    let dt = offset.from_local_datetime(&ndt).single()?;
    Some(dt.with_timezone(&Utc))
}
