use axum::{
    extract::{Path, State},
    routing::{delete, get},
    Extension, Json, Router,
};
use serde::Serialize;
use tracing::{debug, error, info};

use crate::error::AppError;
use crate::models::user::User;
use crate::services::favorites::{
    AddFavoriteRequest, Favorite, FavoritesContentData, FavoritesService,
};

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    // Keep a stable non-null message for Android generic response DTO compatibility.
    pub message: String,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            message: "ok".to_string(),
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            message: message.clone(),
            data: None,
            error: Some(message),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct FavoritesResponse {
    pub movies: Vec<String>,
    pub series: Vec<String>,
    pub channels: Vec<String>,
    pub music_tracks: Vec<String>,
    pub music_albums: Vec<String>,
    pub music_artists: Vec<String>,
    pub data: Option<FavoritesContentData>,
}

/// Add a favorite
pub async fn add_favorite(
    State(service): State<FavoritesService>,
    Extension(user): Extension<User>,
    Json(request): Json<AddFavoriteRequest>,
) -> Result<Json<ApiResponse<Favorite>>, AppError> {
    info!(
        "Adding favorite for user {}: {} {}",
        user.id, request.content_type, request.content_id
    );

    match service
        .add_favorite(user.id, &request.content_type, &request.content_id)
        .await
    {
        Ok(favorite) => Ok(Json(ApiResponse::success(favorite))),
        Err(e) => {
            error!("Failed to add favorite: {}", e);
            Ok(Json(ApiResponse::error(format!(
                "Failed to add favorite: {}",
                e
            ))))
        }
    }
}

/// Remove a favorite
pub async fn remove_favorite(
    State(service): State<FavoritesService>,
    Extension(user): Extension<User>,
    Path((content_type, content_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    info!(
        "Removing favorite for user {}: {} {}",
        user.id, content_type, content_id
    );

    match service
        .remove_favorite(user.id, &content_type, &content_id)
        .await
    {
        Ok(removed) => Ok(Json(ApiResponse::success(removed))),
        Err(e) => {
            error!("Failed to remove favorite: {}", e);
            Ok(Json(ApiResponse::error(format!(
                "Failed to remove favorite: {}",
                e
            ))))
        }
    }
}

/// Check if content is favorited
pub async fn check_favorite(
    State(service): State<FavoritesService>,
    Extension(user): Extension<User>,
    Path((content_type, content_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    debug!(
        "Checking favorite for user {}: {} {}",
        user.id, content_type, content_id
    );

    match service
        .is_favorite(user.id, &content_type, &content_id)
        .await
    {
        Ok(is_fav) => Ok(Json(ApiResponse::success(is_fav))),
        Err(e) => {
            error!("Failed to check favorite: {}", e);
            Ok(Json(ApiResponse::error(format!(
                "Failed to check favorite: {}",
                e
            ))))
        }
    }
}

/// Get all favorites for the user, grouped by type
pub async fn get_user_favorites(
    State(service): State<FavoritesService>,
    Extension(user): Extension<User>,
) -> Result<Json<ApiResponse<FavoritesResponse>>, AppError> {
    info!("Getting all favorites for user {}", user.id);

    match service.get_user_favorites_with_content(user.id).await {
        Ok(favorites) => {
            let mut movies = Vec::new();
            let mut series = Vec::new();
            let mut channels = Vec::new();
            let mut music_tracks = Vec::new();
            let mut music_albums = Vec::new();
            let mut music_artists = Vec::new();
            let mut content_data = FavoritesContentData::default();

            for entry in favorites {
                let content_type = entry.favorite.content_type.to_lowercase();
                let ids_vec = match content_type.as_str() {
                    "series" => &mut series,
                    "channel" => &mut channels,
                    "music_track" => &mut music_tracks,
                    "music_album" => &mut music_albums,
                    "music_artist" => &mut music_artists,
                    _ => &mut movies,
                };
                ids_vec.push(entry.favorite.content_id.clone());

                if let Some(content) = entry.content {
                    let chart = match content_type.as_str() {
                        "series" => &mut content_data.series,
                        "channel" => &mut content_data.channels,
                        "music_track" => &mut content_data.music_tracks,
                        "music_album" => &mut content_data.music_albums,
                        "music_artist" => &mut content_data.music_artists,
                        _ => &mut content_data.movies,
                    };
                    chart.push(content);
                }
            }

            let response = FavoritesResponse {
                movies,
                series,
                channels,
                music_tracks,
                music_albums,
                music_artists,
                data: Some(content_data),
            };

            Ok(Json(ApiResponse::success(response)))
        }
        Err(e) => {
            error!("Failed to get favorites: {}", e);
            Ok(Json(ApiResponse::error(format!(
                "Failed to get favorites: {}",
                e
            ))))
        }
    }
}

/// Get favorites by type
pub async fn get_favorites_by_type(
    State(service): State<FavoritesService>,
    Extension(user): Extension<User>,
    Path(content_type): Path<String>,
) -> Result<Json<ApiResponse<Vec<String>>>, AppError> {
    info!("Getting {} favorites for user {}", content_type, user.id);

    match service.get_favorites_by_type(user.id, &content_type).await {
        Ok(favorites) => {
            let ids: Vec<String> = favorites.into_iter().map(|f| f.content_id).collect();
            Ok(Json(ApiResponse::success(ids)))
        }
        Err(e) => {
            error!("Failed to get favorites by type: {}", e);
            Ok(Json(ApiResponse::error(format!(
                "Failed to get favorites: {}",
                e
            ))))
        }
    }
}

/// Get favorites count by type
pub async fn get_favorites_stats(
    State(service): State<FavoritesService>,
    Extension(user): Extension<User>,
) -> Result<Json<ApiResponse<std::collections::HashMap<String, i64>>>, AppError> {
    debug!("Getting favorites stats for user {}", user.id);

    match service.get_favorites_count_by_type(user.id).await {
        Ok(counts) => Ok(Json(ApiResponse::success(counts))),
        Err(e) => {
            error!("Failed to get favorites stats: {}", e);
            Ok(Json(ApiResponse::error(format!(
                "Failed to get favorites stats: {}",
                e
            ))))
        }
    }
}

/// User favorites routes
pub fn user_favorites_routes() -> Router<FavoritesService> {
    Router::new()
        .route("/", get(get_user_favorites).post(add_favorite))
        .route("/:content_type/:content_id", delete(remove_favorite))
        .route("/check/:content_type/:content_id", get(check_favorite))
        .route("/type/:content_type", get(get_favorites_by_type))
        .route("/stats", get(get_favorites_stats))
}

#[cfg(test)]
mod tests {
    use super::ApiResponse;

    #[test]
    fn api_response_success_includes_message_and_data() {
        let response = ApiResponse::success(123_i32);
        let payload = serde_json::to_value(response).expect("response should serialize");

        assert_eq!(payload["success"], true);
        assert_eq!(payload["message"], "ok");
        assert_eq!(payload["data"], 123);
        assert!(payload["error"].is_null());
    }

    #[test]
    fn api_response_error_includes_message_and_error() {
        let response: ApiResponse<()> = ApiResponse::error("boom".to_string());
        let payload = serde_json::to_value(response).expect("response should serialize");

        assert_eq!(payload["success"], false);
        assert_eq!(payload["message"], "boom");
        assert_eq!(payload["error"], "boom");
        assert!(payload["data"].is_null());
    }
}
