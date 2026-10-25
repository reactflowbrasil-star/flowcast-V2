use super::*;
use regex::Regex;
use std::path::Path;

impl ContentService {
    pub(super) fn normalize_title(value: &str) -> String {
        let mut normalized = String::with_capacity(value.len());
        for ch in value.chars() {
            if ch.is_ascii_alphanumeric() {
                normalized.push(ch.to_ascii_lowercase());
            } else {
                normalized.push(' ');
            }
        }
        normalized.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    pub(super) fn strip_numeric_prefix_token(value: &str) -> String {
        let tokens: Vec<&str> = value.split_whitespace().collect();
        if tokens.len() >= 2 && tokens[0].chars().all(|c| c.is_ascii_digit()) {
            tokens[1..].join(" ")
        } else {
            value.to_string()
        }
    }

    pub(super) fn parse_year_str(value: Option<&String>) -> Option<i64> {
        value
            .and_then(|s| s.split('-').next())
            .and_then(|y| y.parse::<i64>().ok())
    }

    pub(super) fn extract_year_hint(value: &str) -> Option<i64> {
        let mut buffer = String::new();
        for ch in value.chars() {
            if ch.is_ascii_digit() {
                buffer.push(ch);
                if buffer.len() == 4 {
                    if let Ok(year) = buffer.parse::<i64>() {
                        if (1900..=2100).contains(&year) {
                            return Some(year);
                        }
                    }
                    buffer.clear();
                }
            } else {
                buffer.clear();
            }
        }
        None
    }

    pub(super) fn pick_best_movie_match(
        title: &str,
        year: Option<i64>,
        results: &[TmdbSearchResult],
    ) -> Option<i64> {
        let query_norm = Self::normalize_title(title);
        let query_norm_stripped = Self::strip_numeric_prefix_token(&query_norm);
        let mut best: Option<(i64, i32)> = None;

        for candidate in results {
            let candidate_title = candidate
                .title
                .as_ref()
                .or(candidate.name.as_ref())
                .map(|s| s.as_str());
            let candidate_title = match candidate_title {
                Some(value) => value,
                None => continue,
            };
            let candidate_norm = Self::normalize_title(candidate_title);
            let candidate_norm_stripped = Self::strip_numeric_prefix_token(&candidate_norm);

            let mut score = 0;
            if candidate_norm == query_norm {
                score += 4;
            }

            if !query_norm_stripped.is_empty() && candidate_norm == query_norm_stripped {
                score += 3;
            }

            if !query_norm_stripped.is_empty()
                && (candidate_norm_stripped.contains(&query_norm_stripped)
                    || query_norm_stripped.contains(&candidate_norm_stripped))
            {
                score += 2;
            } else if candidate_norm.contains(&query_norm) || query_norm.contains(&candidate_norm) {
                score += 1;
            }

            if let Some(q_year) = year {
                if let Some(c_year) = Self::parse_year_str(candidate.release_date.as_ref()) {
                    if c_year == q_year {
                        score += 3;
                    } else if (c_year - q_year).abs() <= 1 {
                        score += 1;
                    }
                }
            }

            match best {
                Some((_, best_score)) if score <= best_score => {}
                _ => best = Some((candidate.id, score)),
            }
        }

        match best {
            Some((id, score)) if score >= 2 => Some(id),
            _ => None,
        }
    }

    pub(super) fn pick_best_tv_match(title: &str, results: &[TmdbSearchResult]) -> Option<i64> {
        let query_norm = Self::normalize_title(title);
        let query_norm_stripped = Self::strip_numeric_prefix_token(&query_norm);
        let year_hint = Self::extract_year_hint(title);
        let mut best: Option<(i64, i32)> = None;

        for candidate in results {
            let candidate_title = candidate
                .name
                .as_ref()
                .or(candidate.title.as_ref())
                .map(|s| s.as_str());
            let candidate_title = match candidate_title {
                Some(value) => value,
                None => continue,
            };
            let candidate_norm = Self::normalize_title(candidate_title);
            let candidate_norm_stripped = Self::strip_numeric_prefix_token(&candidate_norm);

            let mut score = 0;
            if candidate_norm == query_norm {
                score += 4;
            }

            if !query_norm_stripped.is_empty() && candidate_norm == query_norm_stripped {
                score += 3;
            }

            if !query_norm_stripped.is_empty()
                && (candidate_norm_stripped.contains(&query_norm_stripped)
                    || query_norm_stripped.contains(&candidate_norm_stripped))
            {
                score += 2;
            } else if candidate_norm.contains(&query_norm) || query_norm.contains(&candidate_norm) {
                score += 1;
            }

            if let Some(hint) = year_hint {
                if let Some(c_year) = Self::parse_year_str(candidate.first_air_date.as_ref()) {
                    if c_year == hint {
                        score += 2;
                    } else if (c_year - hint).abs() <= 1 {
                        score += 1;
                    }
                }
            }

            match best {
                Some((_, best_score)) if score <= best_score => {}
                _ => best = Some((candidate.id, score)),
            }
        }

        match best {
            Some((id, score)) if score >= 2 => Some(id),
            _ => None,
        }
    }

    pub(super) fn derive_series_title_from_path(&self, video_path: &Path) -> String {
        // Series root dir name either parent or grandparent, depending on structures
        // Example: Trace_[tmdbid-70625]/Season_01/EP17/Trace_S01E17.mp4
        // => series root directory = Trace_[tmdbid-70625]
        // Example: Breaking Bad (2008)/Season 1/Breaking Bad S01E01.mp4
        // => series root directory = Breaking Bad (2008) -> "Breaking Bad (2008)"
        let mut current = video_path.parent();
        let mut candidates: Vec<String> = Vec::new();
        for _ in 0..3 {
            if let Some(dir) = current {
                if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
                    candidates.push(name.to_string());
                }
                current = dir.parent();
            } else {
                break;
            }
        }
        // Choose the first candidate that does not look like Season_*, EP*, or S##E##
        let re_se_folder = Regex::new(r"(?i)^S\d{1,2}E\d{1,3}$").unwrap();
        let re_tmdb_tag = Regex::new(r"(?i)\[tmdbid-\d+\]").unwrap();
        let re_year = Regex::new(r"\s*\((\d{4})\)\s*$").unwrap();
        for c in candidates {
            let c_lower = c.to_lowercase();
            // Skip folders that are Season_*, Temporada *, Saison *, Staffel *, EP*, S##, or exactly S##E## format
            if !c_lower.starts_with("season")
                && !RE_SEASON_WORD.is_match(&c)
                && !RE_SEASON_S_DIR.is_match(&c)
                && !c_lower.starts_with("ep")
                && !re_se_folder.is_match(&c)
            {
                // Remove tmdb tag first
                let cleaned = re_tmdb_tag
                    .replace_all(&c, "")
                    .trim()
                    .trim_matches('_')
                    .replace('_', " ");
                // Remove year in parentheses at the end for cleaner TMDB search
                let cleaned = re_year.replace_all(&cleaned, "").trim().to_string();
                // Strip release noise (codec, resolution, release group tags)
                let cleaned = Self::clean_title_noise(&cleaned);
                return if cleaned.is_empty() { c } else { cleaned };
            }
        }
        "Unknown Series".to_string()
    }

    pub(super) fn detect_season_episode(&self, video_path: &Path) -> (i32, i32) {
        let mut season_no = 1;
        let mut episode_no = 1;
        let fname = video_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let fstem = video_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        // 1) S##E## in filename (highest priority: "S01E03 - Title.mkv")
        if let Some(cap) = RE_SE.captures(fname) {
            if let (Some(s), Some(e)) = (cap.get(1), cap.get(2)) {
                season_no = s.as_str().parse::<i32>().unwrap_or(1);
                episode_no = e.as_str().parse::<i32>().unwrap_or(1);
                let final_season = self.detect_season_from_dirs(video_path, season_no);
                return (final_season, episode_no);
            }
        }

        // 2) S##E## in parent directory (e.g., /S01E01/video.mkv)
        if let Some(parent) = video_path.parent() {
            let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if let Some(cap) = RE_SE.captures(parent_name) {
                if let (Some(s), Some(e)) = (cap.get(1), cap.get(2)) {
                    season_no = s.as_str().parse::<i32>().unwrap_or(1);
                    episode_no = e.as_str().parse::<i32>().unwrap_or(1);
                    return (season_no, episode_no);
                }
            }
        }

        // 3) ##x## in filename ("1x03", "01x12")
        if let Some(cap) = RE_SE_X.captures(fname) {
            if let (Some(s), Some(e)) = (cap.get(1), cap.get(2)) {
                season_no = s.as_str().parse::<i32>().unwrap_or(1);
                episode_no = e.as_str().parse::<i32>().unwrap_or(1);
                let final_season = self.detect_season_from_dirs(video_path, season_no);
                return (final_season, episode_no);
            }
        }

        // ── Episode number fallback chain (no season info in filename) ──
        let mut found_ep = false;

        // 4) EP## in filename ("EP03 - Title.mkv", "ep17.mkv")
        if let Some(cap) = RE_EP_ONLY.captures(fname) {
            episode_no = cap
                .get(1)
                .and_then(|m| m.as_str().parse::<i32>().ok())
                .unwrap_or(1);
            found_ep = true;
        }

        // 5) "Episode N" / "Episodio N" / "Capitulo N" / "Folge N" in filename
        if !found_ep {
            if let Some(cap) = RE_EPISODE_WORD.captures(fname) {
                episode_no = cap
                    .get(1)
                    .and_then(|m| m.as_str().parse::<i32>().ok())
                    .unwrap_or(1);
                found_ep = true;
            }
        }

        // 6) Anime absolute numbering: " - 03 " pattern ("[SubGroup] Title - 142 [1080p].mkv")
        if !found_ep {
            if let Some(cap) = RE_ANIME_EP.captures(fname) {
                episode_no = cap
                    .get(1)
                    .and_then(|m| m.as_str().parse::<i32>().ok())
                    .unwrap_or(1);
                found_ep = true;
            }
        }

        // 7) ##x## in parent directory name
        if !found_ep {
            if let Some(parent) = video_path.parent() {
                let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
                if let Some(cap) = RE_SE_X.captures(parent_name) {
                    if let (Some(s), Some(e)) = (cap.get(1), cap.get(2)) {
                        season_no = s.as_str().parse::<i32>().unwrap_or(1);
                        episode_no = e.as_str().parse::<i32>().unwrap_or(1);
                        found_ep = true;
                    }
                }
            }
        }

        // 8) EP## in parent directory name
        if !found_ep {
            if let Some(parent) = video_path.parent() {
                let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
                if let Some(cap) = RE_EP_ONLY.captures(parent_name) {
                    episode_no = cap
                        .get(1)
                        .and_then(|m| m.as_str().parse::<i32>().ok())
                        .unwrap_or(1);
                    found_ep = true;
                }
            }
        }

        // 9) Leading number in filename stem ("01 - Title.mkv", "03.Title.mkv")
        if !found_ep {
            if let Some(cap) = RE_LEADING_NUM.captures(fstem) {
                episode_no = cap
                    .get(1)
                    .and_then(|m| m.as_str().parse::<i32>().ok())
                    .unwrap_or(1);
                if episode_no <= 999 {
                    found_ep = true;
                } else {
                    episode_no = 1;
                }
            }
        }

        // 10) Trailing number before extension ("Title_03.mkv", "Title.03.mkv")
        if !found_ep {
            if let Some(cap) = RE_TRAILING_NUM.captures(fstem) {
                episode_no = cap
                    .get(1)
                    .and_then(|m| m.as_str().parse::<i32>().ok())
                    .unwrap_or(1);
                if episode_no <= 999 {
                    found_ep = true;
                } else {
                    episode_no = 1;
                }
            }
        }

        // 11) Last number group in filename (ultimate fallback)
        if !found_ep {
            // Strip known noise (year, resolution, codec) before extracting
            let cleaned = Self::clean_title_noise(fstem);
            if let Some(cap) = RE_LAST_NUM.captures(&cleaned) {
                let n = cap
                    .get(1)
                    .and_then(|m| m.as_str().parse::<i32>().ok())
                    .unwrap_or(0);
                // Only use if sane episode number (1-999) and not a year
                if n > 0 && n <= 999 {
                    episode_no = n;
                }
            }
        }

        // ── Season number detection ──
        season_no = self.detect_season_from_dirs(video_path, season_no);
        (season_no, episode_no)
    }

    /// Detect season number from parent/grandparent directories.
    /// Checks Season_*, Temporada *, Saison *, Staffel *, S## folder patterns.
    fn detect_season_from_dirs(&self, video_path: &Path, default: i32) -> i32 {
        if let Some(parent) = video_path.parent() {
            let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");

            // Check parent for season patterns
            if let Some(s) = Self::extract_season_number(parent_name) {
                return s;
            }

            // Check grandparent
            if let Some(pp) = parent.parent() {
                let ppn = pp.file_name().and_then(|s| s.to_str()).unwrap_or("");
                if let Some(s) = Self::extract_season_number(ppn) {
                    return s;
                }
            }
        }
        default
    }

    /// Try all season folder patterns on a directory name.
    fn extract_season_number(dir_name: &str) -> Option<i32> {
        // "Season 01", "Season_1"
        if let Some(cap) = RE_SEASON_DIR.captures(dir_name) {
            return cap.get(1).and_then(|m| m.as_str().parse::<i32>().ok());
        }
        // "Temporada 1", "Saison 02", "Staffel 3", "Stagione 1"
        if let Some(cap) = RE_SEASON_WORD.captures(dir_name) {
            return cap.get(1).and_then(|m| m.as_str().parse::<i32>().ok());
        }
        // "S01", "S1" (standalone folder, not S01E01)
        if let Some(cap) = RE_SEASON_S_DIR.captures(dir_name) {
            return cap.get(1).and_then(|m| m.as_str().parse::<i32>().ok());
        }
        None
    }

    pub(super) fn derive_movie_title_year(&self, video_path: &Path) -> (String, Option<i64>) {
        let fname = video_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        // Extract year in parentheses
        let year = RE_YEAR
            .captures(fname)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<i64>().ok());

        // Remove tmdb tag, year in parentheses, and normalize
        let title = RE_TMDB_TAG.replace_all(fname, "");
        let title = RE_YEAR_CLEAN
            .replace_all(&title, "")
            .replace(['.', '_'], " ")
            .trim()
            .to_string();

        // Strip release noise for cleaner TMDB search
        let title = Self::clean_title_noise(&title);

        (
            if title.is_empty() {
                fname.to_string()
            } else {
                title
            },
            year,
        )
    }

    /// Strip resolution, codec, release, audio, and bracketed noise tags from a title.
    /// Produces a cleaned string suitable for TMDB searching.
    pub(super) fn clean_title_noise(title: &str) -> String {
        let mut cleaned = title.to_string();
        // Remove bracketed groups like [SubGroup], [1080p], [HEVC] but preserve TMDB tags (already stripped elsewhere)
        cleaned = RE_BRACKETED.replace_all(&cleaned, "").to_string();
        // Remove resolution, codec, release, audio tags
        cleaned = RE_RESOLUTION.replace_all(&cleaned, "").to_string();
        cleaned = RE_CODEC.replace_all(&cleaned, "").to_string();
        cleaned = RE_RELEASE_NOISE.replace_all(&cleaned, "").to_string();
        cleaned = RE_AUDIO_TAGS.replace_all(&cleaned, "").to_string();
        // Clean up residual separators/whitespace
        cleaned = cleaned
            .replace(" - ", " ")
            .replace("  ", " ")
            .trim_matches(|c: char| c == ' ' || c == '-' || c == '.' || c == '_')
            .to_string();
        // Collapse multiple spaces
        cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
    }
}
