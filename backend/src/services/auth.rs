use crate::error::AppError;
use crate::models::user::{User, UserRole};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user id
    pub username: String,
    pub role: UserRole,
    pub device_id: Option<String>, // device id for tracking
    pub exp: i64,
    pub iat: i64,
}

#[derive(Clone)]
pub struct AuthService {
    jwt_secret: String,
}

impl AuthService {
    pub fn new(jwt_secret: String) -> Self {
        Self { jwt_secret }
    }

    /// Generate JWT token for authenticated user
    pub fn generate_token(&self, user: &User) -> Result<String, AppError> {
        self.generate_token_with_device(user, None)
    }

    /// Generate JWT token for authenticated user with device tracking
    pub fn generate_token_with_device(
        &self,
        user: &User,
        device_id: Option<String>,
    ) -> Result<String, AppError> {
        let now = Utc::now();
        let exp = now + Duration::hours(24); // Token expires in 24 hours

        let claims = Claims {
            sub: user.id.to_string(),
            username: user.username.clone(),
            role: user.role.clone(),
            device_id,
            exp: exp.timestamp(),
            iat: now.timestamp(),
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_ref()),
        )
        .map_err(|_| AppError::InternalServerError)
    }

    /// Verify and decode JWT token
    pub fn verify_token(&self, token: &str) -> Result<Claims, AppError> {
        decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_ref()),
            &Validation::default(),
        )
        .map(|data| data.claims)
        .map_err(|_| AppError::AuthenticationFailed)
    }

    /// Hash password using bcrypt
    pub fn hash_password(&self, password: &str) -> Result<String, AppError> {
        hash(password, DEFAULT_COST).map_err(|_| AppError::InternalServerError)
    }

    /// Verify password against hash
    pub fn verify_password(&self, password: &str, hash: &str) -> Result<bool, AppError> {
        verify(password, hash).map_err(|_| AppError::InternalServerError)
    }
}
