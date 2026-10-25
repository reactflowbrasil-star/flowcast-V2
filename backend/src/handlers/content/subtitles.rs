use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Json, Response},
    Extension,
};
use std::path::Path as StdPath;

use crate::{error::AppError, services::Claims};

use super::{resolve_backend_base, verify_user_access, SubtitleTrackResponse};

pub async fn list_content_subtitles(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<SubtitleTrackResponse>>, AppError> {
    let content_service = &app_state.content_service;
    let content = content_service
        .get_content_by_id(id)
        .await?
        .ok_or(AppError::NotFound)?;
    let category = content_service
        .get_category_by_id(content.category_id)
        .await?
        .ok_or(AppError::NotFound)?;

    verify_user_access(
        content_service,
        &claims,
        Some(&category.category_type),
        Some(category.id),
    )
    .await?;

    // Build subtitle tracks response
    let mut tracks = Vec::new();

    // Get subtitle files from database
    let db_subtitles = content_service.get_content_subtitles(id).await?;

    for sub in db_subtitles.iter() {
        tracks.push(SubtitleTrackResponse {
            id: sub.id,
            language: sub.language.clone(),
            label: language_label(&sub.language),
            url: format!(
                "{}/api/content/{}/subtitle/{}",
                resolve_backend_base(&headers, &app_state.config).trim_end_matches('/'),
                id,
                sub.id
            ),
        });
    }

    Ok(Json(tracks))
}

pub async fn serve_content_subtitle(
    State(app_state): State<crate::AppState>,
    headers: HeaderMap,
    Path((content_id, subtitle_id)): Path<(i64, i64)>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, AppError> {
    let content_service = &app_state.content_service;
    let subtitle = content_service
        .get_content_subtitle_by_id(subtitle_id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Verify subtitle belongs to this content
    if subtitle.media_content_id != content_id {
        return Err(AppError::NotFound);
    }

    // Get content and verify access
    let content = content_service
        .get_content_by_id(content_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let category = content_service
        .get_category_by_id(content.category_id)
        .await?
        .ok_or(AppError::NotFound)?;

    verify_user_access(
        content_service,
        &claims,
        Some(&category.category_type),
        Some(category.id),
    )
    .await?;

    // Get subtitle file path
    let p = StdPath::new(&subtitle.file_path);

    if !p.exists() {
        return Err(AppError::NotFound);
    }

    // Read subtitle file
    let subtitle_content = tokio::fs::read_to_string(p)
        .await
        .map_err(|_| AppError::InternalServerError)?;

    // Convert SRT to WebVTT if needed (browsers require WebVTT)
    let (content_type, final_content) = if subtitle.file_path.ends_with(".vtt") {
        ("text/vtt", subtitle_content)
    } else if subtitle.file_path.ends_with(".srt") {
        // Convert SRT to WebVTT off the async runtime
        let srt_content = subtitle_content;
        let vtt_content = tokio::task::spawn_blocking(move || convert_srt_to_webvtt(&srt_content))
            .await
            .map_err(|e| AppError::InternalError(format!("Subtitle convert join error: {}", e)))?;
        ("text/vtt", vtt_content)
    } else {
        ("text/plain", subtitle_content)
    };

    build_subtitle_response(&headers, content_type, final_content)
}

/// Convert SRT subtitle format to WebVTT format
/// SRT format uses commas for milliseconds (00:00:01,000)
/// WebVTT format uses dots for milliseconds (00:00:01.000)
pub(crate) fn convert_srt_to_webvtt(srt_content: &str) -> String {
    let mut vtt_lines = vec!["WEBVTT".to_string(), "".to_string()];

    for line in srt_content.lines() {
        let line = line.trim();

        // Convert timestamp lines (e.g., "00:00:01,000 --> 00:00:05,000")
        if line.contains("-->") {
            // Replace commas with dots in timestamps
            let converted = line.replace(',', ".");
            vtt_lines.push(converted);
        } else {
            vtt_lines.push(line.to_string());
        }
    }

    vtt_lines.join("\n")
}

pub(crate) fn build_subtitle_response(
    headers: &HeaderMap,
    content_type: &str,
    body: String,
) -> Result<Response, AppError> {
    // Get origin from request headers for CORS
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("*");

    let mut response = Response::builder()
        .status(StatusCode::OK)
        .body(Body::from(body))
        .map_err(|_| AppError::InternalServerError)?;

    let response_headers = response.headers_mut();
    response_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(content_type).unwrap_or(HeaderValue::from_static("text/plain")),
    );

    // Cannot use wildcard '*' when credentials mode is 'include', must specify exact origin
    response_headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_str(origin).unwrap_or(HeaderValue::from_static("*")),
    );

    response_headers.insert(
        header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
        HeaderValue::from_static("true"),
    );

    response_headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=3600"),
    );

    Ok(response)
}

pub(crate) fn language_label(lang: &str) -> String {
    let normalized = lang.to_lowercase();
    match normalized.as_str() {
        // Special cases
        "und" | "unknown" => "Unknown".to_string(),

        // English variants
        "en" | "eng" => "English".to_string(),
        "en-us" => "English (US)".to_string(),
        "en-gb" => "English (UK)".to_string(),
        "en-ca" => "English (Canada)".to_string(),
        "en-au" => "English (Australia)".to_string(),

        // Spanish variants
        "es" | "spa" => "Español (Spanish)".to_string(),
        "es-es" => "Español (Spain)".to_string(),
        "es-mx" => "Español (Mexico)".to_string(),
        "es-ar" => "Español (Argentina)".to_string(),
        "es-419" => "Español (Latin America)".to_string(),

        // Portuguese variants
        "pt" | "por" => "Português (Portuguese)".to_string(),
        "pt-br" => "Português (Brazil)".to_string(),
        "pt-pt" => "Português (Portugal)".to_string(),

        // French variants
        "fr" | "fra" | "fre" => "Français (French)".to_string(),
        "fr-fr" => "Français (France)".to_string(),
        "fr-ca" => "Français (Canada)".to_string(),
        "fr-be" => "Français (Belgium)".to_string(),
        "fr-ch" => "Français (Switzerland)".to_string(),

        // German variants
        "de" | "deu" | "ger" => "Deutsch (German)".to_string(),
        "de-de" => "Deutsch (Germany)".to_string(),
        "de-at" => "Deutsch (Austria)".to_string(),
        "de-ch" => "Deutsch (Switzerland)".to_string(),

        // Italian
        "it" | "ita" => "Italiano (Italian)".to_string(),
        "it-it" => "Italiano (Italy)".to_string(),

        // Japanese
        "ja" | "jpn" => "日本語 (Japanese)".to_string(),

        // Korean
        "ko" | "kor" => "한국어 (Korean)".to_string(),

        // Chinese variants
        "zh" | "chi" | "zho" => "中文 (Chinese)".to_string(),
        "zh-cn" => "中文 (Simplified)".to_string(),
        "zh-tw" => "中文 (Traditional)".to_string(),
        "zh-hans" => "中文 (Simplified)".to_string(),
        "zh-hant" => "中文 (Traditional)".to_string(),
        "zh-hk" => "中文 (Hong Kong)".to_string(),
        "cmn" | "cmn-tw" => "中文 (Mandarin)".to_string(),
        "yue" => "粵語 (Cantonese)".to_string(),

        // Dutch
        "nl" | "nld" | "dut" => "Nederlands (Dutch)".to_string(),

        // Norwegian
        "no" | "nor" => "Norsk (Norwegian)".to_string(),
        "nb" => "Norsk Bokmål (Norwegian)".to_string(),
        "nn" => "Norsk Nynorsk (Norwegian)".to_string(),

        // Polish
        "pl" | "pol" => "Polski (Polish)".to_string(),

        // Russian
        "ru" | "rus" => "Русский (Russian)".to_string(),

        // Arabic
        "ar" | "ara" => "العربية (Arabic)".to_string(),

        // Turkish
        "tr" | "tur" => "Türkçe (Turkish)".to_string(),

        // Swedish
        "sv" | "swe" => "Svenska (Swedish)".to_string(),

        // Danish
        "da" | "dan" => "Dansk (Danish)".to_string(),

        // Finnish
        "fi" | "fin" => "Suomi (Finnish)".to_string(),

        // Greek
        "el" | "ell" | "gre" => "Ελληνικά (Greek)".to_string(),

        // Czech
        "cs" | "ces" | "cze" => "Čeština (Czech)".to_string(),

        // Hungarian
        "hu" | "hun" => "Magyar (Hungarian)".to_string(),

        // Romanian
        "ro" | "ron" | "rum" => "Română (Romanian)".to_string(),

        // Slovak
        "sk" | "slk" | "slo" => "Slovenčina (Slovak)".to_string(),

        // Slovenian
        "sl" | "slv" => "Slovenščina (Slovak)".to_string(),

        // Croatian
        "hr" | "hrv" => "Hrvatski (Croatian)".to_string(),

        // Serbian
        "sr" | "srp" => "Српски (Serbian)".to_string(),

        // Bulgarian
        "bg" | "bul" => "Български (Bulgarian)".to_string(),

        // Ukrainian
        "uk" | "ukr" => "Українська (Ukrainian)".to_string(),

        // Hebrew
        "he" | "heb" => "עברית (Hebrew)".to_string(),

        // Hindi
        "hi" | "hin" => "हिन्दी (Hindi)".to_string(),

        // Thai
        "th" | "tha" => "ไทย (Thai)".to_string(),

        // Vietnamese
        "vi" | "vie" => "Tiếng Việt (Vietnamese)".to_string(),

        // Indonesian
        "id" | "ind" => "Bahasa Indonesia (Indonesian)".to_string(),

        // Malay
        "ms" | "msa" | "may" => "Bahasa Melayu (Malay)".to_string(),

        // Icelandic
        "is" | "isl" | "ice" => "Íslenska (Icelandic)".to_string(),

        // Bengali
        "bn" | "ben" => "বাংলা (Bengali)".to_string(),

        // Urdu
        "ur" | "urd" => "اردو (Urdu)".to_string(),

        // Punjabi
        "pa" | "pan" => "ਪੰਜਾਬੀ (Punjabi)".to_string(),

        // Swahili
        "sw" | "swa" => "Kiswahili (Swahili)".to_string(),

        // Tagalog
        "tl" | "tgl" => "Tagalog".to_string(),

        // Afrikaans
        "af" | "afr" => "Afrikaans".to_string(),

        // Albanian
        "sq" | "sqi" | "alb" => "Shqip (Albanian)".to_string(),

        // Amharic
        "am" | "amh" => "አማርኛ (Amharic)".to_string(),

        // Armenian
        "hy" | "hye" | "arm" => "Հայերեն (Armenian)".to_string(),

        // Azerbaijani
        "az" | "aze" => "Azərbaycan (Azerbaijani)".to_string(),

        // Basque
        "eu" | "eus" | "baq" => "Euskara (Basque)".to_string(),

        // Belarusian
        "be" | "bel" => "Беларуская (Belarusian)".to_string(),

        // Bosnian
        "bs" | "bos" => "Bosanski (Bosnian)".to_string(),

        // Catalan
        "ca" | "cat" => "Català (Catalan)".to_string(),

        // Estonian
        "et" | "est" => "Eesti (Estonian)".to_string(),

        // Galician
        "gl" | "glg" => "Galego (Galician)".to_string(),

        // Georgian
        "ka" | "kat" | "geo" => "ქართული (Georgian)".to_string(),

        // Latvian
        "lv" | "lav" => "Latviešu (Latvian)".to_string(),

        // Lithuanian
        "lt" | "lit" => "Lietuvių (Lithuanian)".to_string(),

        // Macedonian
        "mk" | "mkd" | "mac" => "Македонски (Macedonian)".to_string(),

        // Mongolian
        "mn" | "mon" => "Монгол (Mongolian)".to_string(),

        // Persian (Farsi)
        "fa" | "fas" | "per" => "فارسی (Persian)".to_string(),

        // Tamil
        "ta" | "tam" => "தமிழ் (Tamil)".to_string(),

        // Telugu
        "te" | "tel" => "తెలుగు (Telugu)".to_string(),

        // Kannada
        "kn" | "kan" => "ಕನ್ನಡ (Kannada)".to_string(),

        // Malayalam
        "ml" | "mal" => "മലയാളം (Malayalam)".to_string(),

        // Marathi
        "mr" | "mar" => "मराठी (Marathi)".to_string(),

        // Gujarati
        "gu" | "guj" => "ગુજરાતી (Gujarati)".to_string(),

        // Nepali
        "ne" | "nep" => "नेपाली (Nepali)".to_string(),

        // Sinhala
        "si" | "sin" => "සිංහල (Sinhala)".to_string(),

        // Khmer
        "km" | "khm" => "ខ្មែរ (Khmer)".to_string(),

        // Lao
        "lo" | "lao" => "ລາວ (Lao)".to_string(),

        // Burmese
        "my" | "mya" | "bur" => "မြန်မာ (Burmese)".to_string(),

        // Kazakh
        "kk" | "kaz" => "Қазақ (Kazakh)".to_string(),

        // Uzbek
        "uz" | "uzb" => "Oʻzbek (Uzbek)".to_string(),

        // Fallback: return capitalized version
        code => {
            // If it looks like a language code (2-3 chars or has dash), uppercase it
            if code.len() <= 3 || code.contains('-') {
                code.to_uppercase()
            } else {
                // Otherwise return as-is (might be a full name already)
                lang.to_string()
            }
        }
    }
}
