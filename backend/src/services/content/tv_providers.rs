use super::*;

#[derive(Debug, Deserialize)]
pub struct CreateTvProviderRequest {
    pub name: String,
    pub url: String,
    pub ttl_minutes: i32,
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TvProviderRecord {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub ttl_minutes: i32,
    pub enabled: bool,
    pub last_fetched_at: Option<chrono::DateTime<chrono::Utc>>,
    pub next_refresh_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_status: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// Local parser entry used by provider sync
#[derive(Debug, Clone)]
struct ProviderParsedEntry {
    name: String,
    logo_url: Option<String>,
    drm_keys_hex: Option<String>,
    stream_url: String,
    group_title: Option<String>,
    provider: Option<String>,
    #[allow(dead_code)]
    tvg_id: Option<String>,
    origin: Option<String>,
    user_agent: Option<String>,
    referer: Option<String>,
}

impl ContentService {
    // Create provider
    pub async fn create_tv_provider(
        &self,
        req: CreateTvProviderRequest,
    ) -> Result<TvProviderRecord, AppError> {
        // Basic validation
        let name = req.name.trim();
        if name.is_empty() {
            return Err(AppError::BadRequest(
                "Provider name cannot be empty".to_string(),
            ));
        }
        let url = req.url.trim();
        if url.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) {
            return Err(AppError::BadRequest(
                "Provider URL must be http(s)".to_string(),
            ));
        }
        let ttl = req.ttl_minutes.max(1);

        // next_refresh_at: schedule first fetch immediately (now)
        let enabled = req.enabled.unwrap_or(true);
        sqlx::query(
            r#"
            INSERT INTO activity.tv_providers (name, url, ttl_minutes, enabled, last_fetched_at, next_refresh_at, last_status)
            VALUES ($1, $2, $3, $4, NULL, CURRENT_TIMESTAMP, NULL)
            "#,
        )
        .bind(name)
        .bind(url)
        .bind(ttl)
        .bind(enabled)
        .execute(&self.db)
        .await?;

        let row = sqlx::query(
            "SELECT id, name, url, ttl_minutes, enabled, last_fetched_at, next_refresh_at, last_status, created_at FROM activity.tv_providers WHERE name = $1",
        )
        .bind(name)
        .fetch_one(&self.db)
        .await?;

        Ok(Self::map_tv_provider_row(row))
    }

    // List providers
    pub async fn list_tv_providers(&self) -> Result<Vec<TvProviderRecord>, AppError> {
        let rows = sqlx::query(
            "SELECT id, name, url, ttl_minutes, enabled, last_fetched_at, next_refresh_at, last_status, created_at FROM activity.tv_providers ORDER BY id",
        )
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().map(Self::map_tv_provider_row).collect())
    }

    // Delete provider
    pub async fn delete_tv_provider(&self, id: i64) -> Result<(), AppError> {
        let res = sqlx::query("DELETE FROM activity.tv_providers WHERE id = $1")
            .bind(id)
            .execute(&self.db)
            .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    // Sync a provider now: fetch M3U and upsert channels. Returns (created, updated).
    pub async fn sync_tv_provider(&self, id: i64) -> Result<(i64, i64), AppError> {
        use sqlx::Row;

        // Load provider
        let row = sqlx::query(
            "SELECT id, name, url, ttl_minutes, enabled FROM activity.tv_providers WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;
        let row = row.ok_or(AppError::NotFound)?;
        let provider_name: String = row.get("name");
        let provider_url: String = row.get("url");
        let ttl_minutes: i32 = row.get::<i32, _>("ttl_minutes");
        let enabled: bool = row.get("enabled");
        if !enabled {
            // Disabled - only update next_refresh to future but don't ingest
            sqlx::query(
                "UPDATE activity.tv_providers SET next_refresh_at = CURRENT_TIMESTAMP + make_interval(mins => $1::int), last_status = $2 WHERE id = $3",
            )
            .bind(ttl_minutes.max(1))
            .bind("disabled")
            .bind(id)
            .execute(&self.db)
            .await?;
            return Ok((0, 0));
        }

        // Fetch M3U with extended timeout for large playlists
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 minutes timeout
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let text = client
            .get(&provider_url)
            .send()
            .await
            .map_err(|e| AppError::BadRequest(format!("Fetch failed: {}", e)))?
            .text()
            .await
            .map_err(|e| AppError::BadRequest(format!("Invalid body: {}", e)))?;

        let entries = Self::parse_m3u_provider(&text)?;

        // Upsert channels
        let mut created: i64 = 0;
        let mut updated: i64 = 0;

        let tv_category = self
            .get_category_by_type("TV")
            .await?
            .ok_or_else(|| AppError::BadRequest("TV category not found".to_string()))?;

        for e in entries {
            // Try find existing by title + provider
            let query = format!("{} WHERE mc.category_id = $1 AND LOWER(mc.title) = LOWER($2) AND (t.provider IS NULL OR LOWER(t.provider) = LOWER(COALESCE($3, t.provider))) LIMIT 1", sql::CONTENT_JOIN_SELECT);
            let existing = sqlx::query_as::<_, crate::models::ContentJoined>(&query)
            .bind(tv_category.id)
            .bind(&e.name)
            .bind(e.provider.clone().unwrap_or_else(|| provider_name.clone()))
            .fetch_optional(&self.db)
            .await?;

            if let Some(row) = existing {
                let mut tx = self.db.begin().await?;

                sqlx::query(
                    "UPDATE content.media_content SET image_url = COALESCE($1, image_url), active = true WHERE id = $2"
                )
                .bind(&e.logo_url)
                .bind(row.id)
                .execute(&mut *tx).await?;

                sqlx::query(
                    "UPDATE content.tv_channels SET channel_category = COALESCE($1, channel_category), provider = COALESCE($2, provider) WHERE media_content_id = $3"
                )
                .bind(&e.group_title)
                .bind(e.provider.clone().unwrap_or_else(|| provider_name.clone()))
                .bind(row.id)
                .execute(&mut *tx).await?;

                sqlx::query(
                    r#"
                    INSERT INTO content.media_streams (media_content_id, stream_url, stream_type, is_default, drm_keys, user_agent, referer, origin)
                    VALUES ($1, $2, 'primary', true, $3, $4, $5, $6)
                    ON CONFLICT (media_content_id, stream_type) DO UPDATE SET 
                        stream_url = EXCLUDED.stream_url,
                        drm_keys = EXCLUDED.drm_keys,
                        user_agent = COALESCE(EXCLUDED.user_agent, media_streams.user_agent),
                        referer = COALESCE(EXCLUDED.referer, media_streams.referer),
                        origin = COALESCE(EXCLUDED.origin, media_streams.origin)
                    "#
                )
                .bind(row.id)
                .bind(&e.stream_url)
                .bind(&e.drm_keys_hex)
                .bind(&e.user_agent)
                .bind(&e.referer)
                .bind(&e.origin)
                .execute(&mut *tx).await?;

                tx.commit().await?;
                updated += 1;
            } else {
                // Create new
                let create_req = CreateTvChannelRequest {
                    name: e.name.clone(),
                    description: None,
                    logo_url: e.logo_url.clone(),
                    stream_url: e.stream_url.clone(),
                    channel_number: None,
                    is_live: true,
                    channel_category: e.group_title.clone(),
                    provider: Some(e.provider.clone().unwrap_or_else(|| provider_name.clone())),
                    country: None,
                    format: if e.drm_keys_hex.is_some() {
                        Some("DRM".into())
                    } else {
                        Some("M3U8".into())
                    },
                    drm_keys: e.drm_keys_hex.clone(),
                    drm_type: None,
                    license_server_url: None,
                    drm_headers: None,
                    origin: e.origin.clone(),
                    user_agent: e.user_agent.clone(),
                    referer: e.referer.clone(),
                    custom_headers: None,
                    proxy_url: None,
                    doh_url: None,
                };
                self.create_tv_channel(create_req).await?;
                created += 1;
            }
        }

        // Update provider timestamps/status
        sqlx::query(
            "UPDATE activity.tv_providers SET last_fetched_at = CURRENT_TIMESTAMP, next_refresh_at = CURRENT_TIMESTAMP + make_interval(mins => $1::int), last_status = $2 WHERE id = $3",
        )
        .bind(ttl_minutes.max(1))
        .bind(format!("ok: created={}, updated={}", created, updated))
        .bind(id)
        .execute(&self.db)
        .await?;

        Ok((created, updated))
    }

    // Background refresher: refresh due providers (enabled and next_refresh_at <= now)
    pub async fn refresh_due_tv_providers(&self) -> Result<(), AppError> {
        use sqlx::Row;

        let rows = sqlx::query(
            r#"
            SELECT id
            FROM activity.tv_providers
            WHERE enabled = true
              AND (next_refresh_at IS NULL OR next_refresh_at <= CURRENT_TIMESTAMP)
            ORDER BY id
            "#,
        )
        .fetch_all(&self.db)
        .await?;

        for r in rows {
            let id: i64 = r.get("id");
            // Run sync for each provider, update status on error
            match self.sync_tv_provider(id).await {
                Ok((_c, _u)) => { /* status updated in sync */ }
                Err(e) => {
                    // Set next_refresh to a small backoff to avoid tight loop
                    let _ = sqlx::query(
                        "UPDATE activity.tv_providers SET last_status = $1, last_fetched_at = CURRENT_TIMESTAMP, next_refresh_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes' WHERE id = $2",
                    )
                    .bind(format!("error: {}", e))
                    .bind(id)
                    .execute(&self.db)
                    .await;
                }
            }
        }

        Ok(())
    }

    fn map_tv_provider_row(row: sqlx::postgres::PgRow) -> TvProviderRecord {
        use sqlx::Row;
        let id: i64 = row.get("id");
        let name: String = row.get("name");
        let url: String = row.get("url");
        let ttl_minutes: i32 = row.get::<i32, _>("ttl_minutes");
        let enabled: bool = row.get("enabled");
        let last_fetched_at: Option<chrono::DateTime<chrono::Utc>> =
            row.try_get("last_fetched_at").ok();
        let next_refresh_at: Option<chrono::DateTime<chrono::Utc>> =
            row.try_get("next_refresh_at").ok();
        let last_status: Option<String> = row.try_get::<String, _>("last_status").ok();
        let created_at: chrono::DateTime<chrono::Utc> =
            row.get::<chrono::DateTime<chrono::Utc>, _>("created_at");

        TvProviderRecord {
            id,
            name,
            url,
            ttl_minutes,
            enabled,
            last_fetched_at,
            next_refresh_at,
            last_status,
            created_at,
        }
    }

    // --- Local M3U parsing for provider sync ---

    fn parse_m3u_provider(text: &str) -> Result<Vec<ProviderParsedEntry>, AppError> {
        let mut entries = Vec::new();
        let mut lines = text.lines().map(|l| l.trim().to_string()).peekable();

        // helper to extract attribute values from EXTINF line: key="value"
        let extract_attr = |line: &str, key: &str| -> Option<String> {
            let needle = format!(r#"{}=""#, key);
            if let Some(pos) = line.find(&needle) {
                let start = pos + needle.len();
                if let Some(end) = line[start..].find('"') {
                    let val = &line[start..start + end];
                    if !val.is_empty() {
                        return Some(val.to_string());
                    }
                }
            }
            None
        };

        while let Some(line) = lines.next() {
            if line.is_empty() {
                continue;
            }
            if !line.starts_with("#EXTINF") {
                continue;
            }

            let mut name: Option<String> = None;
            let mut logo_url: Option<String> = None;
            let mut group_title: Option<String> = None;
            let mut provider: Option<String> = None;
            let mut tvg_id: Option<String> = None;
            let mut origin: Option<String> = None;
            let mut user_agent: Option<String> = None;
            let mut referer: Option<String> = None;

            // parse EXTINF attributes
            if let Some(gt) = extract_attr(&line, "group-title") {
                group_title = Some(gt);
            }
            if let Some(p) = extract_attr(&line, "provider") {
                provider = Some(p);
            }
            if let Some(tid) = extract_attr(&line, "tvg-id") {
                tvg_id = Some(tid);
            }

            // title after comma
            if let Some(idx) = line.rfind(',') {
                let t = line[idx + 1..].trim();
                if !t.is_empty() {
                    name = Some(t.to_string());
                }
            }
            // allow fallbacks
            if let Some(val) = extract_attr(&line, "tvg-name") {
                if name.is_none() && !val.is_empty() {
                    name = Some(val);
                }
            }
            if let Some(val) = extract_attr(&line, "tvg-logo") {
                if !val.is_empty() {
                    logo_url = Some(val);
                }
            }

            let mut drm_keys_hex: Option<String> = None;
            let mut stream_url: Option<String> = None;
            while let Some(peek) = lines.peek().cloned() {
                if peek.is_empty() {
                    lines.next();
                    break;
                }
                if peek.starts_with('#') {
                    if let Some(eq) = peek.find("license_key=") {
                        let raw = &peek[eq + "license_key=".len()..];
                        let parsed = Self::parse_license_key_to_hex_pairs_svc(raw)?;
                        drm_keys_hex = Some(parsed);
                    } else if let Some(rest) = peek.strip_prefix("#EXTVLCOPT:") {
                        if let Some((key, value)) = rest.split_once('=') {
                            let key = key.trim().to_ascii_lowercase();
                            let value = value.trim().to_string();
                            match key.as_str() {
                                "http-user-agent" => user_agent = Some(value),
                                "http-referrer" | "http-referer" => referer = Some(value),
                                "http-origin" => origin = Some(value),
                                _ => {}
                            }
                        }
                    } else if let Some(rest) = peek.strip_prefix("#EXTHTTP:") {
                        if let Some((key, value)) = rest.split_once('=') {
                            let key = key.trim().to_ascii_lowercase();
                            let value = value.trim().to_string();
                            match key.as_str() {
                                "user-agent" => user_agent = Some(value),
                                "referer" => referer = Some(value),
                                "origin" => origin = Some(value),
                                _ => {}
                            }
                        }
                    }
                    lines.next();
                    continue;
                }
                stream_url = Some(peek.to_string());
                lines.next();
                break;
            }

            let stream_url = match stream_url {
                Some(u) => u,
                None => continue,
            };
            let name = name.unwrap_or_else(|| "Untitled Channel".into());
            entries.push(ProviderParsedEntry {
                name,
                logo_url,
                drm_keys_hex,
                stream_url,
                group_title,
                provider,
                tvg_id,
                origin,
                user_agent,
                referer,
            });
        }
        Ok(entries)
    }

    fn parse_license_key_to_hex_pairs_svc(input: &str) -> Result<String, AppError> {
        let s = input.trim().trim_matches(|c| c == '"' || c == '\'');
        // JSON object of { kidHex: keyHex }
        if s.starts_with('{') {
            let v: serde_json::Value = serde_json::from_str(s)
                .map_err(|_| AppError::BadRequest("Invalid JSON in license_key".to_string()))?;
            let obj = v.as_object().ok_or(AppError::BadRequest(
                "license_key JSON must be an object".to_string(),
            ))?;

            let kid_field = obj
                .get("kid")
                .or_else(|| obj.get("KID"))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty());
            let key_field = obj
                .get("key")
                .or_else(|| obj.get("KEY"))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty());
            if let (Some(kid_hex), Some(key_hex)) = (kid_field, key_field) {
                return Ok(format!("{}:{}", kid_hex, key_hex));
            }

            let mut pairs = Vec::new();
            for (kid_hex, key_val) in obj.iter() {
                let key_hex = key_val
                    .as_str()
                    .ok_or(AppError::BadRequest(
                        "license_key values must be strings".to_string(),
                    ))?
                    .trim()
                    .to_string();
                let kid_hex = kid_hex.trim().to_string();
                if !kid_hex.is_empty() && !key_hex.is_empty() {
                    // JSON mapping form is { kid_hex: key_hex }.
                    pairs.push(format!("{}:{}", kid_hex, key_hex));
                }
            }
            if pairs.is_empty() {
                return Err(AppError::BadRequest(
                    "No valid keys in license_key JSON".to_string(),
                ));
            }
            return Ok(pairs.join(","));
        }

        // Simple "KID:KEY" pair (32-byte hex each)
        if let Some((a, b)) = s.split_once(':') {
            let a = a.trim();
            let b = b.trim();
            if a.len() == 32 && b.len() == 32 {
                return Ok(format!("{}:{}", a, b));
            }
        }
        Err(AppError::BadRequest(
            "Unsupported license_key format".to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::ContentService;

    #[test]
    fn provider_parse_license_key_hex_pair_keeps_kid_key_order() {
        let kid = "c50f8758b7fb4bf886dd561a7cda6e84";
        let key = "0541856bd180caf65d26a9eaf33e0f24";
        let parsed =
            ContentService::parse_license_key_to_hex_pairs_svc(&format!("{kid}:{key}")).unwrap();
        assert_eq!(parsed, format!("{kid}:{key}"));
    }

    #[test]
    fn provider_parse_license_key_json_map_keeps_kid_key_order() {
        let kid = "c50f8758b7fb4bf886dd561a7cda6e84";
        let key = "0541856bd180caf65d26a9eaf33e0f24";
        let parsed =
            ContentService::parse_license_key_to_hex_pairs_svc(&format!(r#"{{"{kid}":"{key}"}}"#))
                .unwrap();
        assert_eq!(parsed, format!("{kid}:{key}"));
    }

    #[test]
    fn provider_parse_license_key_json_explicit_fields() {
        let kid = "c50f8758b7fb4bf886dd561a7cda6e84";
        let key = "0541856bd180caf65d26a9eaf33e0f24";
        let parsed = ContentService::parse_license_key_to_hex_pairs_svc(&format!(
            r#"{{"kid":"{kid}","key":"{key}"}}"#
        ))
        .unwrap();
        assert_eq!(parsed, format!("{kid}:{key}"));
    }
}
