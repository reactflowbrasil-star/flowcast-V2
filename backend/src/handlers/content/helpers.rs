use crate::{error::AppError, services::{Claims, ContentService}};
use tracing::warn;

pub async fn verify_user_access(
    content_service: &ContentService,
    claims: &Claims,
    category_type: Option<&str>,
    category_id: Option<i64>,
) -> Result<(), AppError> {
    // Get user details to check if active
    let user = content_service
        .get_user_by_id(
            claims
                .sub
                .parse::<i64>()
                .map_err(|_| AppError::AuthenticationFailed)?,
        )
        .await?;

    // Check if user is active
    if !user.active {
        return Err(AppError::Forbidden);
    }

    // Admins and resellers have full access - skip category checks
    if matches!(
        claims.role,
        crate::models::user::UserRole::Admin | crate::models::user::UserRole::Reseller
    ) {
        return Ok(());
    }

    // Check category access for end users only
    if matches!(claims.role, crate::models::user::UserRole::EndUser) {
        if let Some(cat_id) = category_id {
            // Check if user has access to this category
            if let Some(subscribed_category_ids) = &user.subscribed_categories {
                if !subscribed_category_ids.contains(&cat_id) {
                    warn!("User {} denied access to category_id {}: not in subscribed categories {:?}",
                          claims.sub, cat_id, subscribed_category_ids);
                    return Err(AppError::Forbidden);
                }
            } else {
                // If no subscribed categories, deny access
                warn!(
                    "User {} denied access: no subscribed categories",
                    claims.sub
                );
                return Err(AppError::Forbidden);
            }
        } else if let Some(cat_type) = category_type {
            // For category type access, we need to get the category ID first
            if let Ok(Some(category)) = content_service.get_category_by_type(cat_type).await {
                if let Some(subscribed_category_ids) = &user.subscribed_categories {
                    if !subscribed_category_ids.contains(&category.id) {
                        warn!("User {} denied access to category_type {}: not in subscribed categories {:?}",
                              claims.sub, cat_type, subscribed_category_ids);
                        return Err(AppError::Forbidden);
                    }
                } else {
                    // If no subscribed categories, deny access
                    warn!(
                        "User {} denied access: no subscribed categories",
                        claims.sub
                    );
                    return Err(AppError::Forbidden);
                }
            }
        }
    }

    Ok(())
}

pub fn parse_claim_user_id(claims: &Claims) -> Result<i64, AppError> {
    claims
        .sub
        .parse::<i64>()
        .map_err(|_| AppError::AuthenticationFailed)
}

