use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::get,
    Extension, Router,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    models::{
        TmdbCastMember, TmdbMovieDetails, TmdbSearchResult, TmdbSeasonDetails, TmdbTvDetails,
        UserRole,
    },
    services::{Claims, TmdbService},
};

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(rename = "type", alias = "search_type")]
    pub search_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TmdbSearchResponse {
    pub results: Vec<TmdbSearchResultResponse>,
    pub tmdb_available: bool,
}

#[derive(Debug, Serialize)]
pub struct TmdbSearchResultResponse {
    pub id: i64,
    pub title: String,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub release_date: Option<String>,
    pub media_type: Option<String>,
    pub vote_average: Option<f64>,
    pub year: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct TmdbMovieResponse {
    pub id: i64,
    pub title: String,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub release_date: Option<String>,
    pub year: Option<i64>,
    pub runtime: Option<i32>,
    pub vote_average: f64,
    pub vote_count: i32,
    pub imdb_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TmdbTvResponse {
    pub id: i64,
    pub name: String,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub first_air_date: Option<String>,
    pub last_air_date: Option<String>,
    pub year: Option<i64>,
    pub number_of_seasons: i32,
    pub number_of_episodes: i32,
    pub vote_average: f64,
    pub vote_count: i32,
    pub seasons: Vec<TmdbSeasonResponse>,
}

#[derive(Debug, Serialize)]
pub struct TmdbSeasonResponse {
    pub id: i64,
    pub season_number: i32,
    pub episode_count: i32,
    pub name: String,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub air_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TmdbAvailabilityResponse {
    pub available: bool,
    pub message: String,
}

/// Response for cast/credits endpoint
#[derive(Debug, Serialize)]
pub struct CastResponse {
    pub cast: Vec<CastMemberResponse>,
}

/// Single cast member in response
#[derive(Debug, Serialize)]
pub struct CastMemberResponse {
    pub id: i64,
    pub name: String,
    pub character: Option<String>,
    pub profile_url: Option<String>,
}

impl From<TmdbCastMember> for CastMemberResponse {
    fn from(member: TmdbCastMember) -> Self {
        Self {
            id: member.id,
            name: member.name,
            character: member.character,
            profile_url: member.profile_path,
        }
    }
}

impl From<TmdbSearchResult> for TmdbSearchResultResponse {
    fn from(result: TmdbSearchResult) -> Self {
        let title = result.title.or(result.name).unwrap_or_default();
        let release_date = result.release_date.or(result.first_air_date);
        let year = release_date
            .as_ref()
            .and_then(|date| TmdbService::extract_year(date));

        Self {
            id: result.id,
            title,
            overview: result.overview,
            poster_url: result
                .poster_path
                .map(|path| format!("https://image.tmdb.org/t/p/w500{}", path)),
            backdrop_url: result
                .backdrop_path
                .map(|path| format!("https://image.tmdb.org/t/p/w1280{}", path)),
            release_date,
            media_type: result.media_type,
            vote_average: result.vote_average,
            year,
        }
    }
}

impl From<TmdbMovieDetails> for TmdbMovieResponse {
    fn from(movie: TmdbMovieDetails) -> Self {
        let year = movie
            .release_date
            .as_ref()
            .and_then(|date| TmdbService::extract_year(date));

        Self {
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            poster_url: movie
                .poster_path
                .map(|path| format!("https://image.tmdb.org/t/p/w500{}", path)),
            backdrop_url: movie
                .backdrop_path
                .map(|path| format!("https://image.tmdb.org/t/p/w1280{}", path)),
            release_date: movie.release_date,
            year,
            runtime: movie.runtime,
            vote_average: movie.vote_average,
            vote_count: movie.vote_count,
            imdb_id: movie.imdb_id,
        }
    }
}

impl From<TmdbTvDetails> for TmdbTvResponse {
    fn from(tv: TmdbTvDetails) -> Self {
        let year = tv
            .first_air_date
            .as_ref()
            .and_then(|date| TmdbService::extract_year(date));

        Self {
            id: tv.id,
            name: tv.name,
            overview: tv.overview,
            poster_url: tv
                .poster_path
                .map(|path| format!("https://image.tmdb.org/t/p/w500{}", path)),
            backdrop_url: tv
                .backdrop_path
                .map(|path| format!("https://image.tmdb.org/t/p/w1280{}", path)),
            first_air_date: tv.first_air_date,
            last_air_date: tv.last_air_date,
            year,
            number_of_seasons: tv.number_of_seasons,
            number_of_episodes: tv.number_of_episodes,
            vote_average: tv.vote_average,
            vote_count: tv.vote_count,
            seasons: tv.seasons.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<crate::models::content::TmdbSeason> for TmdbSeasonResponse {
    fn from(season: crate::models::content::TmdbSeason) -> Self {
        Self {
            id: season.id,
            season_number: season.season_number,
            episode_count: season.episode_count,
            name: season.name,
            overview: season.overview,
            poster_path: season.poster_path,
            air_date: season.air_date,
        }
    }
}

// GET /api/tmdb/status - Check TMDB availability
pub async fn get_tmdb_status(
    State(tmdb_service): State<TmdbService>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<TmdbAvailabilityResponse>, AppError> {
    let available = tmdb_service.is_available().await?;

    let response = TmdbAvailabilityResponse {
        available,
        message: if available {
            "TMDB API is configured and available".to_string()
        } else {
            "TMDB API key not configured. Please configure it in system settings.".to_string()
        },
    };

    Ok(Json(response))
}

// GET /api/tmdb/search?q=query - Search movies and TV shows
pub async fn search_content(
    State(tmdb_service): State<TmdbService>,
    Query(params): Query<SearchQuery>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<TmdbSearchResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let tmdb_available = tmdb_service.is_available().await?;

    if !tmdb_available {
        return Ok(Json(TmdbSearchResponse {
            results: vec![],
            tmdb_available: false,
        }));
    }

    let results = match params.search_type.as_deref() {
        Some("tv") => tmdb_service.search_tv(&params.q).await?,
        Some("movie") => tmdb_service.search_movie(&params.q).await?,
        _ => tmdb_service.search_multi(&params.q).await?,
    };
    let response_results: Vec<TmdbSearchResultResponse> =
        results.into_iter().map(Into::into).collect();

    Ok(Json(TmdbSearchResponse {
        results: response_results,
        tmdb_available: true,
    }))
}

// GET /api/tmdb/movie/:id - Get movie details by TMDB ID
pub async fn get_movie_details(
    State(tmdb_service): State<TmdbService>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<TmdbMovieResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let movie = tmdb_service.get_movie_details(id).await?;
    Ok(Json(movie.into()))
}

// GET /api/tmdb/tv/:id - Get TV show details by TMDB ID
pub async fn get_tv_details(
    State(tmdb_service): State<TmdbService>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<TmdbTvResponse>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let tv = tmdb_service.get_tv_details(id).await?;
    Ok(Json(tv.into()))
}

// GET /api/tmdb/tv/:id/season/:season_number - Get season details
pub async fn get_season_details(
    State(tmdb_service): State<TmdbService>,
    Path((tv_id, season_number)): Path<(i64, i32)>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<TmdbSeasonDetails>, AppError> {
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let season = tmdb_service
        .get_season_details(tv_id, season_number)
        .await?;
    Ok(Json(season))
}

// GET /api/tmdb/credits/:media_type/:id - Get cast/credits for movie or TV show
// This endpoint is PUBLIC (authenticated users can see cast info)
pub async fn get_credits(
    State(tmdb_service): State<TmdbService>,
    Path((media_type, id)): Path<(String, i64)>,
    Extension(_claims): Extension<Claims>,
) -> Result<Json<CastResponse>, AppError> {
    let cast = match media_type.as_str() {
        "movie" => tmdb_service.get_movie_credits(id).await?,
        "tv" => tmdb_service.get_tv_credits(id).await?,
        _ => {
            return Err(AppError::BadRequest(
                "Invalid media type. Use 'movie' or 'tv'".to_string(),
            ))
        }
    };

    let response = CastResponse {
        cast: cast.into_iter().map(Into::into).collect(),
    };

    Ok(Json(response))
}

pub fn tmdb_routes() -> Router<TmdbService> {
    Router::new()
        .route("/status", get(get_tmdb_status))
        .route("/search", get(search_content))
        .route("/movie/:id", get(get_movie_details))
        .route("/tv/:id", get(get_tv_details))
        .route("/tv/:id/season/:season_number", get(get_season_details))
        .route("/credits/:media_type/:id", get(get_credits))
}
