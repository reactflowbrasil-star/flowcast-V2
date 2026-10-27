pub mod config;
pub mod database;
pub mod encryption_middleware;
pub mod error;
pub mod file_cache;
pub mod file_stream;
pub mod handlers;
pub mod middleware;
pub mod models;
pub mod services;
pub mod validation;

pub use config::Config;
pub use database::Database;

// Lightweight, idempotent schema creator used by setup tools and optional runtime migrations
#[path = "modules/db_structure.rs"]
pub mod db_structure;

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{delete, get, post, put},
    Extension, Router,
};

use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use services::activity_log::ActivityLogService;
use services::email::{EmailConfig, EmailService};
use services::user_activity::UserActivityService;
use services::{
    AuthService, ContentService, DeviceService, MediaWatcherService, TmdbService, UserService,
};

/// In-memory IP-based rate limiter for login endpoints.
/// Tracks timestamps of login attempts per IP address.
#[derive(Clone)]
pub struct LoginRateLimiter {
    /// Map of IP -> list of attempt timestamps
    attempts: Arc<Mutex<HashMap<IpAddr, Vec<Instant>>>>,
}

impl LoginRateLimiter {
    pub fn new() -> Self {
        Self {
            attempts: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Check if the IP is rate-limited. Returns Ok(()) or Err with retry-after seconds.
    pub async fn check_ip(&self, ip: IpAddr) -> Result<(), u64> {
        let mut map = self.attempts.lock().await;
        let now = Instant::now();

        let timestamps = map.entry(ip).or_default();

        // Remove entries older than 1 hour
        timestamps.retain(|t| now.duration_since(*t).as_secs() < 3600);

        // Count attempts in the last minute
        let one_min_ago = now - std::time::Duration::from_secs(60);
        let attempts_last_minute = timestamps.iter().filter(|t| **t > one_min_ago).count();

        if attempts_last_minute >= 10 {
            return Err(60); // Retry after 60 seconds
        }
        if timestamps.len() >= 50 {
            return Err(3600); // Retry after 1 hour
        }

        timestamps.push(now);
        Ok(())
    }

    /// Spawn a background task that cleans up stale entries every 10 minutes.
    pub fn spawn_cleanup_task(self) {
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(600)).await;
                let mut map = self.attempts.lock().await;
                let now = Instant::now();
                map.retain(|_, timestamps| {
                    timestamps.retain(|t| now.duration_since(*t).as_secs() < 3600);
                    !timestamps.is_empty()
                });
            }
        });
    }
}

#[derive(Clone)]
pub struct AppState {
    pub database: Database,
    pub auth_service: services::AuthService,
    pub user_service: services::UserService,
    pub device_service: services::DeviceService,
    pub content_service: services::ContentService,
    pub tmdb_service: services::TmdbService,
    pub activity_log_service: ActivityLogService,
    pub user_activity_service: UserActivityService,
    pub security_service: services::security::SecurityService,
    pub epg_service: services::EpgService,
    pub reseller_logs_service: services::ResellerLogsService,
    pub media_watcher_service: Arc<services::MediaWatcherService>,
    pub email_service: EmailService,
    pub login_rate_limiter: LoginRateLimiter,
    pub license_service: services::license::LicenseService,
    pub config: config::Config,
    pub started_at: Instant,
}

pub async fn create_app(database: Database, config: Config) -> anyhow::Result<Router> {
    // Ensure there is at least one admin user available for system-owned operations (e.g., gift code redemption user creation)
    if let Err(e) = db_structure::ensure_default_admin_user(&database.pool).await {
        tracing::warn!("Failed to ensure default admin user: {}", e);
    }
    // Initialize auth service with JWT secret from core.config
    let auth_service = AuthService::new(config.jwt_secret.clone());

    // Initialize user service
    let user_service = UserService::new(database.clone(), auth_service.clone());

    // Initialize device service
    let device_service = DeviceService::new(database.clone());

    // Initialize TMDB service
    let tmdb_service = TmdbService::new(database.pool.clone(), config.public_base_url.clone());
    let metadata_dir = tmdb_service
        .metadata_root_path()
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()))?;
    tracing::info!("Serving metadata assets from {}", metadata_dir.display());

    // Initialize content service with TMDB service
    let content_service =
        ContentService::new(database.pool.clone()).with_tmdb_service(tmdb_service.clone());

    // Initialize activity log service
    let activity_log_service = ActivityLogService::new(database.clone());
    // Initialize user activity service
    let user_activity_service = UserActivityService::new(database.clone());
    // Initialize security service
    let security_service = services::security::SecurityService::new(database.pool.clone());
    // Initialize EPG service
    let epg_service = services::EpgService::new(database.pool.clone());
    // Initialize reseller logs service
    let reseller_logs_service = services::ResellerLogsService::new(database.pool.clone());
    // Initialize favorites service
    let favorites_service = services::favorites::FavoritesService::new(database.clone());

    // Initialize media watcher service
    let content_service_arc = Arc::new(content_service.clone());
    let media_watcher_service = Arc::new(MediaWatcherService::new(
        database.pool.clone(),
        content_service_arc,
    ));

    // Start background watcher
    media_watcher_service.clone().start_background_watcher();

    // Initialize email service from database configuration
    let email_config = EmailConfig::from_db(&database.pool).await;
    if email_config.is_some() {
        tracing::info!("📧 Email service configured from database");
    } else {
        tracing::info!("📧 Email service not configured. Configure it in Admin > Email settings.");
    }
    let email_service = EmailService::new(email_config);

    // Initialize login rate limiter
    let login_rate_limiter = LoginRateLimiter::new();
    login_rate_limiter.clone().spawn_cleanup_task();

    // Initialize license verification service
    let license_service = services::license::LicenseService::new(database.pool.clone());
    // Start background re-validation of active license (every 24h)
    license_service.clone().spawn_revalidation_task();

    // Create shared app state
    let app_state = AppState {
        database,
        auth_service,
        user_service,
        device_service,
        content_service,
        tmdb_service,
        activity_log_service,
        user_activity_service,
        security_service,
        epg_service,
        reseller_logs_service,
        media_watcher_service,
        email_service,
        login_rate_limiter,
        license_service,
        config: config.clone(),
        started_at: Instant::now(),
    };

    // Create admin content routes (require admin role)
    let admin_content_routes = Router::new()
        .nest(
            "/api/admin/content",
            handlers::content::admin_content_routes(),
        )
        .with_state(app_state.content_service.clone())
        .layer(Extension(app_state.config.clone()))
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Admin stream CRUD routes (AppState based, require admin role)
    let admin_streams_routes = Router::new()
        .nest(
            "/api/admin/content",
            handlers::content::admin_streams_routes(),
        )
        .with_state(app_state.clone())
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Admin episode stream CRUD routes (require admin role)
    let admin_episode_streams_routes = Router::new()
        .nest(
            "/api/admin/episodes",
            handlers::content::admin_episode_streams_routes(),
        )
        .with_state(app_state.clone())
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Create admin series routes (require admin role)
    let admin_series_routes = Router::new()
        .nest("/api/admin/series", handlers::series::admin_series_routes())
        .with_state(app_state.content_service.clone())
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Create admin specialized content routes (require admin role)
    let admin_specialized_routes = Router::new()
        .nest(
            "/api/admin/specialized",
            handlers::specialized::admin_specialized_content_routes(),
        )
        .with_state(app_state.content_service.clone())
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Admin ingest routes (scan folders) - require admin
    let admin_ingest_routes = Router::new()
        .nest(
            "/api/admin/ingest",
            handlers::scanner::admin_ingest_routes(),
        )
        .with_state(app_state.content_service.clone())
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Admin media watcher routes - require admin
    let admin_media_watcher_routes = Router::new()
        .nest(
            "/api/admin/media-watcher",
            handlers::media_watcher::media_watcher_routes(),
        )
        .with_state(app_state.clone())
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Admin upload routes - require admin
    let admin_upload_routes = Router::new()
        .nest("/api/admin", handlers::upload::upload_routes())
        .with_state(app_state.clone())
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Admin app versions routes - require admin
    let admin_app_versions_routes = Router::new()
        .merge(handlers::app_versions::admin_routes())
        .with_state(app_state.clone())
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Create admin routes (require admin role)
    let admin_routes = Router::new()
        .route("/api/admin/admins", post(handlers::admin::create_admin))
        .route("/api/admin/users", get(handlers::admin::get_all_end_users))
        .route(
            "/api/admin/users/check-username/:username",
            get(handlers::admin::check_username_availability),
        )
        .route("/api/admin/users", post(handlers::admin::create_end_user))
        .route("/api/admin/users/:id", get(handlers::admin::get_user))
        .route("/api/admin/users/:id", put(handlers::admin::update_user))
        .route("/api/admin/users/:id", delete(handlers::admin::delete_user))
        .route(
            "/api/admin/users/:id/status",
            put(handlers::admin::set_user_active_status),
        )
        .route(
            "/api/admin/users/:id/credits",
            put(handlers::admin::update_user_credits),
        )
        .route(
            "/api/admin/users/:id/password",
            put(handlers::admin::reset_user_password),
        )
        .route(
            "/api/admin/users/:id/transfer",
            put(handlers::admin::transfer_user),
        )
        .route(
            "/api/admin/users/export",
            get(handlers::admin::export_users),
        )
        .route(
            "/api/admin/users/bulk",
            put(handlers::admin::bulk_update_users),
        )
        .route(
            "/api/admin/users/:id/devices",
            get(handlers::device::admin_get_user_devices),
        )
        .route(
            "/api/admin/users/:id/devices/:device_id",
            delete(handlers::device::admin_remove_user_device),
        )
        .route(
            "/api/admin/users/:id/devices/:device_id/remove-and-blacklist",
            delete(handlers::device::admin_remove_and_blacklist_device),
        )
        .route(
            "/api/admin/users/:id/devices/:device_id/blacklist",
            post(handlers::device::admin_blacklist_device),
        )
        .route(
            "/api/admin/devices/:device_id/disconnect",
            post(handlers::device::admin_disconnect_device),
        )
        .route(
            "/api/admin/users/:id/stats",
            get(handlers::admin::get_user_stats),
        )
        .route(
            "/api/admin/users/:id/subscriptions",
            put(handlers::admin::update_user_subscriptions),
        )
        .route(
            "/api/admin/devices",
            get(handlers::device::admin_get_all_devices),
        )
        .route(
            "/api/admin/devices/stats",
            get(handlers::device::admin_get_device_stats),
        )
        .route("/api/admin/config", get(handlers::admin::get_config))
        .route("/api/admin/config", put(handlers::admin::update_config))
        .route("/api/admin/payment-config", get(handlers::admin::get_payment_config))
        .route(
            "/api/admin/notifications",
            get(handlers::notifications::get_admin_notifications),
        )
        .route(
            "/api/admin/import/sqlite",
            post(handlers::admin::import_sqlite),
        )
        .route(
            "/api/admin/import/sqlite/upload",
            post(handlers::admin::import_sqlite_upload),
        )
        .route(
            "/api/admin/import/tasks",
            get(handlers::admin::get_import_tasks),
        )
        .route(
            "/api/admin/import/tasks/:task_id",
            get(handlers::admin::get_import_task),
        )
        .route(
            "/api/admin/db/export",
            post(handlers::admin::export_postgres_backup),
        )
        .route(
            "/api/admin/db/export/:file",
            get(handlers::admin::download_postgres_backup),
        )
        .route(
            "/api/admin/db/import",
            post(handlers::admin::import_postgres_backup),
        )
        .route(
            "/api/admin/config/tmdb",
            put(handlers::admin::update_tmdb_config),
        )
        .route(
            "/api/admin/config/tmdb/test",
            post(handlers::admin::test_tmdb_key),
        )
        .route(
            "/api/admin/credits/rates",
            get(handlers::admin::get_credit_rates),
        )
        .route("/api/admin/stats", get(handlers::admin::get_system_stats))
        .route("/api/admin/system/metrics", get(handlers::admin::get_system_metrics))
        .route("/api/admin/folders", get(handlers::scanner::list_folders))
        .route(
            "/api/admin/demos/reset-counters",
            post(handlers::admin::reset_daily_demo_counters),
        )
        .route(
            "/api/admin/categories",
            get(handlers::admin::get_categories),
        )
        .route("/api/admin/logs", get(handlers::get_admin_activity_logs))
        // User activity tracking routes (Admin only)
        .route(
            "/api/admin/activity/login-history",
            get(handlers::user_activity::get_login_history),
        )
        .route(
            "/api/admin/activity/viewing-history",
            get(handlers::user_activity::get_viewing_history),
        )
        .route(
            "/api/admin/activity/dashboard-metrics",
            get(handlers::user_activity::get_dashboard_metrics),
        )
        // Ticket management routes (Admin)
        .route("/api/admin/tickets", get(handlers::get_tickets))
        .route("/api/admin/tickets", post(handlers::create_ticket_admin))
        .route(
            "/api/admin/tickets/unread-count",
            get(handlers::get_unread_count_total),
        )
        .route("/api/admin/tickets/:id", put(handlers::update_ticket_admin))
        .route(
            "/api/admin/tickets/:id",
            delete(handlers::delete_ticket_admin),
        )
        .route(
            "/api/admin/tickets/:id/assign",
            post(handlers::assign_ticket_to_self),
        )
        .route(
            "/api/admin/tickets/:id/messages",
            get(handlers::get_ticket_messages),
        )
        .route(
            "/api/admin/tickets/:id/messages",
            post(handlers::add_ticket_message),
        )
        .route(
            "/api/admin/tickets/:id/read",
            post(handlers::mark_ticket_messages_read),
        )
        // Security management routes (Admin only)
        .route(
            "/api/admin/security/stats",
            get(handlers::security::get_security_stats),
        )
        .route(
            "/api/admin/security/incidents",
            get(handlers::security::get_security_incidents),
        )
        .route(
            "/api/admin/security/incidents",
            post(handlers::security::create_security_incident),
        )
        .route(
            "/api/admin/security/incidents/:id",
            delete(handlers::security::delete_security_incident),
        )
        .route(
            "/api/admin/security/bans",
            get(handlers::security::get_security_bans),
        )
        .route(
            "/api/admin/security/bans",
            post(handlers::security::create_security_ban),
        )
        .route(
            "/api/admin/security/bans/cleanup",
            post(handlers::security::cleanup_expired_bans),
        )
        .route(
            "/api/admin/security/users/:username/ban-status",
            get(handlers::security::check_user_ban_status),
        )
        .route(
            "/api/admin/security/users/:username/unban",
            post(handlers::security::unban_user),
        )
        .route(
            "/api/admin/security/blacklisted-devices",
            get(handlers::security::get_blacklisted_devices),
        )
        .route(
            "/api/admin/security/blacklisted-devices/remove",
            post(handlers::security::remove_device_from_blacklist),
        )
        // Master API Key routes
        .route(
            "/api/admin/master-api-keys",
            get(handlers::get_master_api_keys),
        )
        .route(
            "/api/admin/master-api-keys",
            post(handlers::create_master_api_key),
        )
        .route(
            "/api/admin/master-api-keys/:id",
            get(handlers::get_master_api_key_by_id),
        )
        .route(
            "/api/admin/master-api-keys/:id",
            put(handlers::update_master_api_key),
        )
        .route(
            "/api/admin/master-api-keys/:id",
            delete(handlers::delete_master_api_key),
        )
        .route(
            "/api/admin/master-api-keys/:id/regenerate",
            post(handlers::regenerate_master_api_key),
        )
        // Admin demo management routes
        .route("/api/admin/demos", get(handlers::admin::get_demo_users))
        .route(
            "/api/admin/demos/history",
            get(handlers::admin::get_demo_history),
        )
        .route(
            "/api/admin/demos/config",
            get(handlers::admin::get_demo_config),
        )
        .route(
            "/api/admin/demos/config",
            put(handlers::admin::update_demo_config),
        )
        // License verification routes (admin)
        .route(
            "/api/admin/license/activate",
            post(handlers::license::activate_license),
        )
        .route(
            "/api/admin/license/status",
            get(handlers::license::get_license_status),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // ─── Packages & Subscriptions (require ANY license + admin role) ───
    // Available to both Regular and Extended licenses
    let admin_packages_routes = Router::new()
        // Direct subscription packages (Admin)
        .route(
            "/api/admin/packages",
            get(handlers::end_user_subscription::admin_list_packages),
        )
        .route(
            "/api/admin/packages",
            post(handlers::end_user_subscription::admin_create_package),
        )
        .route(
            "/api/admin/packages/:id",
            put(handlers::end_user_subscription::admin_update_package),
        )
        .route(
            "/api/admin/packages/:id",
            delete(handlers::end_user_subscription::admin_deactivate_package),
        )
        .route(
            "/api/admin/direct-subscriptions",
            get(handlers::end_user_subscription::admin_list_subscriptions),
        )
        .route(
            "/api/admin/direct-subscriptions/stats",
            get(handlers::end_user_subscription::admin_subscription_stats),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_any_license,
        ))
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // ─── Monetization admin routes (require Extended License + admin role) ───
    // Resellers, billing, gift codes, credits pricing
    let admin_monetization_routes = Router::new()
        // Reseller management (Admin)
        .route("/api/admin/resellers", get(handlers::admin::get_resellers))
        .route(
            "/api/admin/resellers",
            post(handlers::admin::create_reseller),
        )
        .route(
            "/api/admin/resellers/:id",
            put(handlers::admin::update_reseller),
        )
        .route(
            "/api/admin/resellers/:id/credits",
            put(handlers::admin::update_reseller_credits),
        )
        .route(
            "/api/admin/resellers/:id/users",
            get(handlers::admin::get_reseller_users),
        )
        .route(
            "/api/admin/resellers/:id/demo-limit",
            put(handlers::admin::update_reseller_demo_limit),
        )
        // Billing (Admin)
        .route(
            "/api/admin/billing/overview",
            get(handlers::admin::get_billing_overview),
        )
        .route(
            "/api/admin/billing/transactions",
            get(handlers::admin::list_billing_transactions),
        )
        .route(
            "/api/admin/billing/transactions/offline-payment",
            post(handlers::admin::create_offline_payment),
        )
        // Gift codes (monetization feature)
        .route(
            "/api/admin/gift-codes",
            post(handlers::gift_codes::create_gift_code),
        )
        .route(
            "/api/admin/gift-codes/bulk",
            post(handlers::gift_codes::bulk_create_gift_codes),
        )
        .route(
            "/api/admin/gift-codes",
            get(handlers::gift_codes::list_gift_codes),
        )
        .route(
            "/api/admin/gift-codes",
            delete(handlers::gift_codes::delete_gift_codes),
        )
        // Credits pricing config
        .route(
            "/api/admin/credits/pricing-config",
            get(handlers::admin::get_pricing_config),
        )
        .route(
            "/api/admin/credits/pricing-config",
            put(handlers::admin::update_pricing_config),
        )
        .route(
            "/api/admin/config/credits",
            put(handlers::admin::update_credit_config),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_extended_license,
        ))
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Create reseller routes (require reseller role + Extended License)
    let reseller_routes = Router::new()
        .route(
            "/api/reseller/users",
            get(handlers::reseller::get_my_end_users),
        )
        .route(
            "/api/reseller/users/check-username/:username",
            get(handlers::reseller::check_username_availability),
        )
        .route(
            "/api/reseller/users",
            post(handlers::reseller::create_end_user),
        )
        .route(
            "/api/reseller/users/:id",
            put(handlers::reseller::update_end_user),
        )
        .route(
            "/api/reseller/users/:id",
            axum::routing::delete(handlers::reseller::delete_end_user),
        )
        .route(
            "/api/reseller/users/:id/extend",
            put(handlers::reseller::extend_user_subscription),
        )
        .route(
            "/api/reseller/users/:id/status",
            put(handlers::reseller::set_end_user_active_status),
        )
        .route(
            "/api/reseller/users/:id/devices",
            get(handlers::device::reseller_get_user_devices),
        )
        .route(
            "/api/reseller/credits",
            get(handlers::reseller::get_credit_balance),
        )
        .route(
            "/api/reseller/credits/calculate/:devices",
            get(handlers::reseller::calculate_credit_cost),
        )
        .route(
            "/api/reseller/credits/usage",
            get(handlers::reseller::get_credit_usage_stats),
        )
        .route(
            "/api/reseller/credits/rates",
            get(handlers::reseller::get_credit_rates),
        )
        .route(
            "/api/reseller/credits/checkout-session",
            post(handlers::payments::create_checkout_session),
        )
        .route(
            "/api/reseller/demos",
            post(handlers::reseller::create_demo_user),
        )
        .route(
            "/api/reseller/demos/stats",
            get(handlers::reseller::get_demo_stats),
        )
        .route(
            "/api/reseller/categories",
            get(handlers::content::get_categories),
        )
        .route(
            "/api/reseller/stats",
            get(handlers::reseller::get_reseller_stats),
        )
        .route(
            "/api/reseller/logs",
            get(handlers::get_reseller_activity_logs),
        )
        // Ticket management routes (Reseller)
        .route("/api/reseller/tickets", post(handlers::create_ticket))
        .route("/api/reseller/tickets", get(handlers::get_tickets))
        .route(
            "/api/reseller/tickets/unread-count",
            get(handlers::get_unread_count_total),
        )
        .route(
            "/api/reseller/tickets/:id/messages",
            get(handlers::get_ticket_messages),
        )
        .route(
            "/api/reseller/tickets/:id/messages",
            post(handlers::add_ticket_message),
        )
        .route(
            "/api/reseller/tickets/:id/read",
            post(handlers::mark_ticket_messages_read),
        )
        // Notifications routes
        .route(
            "/api/reseller/notifications",
            get(handlers::notifications::get_reseller_notifications),
        )
        // API Keys management routes (Reseller)
        .route(
            "/api/reseller/api-keys",
            get(handlers::reseller_api_keys::list_api_keys),
        )
        .route(
            "/api/reseller/api-keys",
            post(handlers::reseller_api_keys::create_api_key),
        )
        .route(
            "/api/reseller/api-keys/permissions",
            get(handlers::reseller_api_keys::list_available_permissions),
        )
        .route(
            "/api/reseller/api-keys/:id",
            get(handlers::reseller_api_keys::get_api_key),
        )
        .route(
            "/api/reseller/api-keys/:id",
            put(handlers::reseller_api_keys::update_api_key),
        )
        .route(
            "/api/reseller/api-keys/:id",
            delete(handlers::reseller_api_keys::delete_api_key),
        )
        .route(
            "/api/reseller/api-keys/:id/regenerate",
            post(handlers::reseller_api_keys::regenerate_api_key),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_extended_license,
        ))
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::reseller_or_admin,
        ));

    // Create Public API v1 routes (API Key authentication)
    let public_api_routes = Router::new()
        .route("/api/v1/users", get(handlers::public_api::list_users))
        .route("/api/v1/users", post(handlers::public_api::create_user))
        .route("/api/v1/users/:id", get(handlers::public_api::get_user))
        .route(
            "/api/v1/users/:id/extend",
            post(handlers::public_api::extend_user),
        )
        .route(
            "/api/v1/users/:id/status",
            put(handlers::public_api::update_user_status),
        )
        .route(
            "/api/v1/users/:id",
            delete(handlers::public_api::delete_user),
        )
        .route(
            "/api/v1/credits/balance",
            get(handlers::public_api::get_credit_balance),
        )
        .route(
            "/api/v1/credits/calculate",
            post(handlers::public_api::calculate_cost),
        )
        .route(
            "/api/v1/categories",
            get(handlers::public_api::list_categories),
        )
        .route(
            "/api/v1/users/:id/categories",
            get(handlers::public_api::get_user_with_categories),
        )
        .route(
            "/api/v1/users/:id/categories",
            put(handlers::public_api::update_user_categories),
        )
        .route("/api/v1/users/:id", put(handlers::public_api::update_user))
        .route(
            "/api/v1/users/:id/reset-password",
            post(handlers::public_api::reset_user_password),
        )
        // Demo endpoints
        .route("/api/v1/demos", get(handlers::public_api::list_demos))
        .route("/api/v1/demos", post(handlers::public_api::create_demo))
        .route("/api/v1/demos/:id", get(handlers::public_api::get_demo))
        .route(
            "/api/v1/demos/:id",
            delete(handlers::public_api::delete_demo),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            handlers::public_api::api_key_auth_middleware,
        ));

    // Create device routes (require authentication)
    let device_routes = Router::new()
        .route("/api/devices", get(handlers::device::get_user_devices))
        .route("/api/devices", post(handlers::device::register_device))
        .route(
            "/api/devices/:device_id",
            axum::routing::delete(handlers::device::remove_device),
        )
        .route(
            "/api/devices/:device_id/check",
            get(handlers::device::check_device_connection),
        );

    // Create content routes (require authentication)
    let content_routes = Router::new()
        .nest("/api/content", handlers::content::content_routes())
        .with_state(app_state.clone());

    // Create content streaming routes with activity tracking (require authentication)
    let content_streaming_routes = Router::new()
        .nest(
            "/api/content",
            handlers::content::content_streaming_routes(),
        )
        .with_state(app_state.clone());

    // Create EPG admin routes (require admin)
    let epg_admin_routes = Router::new()
        .nest("/api/admin/epg", handlers::epg::admin_routes())
        .with_state(crate::handlers::epg::EpgHandlersState {
            content_service: app_state.content_service.clone(),
            epg_service: app_state.epg_service.clone(),
        })
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::require_admin,
        ));

    // Create movies routes (require authentication)
    let movies_routes = Router::new()
        .nest("/api/movies", handlers::content::movies_routes())
        .with_state(app_state.content_service.clone());

    // Create TV routes (require authentication)
    let tv_routes = Router::new()
        .nest("/api/tv", handlers::content::tv_routes())
        .with_state(app_state.content_service.clone());

    // Create EPG delivery routes (require end user authentication, not Master API Key)
    let epg_delivery_routes = Router::new()
        .nest("/api/tv", handlers::epg::delivery_routes())
        .with_state(crate::handlers::epg::EpgHandlersState {
            content_service: app_state.content_service.clone(),
            epg_service: app_state.epg_service.clone(),
        })
        .layer(axum::middleware::from_fn(
            middleware::request_logging_middleware,
        ))
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::master_api_key_middleware, // Allow Master API Key OR end-user JWT
        ));

    // Create series routes (require authentication)
    let series_routes = Router::new()
        .nest("/api/series", handlers::series::series_routes())
        .with_state(app_state.content_service.clone());

    // Create episodes routes (require authentication)
    let episodes_routes = Router::new()
        .nest("/api/episodes", handlers::series::episodes_routes())
        .with_state(app_state.content_service.clone());

    // Create episodes streaming routes with activity tracking (require authentication)
    let episodes_streaming_routes = Router::new()
        .nest(
            "/api/episodes",
            handlers::series::episodes_streaming_routes(),
        )
        .with_state(app_state.clone());

    // Create specialized content routes (require authentication)
    let specialized_routes = Router::new()
        .nest(
            "/api/specialized",
            handlers::specialized::specialized_content_routes(),
        )
        .with_state(app_state.content_service.clone());

    // Create specialized delivery routes (require authentication)
    let specialized_delivery_routes = Router::new()
        .nest(
            "/api/delivery",
            handlers::specialized::specialized_delivery_routes(),
        )
        .with_state(app_state.content_service.clone());

    // Create enhanced content delivery routes (require authentication) - Req 4.2, 4.3, 4.4, 8.2, 1.3, 1.4
    let enhanced_delivery_routes = Router::new()
        .nest("/api/delivery", handlers::content::delivery_routes())
        .with_state(app_state.clone());

    // Create TMDB routes (require authentication)
    let tmdb_routes = Router::new()
        .nest("/api/tmdb", handlers::tmdb::tmdb_routes())
        .with_state(app_state.tmdb_service.clone());

    // Spawn background refresher for TV providers (auto-INGEST from remote M3U by TTL)
    {
        let svc = app_state.content_service.clone();
        tokio::spawn(async move {
            use tokio::time::{sleep, Duration};
            loop {
                if let Err(e) = svc.refresh_due_tv_providers().await {
                    tracing::warn!("tv_providers refresh failed: {}", e);
                }
                sleep(Duration::from_secs(60)).await;
            }
        });
    }

    // Create protected routes that require authentication
    let protected_routes = Router::new()
        .route("/api/protected", get(protected_endpoint))
        .merge(admin_routes)
        .merge(admin_packages_routes)
        .merge(admin_monetization_routes)
        .merge(admin_content_routes)
        .merge(admin_streams_routes)
        .merge(admin_episode_streams_routes)
        .merge(admin_series_routes)
        .merge(admin_specialized_routes)
        .merge(admin_ingest_routes)
        .merge(admin_media_watcher_routes)
        .merge(admin_upload_routes)
        .merge(admin_app_versions_routes)
        .merge(epg_admin_routes)
        .merge(reseller_routes)
        .merge(device_routes)
        .nest(
            "/api/user",
            Router::new()
                .merge(handlers::user_profile::routes())
                .merge(handlers::viewer_profiles::routes())
                .layer(Extension(app_state.database.pool.clone())),
        )
        // User watch progress routes
        .route(
            "/api/user/progress",
            axum::routing::post(handlers::user_history::save_watch_progress),
        )
        .route(
            "/api/user/progress/:content_id",
            axum::routing::get(handlers::user_history::get_content_progress),
        )
        .route(
            "/api/user/progress/:content_id/:episode_id",
            axum::routing::get(handlers::user_history::get_watch_progress),
        )
        .route(
            "/api/user/continue-watching",
            axum::routing::get(handlers::user_history::get_continue_watching),
        )
        // User history routes (viewing log)
        .route(
            "/api/user/history",
            axum::routing::get(handlers::user_history::get_watch_history),
        )
        .route(
            "/api/user/history/clear",
            axum::routing::delete(handlers::user_history::clear_watch_history),
        )
        // User favorites routes
        .nest(
            "/api/user/favorites",
            handlers::favorites::user_favorites_routes().with_state(favorites_service.clone()),
        )
        // 2FA routes (require authentication)
        .route(
            "/api/auth/2fa/status",
            get(handlers::two_factor::get_2fa_status),
        )
        .route("/api/auth/2fa/setup", post(handlers::two_factor::setup_2fa))
        .route(
            "/api/auth/2fa/verify",
            post(handlers::two_factor::verify_and_enable_2fa),
        )
        .route(
            "/api/auth/2fa/disable",
            post(handlers::two_factor::disable_2fa),
        )
        .route(
            "/api/auth/2fa/backup-codes",
            post(handlers::two_factor::regenerate_backup_codes),
        )
        // End-user subscription management
        .route(
            "/api/user/subscription",
            get(handlers::end_user_subscription::get_subscription),
        )
        .route(
            "/api/user/subscribe",
            post(handlers::end_user_subscription::create_checkout),
        )
        .route(
            "/api/user/subscription/cancel",
            post(handlers::end_user_subscription::cancel_subscription),
        )
        .route(
            "/api/user/subscription/resubscribe",
            post(handlers::end_user_subscription::resubscribe),
        )
        // SMTP configuration routes (admin only)
        .route(
            "/api/admin/smtp",
            get(handlers::smtp_config::get_smtp_config),
        )
        .route(
            "/api/admin/smtp",
            put(handlers::smtp_config::update_smtp_config),
        )
        .route(
            "/api/admin/smtp/test",
            post(handlers::smtp_config::test_smtp_connection),
        )
        .route(
            "/api/delivery/discovery",
            get(handlers::discovery::get_discovery_overview),
        )
        .merge(content_routes)
        .merge(content_streaming_routes)
        .merge(movies_routes)
        .merge(tv_routes)
        .merge(series_routes)
        .merge(episodes_routes)
        .merge(episodes_streaming_routes)
        .merge(specialized_routes)
        .merge(specialized_delivery_routes)
        .merge(enhanced_delivery_routes)
        .merge(tmdb_routes)
        // Content delivery with activity tracking
        .route(
            "/api/content/:id/stream-tracked",
            get(handlers::content::get_content_for_delivery_with_tracking),
        )
        .route(
            "/api/episodes/:id/stream-tracked",
            get(handlers::series::get_episode_for_delivery_with_tracking),
        )
        .route(
            "/api/events",
            axum::routing::get(|| async { axum::Json(serde_json::json!([])) }),
        )
        .layer(axum::middleware::from_fn(
            middleware::request_logging_middleware,
        ))
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            encryption_middleware::encrypt_response_middleware,
        ))
        .route_layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::master_api_key_middleware,
        ))
        .layer(axum::middleware::from_fn(
            middleware::input_validation_middleware,
        ));

    let app = Router::new()
        .route("/api/health", get(health_check))
        // Swagger/OpenAPI static spec + UI
        .nest_service(
            "/api/docs",
            ServeFile::new(concat!(env!("CARGO_MANIFEST_DIR"), "/static/swagger.html")),
        )
        .nest_service(
            "/api/docs/swagger.json",
            ServeFile::new(concat!(env!("CARGO_MANIFEST_DIR"), "/static/swagger.json")),
        )
        .nest_service("/metadata", ServeDir::new(metadata_dir.clone()))
        // Authentication routes (no auth required)
        .route("/api/auth/login", post(handlers::auth::login))
        .route("/api/auth/logout", post(handlers::auth::logout))
        .route("/api/auth/refresh", post(handlers::auth::refresh_token))
        // Password reset routes (no auth required)
        .route(
            "/api/auth/forgot-password",
            post(handlers::password_reset::forgot_password),
        )
        .route(
            "/api/auth/verify-reset-token",
            post(handlers::password_reset::verify_reset_token),
        )
        .route(
            "/api/auth/reset-password",
            post(handlers::password_reset::reset_password),
        )
        .route(
            "/api/redeem/validate",
            post(handlers::gift_codes::validate_code),
        )
        .route(
            "/api/redeem/check-username/:username",
            get(handlers::gift_codes::check_username_availability_public),
        )
        .route("/api/redeem", post(handlers::gift_codes::redeem_code))
        .route(
            "/api/public/content/categories",
            get(handlers::content::get_public_categories),
        )
        .route(
            "/api/public/config/ui",
            get(handlers::ui_config::get_ui_config),
        )
        .route("/api/demo", post(handlers::demo::create_demo_public))
        .route(
            "/api/demo/status",
            get(handlers::demo::get_demo_enabled_status),
        )
        // License type check (public, no auth - needed for first-run activation gate)
        .route(
            "/api/license/type",
            get(handlers::license::get_license_type),
        )
        // Public payment webhook (no auth)
        .route(
            "/api/payments/stripe/webhook",
            post(handlers::payments::stripe_webhook),
        )
        // Direct subscription webhook (no auth, signature-verified)
        .route(
            "/api/payments/stripe/subscription-webhook",
            post(handlers::end_user_subscription::subscription_webhook),
        )
        // Public packages and registration (no auth)
        .route(
            "/api/public/packages",
            get(handlers::end_user_subscription::list_packages),
        )
        .route(
            "/api/public/register",
            post(handlers::end_user_subscription::register_direct_user),
        )
        .route(
            "/api/public/verify-email",
            get(handlers::end_user_subscription::verify_email),
        )
        .route(
            "/api/public/check-email",
            post(handlers::end_user_subscription::check_email_availability),
        )
        // App version check and download (public, no auth required)
        .merge(handlers::app_versions::public_routes())
        // EPG routes with end user authentication (separate from Master API Key routes)
        .merge(epg_delivery_routes)
        // Merge protected routes
        .merge(protected_routes)
        // Public API v1 routes (API Key authentication, no JWT required)
        .merge(public_api_routes)
        // SECURITY FIX: Configure CORS with specific allowed origins instead of permissive
        // In production, set CORS_ALLOWED_ORIGINS env var to comma-separated list of allowed origins
        .layer({
            let allowed_origins =
                std::env::var("CORS_ALLOWED_ORIGINS").unwrap_or_else(|_| "*".to_string());

            if allowed_origins == "*" {
                // Development mode - allow all origins but log warning
                tracing::warn!(
                    "⚠️ CORS is set to allow all origins. Set CORS_ALLOWED_ORIGINS for production."
                );
                CorsLayer::permissive()
            } else {
                // Production mode - restrict to specified origins
                let origins: Vec<_> = allowed_origins
                    .split(',')
                    .filter_map(|s| s.trim().parse().ok())
                    .collect();

                CorsLayer::new()
                    .allow_origin(origins)
                    .allow_methods([
                        axum::http::Method::GET,
                        axum::http::Method::POST,
                        axum::http::Method::PUT,
                        axum::http::Method::DELETE,
                        axum::http::Method::OPTIONS,
                        axum::http::Method::HEAD,
                        axum::http::Method::PATCH,
                    ])
                    .allow_headers([
                        axum::http::header::AUTHORIZATION,
                        axum::http::header::CONTENT_TYPE,
                        axum::http::header::ACCEPT,
                        axum::http::header::ORIGIN,
                        axum::http::header::ACCESS_CONTROL_REQUEST_METHOD,
                        axum::http::header::ACCESS_CONTROL_REQUEST_HEADERS,
                        axum::http::HeaderName::from_static("x-admin-panel"),
                        axum::http::HeaderName::from_static("x-sc-sig"),
                        axum::http::HeaderName::from_static("x-sc-ts"),
                    ])
                    .expose_headers([
                        axum::http::HeaderName::from_static("x-encrypted"),
                    ])
                    .allow_credentials(true)
            }
        })
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    Ok(app)
}

async fn health_check(
    State(app_state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    // Verify database connectivity
    let db_status = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&app_state.database.pool)
        .await;

    let uptime_secs = app_state.started_at.elapsed().as_secs();
    let hours = uptime_secs / 3600;
    let minutes = (uptime_secs % 3600) / 60;

    match db_status {
        Ok(_) => Ok(Json(json!({
            "status": "ok",
            "version": env!("CARGO_PKG_VERSION"),
            "database": "connected",
            "uptime": format!("{}h {}m", hours, minutes)
        }))),
        Err(_) => Err(StatusCode::SERVICE_UNAVAILABLE),
    }
}

async fn protected_endpoint(request: axum::extract::Request) -> Result<Json<Value>, StatusCode> {
    let claims = request
        .extensions()
        .get::<services::Claims>()
        .ok_or(StatusCode::UNAUTHORIZED)?;

    Ok(Json(json!({
        "message": "This is a protected endpoint",
        "user": {
            "id": claims.sub,
            "username": claims.username,
            "role": claims.role
        }
    })))
}
