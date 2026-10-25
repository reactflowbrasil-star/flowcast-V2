use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Authentication failed")]
    AuthenticationFailed,

    #[error("User not found")]
    UserNotFound,

    #[error("Invalid password")]
    InvalidPassword,

    #[error("Account inactive")]
    AccountInactive,

    #[error("Subscription expired")]
    SubscriptionExpired,

    #[error("Insufficient credits")]
    InsufficientCredits,

    #[error("Device limit exceeded")]
    DeviceLimitExceeded,

    #[error("Device disconnected")]
    DeviceDisconnected,

    #[error("TMDB API error: {0}")]
    TmdbError(String),

    #[error("External service error: {0}")]
    ExternalServiceError(String),

    #[error("Encryption error")]
    EncryptionError,

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("Internal server error")]
    InternalServerError,

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Not found")]
    NotFound,

    #[error("Forbidden")]
    Forbidden,

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    #[error("Timeout error: {0}")]
    TimeoutError(String),

    #[error("Configuration error: {0}")]
    ConfigurationError(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Two-factor authentication required")]
    TwoFactorRequired,

    #[error("Too many requests")]
    TooManyRequests(u64),

    #[error("Internal error: {0}")]
    InternalError(String),

    #[error("License required: {0}")]
    LicenseRequired(String),

    #[error("Extended license required: {0}")]
    ExtendedLicenseRequired(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::AuthenticationFailed => (StatusCode::UNAUTHORIZED, "Authentication failed"),
            AppError::UserNotFound => (StatusCode::UNAUTHORIZED, "User not found"),
            AppError::InvalidPassword => (StatusCode::UNAUTHORIZED, "Invalid password"),
            AppError::AccountInactive => (StatusCode::UNAUTHORIZED, "Account inactive"),
            AppError::SubscriptionExpired => (StatusCode::UNAUTHORIZED, "Subscription expired"),
            AppError::InsufficientCredits => (StatusCode::BAD_REQUEST, "Insufficient credits"),
            AppError::DeviceLimitExceeded => (StatusCode::BAD_REQUEST, "Device limit exceeded"),
            AppError::DeviceDisconnected => (StatusCode::UNAUTHORIZED, "Device disconnected"),
            AppError::TmdbError(_) => (StatusCode::BAD_GATEWAY, "External API error"),
            AppError::ExternalServiceError(_) => {
                (StatusCode::BAD_GATEWAY, "External service error")
            }
            AppError::EncryptionError => (StatusCode::INTERNAL_SERVER_ERROR, "Encryption error"),
            AppError::DatabaseError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            AppError::InternalServerError => {
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AppError::BadRequest(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found"),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "Forbidden"),
            AppError::ValidationError(ref msg) => (StatusCode::UNPROCESSABLE_ENTITY, msg.as_str()),
            AppError::Conflict(ref msg) => (StatusCode::CONFLICT, msg.as_str()),
            AppError::RateLimitExceeded => (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded"),
            AppError::ServiceUnavailable(_) => {
                (StatusCode::SERVICE_UNAVAILABLE, "Service unavailable")
            }
            AppError::TimeoutError(_) => (StatusCode::REQUEST_TIMEOUT, "Request timeout"),
            AppError::ConfigurationError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "Configuration error")
            }
            AppError::PermissionDenied(_) => (StatusCode::FORBIDDEN, "Permission denied"),
            AppError::TwoFactorRequired => {
                (StatusCode::FORBIDDEN, "Two-factor authentication required")
            }
            AppError::TooManyRequests(retry_after) => {
                // Return 429 with Retry-After header
                let body = Json(json!({
                    "error": "Too many requests",
                    "details": format!("Rate limit exceeded. Try again in {} seconds.", retry_after),
                    "retry_after": retry_after,
                    "timestamp": chrono::Utc::now().to_rfc3339()
                }));
                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    [(
                        axum::http::header::RETRY_AFTER,
                        retry_after.to_string(),
                    )],
                    body,
                )
                    .into_response();
            }
            AppError::InternalError(ref msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.as_str()),
            AppError::LicenseRequired(ref msg) => (StatusCode::FORBIDDEN, msg.as_str()),
            AppError::ExtendedLicenseRequired(ref msg) => (StatusCode::FORBIDDEN, msg.as_str()),
        };

        // Log error for monitoring (except for client errors)
        match &self {
            AppError::InternalServerError
            | AppError::DatabaseError(_)
            | AppError::EncryptionError
            | AppError::ConfigurationError(_)
            | AppError::ServiceUnavailable(_)
            | AppError::TimeoutError(_) => {
                tracing::error!("Server error: {}", self);
            }
            AppError::TmdbError(_) | AppError::ExternalServiceError(_) => {
                tracing::warn!("External service error: {}", self);
            }
            AppError::ValidationError(_) | AppError::BadRequest(_) => {
                tracing::debug!("Client error: {}", self);
            }
            _ => {
                tracing::info!("Request error: {}", self);
            }
        }

        let body = Json(json!({
            "error": error_message,
            "details": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339()
        }));

        (status, body).into_response()
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::ValidationError(format!("JSON serialization error: {}", err))
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::ConfigurationError(format!("IO error: {}", err))
    }
}

impl From<image::ImageError> for AppError {
    fn from(err: image::ImageError) -> Self {
        AppError::ConfigurationError(format!("Image processing error: {}", err))
    }
}
