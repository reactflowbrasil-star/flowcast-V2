use super::*;
use std::path::{Path, PathBuf};

impl ContentService {
    async fn list_srt_files(dir: PathBuf) -> Result<Vec<PathBuf>, AppError> {
        tokio::task::spawn_blocking(move || {
            let mut files = Vec::new();
            for ent in std::fs::read_dir(&dir)? {
                let ent = ent?;
                let p = ent.path();
                if p.extension()
                    .and_then(|s| s.to_str())
                    .map(|s| s.eq_ignore_ascii_case("srt"))
                    .unwrap_or(false)
                {
                    files.push(p);
                }
            }
            Ok::<_, std::io::Error>(files)
        })
        .await
        .map_err(|e| AppError::InternalError(format!("List subtitles join error: {}", e)))?
        .map_err(|e| AppError::BadRequest(format!("Read dir error: {}", e)))
    }

    async fn detect_language_from_content_async(file_path: PathBuf) -> Option<String> {
        let file_path_log = file_path.clone();
        match tokio::task::spawn_blocking(move || Self::detect_language_from_content(&file_path))
            .await
        {
            Ok(result) => result,
            Err(err) => {
                tracing::warn!(
                    "⚠️  [SUBTITLE-LANG] Language detection task failed for {:?}: {}",
                    file_path_log,
                    err
                );
                None
            }
        }
    }

    pub(super) async fn add_episode_subtitles_from_dir(
        &self,
        episode_id: i64,
        video_path: &Path,
    ) -> Result<i32, AppError> {
        let mut count = 0;
        let dir = match video_path.parent() {
            Some(d) => d,
            None => return Ok(0),
        };
        let video_stem = video_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let srt_files = Self::list_srt_files(dir.to_path_buf()).await?;
        for p in srt_files {
            // Match by prefix (same basename or starts_with)
            let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if name.starts_with(&video_stem) || Self::strip_lang_from_end(name) == video_stem {
                // Try to detect language from filename first
                let lang = if let Some(lang) = Self::extract_lang_from_filename(&p) {
                    lang
                } else {
                    tracing::info!(
                        "🔍 [SUBTITLE-LANG] Filename detection failed for {:?}, analyzing content...",
                        p
                    );
                    Self::detect_language_from_content_async(p.clone())
                        .await
                        .unwrap_or_else(|| {
                            tracing::warn!(
                                "⚠️  [SUBTITLE-LANG] Could not detect language for {:?}, defaulting to 'und'",
                                p
                            );
                            "und".to_string()
                        })
                };

                tracing::info!(
                    "✅ [SUBTITLE-LANG] Detected language '{}' for {:?}",
                    lang,
                    p
                );
                self.add_episode_subtitle(episode_id, &lang, &p).await?;
                count += 1;
            }
        }
        Ok(count)
    }

    pub(super) async fn add_movie_subtitles_from_dir(
        &self,
        content_id: i64,
        video_path: &Path,
    ) -> Result<i32, AppError> {
        let mut count = 0;
        let dir = match video_path.parent() {
            Some(d) => d,
            None => return Ok(0),
        };
        let video_stem = video_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let srt_files = Self::list_srt_files(dir.to_path_buf()).await?;
        for p in srt_files {
            // Match by prefix (same basename or starts_with)
            let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if name.starts_with(&video_stem) || Self::strip_lang_from_end(name) == video_stem {
                // Try to detect language from filename first
                let lang = if let Some(lang) = Self::extract_lang_from_filename(&p) {
                    lang
                } else {
                    tracing::info!(
                        "🔍 [SUBTITLE-LANG] Filename detection failed for {:?}, analyzing content...",
                        p
                    );
                    Self::detect_language_from_content_async(p.clone())
                        .await
                        .unwrap_or_else(|| {
                            tracing::warn!(
                                "⚠️  [SUBTITLE-LANG] Could not detect language for {:?}, defaulting to 'und'",
                                p
                            );
                            "und".to_string()
                        })
                };

                tracing::info!(
                    "✅ [SUBTITLE-LANG] Detected language '{}' for {:?}",
                    lang,
                    p
                );
                self.add_content_subtitle(content_id, &lang, &p).await?;
                count += 1;
            }
        }
        Ok(count)
    }

    fn strip_lang_from_end(name: &str) -> String {
        // e.g. "Movie (2011).en" -> "Movie (2011)"
        if let Some(idx) = name.rfind('.') {
            name[..idx].to_string()
        } else {
            name.to_string()
        }
    }

    fn extract_lang_from_filename(path: &Path) -> Option<String> {
        // Detect language code from various filename patterns:
        // "Title (2011).en.srt" => "en"
        // "Trace_S01E17.fr.srt" => "fr"
        // "Movie.Spanish.srt" => "es"
        // "Movie[en].srt" => "en"
        // "Movie (English).srt" => "en"
        // "Movie.spa.srt" => "es"

        let stem = path.file_stem()?.to_str()?;
        let stem_lower = stem.to_lowercase();

        // Pattern 1: Standard dot notation (Movie.en.srt, Movie.spa.srt)
        if let Some(idx) = stem.rfind('.') {
            let potential_lang = stem[idx + 1..].to_lowercase();
            if (2..=5).contains(&potential_lang.len()) {
                // Normalize common 3-letter codes to 2-letter
                let normalized = Self::normalize_language_code(&potential_lang);
                return Some(normalized);
            }
        }

        // Pattern 2: Bracketed notation (Movie[en].srt, Movie[English].srt)
        if let Some(start) = stem_lower.rfind('[') {
            if let Some(end) = stem_lower[start..].find(']') {
                let lang_part = &stem_lower[start + 1..start + end];
                let normalized = Self::normalize_language_code(lang_part);
                return Some(normalized);
            }
        }

        // Pattern 3: Parentheses notation (Movie (English).srt, Movie (Spanish).srt)
        if let Some(start) = stem_lower.rfind('(') {
            if let Some(end) = stem_lower[start..].find(')') {
                let lang_part = &stem_lower[start + 1..start + end].trim();
                let normalized = Self::normalize_language_code(lang_part);
                return Some(normalized);
            }
        }

        // Pattern 4: Full language names anywhere in filename
        // Check for common language names
        let language_map = [
            ("spanish", "es"),
            ("español", "es"),
            ("spa", "es"),
            ("english", "en"),
            ("eng", "en"),
            ("french", "fr"),
            ("français", "fr"),
            ("francais", "fr"),
            ("fre", "fr"),
            ("fra", "fr"),
            ("german", "de"),
            ("deutsch", "de"),
            ("ger", "de"),
            ("deu", "de"),
            ("italian", "it"),
            ("italiano", "it"),
            ("ita", "it"),
            ("portuguese", "pt"),
            ("português", "pt"),
            ("portugues", "pt"),
            ("por", "pt"),
            ("russian", "ru"),
            ("русский", "ru"),
            ("rus", "ru"),
            ("chinese", "zh"),
            ("中文", "zh"),
            ("chi", "zh"),
            ("zho", "zh"),
            ("japanese", "ja"),
            ("日本語", "ja"),
            ("jpn", "ja"),
            ("korean", "ko"),
            ("한국어", "ko"),
            ("kor", "ko"),
            ("arabic", "ar"),
            ("العربية", "ar"),
            ("ara", "ar"),
            ("dutch", "nl"),
            ("nederlands", "nl"),
            ("nld", "nl"),
            ("dut", "nl"),
            ("polish", "pl"),
            ("polski", "pl"),
            ("pol", "pl"),
            ("turkish", "tr"),
            ("türkçe", "tr"),
            ("turkce", "tr"),
            ("tur", "tr"),
            ("swedish", "sv"),
            ("svenska", "sv"),
            ("swe", "sv"),
            ("norwegian", "no"),
            ("norsk", "no"),
            ("nor", "no"),
            ("danish", "da"),
            ("dansk", "da"),
            ("dan", "da"),
            ("finnish", "fi"),
            ("suomi", "fi"),
            ("fin", "fi"),
            ("greek", "el"),
            ("ελληνικά", "el"),
            ("ell", "el"),
            ("gre", "el"),
            ("czech", "cs"),
            ("čeština", "cs"),
            ("cestina", "cs"),
            ("ces", "cs"),
            ("cze", "cs"),
            ("hungarian", "hu"),
            ("magyar", "hu"),
            ("hun", "hu"),
            ("romanian", "ro"),
            ("română", "ro"),
            ("romana", "ro"),
            ("ron", "ro"),
            ("rum", "ro"),
            ("bulgarian", "bg"),
            ("български", "bg"),
            ("bul", "bg"),
            ("croatian", "hr"),
            ("hrvatski", "hr"),
            ("hrv", "hr"),
            ("serbian", "sr"),
            ("српски", "sr"),
            ("srp", "sr"),
            ("ukrainian", "uk"),
            ("українська", "uk"),
            ("ukr", "uk"),
            ("hindi", "hi"),
            ("हिन्दी", "hi"),
            ("hin", "hi"),
            ("thai", "th"),
            ("ไทย", "th"),
            ("tha", "th"),
            ("vietnamese", "vi"),
            ("tiếng việt", "vi"),
            ("vie", "vi"),
            ("indonesian", "id"),
            ("bahasa indonesia", "id"),
            ("ind", "id"),
            ("malay", "ms"),
            ("bahasa melayu", "ms"),
            ("may", "ms"),
            ("msa", "ms"),
        ];

        for (name, code) in &language_map {
            if stem_lower.contains(name) {
                return Some(code.to_string());
            }
        }

        None
    }

    /// Detect language from subtitle file content using whatlang library
    fn detect_language_from_content(file_path: &Path) -> Option<String> {
        use whatlang::{detect, Lang};

        // Read first 5000 characters of the subtitle file for language detection
        let content = match std::fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => return None,
        };

        // Extract text content from subtitle file (skip timestamps and numbers)
        let mut text_lines = Vec::new();
        for line in content.lines() {
            let line = line.trim();

            // Skip empty lines, numbers, and timestamp lines
            if line.is_empty() || line.parse::<i32>().is_ok() || line.contains("-->") {
                continue;
            }

            // Skip WEBVTT header
            if line.starts_with("WEBVTT") || line.starts_with("NOTE") {
                continue;
            }

            text_lines.push(line);

            // Limit to first 100 lines for performance
            if text_lines.len() >= 100 {
                break;
            }
        }

        let sample_text = text_lines.join(" ");

        // Need at least 50 characters for reliable detection
        if sample_text.len() < 50 {
            return None;
        }

        // Detect language
        let info = detect(&sample_text)?;

        // Map whatlang Lang to ISO 639-1 codes
        let lang_code = match info.lang() {
            Lang::Eng => "en",
            Lang::Spa => "es",
            Lang::Fra => "fr",
            Lang::Deu => "de",
            Lang::Ita => "it",
            Lang::Por => "pt",
            Lang::Rus => "ru",
            Lang::Jpn => "ja",
            Lang::Kor => "ko",
            Lang::Cmn => "zh", // Mandarin Chinese
            Lang::Ara => "ar",
            Lang::Tur => "tr",
            Lang::Nld => "nl",
            Lang::Pol => "pl",
            Lang::Swe => "sv",
            Lang::Dan => "da",
            Lang::Fin => "fi",
            Lang::Ell => "el", // Greek
            Lang::Ces => "cs", // Czech
            Lang::Hun => "hu",
            Lang::Ron => "ro", // Romanian
            Lang::Bul => "bg",
            Lang::Hrv => "hr", // Croatian
            Lang::Srp => "sr", // Serbian
            Lang::Ukr => "uk",
            Lang::Heb => "he",
            Lang::Hin => "hi",
            Lang::Tha => "th",
            Lang::Vie => "vi",
            Lang::Ind => "id",
            Lang::Ben => "bn",
            Lang::Kat => "ka", // Georgian
            Lang::Hye => "hy", // Armenian
            Lang::Aze => "az",
            Lang::Bel => "be",
            Lang::Cat => "ca",
            Lang::Est => "et",
            Lang::Lav => "lv",
            Lang::Lit => "lt",
            Lang::Mkd => "mk",
            Lang::Pes => "fa", // Persian
            Lang::Tam => "ta",
            Lang::Tel => "te",
            Lang::Kan => "kn",
            Lang::Mal => "ml",
            Lang::Mar => "mr",
            Lang::Guj => "gu",
            Lang::Nep => "ne",
            Lang::Sin => "si",
            Lang::Khm => "km",
            Lang::Mya => "my",
            Lang::Uzb => "uz",
            Lang::Slk => "sk",
            Lang::Slv => "sl",
            Lang::Afr => "af",
            Lang::Amh => "am",
            Lang::Tgl => "tl", // Tagalog
            Lang::Urd => "ur",
            Lang::Pan => "pa",
            _ => return None,
        };

        // Only return if confidence is high enough (> 0.7)
        if info.confidence() > 0.7 {
            Some(lang_code.to_string())
        } else {
            None
        }
    }

    fn normalize_language_code(code: &str) -> String {
        // Normalize common 3-letter ISO 639-2 codes to 2-letter ISO 639-1 codes
        let code_lower = code.to_lowercase();
        match code_lower.as_str() {
            // Common 3-letter to 2-letter mappings
            "eng" => "en".to_string(),
            "spa" => "es".to_string(),
            "fre" | "fra" => "fr".to_string(),
            "ger" | "deu" => "de".to_string(),
            "ita" => "it".to_string(),
            "por" => "pt".to_string(),
            "rus" => "ru".to_string(),
            "chi" | "zho" => "zh".to_string(),
            "jpn" => "ja".to_string(),
            "kor" => "ko".to_string(),
            "ara" => "ar".to_string(),
            "dut" | "nld" => "nl".to_string(),
            "pol" => "pl".to_string(),
            "tur" => "tr".to_string(),
            "swe" => "sv".to_string(),
            "nor" => "no".to_string(),
            "dan" => "da".to_string(),
            "fin" => "fi".to_string(),
            "gre" | "ell" => "el".to_string(),
            "cze" | "ces" => "cs".to_string(),
            "hun" => "hu".to_string(),
            "rum" | "ron" => "ro".to_string(),
            "bul" => "bg".to_string(),
            "hrv" => "hr".to_string(),
            "srp" => "sr".to_string(),
            "ukr" => "uk".to_string(),
            "hin" => "hi".to_string(),
            "tha" => "th".to_string(),
            "vie" => "vi".to_string(),
            "ind" => "id".to_string(),
            "may" | "msa" => "ms".to_string(),

            // Full language names to codes
            "english" => "en".to_string(),
            "spanish" | "español" => "es".to_string(),
            "french" | "français" | "francais" => "fr".to_string(),
            "german" | "deutsch" => "de".to_string(),
            "italian" | "italiano" => "it".to_string(),
            "portuguese" | "português" | "portugues" => "pt".to_string(),
            "russian" | "русский" => "ru".to_string(),
            "chinese" | "中文" => "zh".to_string(),
            "japanese" | "日本語" => "ja".to_string(),
            "korean" | "한국어" => "ko".to_string(),
            "arabic" | "العربية" => "ar".to_string(),
            "dutch" | "nederlands" => "nl".to_string(),
            "polish" | "polski" => "pl".to_string(),
            "turkish" | "türkçe" | "turkce" => "tr".to_string(),
            "swedish" | "svenska" => "sv".to_string(),
            "norwegian" | "norsk" => "no".to_string(),
            "danish" | "dansk" => "da".to_string(),
            "finnish" | "suomi" => "fi".to_string(),
            "greek" | "ελληνικά" => "el".to_string(),
            "czech" | "čeština" | "cestina" => "cs".to_string(),
            "hungarian" | "magyar" => "hu".to_string(),
            "romanian" | "română" | "romana" => "ro".to_string(),
            "bulgarian" | "български" => "bg".to_string(),
            "croatian" | "hrvatski" => "hr".to_string(),
            "serbian" | "српски" => "sr".to_string(),
            "ukrainian" | "українська" => "uk".to_string(),
            "hindi" | "हिन्दी" => "hi".to_string(),
            "thai" | "ไทย" => "th".to_string(),
            "vietnamese" | "tiếng việt" => "vi".to_string(),
            "indonesian" | "bahasa indonesia" => "id".to_string(),
            "malay" | "bahasa melayu" => "ms".to_string(),

            // If already a 2-letter code or unknown, return as-is
            _ => code_lower,
        }
    }

    pub(super) async fn upsert_movie(
        &self,
        category: &Category,
        title: &str,
        year: Option<i64>,
        tmdb_id: Option<i64>,
        file_path: &Path,
        duplicate_policy: &str,
    ) -> Result<(i64, String), AppError> {
        // If TMDB provided, try to find existing by tmdb_id
        if let Some(tid) = tmdb_id {
            let query = format!("{} WHERE mc.category_id = $1 AND m.tmdb_id = $2 LIMIT 1", sql::CONTENT_JOIN_SELECT);
            if let Some(existing) = sqlx::query_as::<_, crate::models::ContentJoined>(&query)
            .bind(category.id)
            .bind(tid)
            .fetch_optional(&self.db)
            .await? {
                match duplicate_policy {
                    "replace" => {
                        sqlx::query(
                            r#"
                            INSERT INTO content.media_streams (media_content_id, stream_url, stream_type, is_default)
                            VALUES ($1, $2, 'primary', true)
                            ON CONFLICT (media_content_id, stream_type) 
                            DO UPDATE SET stream_url = EXCLUDED.stream_url
                            "#
                        )
                        .bind(existing.id)
                        .bind(file_path.to_string_lossy().to_string())
                        .execute(&self.db)
                        .await?;
                            
                        sqlx::query("UPDATE content.media_content SET active = true WHERE id = $1")
                            .bind(existing.id)
                            .execute(&self.db)
                            .await?;
                            
                        return Ok((existing.id, "replaced".to_string()));
                    }
                    "allow" => {
                        // Create another (duplicate allowed)
                        let created = self
                            .create_content_from_tmdb_with_stream(
                                category.id,
                                tid,
                                "movie",
                                &file_path.to_string_lossy(),
                            )
                            .await?;
                        return Ok((created.id, "created".to_string()));
                    }
                    _ => return Ok((existing.id, "skipped".to_string())),
                }
            }
        }

        // Fallback: look by title+year
        let query = format!("{} WHERE mc.category_id = $1 AND LOWER(mc.title) = LOWER($2) AND ($3 IS NULL OR m.year = $4) LIMIT 1", sql::CONTENT_JOIN_SELECT);
        if let Some(found) = sqlx::query_as::<_, crate::models::ContentJoined>(&query)
        .bind(category.id)
        .bind(title)
        .bind(year)
        .bind(year)
        .fetch_optional(&self.db)
        .await? {
            match duplicate_policy {
                "replace" => {
                    sqlx::query(
                        r#"
                        INSERT INTO content.media_streams (media_content_id, stream_url, stream_type, is_default)
                        VALUES ($1, $2, 'primary', true)
                        ON CONFLICT (media_content_id, stream_type) 
                        DO UPDATE SET stream_url = EXCLUDED.stream_url
                        "#
                    )
                    .bind(found.id)
                    .bind(file_path.to_string_lossy().to_string())
                    .execute(&self.db)
                    .await?;

                    sqlx::query("UPDATE content.media_content SET active = true WHERE id = $1")
                        .bind(found.id)
                        .execute(&self.db)
                        .await?;
                        
                    return Ok((found.id, "replaced".to_string()));
                }
                "allow" => {
                    // Create another record with same title/year
                }
                _ => return Ok((found.id, "skipped".to_string())),
            }
        }

        // Create new movie
        let stream_url = file_path.to_string_lossy().to_string();
        if let Some(tid) = tmdb_id {
            let created = self
                .create_content_from_tmdb(CreateContentFromTmdbRequest {
                    category_id: category.id,
                    tmdb_id: tid,
                    media_type: "movie".to_string(),
                    stream_url,
                    active: None,
                })
                .await?;
            Ok((created.id, "created".to_string()))
        } else {
            // Manual movie create
            let created = self
                .create_content_manual(CreateContentRequest {
                    category_id: category.id,
                    title: title.to_string(),
                    description: None,
                    image_url: None,
                    backdrop_url: None,
                    stream_url,
                    tmdb_id: None,
                    year,
                    genre: None,
                    provider: None,
                    country: None,
                    format: None,
                    channel_number: None,
                    is_live: None,
                    drm_keys: None,
                    drm_type: None,
                    license_server_url: None,
                    drm_headers: None,
                    origin: None,
                    user_agent: None,
                    referer: None,
                    custom_headers: None,
                    proxy_url: None,
                    doh_url: None,
                    duration: None,
                    rating: None,
                    quality: None,
                    language: None,
                    audio_languages: None,
                    epg_source_id: None,
                    epg_channel_id: None,
                    epg_offset_minutes: None,
                    active: None,
                })
                .await?;
            Ok((created.id, "created".to_string()))
        }
    }

    async fn create_content_from_tmdb_with_stream(
        &self,
        category_id: i64,
        tmdb_id: i64,
        media_type: &str,
        stream_path: &str,
    ) -> Result<crate::models::ContentJoined, AppError> {
        self.create_content_from_tmdb(CreateContentFromTmdbRequest {
            category_id,
            tmdb_id,
            media_type: media_type.to_string(),
            stream_url: stream_path.to_string(),
            active: None,
        })
        .await
    }

    pub(super) async fn find_series_by_tmdb_id(
        &self,
        tmdb_id: i64,
    ) -> Result<Option<(i64, i64, Option<i64>)>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT s.id as sid, c.id as cid, c.tmdb_id as ctmdb
            FROM content.series s
            JOIN content.media_content c ON s.content_id = c.id
            WHERE c.tmdb_id = $1
            LIMIT 1
            "#,
        )
        .bind(tmdb_id)
        .fetch_optional(&self.db)
        .await?;

        Ok(row.map(|r| {
            let sid: i64 = r.get("sid");
            let cid: i64 = r.get("cid");
            let c_tmdb: Option<i64> = r.get("ctmdb");
            (sid, cid, c_tmdb)
        }))
    }

    pub(super) async fn find_series_by_title(
        &self,
        title: &str,
    ) -> Result<Option<(i64, i64, Option<i64>)>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT s.id as sid, c.id as cid, c.tmdb_id as ctmdb
            FROM content.series s
            JOIN content.media_content c ON s.content_id = c.id
            WHERE LOWER(c.title) = LOWER($1)
            LIMIT 1
            "#,
        )
        .bind(title)
        .fetch_optional(&self.db)
        .await?;

        Ok(row.map(|r| {
            let sid: i64 = r.get("sid");
            let cid: i64 = r.get("cid");
            let c_tmdb: Option<i64> = r.get("ctmdb");
            (sid, cid, c_tmdb)
        }))
    }

    async fn add_content_subtitle(
        &self,
        content_id: i64,
        lang: &str,
        file: &Path,
    ) -> Result<(), AppError> {
        // Use ON CONFLICT DO NOTHING to prevent duplicate subtitles
        // Duplicates are determined by (content_id, language, file_path)
        sqlx::query(
            r#"
            INSERT INTO content.media_content_subtitles (media_content_id, language, file_path)
            VALUES ($1, $2, $3)
            ON CONFLICT (media_content_id, language, file_path) DO NOTHING
            "#,
        )
        .bind(content_id)
        .bind(lang)
        .bind(file.to_string_lossy().to_string())
        .execute(&self.db)
        .await?;
        Ok(())
    }

    async fn add_episode_subtitle(
        &self,
        episode_id: i64,
        lang: &str,
        file: &Path,
    ) -> Result<(), AppError> {
        // Use ON CONFLICT DO NOTHING to prevent duplicate subtitles
        // Duplicates are determined by (episode_id, language, file_path)
        sqlx::query(
            r#"
            INSERT INTO content.episode_subtitles (episode_id, language, file_path)
            VALUES ($1, $2, $3)
            ON CONFLICT (episode_id, language, file_path) DO NOTHING
            "#,
        )
        .bind(episode_id)
        .bind(lang)
        .bind(file.to_string_lossy().to_string())
        .execute(&self.db)
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_language_code_maps_common_variants() {
        assert_eq!(ContentService::normalize_language_code("eng"), "en");
        assert_eq!(ContentService::normalize_language_code("spa"), "es");
        assert_eq!(ContentService::normalize_language_code("Portuguese"), "pt");
        assert_eq!(ContentService::normalize_language_code("es"), "es");
    }

    #[test]
    fn strip_lang_from_end_removes_lang_suffixes() {
        assert_eq!(ContentService::strip_lang_from_end("Movie.en"), "Movie");
        assert_eq!(ContentService::strip_lang_from_end("Show.pt-BR"), "Show");
        assert_eq!(ContentService::strip_lang_from_end("Title"), "Title");
    }
}
