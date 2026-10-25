use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;

use iptv_backend::{Config, Database, create_app};

// ═══════════════════════════════════════════════════════════
// Test Harness
// ═══════════════════════════════════════════════════════════

/// Helper that boots the full app against a real PostgreSQL database.
/// Requires DATABASE_URL and JWT_SECRET to be set.
struct TestApp {
    router: axum::Router,
}

impl TestApp {
    async fn try_new() -> Option<Self> {
        dotenvy::dotenv().ok();

        // Bail silently if required config is missing
        if std::env::var("DATABASE_URL").is_err() || std::env::var("JWT_SECRET").is_err() {
            return None;
        }

        let config = Config::from_env().ok()?;
        let database = Database::new(&config.database_url).await.ok()?;
        let router = create_app(database, config).await.ok()?;

        Some(Self { router })
    }

    /// Send a GET request and return (status, body JSON).
    async fn get(&self, uri: &str) -> (StatusCode, Value) {
        let req = Request::builder()
            .uri(uri)
            .body(Body::empty())
            .unwrap();

        let response = self
            .router
            .clone()
            .oneshot(req)
            .await
            .expect("oneshot failed");

        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap_or_default();
        let json: Value =
            serde_json::from_slice(&body).unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&body).to_string()));
        (status, json)
    }

    /// Send a GET with Authorization: Bearer header.
    async fn get_auth(&self, uri: &str, token: &str) -> (StatusCode, Value) {
        let req = Request::builder()
            .uri(uri)
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap();

        let response = self
            .router
            .clone()
            .oneshot(req)
            .await
            .expect("oneshot failed");

        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap_or_default();
        let json: Value =
            serde_json::from_slice(&body).unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&body).to_string()));
        (status, json)
    }

    /// Send a POST with JSON body and optional auth.
    async fn post(&self, uri: &str, body: Value, token: Option<&str>) -> (StatusCode, Value) {
        let mut builder = Request::builder()
            .method("POST")
            .uri(uri)
            .header("Content-Type", "application/json");

        if let Some(t) = token {
            builder = builder.header("Authorization", format!("Bearer {}", t));
        }

        let req = builder
            .body(Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap();

        let response = self
            .router
            .clone()
            .oneshot(req)
            .await
            .expect("oneshot failed");

        let status = response.status();
        let resp_body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap_or_default();
        let json: Value = serde_json::from_slice(&resp_body)
            .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&resp_body).to_string()));
        (status, json)
    }

    /// Login as admin and return the JWT token.
    async fn admin_login(&self) -> String {
        let password = std::env::var("ADMIN_DEFAULT_PASSWORD").unwrap_or_else(|_| "admin123".to_string());
        let (status, body) = self
            .post(
                "/api/auth/login",
                serde_json::json!({
                    "username": "admin",
                    "password": password
                }),
                None,
            )
            .await;
        assert_eq!(status, StatusCode::OK, "Admin login failed: {:?}", body);
        body["token"]
            .as_str()
            .expect("login response missing 'token' field")
            .to_string()
    }
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════
//
// All tests share a single TestApp via `tokio::sync::OnceCell`
// to avoid rebuilding the app + DB pool for every test case.
//
// To run:
//   cargo test --test integration
//
// Required env (auto-loaded from .env):
//   DATABASE_URL, JWT_SECRET
//
// If not set, tests are silently skipped.

use tokio::sync::OnceCell;

static APP: OnceCell<Option<TestApp>> = OnceCell::const_new();

async fn app() -> Option<&'static TestApp> {
    APP.get_or_init(|| async { TestApp::try_new().await })
        .await
        .as_ref()
}

/// Macro to skip tests when the app couldn't be initialized.
macro_rules! require_app {
    () => {
        match app().await {
            Some(a) => a,
            None => {
                eprintln!("⏭  Skipping integration test — DATABASE_URL or JWT_SECRET not set");
                return;
            }
        }
    };
}

// ─── Public Endpoints ─────────────────────────

#[tokio::test]
async fn public_movies_returns_200() {
    let app = require_app!();
    let (status, _body) = app.get("/api/content/movies").await;
    assert_eq!(status, StatusCode::OK, "GET /api/content/movies should return 200");
}

#[tokio::test]
async fn public_series_returns_200() {
    let app = require_app!();
    let (status, _body) = app.get("/api/content/series").await;
    assert_eq!(status, StatusCode::OK, "GET /api/content/series should return 200");
}

#[tokio::test]
async fn public_channels_returns_200() {
    let app = require_app!();
    let (status, _body) = app.get("/api/content/channels").await;
    assert_eq!(status, StatusCode::OK, "GET /api/content/channels should return 200");
}

#[tokio::test]
async fn public_categories_returns_200() {
    let app = require_app!();
    let (status, _body) = app.get("/api/content/categories").await;
    assert_eq!(status, StatusCode::OK, "GET /api/content/categories should return 200");
}

// ─── Auth Flow ────────────────────────────────

#[tokio::test]
async fn login_with_valid_credentials_returns_token() {
    let app = require_app!();
    let token = app.admin_login().await;
    assert!(!token.is_empty(), "Should receive a non-empty JWT");
}

#[tokio::test]
async fn login_with_invalid_credentials_returns_401() {
    let app = require_app!();
    let (status, _) = app
        .post(
            "/api/auth/login",
            serde_json::json!({
                "username": "admin",
                "password": "wrong_password_xyz"
            }),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "Bad credentials should return 401");
}

#[tokio::test]
async fn login_with_empty_body_returns_4xx() {
    let app = require_app!();
    let (status, _) = app
        .post("/api/auth/login", serde_json::json!({}), None)
        .await;
    assert!(
        status.is_client_error(),
        "Empty login body should return 4xx, got {}",
        status
    );
}

// ─── Authorization Guards ─────────────────────

#[tokio::test]
async fn admin_users_without_token_returns_401() {
    let app = require_app!();
    let (status, _) = app.get("/api/admin/users").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "Admin endpoint without token should 401");
}

#[tokio::test]
async fn user_profile_without_token_returns_401() {
    let app = require_app!();
    let (status, _) = app.get("/api/user/profile").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "User endpoint without token should 401");
}

#[tokio::test]
async fn payment_config_without_token_returns_401() {
    let app = require_app!();
    let (status, _) = app.get("/api/admin/payment-config").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "Payment config without token should 401");
}

#[tokio::test]
async fn invalid_jwt_returns_401() {
    let app = require_app!();
    let (status, _) = app
        .get_auth("/api/user/profile", "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.fake.invalid")
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "Invalid JWT should 401");
}

// ─── Authenticated Endpoints ──────────────────

#[tokio::test]
async fn admin_users_with_token_returns_200() {
    let app = require_app!();
    let token = app.admin_login().await;
    let (status, body) = app.get_auth("/api/admin/users", &token).await;
    assert_eq!(status, StatusCode::OK, "Admin users should return 200, got: {:?}", body);
}

#[tokio::test]
async fn admin_config_with_token_returns_200() {
    let app = require_app!();
    let token = app.admin_login().await;
    let (status, _) = app.get_auth("/api/admin/config", &token).await;
    assert_eq!(status, StatusCode::OK, "Admin config should return 200");
}

#[tokio::test]
async fn payment_config_returns_expected_fields() {
    let app = require_app!();
    let token = app.admin_login().await;
    let (status, body) = app.get_auth("/api/admin/payment-config", &token).await;
    assert_eq!(status, StatusCode::OK, "Payment config should return 200");

    // Verify expected fields exist
    assert!(body.get("has_stripe_key").is_some(), "Missing 'has_stripe_key'");
    assert!(body.get("stripe_currency").is_some(), "Missing 'stripe_currency'");
    assert!(body.get("has_webhook_secret").is_some(), "Missing 'has_webhook_secret'");
}

#[tokio::test]
async fn user_profile_with_token_returns_200() {
    let app = require_app!();
    let token = app.admin_login().await;
    let (status, body) = app.get_auth("/api/user/profile", &token).await;
    assert_eq!(status, StatusCode::OK, "Profile should return 200, got: {:?}", body);
    assert!(body.get("username").is_some(), "Profile should have 'username'");
}

// ─── Invalid Routes ───────────────────────────

#[tokio::test]
async fn nonexistent_route_returns_404() {
    let app = require_app!();
    let (status, _) = app.get("/api/nonexistent/endpoint").await;
    assert_eq!(status, StatusCode::NOT_FOUND, "Unknown route should 404");
}

// ─── Content Listing Structure ────────────────

#[tokio::test]
async fn movies_response_is_array_or_has_data_field() {
    let app = require_app!();
    let (status, body) = app.get("/api/content/movies").await;
    assert_eq!(status, StatusCode::OK);

    // The response should either be an array of movies or an object with a "data" array
    let is_array = body.is_array();
    let has_data = body.get("data").map_or(false, |d| d.is_array());
    let has_items = body.get("items").map_or(false, |d| d.is_array());
    assert!(
        is_array || has_data || has_items,
        "Movies response should be an array or contain 'data'/'items' array, got: {}",
        serde_json::to_string_pretty(&body).unwrap_or_default().chars().take(500).collect::<String>()
    );
}

// ─── Enhanced Health Check ────────────────────

#[tokio::test]
async fn health_check_returns_db_status_and_version() {
    let app = require_app!();
    let (status, body) = app.get("/api/health").await;
    assert_eq!(status, StatusCode::OK, "Health check should return 200");
    assert_eq!(body["status"].as_str(), Some("ok"));
    assert!(body.get("database").is_some(), "Health check should report DB status");
    assert!(body.get("version").is_some(), "Health check should report version");
    assert!(body.get("uptime").is_some(), "Health check should report uptime");
}

// ─── Admin Config ─────────────────────────────

#[tokio::test]
async fn admin_config_returns_config_entries() {
    let app = require_app!();
    let token = app.admin_login().await;
    let (status, body) = app.get_auth("/api/admin/config", &token).await;
    assert_eq!(status, StatusCode::OK);
    // Config should be an array or object with entries
    assert!(
        body.is_array() || body.is_object(),
        "Config response should be an array or object"
    );
}

// ─── Rate Limiter Behavior ────────────────────

#[tokio::test]
async fn first_login_attempt_is_not_rate_limited() {
    let app = require_app!();
    // A single login attempt (even with wrong creds) should NOT get 429
    let (status, _) = app
        .post(
            "/api/auth/login",
            serde_json::json!({
                "username": "nonexistent_rate_test_user",
                "password": "test"
            }),
            None,
        )
        .await;
    assert_ne!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "First login attempt should never get 429"
    );
}
