use std::collections::{HashMap, HashSet};

use axum::{
    extract::{Query, State},
    response::Json,
    Extension,
};
use chrono::{Duration, Utc};
use rand::{seq::SliceRandom, thread_rng};
use serde::Deserialize;
use tracing::warn;

use crate::error::AppError;
use crate::models::{
    Category, ContentJoined, DiscoveryMediaItem, DiscoveryOverview, DiscoveryRail,
    DiscoverySpecialSections, LanguageOption, LiveChannelOverview, LiveProgram, LiveTvOverview,
    TmdbSearchResult, User,
};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct DiscoveryQuery {
    pub language: Option<String>,
    pub limit: Option<usize>,
}

pub async fn get_discovery_overview(
    State(app_state): State<AppState>,
    Extension(user): Extension<User>,
    Query(query): Query<DiscoveryQuery>,
) -> Result<Json<DiscoveryOverview>, AppError> {
    let rail_limit = query.limit.unwrap_or(12).clamp(6, 24);
    let language = query.language.as_deref();

    // Load categories and determine which ones the user can access
    let all_categories = app_state.content_service.get_all_categories().await?;
    let user_category_ids: HashSet<i64> = user
        .subscribed_categories
        .clone()
        .unwrap_or_default()
        .into_iter()
        .collect();

    let mut accessible_categories: Vec<Category> = if user_category_ids.is_empty() {
        all_categories.clone()
    } else {
        all_categories
            .iter()
            .filter(|category| user_category_ids.contains(&category.id))
            .cloned()
            .collect()
    };

    if accessible_categories.is_empty() {
        accessible_categories = all_categories.clone();
    }

    let categories_by_type = group_categories_by_type(&accessible_categories);

    // Prepare category lists by type (case-insensitive)
    let vod_categories = select_categories(&categories_by_type, "VOD");
    let series_categories = select_categories(&categories_by_type, "Series");
    let kids_categories = select_categories(&categories_by_type, "Kids");
    let anime_categories = select_categories(&categories_by_type, "Anime");
    let eventos_categories = select_categories(&categories_by_type, "Eventos");
    let tv_categories = select_categories(&categories_by_type, "TV");

    // Fetch TMDB powered collections with graceful fallbacks
    let tmdb_popular_raw = match app_state.tmdb_service.get_popular_movies(language).await {
        Ok(list) => list,
        Err(error) => {
            warn!("TMDB popular movies fetch failed: {}", error);
            Vec::new()
        }
    };

    let tmdb_top_raw = match app_state.tmdb_service.get_top_rated_movies(language).await {
        Ok(list) => list,
        Err(error) => {
            warn!("TMDB top rated movies fetch failed: {}", error);
            Vec::new()
        }
    };

    let tmdb_trending_tv_raw = match app_state
        .tmdb_service
        .get_trending("tv", "week", language)
        .await
    {
        Ok(list) => list,
        Err(error) => {
            warn!("TMDB trending TV fetch failed: {}", error);
            Vec::new()
        }
    };

    let tmdb_popular_tv_raw = match app_state.tmdb_service.get_popular_tv(language).await {
        Ok(list) => list,
        Err(error) => {
            warn!("TMDB popular TV fetch failed: {}", error);
            Vec::new()
        }
    };

    let tmdb_family_raw = match app_state
        .tmdb_service
        .discover_movies_by_genre(10751, language)
        .await
    {
        Ok(list) => list,
        Err(error) => {
            warn!("TMDB family genre fetch failed: {}", error);
            Vec::new()
        }
    };

    let tmdb_documentary_raw = match app_state
        .tmdb_service
        .discover_movies_by_genre(99, language)
        .await
    {
        Ok(list) => list,
        Err(error) => {
            warn!("TMDB documentary genre fetch failed: {}", error);
            Vec::new()
        }
    };

    let movie_genres = match app_state.tmdb_service.get_movie_genres(language).await {
        Ok(list) => list,
        Err(error) => {
            warn!("TMDB movie genres fetch failed: {}", error);
            Vec::new()
        }
    };

    let tv_genres = match app_state.tmdb_service.get_tv_genres(language).await {
        Ok(list) => list,
        Err(error) => {
            warn!("TMDB TV genres fetch failed: {}", error);
            Vec::new()
        }
    };

    let mut genre_lookup: HashMap<i32, String> = HashMap::new();
    for genre in movie_genres.into_iter().chain(tv_genres.into_iter()) {
        genre_lookup.entry(genre.id).or_insert(genre.name);
    }

    // Map TMDB results to media items
    let tmdb_popular_media = to_media_items(&tmdb_popular_raw, rail_limit * 2, Some(&genre_lookup));
    let tmdb_top_media = to_media_items(&tmdb_top_raw, rail_limit * 2, Some(&genre_lookup));
    let tmdb_trending_tv_media =
        to_media_items(&tmdb_trending_tv_raw, rail_limit * 2, Some(&genre_lookup));
    let tmdb_popular_tv_media =
        to_media_items(&tmdb_popular_tv_raw, rail_limit * 2, Some(&genre_lookup));
    let tmdb_family_media = to_media_items(&tmdb_family_raw, rail_limit * 2, Some(&genre_lookup));
    let tmdb_documentary_media =
        to_media_items(&tmdb_documentary_raw, rail_limit * 2, Some(&genre_lookup));

    // Load local catalog slices per category type
    let vod_media = collect_media_for_categories(&app_state, &vod_categories, rail_limit).await?;
    let series_media =
        collect_media_for_categories(&app_state, &series_categories, rail_limit).await?;
    let kids_media = collect_media_for_categories(&app_state, &kids_categories, rail_limit).await?;
    let anime_media =
        collect_media_for_categories(&app_state, &anime_categories, rail_limit).await?;
    let eventos_media =
        collect_media_for_categories(&app_state, &eventos_categories, rail_limit).await?;

    // TMDB collections rail definitions
    let mut tmdb_collections: Vec<DiscoveryRail> = Vec::new();
    if let Some(rail) = rail_from_items(
        "tmdb-populares",
        "Popular on TMDB",
        Some("Titles leading the global rankings."),
        "carousel",
        &tmdb_popular_media,
        rail_limit,
    ) {
        tmdb_collections.push(rail);
    }

    if let Some(rail) = rail_from_items(
        "tmdb-top-rated",
        "Top Rated",
        Some("Movies with the best community ratings."),
        "carousel",
        &tmdb_top_media,
        rail_limit,
    ) {
        tmdb_collections.push(rail);
    }

    if let Some(rail) = rail_from_items(
        "tmdb-trending-tv",
        "Trending Series",
        Some("New releases and episodes making waves."),
        "carousel",
        &tmdb_trending_tv_media,
        rail_limit,
    ) {
        tmdb_collections.push(rail);
    }

    let tmdb_genre_rails = build_tmdb_genre_rails(
        &genre_lookup,
        &[
            &tmdb_popular_media,
            &tmdb_top_media,
            &tmdb_family_media,
            &tmdb_documentary_media,
            &tmdb_popular_tv_media,
            &tmdb_trending_tv_media,
        ],
        rail_limit,
    );
    tmdb_collections.extend(tmdb_genre_rails);

    // Prepare special sections using local + TMDB data
    let special_sections = DiscoverySpecialSections {
        kids: rail_from_items(
            "kids",
            "Kids Zone",
            Some("Safe and curated content for the little ones."),
            "carousel",
            &kids_media,
            rail_limit,
        ),
        anime: rail_from_items(
            "anime",
            "Essential Anime",
            Some("Selection of classic sagas and recent releases."),
            "carousel",
            &anime_media,
            rail_limit,
        ),
        events: rail_from_items(
            "eventos",
            "Special Events",
            Some("Live and on-demand event coverage."),
            "carousel",
            &eventos_media,
            rail_limit,
        ),
        family: rail_from_items(
            "tmdb-family",
            "Family Movies from TMDB",
            Some("Adventures and emotions to watch together."),
            "carousel",
            &tmdb_family_media,
            rail_limit,
        ),
        documentaries: rail_from_items(
            "tmdb-docs",
            "Inspiring Documentaries",
            Some("Real stories curated with TMDB data."),
            "carousel",
            &tmdb_documentary_media,
            rail_limit,
        ),
    };

    // Live TV overview with EPG preview
    let live_tv = build_live_tv_overview(&app_state, &tv_categories, rail_limit.min(8)).await?;

    // Series highlights (Series + Anime)
    let mut series_highlights: Vec<DiscoveryRail> = Vec::new();
    if let Some(rail) = rail_from_items(
        "series-spotlight",
        "Featured Series",
        Some("The best of the episodic catalog."),
        "carousel",
        &series_media,
        rail_limit,
    ) {
        series_highlights.push(rail);
    }

    if let Some(rail) = rail_from_items(
        "anime-spotlight",
        "Your Anime List",
        Some("Curated Japanese action, adventure and fantasy."),
        "carousel",
        &anime_media,
        rail_limit,
    ) {
        series_highlights.push(rail);
    }

    // Build AI-inspired recommendation bundles mixing TMDB and local catalog
    let mut ai_pool: Vec<DiscoveryMediaItem> = Vec::new();
    ai_pool.extend(tmdb_popular_media.iter().take(rail_limit).cloned());
    ai_pool.extend(tmdb_top_media.iter().take(rail_limit).cloned());
    ai_pool.extend(tmdb_trending_tv_media.iter().take(rail_limit).cloned());
    ai_pool.extend(tmdb_popular_tv_media.iter().take(rail_limit).cloned());
    ai_pool.extend(vod_media.iter().cloned());
    ai_pool.extend(series_media.iter().cloned());
    ai_pool.extend(kids_media.iter().cloned());

    let ai_recommendations = build_ai_recommendations(ai_pool, rail_limit);

    let language_options = vec![
        LanguageOption {
            code: "es".to_string(),
            label: "Español".to_string(),
            native_label: Some("Español".to_string()),
        },
        LanguageOption {
            code: "en".to_string(),
            label: "English".to_string(),
            native_label: Some("English".to_string()),
        },
        LanguageOption {
            code: "zh".to_string(),
            label: "Chinese".to_string(),
            native_label: Some("中文".to_string()),
        },
    ];

    let overview = DiscoveryOverview {
        language_options,
        tmdb_collections,
        ai_recommendations,
        special_sections,
        live_tv,
        series_highlights,
    };

    Ok(Json(overview))
}

fn group_categories_by_type(categories: &[Category]) -> HashMap<String, Vec<Category>> {
    let mut map: HashMap<String, Vec<Category>> = HashMap::new();
    for category in categories {
        map.entry(category.category_type.clone())
            .or_default()
            .push(category.clone());
    }
    map
}

fn select_categories(map: &HashMap<String, Vec<Category>>, key: &str) -> Vec<Category> {
    map.iter()
        .filter_map(|(k, value)| {
            if k.eq_ignore_ascii_case(key) {
                Some(value.clone())
            } else {
                None
            }
        })
        .flatten()
        .collect()
}

fn to_media_items(
    results: &[TmdbSearchResult],
    limit: usize,
    genre_lookup: Option<&HashMap<i32, String>>,
) -> Vec<DiscoveryMediaItem> {
    results
        .iter()
        .take(limit)
        .map(|result| map_tmdb_media_item(result, genre_lookup))
        .collect()
}

fn map_tmdb_media_item(
    result: &TmdbSearchResult,
    genre_lookup: Option<&HashMap<i32, String>>,
) -> DiscoveryMediaItem {
    let title = result
        .title
        .clone()
        .or_else(|| result.name.clone())
        .unwrap_or_else(|| "Title unavailable".to_string());

    let mut item = DiscoveryMediaItem::with_id(format!("tmdb-{}", result.id), title);
    item.tmdb_id = Some(result.id);
    item.media_type = result.media_type.clone().or_else(|| {
        if result.name.is_some() {
            Some("tv".to_string())
        } else {
            Some("movie".to_string())
        }
    });

    if let Some(overview) = &result.overview {
        if !overview.trim().is_empty() {
            item.description = Some(overview.clone());
        }
    }

    if let Some(poster) = &result.poster_path {
        item.image = Some(format!("https://image.tmdb.org/t/p/w500{}", poster));
    }
    if let Some(backdrop) = &result.backdrop_path {
        item.backdrop = Some(format!("https://image.tmdb.org/t/p/w1280{}", backdrop));
    }
    // Ensure hero has a backdrop: fallback to poster if backdrop is missing
    if item.backdrop.is_none() {
        item.backdrop = item.image.clone();
    }

    item.year = result
        .release_date
        .as_ref()
        .or(result.first_air_date.as_ref())
        .and_then(|date| date.split('-').next())
        .and_then(|year| year.parse::<i32>().ok());

    if let Some(vote_average) = result.vote_average {
        item.rating = Some(vote_average as f32);
        if vote_average >= 8.0 {
            item.badges.push("TOP".to_string());
        }
    }

    if let Some(genre_ids) = &result.genre_ids {
        for genre_id in genre_ids {
            item.genre_ids.push(*genre_id);
            if let Some(lookup) = genre_lookup {
                if let Some(name) = lookup.get(genre_id) {
                    if !item.genres.contains(name) {
                        item.genres.push(name.clone());
                    }
                }
            }
        }
    }

    if let Some(language) = &result.original_language {
        if !language.trim().is_empty() {
            item.badges.push(language.to_uppercase());
        }
    }

    item
}

fn map_content_media_item(content: &ContentJoined, category: Option<&Category>) -> DiscoveryMediaItem {
    let mut item =
        DiscoveryMediaItem::with_id(format!("content-{}", content.id), content.title.clone());
    item.content_id = Some(content.id);
    item.image = content.image_url.clone();
    item.backdrop = content.backdrop_url.clone();
    item.description = content.description.clone();
    item.year = content.year.and_then(|year| i32::try_from(year).ok());
    item.provider = content.provider.clone();
    item.channel_number = content.channel_number;

    // Ensure backdrop always present if we at least have an image
    if item.backdrop.is_none() && item.image.is_some() {
        item.backdrop = item.image.clone();
    }

    if let Some(genre) = &content.genre {
        if !genre.trim().is_empty() {
            item.genres.push(genre.clone());
        }
    }

    if let Some(cat) = category {
        item.subtitle = Some(cat.name.clone());
        item.media_type = Some(cat.category_type.clone());
        if content.is_live.unwrap_or(false) {
            item.badges.push("LIVE".to_string());
        }
    }

    item
}

async fn collect_media_for_categories(
    app_state: &AppState,
    categories: &[Category],
    limit: usize,
) -> Result<Vec<DiscoveryMediaItem>, AppError> {
    if categories.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    // Batch load content from all categories in a single query (eliminates N+1)
    let category_ids: Vec<i64> = categories.iter().map(|c| c.id).collect();
    let content_by_category = app_state
        .content_service
        .get_content_by_categories_batch(&category_ids, limit as i32, true)
        .await?;

    // Create category lookup for mapping
    let category_map: std::collections::HashMap<i64, &Category> =
        categories.iter().map(|c| (c.id, c)).collect();

    let mut items = Vec::new();
    for category in categories {
        if let Some(fetched) = content_by_category.get(&category.id) {
            for content in fetched {
                // Map content -> media item and normalize any local metadata paths to absolute URLs
                let mut item = map_content_media_item(
                    content,
                    category_map.get(&content.category_id).copied(),
                );

                if let Some(img) = item.image.clone() {
                    if img.starts_with("/metadata/") || img.starts_with("metadata/") {
                        let absolute = app_state.tmdb_service.build_image_url(&img, "w500");
                        item.image = Some(absolute);
                    }
                }

                if let Some(backdrop) = item.backdrop.clone() {
                    if backdrop.starts_with("/metadata/") || backdrop.starts_with("metadata/") {
                        let absolute = app_state.tmdb_service.build_image_url(&backdrop, "w1280");
                        item.backdrop = Some(absolute);
                    }
                }

                // Final safeguard: if backdrop is still missing, reuse image for hero purposes
                if item.backdrop.is_none() && item.image.is_some() {
                    item.backdrop = item.image.clone();
                }

                items.push(item);

                if items.len() >= limit {
                    return Ok(items);
                }
            }
        }
    }

    Ok(items)
}

fn rail_from_items(
    slug: &str,
    title: &str,
    description: Option<&str>,
    layout: &str,
    source_items: &[DiscoveryMediaItem],
    limit: usize,
) -> Option<DiscoveryRail> {
    if source_items.is_empty() || limit == 0 {
        return None;
    }

    let items: Vec<DiscoveryMediaItem> = source_items.iter().take(limit).cloned().collect();
    if items.is_empty() {
        return None;
    }

    Some(DiscoveryRail {
        slug: slug.to_string(),
        title: title.to_string(),
        description: description.map(|d| d.to_string()),
        layout: Some(layout.to_string()),
        items,
    })
}

fn build_tmdb_genre_rails(
    genre_lookup: &HashMap<i32, String>,
    sources: &[&[DiscoveryMediaItem]],
    limit: usize,
) -> Vec<DiscoveryRail> {
    if genre_lookup.is_empty() || limit == 0 {
        return Vec::new();
    }

    let mut buckets: HashMap<i32, Vec<DiscoveryMediaItem>> = HashMap::new();
    for source in sources {
        for item in source.iter() {
            for genre_id in &item.genre_ids {
                if !genre_lookup.contains_key(genre_id) {
                    continue;
                }
                let entries = buckets.entry(*genre_id).or_default();
                if !entries.iter().any(|existing| existing.id == item.id) {
                    entries.push(item.clone());
                }
            }
        }
    }

    let mut entries: Vec<(i32, Vec<DiscoveryMediaItem>)> = buckets
        .into_iter()
        .filter(|(_, items)| items.len() >= 3)
        .collect();
    entries.sort_by(|a, b| b.1.len().cmp(&a.1.len()));
    entries.truncate(4);

    let mut rails = Vec::new();
    for (genre_id, items) in entries {
        if let Some(name) = genre_lookup.get(&genre_id) {
            let slug = format!("tmdb-genre-{}", genre_id);
            let description_string = format!("Featured selection of {}", name.to_lowercase());
            if let Some(rail) = rail_from_items(
                &slug,
                name,
                Some(description_string.as_str()),
                "carousel",
                &items,
                limit,
            ) {
                rails.push(rail);
            }
        }
    }

    rails
}

fn build_ai_recommendations(
    mut items: Vec<DiscoveryMediaItem>,
    rail_limit: usize,
) -> Vec<DiscoveryRail> {
    if items.is_empty() || rail_limit == 0 {
        return Vec::new();
    }

    let mut rng = thread_rng();
    items.shuffle(&mut rng);

    let chunk_size = usize::min(usize::max(4, rail_limit), items.len());
    let descriptors = [
        (
            "ai-cinema",
            "AI Recommended",
            "Smart selection of movies and releases for you.",
        ),
        (
            "ai-series",
            "Suggested Series",
            "Stories based on what users with similar tastes watch.",
        ),
        (
            "ai-surprise",
            "Surprise Mode",
            "A random mix curated by our AI layer.",
        ),
    ];

    let mut start = 0usize;
    let mut rails = Vec::new();
    for (slug, title, description) in descriptors.iter() {
        if start >= items.len() {
            break;
        }
        let end = usize::min(items.len(), start + chunk_size);
        let slice = items[start..end].to_vec();
        if slice.is_empty() {
            break;
        }
        rails.push(DiscoveryRail {
            slug: slug.to_string(),
            title: title.to_string(),
            description: Some(description.to_string()),
            layout: Some("carousel".to_string()),
            items: slice,
        });
        start = end;
    }

    if rails.is_empty() {
        rails.push(DiscoveryRail {
            slug: "ai-mix".to_string(),
            title: "Discover something new".to_string(),
            description: Some(
                "We combine popularity, affinity and randomness to surprise you.".to_string(),
            ),
            layout: Some("carousel".to_string()),
            items,
        });
    } else if start < items.len() {
        if let Some(last) = rails.last_mut() {
            last.items.extend_from_slice(&items[start..]);
        }
    }

    rails
}

async fn build_live_tv_overview(
    app_state: &AppState,
    categories: &[Category],
    limit: usize,
) -> Result<Option<LiveTvOverview>, AppError> {
    if categories.is_empty() || limit == 0 {
        return Ok(None);
    }

    // Batch load content from all TV categories in a single query (eliminates N+1)
    let category_ids: Vec<i64> = categories.iter().map(|c| c.id).collect();
    let content_by_category = app_state
        .content_service
        .get_content_by_categories_batch(&category_ids, limit as i32, true)
        .await?;

    // Collect live channels from all categories
    let mut channels: Vec<ContentJoined> = Vec::new();
    for category in categories {
        if let Some(content_list) = content_by_category.get(&category.id) {
            for content in content_list {
                if content.is_live.unwrap_or(false) {
                    channels.push(content.clone());
                    if channels.len() >= limit {
                        break;
                    }
                }
            }
        }
        if channels.len() >= limit {
            break;
        }
    }

    if channels.is_empty() {
        return Ok(None);
    }

    channels.truncate(limit);
    let channel_ids: Vec<i64> = channels.iter().map(|content| content.id).collect();

    let mut epg_by_channel: HashMap<i64, Vec<LiveProgram>> = HashMap::new();
    let mappings = app_state
        .content_service
        .get_epg_mappings_for_channels(&channel_ids)
        .await?;

    if !mappings.is_empty() {
        let now = Utc::now();
        let window_end = now + Duration::hours(6);
        let programs = app_state
            .epg_service
            .get_programs_window(mappings.clone(), now, window_end)
            .await?;
        let epg_map = app_state
            .content_service
            .get_epg_mappings_map_by_epg_id(&channel_ids)
            .await?;

        for program in programs {
            if let Some(content_id) = epg_map.get(&program.channel_id) {
                epg_by_channel
                    .entry(*content_id)
                    .or_default()
                    .push(LiveProgram {
                        title: program.title.clone(),
                        description: program.description.clone(),
                        start: program.start.clone(),
                        end: program.end.clone(),
                        category: program.category.clone(),
                    });
            }
        }

        for programs in epg_by_channel.values_mut() {
            programs.sort_by(|a, b| a.start.cmp(&b.start));
            programs.truncate(3);
        }
    }

    let overview_channels = channels
        .into_iter()
        .map(|content| {
            let backdrop = match (content.backdrop_url.clone(), content.image_url.clone()) {
                (Some(b), _) => Some(b),
                (None, img) => img, // fallback to image when no backdrop
            };
            LiveChannelOverview {
                content_id: content.id,
                title: content.title.clone(),
                image: content.image_url.clone(),
                backdrop,
                provider: content.provider.clone(),
                channel_number: content.channel_number,
                epg: epg_by_channel.remove(&content.id).unwrap_or_default(),
            }
        })
        .collect::<Vec<_>>();

    Ok(Some(LiveTvOverview {
        headline: Some("Live TV with smart guide".to_string()),
        channels: overview_channels,
    }))
}
