use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LanguageOption {
    pub code: String,
    pub label: String,
    pub native_label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveryMediaItem {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub backdrop: Option<String>,
    pub media_type: Option<String>,
    pub content_id: Option<i64>,
    pub tmdb_id: Option<i64>,
    pub rating: Option<f32>,
    pub year: Option<i32>,
    pub genres: Vec<String>,
    pub runtime: Option<i32>,
    pub provider: Option<String>,
    pub channel_number: Option<i64>,
    pub progress: Option<f32>,
    pub badges: Vec<String>,
    pub genre_ids: Vec<i32>,
}

impl DiscoveryMediaItem {
    pub fn with_id(id: impl Into<String>, title: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            subtitle: None,
            description: None,
            image: None,
            backdrop: None,
            media_type: None,
            content_id: None,
            tmdb_id: None,
            rating: None,
            year: None,
            genres: Vec::new(),
            runtime: None,
            provider: None,
            channel_number: None,
            progress: None,
            badges: Vec::new(),
            genre_ids: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveryRail {
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub layout: Option<String>,
    pub items: Vec<DiscoveryMediaItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DiscoverySpecialSections {
    pub kids: Option<DiscoveryRail>,
    pub anime: Option<DiscoveryRail>,
    pub events: Option<DiscoveryRail>,
    pub documentaries: Option<DiscoveryRail>,
    pub family: Option<DiscoveryRail>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LiveProgram {
    pub title: String,
    pub description: Option<String>,
    pub start: String,
    pub end: String,
    pub category: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LiveChannelOverview {
    pub content_id: i64,
    pub title: String,
    pub image: Option<String>,
    pub backdrop: Option<String>,
    pub provider: Option<String>,
    pub channel_number: Option<i64>,
    pub epg: Vec<LiveProgram>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LiveTvOverview {
    pub headline: Option<String>,
    pub channels: Vec<LiveChannelOverview>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DiscoveryOverview {
    pub language_options: Vec<LanguageOption>,
    pub tmdb_collections: Vec<DiscoveryRail>,
    pub ai_recommendations: Vec<DiscoveryRail>,
    pub special_sections: DiscoverySpecialSections,
    pub live_tv: Option<LiveTvOverview>,
    pub series_highlights: Vec<DiscoveryRail>,
}
