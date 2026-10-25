use crate::error::AppError;
use std::collections::HashSet;

fn parse_license_key_to_hex_pairs(input: &str) -> Result<String, AppError> {
    let s = input.trim().trim_matches(|c| c == '"' || c == '\'');
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
            let key_hex = key_val.as_str().ok_or(AppError::BadRequest(
                "license_key values must be strings".to_string(),
            ))?;
            if !kid_hex.is_empty() && !key_hex.is_empty() {
                // JSON mapping form is { kid_hex: key_hex }.
                pairs.push(format!("{}:{}", kid_hex.trim(), key_hex.trim()));
            }
        }
        if pairs.is_empty() {
            return Err(AppError::BadRequest(
                "No valid keys in license_key JSON".to_string(),
            ));
        }
        return Ok(pairs.join(","));
    }

    if let Some((a, b)) = s.split_once(':') {
        let a = a.trim();
        let b = b.trim();
        if a.len() == 32 && b.len() == 32 {
            // Keep input orientation as KID:KEY.
            return Ok(format!("{}:{}", a, b));
        }
    }
    Err(AppError::BadRequest(
        "Unsupported license_key format".to_string(),
    ))
}

#[derive(Debug, Clone)]
pub(super) struct ParsedEntry {
    pub(super) name: String,
    pub(super) logo_url: Option<String>,
    pub(super) drm_keys_hex: Option<String>,
    pub(super) stream_url: String,
    pub(super) group_title: Option<String>,
    pub(super) provider: Option<String>,
    #[allow(dead_code)]
    pub(super) tvg_id: Option<String>,
}

fn extract_attr_value(line: &str, key: &str) -> Option<String> {
    let quoted_needle = format!(r#"{}=""#, key);
    if let Some(pos) = line.find(&quoted_needle) {
        let start = pos + quoted_needle.len();
        if let Some(end) = line[start..].find('"') {
            let val = &line[start..start + end];
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }

    let plain_needle = format!("{}=", key);
    if let Some(pos) = line.find(&plain_needle) {
        let start = pos + plain_needle.len();
        let rest = &line[start..];
        let end = rest
            .find([' ', ','])
            .unwrap_or(rest.len());
        let val = rest[..end].trim_matches(|c| c == '"' || c == '\'');
        if !val.is_empty() {
            return Some(val.to_string());
        }
    }

    None
}

fn looks_like_stream_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let supported_hints = [
        ".m3u8", ".mpd", ".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v", ".mpeg", ".flv", ".vob",
    ];
    supported_hints.iter().any(|hint| lower.contains(hint))
}

fn derive_title_from_url(url: &str, index: usize) -> String {
    let clean = url
        .split('#')
        .next()
        .unwrap_or(url)
        .split('?')
        .next()
        .unwrap_or(url);

    let file_name = clean.rsplit('/').next().unwrap_or("").trim();
    if file_name.is_empty() {
        return format!("Imported {}", index + 1);
    }

    let stem = file_name
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(file_name);
    let normalized = stem
        .replace(['_', '-', '.'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if normalized.is_empty() {
        format!("Imported {}", index + 1)
    } else {
        normalized
    }
}

fn parse_url_only_bulk(text: &str) -> Vec<ParsedEntry> {
    let mut entries = Vec::new();
    let mut seen_urls = HashSet::new();

    for (idx, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if !(line.starts_with("http://") || line.starts_with("https://")) {
            continue;
        }
        if !looks_like_stream_url(line) {
            continue;
        }
        if !seen_urls.insert(line.to_string()) {
            continue;
        }

        entries.push(ParsedEntry {
            name: derive_title_from_url(line, idx),
            logo_url: None,
            drm_keys_hex: None,
            stream_url: line.to_string(),
            group_title: None,
            provider: None,
            tvg_id: None,
        });
    }

    entries
}

pub(super) fn parse_m3u_bulk(text: &str) -> Result<Vec<ParsedEntry>, AppError> {
    let mut entries = Vec::new();
    let mut lines = text.lines().map(|l| l.trim().to_string()).peekable();

    while let Some(line) = lines.next() {
        if line.is_empty() || !line.starts_with("#EXTINF") {
            continue;
        }

        let mut name: Option<String> = None;
        let mut logo_url: Option<String> = None;
        let mut group_title: Option<String> = None;
        let mut provider: Option<String> = None;
        let mut tvg_id: Option<String> = None;

        if let Some(gt) = extract_attr_value(&line, "group-title") {
            group_title = Some(gt);
        }
        if let Some(p) = extract_attr_value(&line, "provider") {
            provider = Some(p);
        }
        if let Some(tid) = extract_attr_value(&line, "tvg-id") {
            tvg_id = Some(tid);
        }

        if let Some(idx) = line.rfind(',') {
            let t = line[idx + 1..].trim();
            if !t.is_empty() {
                name = Some(t.to_string());
            }
        }

        if let Some(val) = extract_attr_value(&line, "tvg-name") {
            if name.is_none() && !val.is_empty() {
                name = Some(val);
            }
        }
        if let Some(val) = extract_attr_value(&line, "tvg-logo") {
            if !val.is_empty() {
                logo_url = Some(val);
            }
        }

        let mut drm_keys_hex: Option<String> = None;
        let mut current_license_type: Option<String> = None;
        let mut stream_url: Option<String> = None;
        while let Some(peek) = lines.peek().cloned() {
            if peek.is_empty() {
                lines.next();
                continue;
            }
            if peek.starts_with('#') {
                if peek.contains("license_type=")
                    || peek.contains("inputstream.adaptive.license_type=")
                {
                    if let Some(eq_pos) = peek.find('=') {
                        let val = peek[eq_pos + 1..].trim().trim_matches('"').to_string();
                        if !val.is_empty() {
                            current_license_type = Some(val);
                        }
                    }
                }
                if (peek.contains("license_key=")
                    || peek.contains("inputstream.adaptive.license_key="))
                    && current_license_type
                        .as_deref()
                        .map(|s| s.to_lowercase().contains("clearkey"))
                        .unwrap_or(false)
                {
                    let eq_pos = match peek.find('=') {
                        Some(pos) => pos + 1,
                        None => {
                            lines.next();
                            continue;
                        }
                    };
                    let raw = peek[eq_pos..]
                        .trim()
                        .trim_matches(|c| c == '"' || c == '\'');
                    let parsed = parse_license_key_to_hex_pairs(raw)?;
                    drm_keys_hex = Some(parsed);
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
        entries.push(ParsedEntry {
            name,
            logo_url,
            drm_keys_hex,
            stream_url,
            group_title,
            provider,
            tvg_id,
        });
    }

    if entries.is_empty() {
        let fallback_entries = parse_url_only_bulk(text);
        if !fallback_entries.is_empty() {
            return Ok(fallback_entries);
        }
    }

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::{parse_license_key_to_hex_pairs, parse_m3u_bulk};

    #[test]
    fn parse_license_key_hex_pair_keeps_kid_key_order() {
        let kid = "c50f8758b7fb4bf886dd561a7cda6e84";
        let key = "0541856bd180caf65d26a9eaf33e0f24";
        let parsed = parse_license_key_to_hex_pairs(&format!("{kid}:{key}")).unwrap();
        assert_eq!(parsed, format!("{kid}:{key}"));
    }

    #[test]
    fn parse_license_key_json_map_keeps_kid_key_order() {
        let kid = "c50f8758b7fb4bf886dd561a7cda6e84";
        let key = "0541856bd180caf65d26a9eaf33e0f24";
        let parsed = parse_license_key_to_hex_pairs(&format!(r#"{{"{kid}":"{key}"}}"#)).unwrap();
        assert_eq!(parsed, format!("{kid}:{key}"));
    }

    #[test]
    fn parse_license_key_json_explicit_fields() {
        let kid = "c50f8758b7fb4bf886dd561a7cda6e84";
        let key = "0541856bd180caf65d26a9eaf33e0f24";
        let parsed =
            parse_license_key_to_hex_pairs(&format!(r#"{{"kid":"{kid}","key":"{key}"}}"#)).unwrap();
        assert_eq!(parsed, format!("{kid}:{key}"));
    }

    #[test]
    fn parse_m3u_with_blank_line_before_url() {
        let text = r#"
#EXTM3U
#EXTINF:-1 tvg-name="Movie One",Movie One

https://cdn.example.com/movie-one.m3u8
"#;

        let entries = parse_m3u_bulk(text).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Movie One");
        assert_eq!(
            entries[0].stream_url,
            "https://cdn.example.com/movie-one.m3u8"
        );
    }

    #[test]
    fn parse_m3u_accepts_unquoted_attrs() {
        let text = r#"
#EXTM3U
#EXTINF:-1 tvg-name=MovieTwo group-title=Series,MovieTwo
https://cdn.example.com/movie-two.m3u8
"#;

        let entries = parse_m3u_bulk(text).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "MovieTwo");
        assert_eq!(entries[0].group_title.as_deref(), Some("Series"));
    }

    #[test]
    fn parse_url_only_playlist_fallback() {
        let text = r#"
#EXTM3U
https://cdn.example.com/alpha.m3u8
https://cdn.example.com/beta.mpd
"#;

        let entries = parse_m3u_bulk(text).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].stream_url, "https://cdn.example.com/alpha.m3u8");
        assert_eq!(entries[1].stream_url, "https://cdn.example.com/beta.mpd");
    }
}
