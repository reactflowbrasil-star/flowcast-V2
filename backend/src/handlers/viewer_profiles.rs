use axum::{
    extract::{Path, State},
    response::Json,
    routing::{delete, get, post, put},
    Extension, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::{error::AppError, services::Claims, AppState};

const MAX_VIEWER_PROFILES: i64 = 5;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ViewerProfile {
    pub id: i64,
    pub name: String,
    pub avatar: String,
    pub cover: String,
    pub favorite_genres: Vec<String>,
    pub is_kids: bool,
}

#[derive(Debug, Deserialize)]
pub struct ViewerProfileInput {
    pub name: String,
    pub avatar: Option<String>,
    pub cover: Option<String>,
    pub favorite_genres: Option<Vec<String>>,
    pub is_kids: Option<bool>,
}

fn user_id(claims: &Claims) -> Result<i64, AppError> {
    claims.sub.parse().map_err(|_| AppError::AuthenticationFailed)
}

fn validate_profile(input: &ViewerProfileInput) -> Result<(), AppError> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 40 {
        return Err(AppError::BadRequest(
            "Profile name must contain between 1 and 40 characters".to_string(),
        ));
    }
    if input.favorite_genres.as_ref().is_some_and(|genres| genres.len() > 20) {
        return Err(AppError::BadRequest("Choose no more than 20 genres".to_string()));
    }
    if input
        .avatar
        .as_ref()
        .is_some_and(|avatar| avatar.chars().count() > 16)
    {
        return Err(AppError::BadRequest("Invalid profile avatar".to_string()));
    }
    if input.cover.as_ref().is_some_and(|cover| {
        cover.is_empty()
            || cover.len() > 32
            || !cover.chars().all(|character| character.is_ascii_alphanumeric() || character == '-')
    }) {
        return Err(AppError::BadRequest("Invalid profile cover".to_string()));
    }
    Ok(())
}

pub async fn list_profiles(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<ViewerProfile>>, AppError> {
    let id = user_id(&claims)?;
    sqlx::query(
        r#"
        INSERT INTO auth.viewer_profiles (user_id, name)
        SELECT u.id, u.username
        FROM auth.users u
        WHERE u.id = $1
          AND NOT EXISTS (
              SELECT 1 FROM auth.viewer_profiles vp WHERE vp.user_id = u.id
          )
        "#,
    )
    .bind(id)
    .execute(&state.database.pool)
    .await
    .map_err(|error| AppError::InternalError(format!("Failed to initialize viewer profile: {error}")))?;

    let profiles = sqlx::query_as::<_, ViewerProfile>(
        "SELECT id, name, avatar, cover, favorite_genres, is_kids FROM auth.viewer_profiles WHERE user_id = $1 ORDER BY id ASC",
    )
    .bind(id)
    .fetch_all(&state.database.pool)
    .await
    .map_err(|error| AppError::InternalError(format!("Failed to list viewer profiles: {error}")))?;
    Ok(Json(profiles))
}

pub async fn create_profile(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(input): Json<ViewerProfileInput>,
) -> Result<Json<ViewerProfile>, AppError> {
    validate_profile(&input)?;
    let id = user_id(&claims)?;
    let mut transaction = state.database.pool.begin().await
        .map_err(|error| AppError::InternalError(format!("Failed to start profile creation: {error}")))?;
    sqlx::query("SELECT id FROM auth.users WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| AppError::InternalError(format!("Failed to lock profile owner: {error}")))?
        .ok_or(AppError::NotFound)?;
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auth.viewer_profiles WHERE user_id = $1",
    )
    .bind(id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| AppError::InternalError(format!("Failed to count viewer profiles: {error}")))?;
    if count >= MAX_VIEWER_PROFILES {
        return Err(AppError::BadRequest("An account can have up to five viewer profiles".to_string()));
    }

    let profile = sqlx::query_as::<_, ViewerProfile>(
        r#"
        INSERT INTO auth.viewer_profiles (user_id, name, avatar, cover, favorite_genres, is_kids)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, avatar, cover, favorite_genres, is_kids
        "#,
    )
    .bind(id)
    .bind(input.name.trim())
    .bind(input.avatar.as_deref().unwrap_or("🍿"))
    .bind(input.cover.as_deref().unwrap_or("violet"))
    .bind(input.favorite_genres.unwrap_or_default())
    .bind(input.is_kids.unwrap_or(false))
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| AppError::InternalError(format!("Failed to create viewer profile: {error}")))?;
    transaction.commit().await
        .map_err(|error| AppError::InternalError(format!("Failed to finish profile creation: {error}")))?;
    Ok(Json(profile))
}

pub async fn update_profile(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(profile_id): Path<i64>,
    Json(input): Json<ViewerProfileInput>,
) -> Result<Json<ViewerProfile>, AppError> {
    validate_profile(&input)?;
    let id = user_id(&claims)?;
    let profile = sqlx::query_as::<_, ViewerProfile>(
        r#"
        UPDATE auth.viewer_profiles SET
            name = $1,
            avatar = COALESCE($2, avatar),
            cover = COALESCE($3, cover),
            favorite_genres = COALESCE($4, favorite_genres),
            is_kids = COALESCE($5, is_kids),
            updated_at = NOW()
        WHERE id = $6 AND user_id = $7
        RETURNING id, name, avatar, cover, favorite_genres, is_kids
        "#,
    )
    .bind(input.name.trim())
    .bind(input.avatar)
    .bind(input.cover)
    .bind(input.favorite_genres)
    .bind(input.is_kids)
    .bind(profile_id)
    .bind(id)
    .fetch_optional(&state.database.pool)
    .await
    .map_err(|error| AppError::InternalError(format!("Failed to update viewer profile: {error}")))?
    .ok_or(AppError::NotFound)?;
    Ok(Json(profile))
}

pub async fn delete_profile(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(profile_id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let id = user_id(&claims)?;
    let mut transaction = state.database.pool.begin().await
        .map_err(|error| AppError::InternalError(format!("Failed to start profile deletion: {error}")))?;
    sqlx::query("SELECT id FROM auth.users WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| AppError::InternalError(format!("Failed to lock profile owner: {error}")))?
        .ok_or(AppError::NotFound)?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM auth.viewer_profiles WHERE user_id = $1")
        .bind(id)
        .fetch_one(&mut *transaction)
    .await
    .map_err(|error| AppError::InternalError(format!("Failed to count viewer profiles: {error}")))?;
    if count <= 1 {
        return Err(AppError::BadRequest("The account must keep at least one viewer profile".to_string()));
    }
    let result = sqlx::query("DELETE FROM auth.viewer_profiles WHERE id = $1 AND user_id = $2")
        .bind(profile_id)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| AppError::InternalError(format!("Failed to delete viewer profile: {error}")))?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    transaction.commit().await
        .map_err(|error| AppError::InternalError(format!("Failed to finish profile deletion: {error}")))?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/profiles", get(list_profiles).post(create_profile))
        .route("/profiles/:id", put(update_profile).delete(delete_profile))
}
