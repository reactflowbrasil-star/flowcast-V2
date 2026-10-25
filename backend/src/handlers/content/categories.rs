use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    Extension,
};

use crate::{
    error::AppError,
    handlers::content::{CategoryResponse, CreateCategoryRequest, UpdateCategoryRequest},
    models::UserRole,
    services::{Claims, ContentService},
    AppState,
};

/// Public GET /api/public/content/categories - returns all categories without requiring JWT auth
/// This endpoint is intended for public UI pages (like the demo signup) that need to show
/// available categories before a user is authenticated.
pub async fn get_public_categories(
    State(app_state): State<AppState>,
) -> Result<Json<Vec<CategoryResponse>>, AppError> {
    let categories = app_state.content_service.get_all_categories().await?;
    let response: Vec<CategoryResponse> = categories.into_iter().map(Into::into).collect();
    Ok(Json(response))
}

// GET /api/content/categories - Get all categories (authenticated version)
pub async fn get_categories(
    State(app_state): State<AppState>,
    Extension(claims): Extension<Claims>, // Require authentication
    Extension(user): Extension<crate::models::user::User>,
) -> Result<Json<Vec<CategoryResponse>>, AppError> {
    let content_service = &app_state.content_service;
    let categories = content_service.get_all_categories().await?;

    // Filter categories based on user's subscribed categories for end users
    let filtered_categories = if matches!(claims.role, crate::models::user::UserRole::EndUser) {
        if let Some(subscribed_category_ids) = &user.subscribed_categories {
            categories
                .into_iter()
                .filter(|cat| subscribed_category_ids.contains(&cat.id))
                .collect::<Vec<_>>()
        } else {
            tracing::warn!("get_categories: End user has no subscribed categories");
            // If no subscribed categories, return empty list
            Vec::new()
        }
    } else {
        // Admin and resellers can see all categories
        categories
    };

    let response: Vec<CategoryResponse> = filtered_categories.into_iter().map(Into::into).collect();

    Ok(Json(response))
}

// GET /api/content/categories/:id - Get category by ID
pub async fn get_category_by_id(
    State(app_state): State<AppState>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>, // Require authentication
    Extension(user): Extension<crate::models::user::User>,
) -> Result<Json<CategoryResponse>, AppError> {
    let content_service = &app_state.content_service;
    let category = content_service
        .get_category_by_id(id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Check if user has access to this category for end users
    if matches!(claims.role, crate::models::user::UserRole::EndUser) {
        if let Some(subscribed_category_ids) = &user.subscribed_categories {
            if !subscribed_category_ids.contains(&category.id) {
                return Err(AppError::Forbidden);
            }
        } else {
            // If no subscribed categories, deny access
            return Err(AppError::Forbidden);
        }
    }

    Ok(Json(category.into()))
}

// POST /api/admin/categories - Create new category (admin only)
pub async fn create_category(
    State(content_service): State<ContentService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateCategoryRequest>,
) -> Result<(StatusCode, Json<CategoryResponse>), AppError> {
    // Only admins can create categories
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::CreateCategoryRequest {
        name: request.name,
        category_type: request.category_type,
    };

    let category = content_service.create_category(service_request).await?;
    Ok((StatusCode::CREATED, Json(category.into())))
}

// PUT /api/admin/categories/:id - Update category (admin only)
pub async fn update_category(
    State(content_service): State<ContentService>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<UpdateCategoryRequest>,
) -> Result<Json<CategoryResponse>, AppError> {
    // Only admins can update content.categories
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    let service_request = crate::services::content::UpdateCategoryRequest {
        name: request.name,
        category_type: request.category_type,
    };

    let category = content_service.update_category(id, service_request).await?;
    Ok(Json(category.into()))
}

// DELETE /api/admin/categories/:id - Delete category (admin only)
pub async fn delete_category(
    State(content_service): State<ContentService>,
    Path(id): Path<i64>,
    Extension(claims): Extension<Claims>,
) -> Result<StatusCode, AppError> {
    // Only admins can delete categories
    if !matches!(claims.role, UserRole::Admin | UserRole::System) {
        return Err(AppError::Forbidden);
    }

    content_service.delete_category(id).await?;
    Ok(StatusCode::NO_CONTENT)
}
