use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::AppError, AppState};

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Serialize)]
pub struct ForgotPasswordResponse {
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyResetTokenRequest {
    pub token: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyResetTokenResponse {
    pub valid: bool,
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, Serialize)]
pub struct ResetPasswordResponse {
    pub message: String,
}

/// Request a password reset email
pub async fn forgot_password(
    State(app_state): State<AppState>,
    Json(payload): Json<ForgotPasswordRequest>,
) -> Result<Json<ForgotPasswordResponse>, AppError> {
    // Check if email service is configured
    if !app_state.email_service.is_configured() {
        return Err(AppError::BadRequest(
            "Email service is not configured. Contact administrator.".to_string(),
        ));
    }

    // Find user by email
    let user = sqlx::query_as::<_, (i64, String, String)>(
        "SELECT id, username, email FROM auth.users WHERE email = $1 AND active = true",
    )
    .bind(&payload.email)
    .fetch_optional(&app_state.database.pool)
    .await?;

    // Always return success to prevent email enumeration
    let response = ForgotPasswordResponse {
        message: "If an account with that email exists, a password reset link has been sent."
            .to_string(),
    };

    let Some((user_id, username, email)) = user else {
        tracing::info!(
            email = payload.email,
            "Password reset requested for non-existent email"
        );
        return Ok(Json(response));
    };

    // Invalidate any existing tokens for this user
    sqlx::query("UPDATE auth.password_reset_tokens SET used = true WHERE user_id = $1 AND used = false")
        .bind(user_id)
        .execute(&app_state.database.pool)
        .await?;

    // Generate a secure token
    let token = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + Duration::hours(1);

    // Store the token
    sqlx::query(
        "INSERT INTO auth.password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(user_id)
    .bind(&token)
    .bind(expires_at)
    .execute(&app_state.database.pool)
    .await?;

    // Send the email
    if let Err(e) = app_state
        .email_service
        .send_password_reset(&email, &username, &token)
        .await
    {
        tracing::error!(error = %e, user_id = user_id, "Failed to send password reset email");
        // Don't expose the error to the user
    } else {
        tracing::info!(
            user_id = user_id,
            username = username,
            "Password reset email sent"
        );
    }

    Ok(Json(response))
}

/// Verify if a reset token is valid
pub async fn verify_reset_token(
    State(app_state): State<AppState>,
    Json(payload): Json<VerifyResetTokenRequest>,
) -> Result<Json<VerifyResetTokenResponse>, AppError> {
    let result = sqlx::query_as::<_, (i64, String)>(
        r#"
        SELECT u.id, u.username
        FROM auth.password_reset_tokens prt
        JOIN auth.users u ON prt.user_id = u.id
        WHERE prt.token = $1 AND prt.used = false AND prt.expires_at > $2
        "#,
    )
    .bind(&payload.token)
    .bind(Utc::now())
    .fetch_optional(&app_state.database.pool)
    .await?;

    match result {
        Some((_, username)) => Ok(Json(VerifyResetTokenResponse {
            valid: true,
            username: Some(username),
        })),
        None => Ok(Json(VerifyResetTokenResponse {
            valid: false,
            username: None,
        })),
    }
}

/// Reset password using a valid token
pub async fn reset_password(
    State(app_state): State<AppState>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<Json<ResetPasswordResponse>, AppError> {
    // Validate password length
    if payload.new_password.len() < 6 {
        return Err(AppError::BadRequest(
            "Password must be at least 6 characters long".to_string(),
        ));
    }

    // Atomically consume the token: mark as used and return user_id in one step.
    // This prevents parallel requests from both using the same token.
    let token_record = sqlx::query_as::<_, (i64,)>(
        r#"
        UPDATE auth.password_reset_tokens
        SET used = true
        WHERE token = $1 AND used = false AND expires_at > $2
        RETURNING user_id
        "#,
    )
    .bind(&payload.token)
    .bind(Utc::now())
    .fetch_optional(&app_state.database.pool)
    .await?;

    let Some((user_id,)) = token_record else {
        return Err(AppError::BadRequest(
            "Invalid or expired reset token".to_string(),
        ));
    };

    // Hash the new password
    let password_hash = bcrypt::hash(&payload.new_password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::InternalError(format!("Failed to hash password: {}", e)))?;

    // Update the user's password
    sqlx::query("UPDATE auth.users SET password_hash = $1 WHERE id = $2")
        .bind(&password_hash)
        .bind(user_id)
        .execute(&app_state.database.pool)
        .await?;

    // Invalidate all other tokens for this user
    sqlx::query("UPDATE auth.password_reset_tokens SET used = true WHERE user_id = $1")
        .bind(user_id)
        .execute(&app_state.database.pool)
        .await?;

    tracing::info!(user_id = user_id, "Password reset successfully");

    Ok(Json(ResetPasswordResponse {
        message: "Password has been reset successfully. You can now login with your new password."
            .to_string(),
    }))
}
