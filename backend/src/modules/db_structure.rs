// Database structure definitions for IPTV System
//
// This module contains all the SQL statements to create the complete
// IPTV database structure from scratch.
// PostgreSQL-compatible version.

use anyhow::Result;
use bcrypt::{hash, DEFAULT_COST};
use sqlx::{Pool, Postgres};

pub(crate) const DEFAULT_TV_CHANNEL_CATEGORIES: &[&str] = &[
    "Entertainment",
    "Sports",
    "News",
    "Movies",
    "Series",
    "Kids",
    "Documentary",
    "Lifestyle",
    "Culture & Education",
    "International",
    "Spain",
    "USA",
];

/// Create all database tables in the correct order
pub async fn create_all_tables(pool: &Pool<Postgres>) -> Result<()> {
    println!("🛠️  Creating database tables...");

    // Create logical schemas for Microservices isolation
    sqlx::query("CREATE SCHEMA IF NOT EXISTS auth;").execute(pool).await?;
    sqlx::query("CREATE SCHEMA IF NOT EXISTS content;").execute(pool).await?;
    sqlx::query("CREATE SCHEMA IF NOT EXISTS billing;").execute(pool).await?;
    sqlx::query("CREATE SCHEMA IF NOT EXISTS activity;").execute(pool).await?;
    sqlx::query("CREATE SCHEMA IF NOT EXISTS core;").execute(pool).await?;

    // Create tables in dependency order (no foreign keys first, then with foreign keys)

    // Independent tables (no foreign keys)
    create_config_table(pool).await?;
    create_system_config_table(pool).await?;
    create_system_info_table(pool).await?;
    create_categories_table(pool).await?;
    create_tv_channel_categories_table(pool).await?;
    create_epg_sources_table(pool).await?;
    // TV Providers (auto-ingest remote M3U with TTL)
    create_tv_providers_table(pool).await?;
    // Gift codes table (created here so migrations run on first bootstrap)
    create_gift_codes_table(pool).await?;
    // License activations (Envato purchase code verification)
    create_license_activations_table(pool).await?;

    // User management (depends on itself)
    create_users_table(pool).await?;
    create_master_api_keys_table(pool).await?;
    // Payments and purchases (depends on users)
    create_credit_purchases_table(pool).await?;
    // Billing transactions (depends on users)
    create_billing_transactions_table(pool).await?;
    // Reseller logs (depends on users)
    create_reseller_logs_table(pool).await?;

    // Content tables (depend on categories)
    create_media_content_table(pool).await?;
    create_movies_table(pool).await?;
    create_tv_channels_table(pool).await?;
    create_media_streams_table(pool).await?;

    // Events (depend on content)
    create_events_table(pool).await?;

    // Series structure (depends on content)
    create_series_table(pool).await?;
    create_seasons_table(pool).await?;
    create_episodes_table(pool).await?;

    // External subtitles tables (movies and episodes)
    create_content_subtitles_table(pool).await?;
    create_episode_subtitles_table(pool).await?;

    // Events with schedules (depends on events)
    create_event_schedules_table(pool).await?;

    // User-related tables (depend on users)
    create_devices_table(pool).await?;
    create_user_devices_table(pool).await?;
    create_user_subscriptions_table(pool).await?;
    create_user_favorites_table(pool).await?;
    create_blacklisted_tokens_table(pool).await?;
    create_rate_limits_table(pool).await?;

    // Activity and logging tables (depend on users)
    create_activity_logs_table(pool).await?;
    create_user_login_history_table(pool).await?;
    create_user_viewing_history_table(pool).await?;
    create_user_watch_progress_table(pool).await?;
    create_security_incidents_table(pool).await?;
    create_security_bans_table(pool).await?;

    // Support system (depends on users)
    create_tickets_table(pool).await?; // Simple tickets table
    create_support_tickets_table(pool).await?; // Advanced tickets table
    create_ticket_messages_table(pool).await?;
    create_ticket_message_reads_table(pool).await?;

    // Media watcher
    create_media_watch_folders_table(pool).await?;

    // Reseller API keys for public API access
    create_reseller_api_keys_table(pool).await?;
    create_reseller_api_key_usage_table(pool).await?;

    // App versions for in-app updates
    create_app_versions_table(pool).await?;

    // Direct subscription system
    create_packages_table(pool).await?;
    create_direct_subscriptions_table(pool).await?;

    // Ensure new columns exist in existing deployments
    run_runtime_migrations(pool).await?;

    println!("✅ All tables created successfully");
    Ok(())
}

/// State of the schema after running ensure_database_schema
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemaState {
    FreshInstall,
    Existing,
}

macro_rules! ensure_table {
    ($pool:expr, $name:expr, $create_fn:ident) => {{
        if !table_exists($pool, $name).await? {
            $create_fn($pool).await?;
            true
        } else {
            false
        }
    }};
}

/// Ensure every expected table exists without modifying existing data
pub async fn ensure_database_schema(pool: &Pool<Postgres>) -> Result<SchemaState> {
    // Ensure Schemas exist first
    sqlx::query("CREATE SCHEMA IF NOT EXISTS auth;").execute(pool).await?;
    sqlx::query("CREATE SCHEMA IF NOT EXISTS content;").execute(pool).await?;
    sqlx::query("CREATE SCHEMA IF NOT EXISTS billing;").execute(pool).await?;
    sqlx::query("CREATE SCHEMA IF NOT EXISTS activity;").execute(pool).await?;
    sqlx::query("CREATE SCHEMA IF NOT EXISTS core;").execute(pool).await?;

    let config_created = ensure_table!(pool, "core.config", create_config_table);
    let system_config_created = ensure_table!(pool, "core.system_config", create_system_config_table);
    let system_info_created = ensure_table!(pool, "core.system_info", create_system_info_table);
    let categories_created = ensure_table!(pool, "content.categories", create_categories_table);
    let tv_channel_categories_created = ensure_table!(
        pool,
        "content.tv_channel_categories",
        create_tv_channel_categories_table
    );
    let epg_sources_created = ensure_table!(pool, "activity.epg_sources", create_epg_sources_table);
    let users_created = ensure_table!(pool, "auth.users", create_users_table);
    let master_api_keys_created =
        ensure_table!(pool, "auth.master_api_keys", create_master_api_keys_table);
    ensure_table!(pool, "billing.credit_purchases", create_credit_purchases_table);
    ensure_table!(
        pool,
        "billing.billing_transactions",
        create_billing_transactions_table
    );

    ensure_table!(pool, "content.media_content", create_media_content_table);
    ensure_table!(pool, "content.movies", create_movies_table);
    ensure_table!(pool, "content.tv_channels", create_tv_channels_table);
    ensure_table!(pool, "content.media_streams", create_media_streams_table);
    let events_created = ensure_table!(pool, "activity.events", create_events_table);
    ensure_table!(pool, "content.series", create_series_table);
    ensure_table!(pool, "content.seasons", create_seasons_table);
    ensure_table!(pool, "content.episodes", create_episodes_table);

    // Ensure external subtitles tables exist on existing databases
    ensure_table!(pool, "content.media_content_subtitles", create_content_subtitles_table);
    ensure_table!(pool, "content.episode_subtitles", create_episode_subtitles_table);

    // Multi-language metadata translations
    ensure_table!(pool, "content.media_content_translations", create_media_content_translations_table);

    ensure_table!(pool, "activity.event_schedules", create_event_schedules_table);
    ensure_table!(pool, "activity.tv_providers", create_tv_providers_table);
    // Ensure gift_codes exists (safe on existing DBs)
    ensure_table!(pool, "billing.gift_codes", create_gift_codes_table);
    // Envato license activations
    ensure_table!(pool, "core.license_activations", create_license_activations_table);

    ensure_table!(pool, "auth.devices", create_devices_table);
    ensure_table!(pool, "auth.user_devices", create_user_devices_table);
    ensure_table!(pool, "billing.user_subscriptions", create_user_subscriptions_table);
    ensure_table!(pool, "activity.user_favorites", create_user_favorites_table);
    ensure_table!(pool, "activity.blacklisted_tokens", create_blacklisted_tokens_table);
    ensure_table!(pool, "activity.rate_limits", create_rate_limits_table);

    ensure_table!(pool, "activity.activity_logs", create_activity_logs_table);
    ensure_table!(pool, "activity.user_login_history", create_user_login_history_table);
    ensure_table!(
        pool,
        "activity.user_viewing_history",
        create_user_viewing_history_table
    );
    ensure_table!(
        pool,
        "activity.user_watch_progress",
        create_user_watch_progress_table
    );
    ensure_table!(pool, "auth.security_incidents", create_security_incidents_table);
    ensure_table!(pool, "auth.security_bans", create_security_bans_table);

    ensure_table!(pool, "core.tickets", create_tickets_table);
    ensure_table!(pool, "core.support_tickets", create_support_tickets_table);
    ensure_table!(pool, "core.ticket_messages", create_ticket_messages_table);
    ensure_table!(
        pool,
        "core.ticket_message_reads",
        create_ticket_message_reads_table
    );

    ensure_table!(pool, "billing.reseller_logs", create_reseller_logs_table);
    ensure_reseller_logs_schema(pool).await?;
    ensure_table!(
        pool,
        "core.media_watch_folders",
        create_media_watch_folders_table
    );
    ensure_table!(pool, "auth.reseller_api_keys", create_reseller_api_keys_table);
    ensure_table!(
        pool,
        "activity.reseller_api_key_usage",
        create_reseller_api_key_usage_table
    );

    // App versions for in-app updates
    ensure_table!(pool, "core.app_versions", create_app_versions_table);

    // Direct subscription system (packages + end-user subscriptions)
    ensure_table!(pool, "billing.packages", create_packages_table);
    ensure_table!(
        pool,
        "billing.direct_subscriptions",
        create_direct_subscriptions_table
    );

    run_runtime_migrations(pool).await?;

    let core_tables_created = config_created
        || system_config_created
        || system_info_created
        || categories_created
        || epg_sources_created
        || events_created
        || master_api_keys_created
        || users_created
        || tv_channel_categories_created;

    let state = if users_created && core_tables_created {
        SchemaState::FreshInstall
    } else {
        SchemaState::Existing
    };

    Ok(state)
}

/// Ensure default admin account exists with predefined credentials
pub async fn ensure_default_admin_user(pool: &Pool<Postgres>) -> Result<()> {
    let existing_admin =
        sqlx::query_scalar::<_, i64>("SELECT id FROM auth.users WHERE username = $1 LIMIT 1")
            .bind("admin")
            .fetch_optional(pool)
            .await?;

    if existing_admin.is_some() {
        return Ok(());
    }

    // SECURITY FIX: Use environment variable for admin password
    // If not provided, use a temporary password that MUST be changed on first login
    let default_password = std::env::var("ADMIN_DEFAULT_PASSWORD").unwrap_or_else(|_| {
        // Generate a unique temporary password using timestamp
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let password = format!("tmp_{:x}", timestamp);
        // Log the generated password so admin can access the system
        // This will only happen on first install
        println!(
            "⚠️  IMPORTANT: Generated temporary admin password: {}",
            password
        );
        println!("⚠️  Please change this password immediately after first login!");
        println!("⚠️  Or set ADMIN_DEFAULT_PASSWORD environment variable before first run.");
        password
    });

    let password_hash = hash(&default_password, DEFAULT_COST)?;

    sqlx::query(
        "INSERT INTO auth.users (username, password_hash, role, email, active) VALUES ($1, $2, 'admin', $3, true)"
        )
    .bind("admin")
    .bind(password_hash)
    .bind("admin@admin.com")
    .execute(pool)
    .await?;

    println!("👤 Created default admin user 'admin'");

    Ok(())
}

pub async fn ensure_default_categories(pool: &Pool<Postgres>) -> Result<()> {
    const DEFAULT_CATEGORIES: &[(&str, &str)] = &[
        ("VOD Movies", "VOD"),
        ("TV Channels", "TV"),
        ("TV Series", "Series"),
        ("Events", "Eventos"),
        ("Kids Content", "Kids"),
        ("Anime", "Anime"),
    ];

    for (name, category_type) in DEFAULT_CATEGORIES {
        let exists = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM content.categories WHERE category_type = $1"
        )
        .bind(category_type)
        .fetch_one(pool)
        .await?;

        if exists == 0 {
            sqlx::query("INSERT INTO content.categories (name, category_type) VALUES ($1, $2)")
                .bind(name)
                .bind(category_type)
                .execute(pool)
                .await?;
            println!(
                "📁 Added default category '{}' ({}) to categories table",
                name, category_type
            );
        }
    }

    Ok(())
}

pub async fn ensure_system_info_record(pool: &Pool<Postgres>) -> Result<()> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM core.system_info WHERE id = 1")
        .fetch_one(pool)
        .await?;

    if exists == 0 {
        sqlx::query("INSERT INTO core.system_info (id, version) VALUES (1, '1.1.2')")
            .execute(pool)
            .await?;
        println!("ℹ️  Initialized system_info record");
    } else {
        // Keep runtime-reported platform version aligned with the shipped release.
        sqlx::query("UPDATE core.system_info SET version = '1.1.2' WHERE id = 1")
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn ensure_default_tv_channel_categories(pool: &Pool<Postgres>) -> Result<()> {
    let existing_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM content.tv_channel_categories")
        .fetch_one(pool)
        .await?;

    if existing_count == 0 {
        for name in DEFAULT_TV_CHANNEL_CATEGORIES {
            sqlx::query(
                "INSERT INTO content.tv_channel_categories (name) VALUES ($1) ON CONFLICT DO NOTHING"
        )
            .bind(name)
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

const CANAIS_BR: &[(&str, &str)] = &[
    ("AMC HD", "http://45.185.11.126:8000/play/a06s/index.m3u8"),
    ("AXN HD", "http://45.185.11.126:8000/play/a0ao/index.m3u8"),
    ("Adult Swim HD", "http://45.185.11.126:8000/play/a06m/index.m3u8"),
    ("Animal Planet HD", "http://45.185.11.126:8000/play/a09k/index.m3u8"),
    ("BIS HD", "http://45.185.11.126:8000/play/a07w/index.m3u8"),
    ("BM&C HD", "http://45.185.11.126:8000/play/a06i/index.m3u8"),
    ("Band News HD", "http://45.185.11.126:8000/play/a076/index.m3u8"),
    ("Band Sports HD", "http://45.185.11.126:8000/play/a05o/index.m3u8"),
    ("CNN Brasil Money HD", "http://45.185.11.126:8000/play/a0a6/index.m3u8"),
    ("CNN International HD", "http://45.185.11.126:8000/play/a0ap/index.m3u8"),
    ("Canal Brasil HD", "http://45.185.11.126:8000/play/a06x/index.m3u8"),
    ("Canal Sony HD", "http://45.185.11.126:8000/play/a0an/index.m3u8"),
    ("Canal UOL HD", "http://45.185.11.126:8000/play/a0a4/index.m3u8"),
    ("Cartoon Network HD", "http://45.185.11.126:8000/play/a087/index.m3u8"),
    ("Cartoonito HD", "http://45.185.11.126:8000/play/a0ae/index.m3u8"),
    ("Cinemax HD", "http://45.185.11.126:8000/play/a081/index.m3u8"),
    ("Claro TV+ 4K", "http://45.185.11.126:8000/play/a06f/index.m3u8"),
    ("Combate HD", "http://45.185.11.126:8000/play/a073/index.m3u8"),
    ("DUMDUM HD", "http://45.185.11.126:8000/play/a078/index.m3u8"),
    ("Disc. Home & Health HD", "http://45.185.11.126:8000/play/a07y/index.m3u8"),
    ("Discovery Channel HD", "http://45.185.11.126:8000/play/a0ac/index.m3u8"),
    ("Discovery Kids HD", "http://45.185.11.126:8000/play/a0ad/index.m3u8"),
    ("Discovery Science HD", "http://45.185.11.126:8000/play/a077/index.m3u8"),
    ("Discovery Theater HD", "http://45.185.11.126:8000/play/a085/index.m3u8"),
    ("Discovery Turbo HD", "http://45.185.11.126:8000/play/a07z/index.m3u8"),
    ("Discovery World HD", "http://45.185.11.126:8000/play/a086/index.m3u8"),
    ("ESPN 4 HD", "http://45.185.11.126:8000/play/a05m/index.m3u8"),
    ("ESPN 5 HD", "http://45.185.11.126:8000/play/a05n/index.m3u8"),
    ("ESPN 6 HD", "http://45.185.11.126:8000/play/a084/index.m3u8"),
    ("Food Network HD", "http://45.185.11.126:8000/play/a06j/index.m3u8"),
    ("GE TV HD", "http://45.185.11.126:8000/play/a08v/index.m3u8"),
    ("GNT HD", "http://45.185.11.126:8000/play/a079/index.m3u8"),
    ("GloboNews HD", "http://45.185.11.126:8000/play/a08d/index.m3u8"),
    ("Globoplay Novelas HD", "http://45.185.11.126:8000/play/a06w/index.m3u8"),
    ("Gloob HD", "http://45.185.11.126:8000/play/a07v/index.m3u8"),
    ("Gloobinho HD", "http://45.185.11.126:8000/play/a071/index.m3u8"),
    ("HBO Family HD", "http://45.185.11.126:8000/play/a08q/index.m3u8"),
    ("HBO HD", "http://45.185.11.126:8000/play/a08n/index.m3u8"),
    ("HBO MUNDI HD", "http://45.185.11.126:8000/play/a082/index.m3u8"),
    ("HBO POP HD", "http://45.185.11.126:8000/play/a08s/index.m3u8"),
    ("HBO Signature HD", "http://45.185.11.126:8000/play/a08r/index.m3u8"),
    ("HBO XTREME HD", "http://45.185.11.126:8000/play/a083/index.m3u8"),
    ("HBO+ HD", "http://45.185.11.126:8000/play/a08p/index.m3u8"),
    ("HBO2 HD", "http://45.185.11.126:8000/play/a08o/index.m3u8"),
    ("HGTV HD", "http://45.185.11.126:8000/play/a074/index.m3u8"),
    ("History HD", "http://45.185.11.126:8000/play/a0al/index.m3u8"),
    ("ID HD", "http://45.185.11.126:8000/play/a089/index.m3u8"),
    ("JP News HD", "http://45.185.11.126:8000/play/a0a1/index.m3u8"),
    ("Lifetime HD", "http://45.185.11.126:8000/play/a06l/index.m3u8"),
    ("Megapix HD", "http://45.185.11.126:8000/play/a057/index.m3u8"),
    ("Modo Viagem HD", "http://45.185.11.126:8000/play/a07u/index.m3u8"),
    ("Multishow HD", "http://45.185.11.126:8000/play/a07a/index.m3u8"),
    ("OFF HD", "http://45.185.11.126:8000/play/a07t/index.m3u8"),
    ("Paramount+ 4", "http://45.185.11.126:8000/play/a0aq/index.m3u8"),
    ("Playboy TV HD", "http://45.185.11.126:8000/play/a09n/index.m3u8"),
    ("Premiere 2 HD", "http://45.185.11.126:8000/play/a06h/index.m3u8"),
    ("Premiere 3 HD", "http://45.185.11.126:8000/play/a0av/index.m3u8"),
    ("Premiere 4 HD", "http://45.185.11.126:8000/play/a07b/index.m3u8"),
    ("Premiere 5 HD", "http://45.185.11.126:8000/play/a07c/index.m3u8"),
    ("Premiere 6 HD", "http://45.185.11.126:8000/play/a05j/index.m3u8"),
    ("Premiere 7 HD", "http://45.185.11.126:8000/play/a05k/index.m3u8"),
    ("Premiere 8 HD", "http://45.185.11.126:8000/play/a05l/index.m3u8"),
    ("Premiere Clubes HD", "http://45.185.11.126:8000/play/a06g/index.m3u8"),
    ("Record News HD", "http://45.185.11.126:8000/play/a0a2/index.m3u8"),
    ("SBT News HD", "http://45.185.11.126:8000/play/a0a7/index.m3u8"),
    ("Space HD", "http://45.185.11.126:8000/play/a08b/index.m3u8"),
    ("Studio Universal HD", "http://45.185.11.126:8000/play/a06o/index.m3u8"),
    ("TIMES EXCLUSIVO CNBC", "http://45.185.11.126:8000/play/a0a5/index.m3u8"),
    ("TLC HD", "http://45.185.11.126:8000/play/a0aa/index.m3u8"),
    ("TNT Novelas HD", "http://45.185.11.126:8000/play/a088/index.m3u8"),
    ("TNT Sports HD", "http://45.185.11.126:8000/play/a0bi/index.m3u8"),
    ("TNT Series HD", "http://45.185.11.126:8000/play/a08a/index.m3u8"),
    ("TV Ra Tim Bum HD", "http://45.185.11.126:8000/play/a080/index.m3u8"),
    ("Telecine Action HD", "http://45.185.11.126:8000/play/a058/index.m3u8"),
    ("Telecine Cult HD", "http://45.185.11.126:8000/play/a05a/index.m3u8"),
    ("Telecine Fun HD", "http://45.185.11.126:8000/play/a059/index.m3u8"),
    ("Telecine Pipoca HD", "http://45.185.11.126:8000/play/a08g/index.m3u8"),
    ("Telecine Premium HD", "http://45.185.11.126:8000/play/a08e/index.m3u8"),
    ("Telecine Touch HD", "http://45.185.11.126:8000/play/a08f/index.m3u8"),
    ("Trace Brasil HD", "http://45.185.11.126:8000/play/a08l/index.m3u8"),
    ("Travel Food & Drinks HD", "http://45.185.11.126:8000/play/a07x/index.m3u8"),
    ("USA HD", "http://45.185.11.126:8000/play/a06k/index.m3u8"),
    ("Universal Premiere HD", "http://45.185.11.126:8000/play/a08m/index.m3u8"),
    ("Universal Reality HD", "http://45.185.11.126:8000/play/a08c/index.m3u8"),
    ("Universal TV HD", "http://45.185.11.126:8000/play/a0af/index.m3u8"),
    ("Warner Channel HD", "http://45.185.11.126:8000/play/a0am/index.m3u8"),
    ("Woohoo HD", "http://45.185.11.126:8000/play/a075/index.m3u8"),
    ("Sportv HD", "http://45.185.11.126:8000/play/a05g/index.m3u8"),
    ("Sportv 2 HD", "http://45.185.11.126:8000/play/a05f/index.m3u8"),
    ("Sportv 3 HD", "http://45.185.11.126:8000/play/a06v/index.m3u8"),
];

pub async fn ensure_seed_canais_br(pool: &Pool<Postgres>) -> Result<()> {
    let category_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM content.categories WHERE category_type = 'TV' ORDER BY id LIMIT 1"
    )
    .fetch_optional(pool)
    .await?;

    let cat_id = match category_id {
        Some(id) => id,
        None => return Ok(()),
    };

    let mut channel_num = 1i64;
    for (title, url) in CANAIS_BR {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM content.media_content WHERE title = $1 AND media_type = 'tv_channel'"
        )
        .bind(title)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        if exists == 0 {
            let row = sqlx::query_scalar::<_, i64>(
                r#"
                INSERT INTO content.media_content (category_id, title, description, stream_url, media_type, active)
                VALUES ($1, $2, $3, $4, 'tv_channel', true)
                RETURNING id
                "#,
            )
            .bind(cat_id)
            .bind(title)
            .bind(format!("Canal ao vivo {}", title))
            .bind(url)
            .fetch_one(pool)
            .await;

            if let Ok(content_id) = row {
                let _ = sqlx::query(
                    r#"
                    INSERT INTO content.tv_channels (media_content_id, channel_number, is_live, provider, country)
                    VALUES ($1, $2, true, 'Brasil', 'BR')
                    ON CONFLICT DO NOTHING
                    "#,
                )
                .bind(content_id)
                .bind(channel_num)
                .execute(pool)
                .await;

                let _ = sqlx::query(
                    r#"
                    INSERT INTO content.media_streams (media_content_id, stream_url, stream_type, is_default)
                    VALUES ($1, $2, 'main', true)
                    "#,
                )
                .bind(content_id)
                .bind(url)
                .execute(pool)
                .await;

                channel_num += 1;
            }
        }
    }

    Ok(())
}

async fn table_exists(pool: &Pool<Postgres>, table_name: &str) -> Result<bool> {
    // Support schema-qualified names (e.g. "content.media_content") and plain names
    let (schema, tbl) = if let Some(dot_pos) = table_name.find('.') {
        (&table_name[..dot_pos], &table_name[dot_pos + 1..])
    } else {
        return Err(anyhow::anyhow!("table_exists requires a schema-qualified name (e.g. schema.table)"));
    };
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)"
    )
    .bind(schema)
    .bind(tbl)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

async fn column_exists(pool: &Pool<Postgres>, schema: &str, table: &str, column: &str) -> Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3)"
    )
    .bind(schema)
    .bind(table)
    .bind(column)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

/// Create users table - Core user management
async fn create_users_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE auth.users (
            id BIGSERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin', 'reseller', 'end_user')),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

            -- Demo account management
            daily_demo_limit INTEGER DEFAULT NULL,
            demos_created_today INTEGER DEFAULT NULL,
            last_demo_reset_date DATE DEFAULT NULL,
            is_demo BOOLEAN DEFAULT NULL,
            demo_expires_at TIMESTAMPTZ DEFAULT NULL,

            -- User profile
            email TEXT,
            credits DOUBLE PRECISION DEFAULT 0.0,
            active BOOLEAN DEFAULT true,

            -- Account hierarchy
            created_by BIGINT DEFAULT NULL,
            max_devices INTEGER NOT NULL DEFAULT 3,
            expires_at TIMESTAMPTZ DEFAULT NULL
        )
        "#
        )
    .execute(pool)
    .await?;

    Ok(())
}

/// Create license_activations table — Envato purchase code tracking
async fn create_license_activations_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE core.license_activations (
            id SERIAL PRIMARY KEY,
            purchase_code VARCHAR(64) NOT NULL,
            license_type VARCHAR(32) NOT NULL,
            buyer_username VARCHAR(128),
            item_id VARCHAR(32),
            item_name VARCHAR(256),
            supported_until TEXT,
            domain VARCHAR(256),
            server_ip VARCHAR(64),
            activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_verified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            UNIQUE(purchase_code)
        )
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create config table - System configuration
async fn create_config_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE core.config (
            id BIGSERIAL PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create system_config table - Advanced system settings
async fn create_system_config_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE core.system_config (
            id BIGSERIAL PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create system_info table - System status and metadata
async fn create_system_info_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE core.system_info (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            startup_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            version TEXT DEFAULT '1.1.2',
            last_restart TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create categories table - Content categorization
async fn create_categories_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE content.categories (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            category_type TEXT NOT NULL,
            tmdb_id BIGINT DEFAULT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create tv_channel_categories table - Custom tags for live TV channels
async fn create_tv_channel_categories_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE content.tv_channel_categories (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;

    // Case-insensitive uniqueness (SQLite used `COLLATE NOCASE`).
    // Avoids requiring extensions (e.g., citext) while keeping behavior consistent.
    sqlx::query(
        "CREATE UNIQUE INDEX idx_tv_channel_categories_name_lower_unique ON content.tv_channel_categories (LOWER(name))"
        )
    .execute(pool)
    .await?;

    Ok(())
}

/// Create media_content table - Base polymorphic media storage
async fn create_media_content_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS content.media_content (
            id BIGSERIAL PRIMARY KEY,
            category_id BIGINT,
            title TEXT NOT NULL,
            description TEXT,
            image_url TEXT,
            backdrop_url TEXT,
            stream_url TEXT DEFAULT '',
            tmdb_id BIGINT,
            year BIGINT,
            media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'series', 'tv_channel', 'event', 'anime', 'kids')),
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES content.categories(id) ON DELETE SET NULL
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create media_streams table - 1-to-N relationships for media qualities and parts
async fn create_media_streams_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS content.media_streams (
            id BIGSERIAL PRIMARY KEY,
            media_content_id BIGINT NOT NULL,
            stream_url TEXT NOT NULL,
            stream_type TEXT NOT NULL DEFAULT 'main',
            is_default BOOLEAN NOT NULL DEFAULT true,
            quality TEXT,
            language TEXT,
            audio_languages TEXT,
            format TEXT,
            drm_keys TEXT,
            drm_type TEXT,
            license_server_url TEXT,
            drm_headers TEXT,
            proxy_url TEXT,
            doh_url TEXT,
            origin TEXT,
            user_agent TEXT,
            referer TEXT,
            custom_headers TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (media_content_id) REFERENCES content.media_content(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create default VOD/Movies metadata table
async fn create_movies_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS content.movies (
            media_content_id BIGINT PRIMARY KEY,
            backdrop_url TEXT,
            year BIGINT,
            duration INTEGER,
            rating REAL,
            genre TEXT,
            tmdb_id BIGINT,
            FOREIGN KEY (media_content_id) REFERENCES content.media_content(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create TV channels metadata table
async fn create_tv_channels_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS content.tv_channels (
            media_content_id BIGINT PRIMARY KEY,
            channel_number BIGINT,
            is_live BOOLEAN DEFAULT false,
            provider TEXT,
            country TEXT,
            channel_category TEXT,
            epg_source_id BIGINT,
            epg_channel_id TEXT,
            epg_offset_minutes BIGINT DEFAULT 0,
            FOREIGN KEY (media_content_id) REFERENCES content.media_content(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;
    
    sqlx::query("CREATE INDEX idx_tv_channels_epg_source ON content.tv_channels(epg_source_id)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create series table - TV series management
async fn create_series_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS content.series (
            id BIGSERIAL PRIMARY KEY,
            content_id BIGINT NOT NULL,
            total_seasons INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (content_id) REFERENCES content.media_content(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create seasons table - Series seasons
async fn create_seasons_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE content.seasons (
            id BIGSERIAL PRIMARY KEY,
            series_id BIGINT,
            season_number INTEGER,
            total_episodes INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            title TEXT,
            description TEXT,
            image_url TEXT,
            tmdb_id BIGINT,
            air_date TEXT,
            backdrop_url TEXT,
            poster_url TEXT,
            FOREIGN KEY (series_id) REFERENCES content.series(id)
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create episodes table - Individual episodes
async fn create_episodes_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE content.episodes (
            id BIGSERIAL PRIMARY KEY,
            season_id BIGINT,
            episode_number INTEGER,
            title TEXT,
            description TEXT,
            stream_url TEXT,
            duration INTEGER,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            image_url TEXT,
            tmdb_id BIGINT,
            air_date TEXT,
            FOREIGN KEY (season_id) REFERENCES content.seasons(id)
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create events table - Live events
async fn create_events_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS activity.events (
            id BIGSERIAL PRIMARY KEY,
            content_id BIGINT NOT NULL,
            event_type TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (content_id) REFERENCES content.media_content(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create event_schedules table - Event scheduling
async fn create_event_schedules_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE activity.event_schedules (
            id BIGSERIAL PRIMARY KEY,
            event_id BIGINT,
            schedule_date DATE,
            start_time TIMESTAMPTZ NOT NULL,
            end_time TIMESTAMPTZ,
            stream_url TEXT,
            title TEXT,
            description TEXT,
            image_url TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES activity.events(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Fix broken foreign key constraint in existing event_schedules table
/// Note: PostgreSQL handles foreign keys differently - this is mostly a no-op for PostgreSQL
/// but we keep it for compatibility with the migration workflow
pub async fn fix_event_schedules_foreign_key(pool: &Pool<Postgres>) -> Result<()> {
    println!("🔧 Checking event_schedules foreign key constraints...");

    // In PostgreSQL, we check the constraint using information_schema
    // This is a simplified version - PostgreSQL handles FK constraints properly
    let orphaned_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM activity.event_schedules WHERE event_id IS NOT NULL AND event_id NOT IN (SELECT id FROM activity.events)"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    if orphaned_count > 0 {
        println!(
            "⚠️  Found {} orphaned records in event_schedules. These will be deleted.",
            orphaned_count
        );
        // Delete orphaned records
        sqlx::query("DELETE FROM activity.event_schedules WHERE event_id IS NOT NULL AND event_id NOT IN (SELECT id FROM activity.events)")
            .execute(pool)
            .await?;
        println!("✅ Orphaned records cleaned up");
    } else {
        println!("ℹ️  Foreign key constraint in event_schedules table is correct");
    }

    Ok(())
}

/// Create devices table - User device management
async fn create_devices_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE auth.devices (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            device_name TEXT NOT NULL,
            device_id TEXT UNIQUE NOT NULL,
            last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create user_devices table - Advanced device tracking
async fn create_user_devices_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE auth.user_devices (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            device_name TEXT,
            device_id TEXT NOT NULL,
            last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, device_id)
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create user_subscriptions table - Category subscriptions
async fn create_user_subscriptions_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE billing.user_subscriptions (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT,
            category_id BIGINT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, category_id)
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create user_favorites table - User favorites tracking
async fn create_user_favorites_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE activity.user_favorites (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            content_type TEXT NOT NULL,
            content_id TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, content_type, content_id),
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;

    // Create indexes for performance
    sqlx::query("CREATE INDEX idx_user_favorites_user_id ON activity.user_favorites(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_user_favorites_type ON activity.user_favorites(content_type)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create blacklisted_tokens table - Token blacklisting
async fn create_blacklisted_tokens_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE activity.blacklisted_tokens (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            device_id TEXT NOT NULL,
            blacklisted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, device_id)
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create rate_limits table - API rate limiting
async fn create_rate_limits_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE activity.rate_limits (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            action TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX idx_rate_limits_user_action_time ON activity.rate_limits(user_id, action, created_at)"
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create activity_logs table - User activity tracking
async fn create_activity_logs_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE activity.activity_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            target_user_id BIGINT,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            credits_amount REAL,
            metadata TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_by BIGINT NOT NULL
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create user_login_history table - Login tracking
async fn create_user_login_history_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE activity.user_login_history (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            username TEXT NOT NULL,
            login_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            device_info TEXT,
            user_agent TEXT,
            success BOOLEAN DEFAULT TRUE
        )
        "#
        )
    .execute(pool)
    .await?;

    // Create indexes for performance
    sqlx::query("CREATE INDEX idx_user_login_history_user_id ON activity.user_login_history(user_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX idx_user_login_history_timestamp ON activity.user_login_history(login_timestamp)"
        )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX idx_user_login_history_ip ON activity.user_login_history(ip_address)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create user_viewing_history table - Content viewing tracking
async fn create_user_viewing_history_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE activity.user_viewing_history (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            username TEXT NOT NULL,
            content_type TEXT NOT NULL,
            content_id BIGINT,
            content_title TEXT NOT NULL,
            episode_title TEXT,
            season_number INTEGER,
            episode_number INTEGER,
            start_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            device_info TEXT,
            user_agent TEXT,
            series_title TEXT
        )
        "#
        )
    .execute(pool)
    .await?;

    // Create indexes for performance
    sqlx::query("CREATE INDEX idx_user_viewing_history_user_id ON activity.user_viewing_history(user_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX idx_user_viewing_history_timestamp ON activity.user_viewing_history(start_timestamp)"
        )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX idx_user_viewing_history_content_type ON activity.user_viewing_history(content_type)"
        )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX idx_user_viewing_history_content_id ON activity.user_viewing_history(content_id)"
        )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX idx_user_viewing_history_ip ON activity.user_viewing_history(ip_address)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create user_watch_progress table - Stores playback position for resume functionality
async fn create_user_watch_progress_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS activity.user_watch_progress (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            content_id BIGINT NOT NULL,
            content_type TEXT NOT NULL,
            episode_id BIGINT,
            position_seconds INTEGER NOT NULL DEFAULT 0,
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            progress_percent REAL NOT NULL DEFAULT 0,
            completed BOOLEAN NOT NULL DEFAULT false,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
            UNIQUE(user_id, content_id, episode_id)
        )
        "#
        )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX idx_user_watch_progress_user_id ON activity.user_watch_progress(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_user_watch_progress_content ON activity.user_watch_progress(content_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_user_watch_progress_updated ON activity.user_watch_progress(updated_at)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create security_incidents table - Security event tracking
async fn create_security_incidents_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE auth.security_incidents (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT,
            username TEXT NOT NULL,
            incident_type TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            device_id TEXT,
            details TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;

    // Create indexes for performance
    sqlx::query("CREATE INDEX idx_security_incidents_user_id ON auth.security_incidents(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_security_incidents_username ON auth.security_incidents(username)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create security_bans table - User banning system
async fn create_security_bans_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE auth.security_bans (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT,
            username TEXT NOT NULL,
            ban_type TEXT NOT NULL,
            ban_reason TEXT NOT NULL,
            ban_level INTEGER DEFAULT 1,
            banned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMPTZ,
            is_active BOOLEAN DEFAULT true,
            created_by BIGINT
        )
        "#
        )
    .execute(pool)
    .await?;

    // Create indexes for performance
    sqlx::query("CREATE INDEX idx_security_bans_user_id ON auth.security_bans(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_security_bans_active ON auth.security_bans(is_active)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create tickets table - Simple ticket system
async fn create_tickets_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE core.tickets (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open',
            priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMPTZ DEFAULT NULL,
            assigned_to BIGINT DEFAULT NULL
        )
        "#
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Create support_tickets table - Advanced support ticket system
async fn create_support_tickets_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE core.support_tickets (
            id BIGSERIAL PRIMARY KEY,
            ticket_number TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
            status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'waiting_response', 'resolved', 'closed')),
            category TEXT NOT NULL CHECK (category IN ('technical', 'billing', 'account', 'content', 'other')),
            created_by BIGINT NOT NULL,
            assigned_to BIGINT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMPTZ,
            closed_at TIMESTAMPTZ,
            FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL
        )
        "#
    )
    .execute(pool)
    .await?;

    // Create indexes for performance
    sqlx::query("CREATE INDEX idx_support_tickets_created_by ON core.support_tickets(created_by)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_support_tickets_assigned_to ON core.support_tickets(assigned_to)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_support_tickets_status ON core.support_tickets(status)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_support_tickets_priority ON core.support_tickets(priority)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_support_tickets_updated_at ON core.support_tickets(updated_at)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create ticket_messages table - Support ticket messages
async fn create_ticket_messages_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE core.ticket_messages (
            id BIGSERIAL PRIMARY KEY,
            ticket_id BIGINT NOT NULL,
            message TEXT NOT NULL,
            is_internal BOOLEAN DEFAULT false,
            user_id BIGINT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES core.support_tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;

    // Create indexes for performance
    sqlx::query("CREATE INDEX idx_ticket_messages_ticket_id ON core.ticket_messages(ticket_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_ticket_messages_user_id ON core.ticket_messages(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_ticket_messages_created_at ON core.ticket_messages(created_at)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create ticket_message_reads table - Message read tracking
async fn create_ticket_message_reads_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE core.ticket_message_reads (
            id BIGSERIAL PRIMARY KEY,
            ticket_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            last_read_message_id BIGINT NOT NULL,
            read_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticket_id, user_id),
            FOREIGN KEY (ticket_id) REFERENCES core.support_tickets(id),
            
            FOREIGN KEY (last_read_message_id) REFERENCES core.ticket_messages(id)
        )
        "#
        )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX idx_ticket_message_reads_ticket_user ON core.ticket_message_reads(ticket_id, user_id)")
        .execute(pool)
        .await?;
    Ok(())
}

/// Create master_api_keys table - API key management
async fn create_master_api_keys_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE auth.master_api_keys (
            id BIGSERIAL PRIMARY KEY,
            key_name TEXT NOT NULL UNIQUE,
            key_prefix VARCHAR(16) NOT NULL,
            key_hash TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT false,
            created_by BIGINT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMPTZ,
            description TEXT
        )
        "#
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create epg_sources table - EPG source management
async fn create_epg_sources_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE activity.epg_sources (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            timezone TEXT DEFAULT 'UTC',
            cache_ttl_minutes INTEGER DEFAULT 15,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;

    // Create indexes for performance
    sqlx::query("CREATE INDEX idx_epg_sources_active ON activity.epg_sources(is_active)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE UNIQUE INDEX idx_epg_sources_name ON activity.epg_sources(name)")
        .execute(pool)
        .await?;

    Ok(())
}

// Create credit_purchases table - Records reseller credit purchases via Stripe
async fn create_credit_purchases_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS billing.credit_purchases (
            id BIGSERIAL PRIMARY KEY,
            reseller_id BIGINT NOT NULL,
            session_id TEXT NOT NULL UNIQUE,
            quantity INTEGER NOT NULL,
            unit_amount_cents INTEGER NOT NULL,
            discount_percent REAL NOT NULL,
            amount_total_cents INTEGER NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL, -- 'created','completed','refunded','failed'
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;

    // Indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_credit_purchases_reseller_id ON billing.credit_purchases(reseller_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_credit_purchases_status ON billing.credit_purchases(status)"
        )
    .execute(pool)
    .await?;

    Ok(())
}

async fn create_reseller_logs_table(pool: &Pool<Postgres>) -> Result<()> {
    tracing::info!("Creating reseller_logs table...");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS billing.reseller_logs (
            id BIGSERIAL PRIMARY KEY,
            reseller_id BIGINT,
            reseller_username TEXT NOT NULL,
            end_user_username TEXT NOT NULL,
            end_user_email TEXT,
            end_user_max_devices INTEGER,
            end_user_expires_at TIMESTAMPTZ,
            end_user_category_ids TEXT, -- JSON array of category IDs
            credits_cost REAL NOT NULL,
            duration_months INTEGER NOT NULL,
            action TEXT NOT NULL, -- 'CREATE', 'DELETE', etc.
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT,

            -- Foreign key to resellers (but allow deletion)
            FOREIGN KEY (reseller_id) REFERENCES auth.users(id) ON DELETE SET NULL
        )
        "#
        )
    .execute(pool)
    .await?;

    // Create indexes for performance and queries
    sqlx::query("CREATE INDEX idx_reseller_logs_reseller_id ON billing.reseller_logs(reseller_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX idx_reseller_logs_created_at ON billing.reseller_logs(created_at)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX idx_reseller_logs_end_user_username ON billing.reseller_logs(end_user_username)"
        )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX idx_reseller_logs_credits_cost ON billing.reseller_logs(credits_cost)")
        .execute(pool)
        .await?;

    tracing::info!("✅ reseller_logs table created successfully");
    Ok(())
}

async fn ensure_reseller_logs_schema(pool: &Pool<Postgres>) -> Result<()> {
    let rows = sqlx::query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core') AND table_name = 'reseller_logs'"
        )
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        tracing::warn!("reseller_logs exists but has no columns; recreating table");
        sqlx::query("DROP TABLE IF EXISTS billing.reseller_logs")
            .execute(pool)
            .await?;
        create_reseller_logs_table(pool).await?;
    }

    Ok(())
}

/// Create billing_transactions table - Unified billing (Stripe, offline, adjustments)
async fn create_billing_transactions_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS billing.billing_transactions (
            id BIGSERIAL PRIMARY KEY,
            reseller_id BIGINT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('stripe','offline','adjustment')),
            method TEXT,                 -- card/cash/bank/other
            reference TEXT,              -- stripe session id or invoice number
            amount_cents INTEGER NOT NULL,
            currency TEXT NOT NULL,
            credits_qty INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('completed','pending','refunded','failed')) DEFAULT 'completed',
            notes TEXT,
            metadata TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_by BIGINT
        )
        "#
    )
    .execute(pool)
    .await?;

    // Indexes
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_billing_tx_reseller ON billing.billing_transactions(reseller_id)"
        )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_billing_tx_created_at ON billing.billing_transactions(created_at)"
        )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_billing_tx_source ON billing.billing_transactions(source)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Add missing columns to existing databases without destructive migrations
/// Lightweight runtime migrations that can safely run against existing databases
/// without requiring destructive schema rebuilds.
pub async fn run_runtime_migrations(pool: &Pool<Postgres>) -> Result<()> {
    // Add new category-related columns if needed (non-destructive)
    add_category_type_column_if_missing(pool).await?;
    add_tmdb_id_column_if_missing(pool).await?;

    // Add proxy / doh columns if needed
    add_proxy_url_column_if_missing(pool).await?;
    add_doh_url_column_if_missing(pool).await?;

    // Ensure public endpoint config defaults exist
    ensure_public_endpoints_config(pool).await?;

    // Ensure user_subscriptions uniqueness for existing installations
    ensure_user_subscriptions_unique(pool).await?;

    // Ensure credits column uses FLOAT8 for Rust f64 compatibility
    ensure_user_credits_double(pool).await?;

    // Ensure new subtitle tables exist (safe on existing DBs)
    if !table_exists(pool, "content.media_content_subtitles").await? {
        create_content_subtitles_table(pool).await?;
    }
    if !table_exists(pool, "content.episode_subtitles").await? {
        create_episode_subtitles_table(pool).await?;
    }

    // Ensure password reset and 2FA tables/columns exist
    create_password_reset_tokens_table(pool).await?;
    add_2fa_columns_if_missing(pool).await?;

    // Ensure SMTP config table exists
    ensure_smtp_config_table(pool).await?;

    // Add Widevine/PlayReady DRM columns if missing
    add_drm_columns_if_missing(pool).await?;

    // Add episode_id column to media_streams for per-episode multi-stream support
    add_episode_id_to_media_streams(pool).await?;

    // Add missing columns to event_schedules table
    add_event_schedules_columns_if_missing(pool).await?;

    // Direct subscription system: add user columns for subscription_source, email verification
    add_direct_subscription_user_columns(pool).await?;

    ensure_performance_indexes(pool).await?;

    // === SCHEMA NORMALIZATION v1.2.0 ===
    migrate_public_tables_to_schemas(pool).await?;
    ensure_media_content_columns(pool).await?;
    ensure_media_streams_default_unique(pool).await?;
    migrate_legacy_content_to_polymorphic(pool).await?;
    migrate_master_api_keys_to_hash(pool).await?;
    normalize_column_names(pool).await?;
    ensure_user_favorites_unique(pool).await?;
    normalize_legacy_content_view(pool).await?;
    normalize_subtitle_tables(pool).await?;

    // License hardening: add HMAC signature column to license_activations
    if !column_exists(pool, "core", "license_activations", "signature").await? {
        sqlx::query("ALTER TABLE core.license_activations ADD COLUMN signature TEXT")
            .execute(pool)
            .await?;
        tracing::info!("Added 'signature' column to core.license_activations");
    }

    Ok(())
}

async fn migrate_public_tables_to_schemas(pool: &Pool<Postgres>) -> Result<()> {
    // Quick check: does the public schema have any of our application tables?
    // If not, skip entirely (fast path for clean v1.2.0 installs).
    let has_legacy_tables: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'content', 'categories', 'config'))"
    )
    .fetch_one(pool)
    .await?;

    if !has_legacy_tables {
        return Ok(());
    }

    tracing::info!("🔄 Detected legacy tables in public schema. Starting v1.1.2 → v1.2.0 schema migration...");

    // ══════════════════════════════════════════════════════════════════════
    // CRITICAL: Tables MUST be ordered so that children (FK dependents)
    // are processed BEFORE their parents. This prevents CASCADE drops
    // from destroying child data that hasn't been moved yet.
    //
    // v1.1.2 "content" is a flat table → v1.2.0 "media_content" (split).
    // We handle the rename separately after the standard moves.
    // ══════════════════════════════════════════════════════════════════════
    let table_mappings: Vec<(&str, &str)> = vec![
        // ── Leaf tables first (no children depend on these) ──
        // Activity leaf tables
        ("activity_logs", "activity"),
        ("user_login_history", "activity"),
        ("user_viewing_history", "activity"),
        ("user_watch_progress", "activity"),
        ("reseller_api_key_usage", "activity"),
        ("blacklisted_tokens", "activity"),
        ("rate_limits", "activity"),
        ("user_favorites", "activity"),

        // Core leaf tables
        ("ticket_message_reads", "core"),
        ("ticket_messages", "core"),
        ("support_tickets", "core"),
        ("tickets", "core"),
        ("media_watch_folders", "core"),
        ("app_versions", "core"),
        ("password_reset_tokens", "core"),
        ("system_info", "core"),
        ("system_config", "core"),
        ("config", "core"),
        ("smtp_config", "core"),

        // Auth leaf tables
        ("security_incidents", "auth"),
        ("security_bans", "auth"),
        ("user_devices", "auth"),
        ("devices", "auth"),
        ("reseller_api_keys", "auth"),
        ("master_api_keys", "auth"),

        // Billing leaf tables
        ("gift_code_redemptions", "billing"),
        ("direct_subscriptions", "billing"),
        ("reseller_logs", "billing"),
        ("billing_transactions", "billing"),
        ("credit_purchases", "billing"),
        ("user_subscriptions", "billing"),

        // ── Content children (depend on media_content/categories) ──
        ("episode_subtitles", "content"),       // depends on episodes
        ("episodes", "content"),                // depends on seasons
        ("seasons", "content"),                 // depends on series
        ("series", "content"),                  // depends on media_content
        ("media_streams", "content"),           // depends on media_content
        ("movies", "content"),                  // depends on media_content
        ("tv_channels", "content"),             // depends on media_content
        ("media_content_subtitles", "content"), // depends on media_content (new name)

        // ── Activity tables that depend on content ──
        ("event_schedules", "activity"),        // depends on events
        ("events", "activity"),                 // depends on media_content
        ("epg_sources", "activity"),
        ("tv_providers", "activity"),

        // ── Billing tables that depend on content/auth ──
        ("gift_codes", "billing"),
        ("packages", "billing"),

        // ── Content parent tables (move LAST) ──
        ("tv_channel_categories", "content"),
        ("categories", "content"),

        // ── Auth parent table (move LAST) ──
        ("users", "auth"),
    ];

    for (table, target_schema) in &table_mappings {
        if let Err(e) = migrate_single_table(pool, table, target_schema).await {
            tracing::error!("❌ Error migrating table '{}' to '{}': {}", table, target_schema, e);
            // Continue with other tables — don't abort the whole migration
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SPECIAL CASE: v1.1.2 `public.content`
    // If the new schema already has content.media_content with data, keep it
    // and move legacy table to content.legacy_content for safe migration.
    // If empty/missing, move legacy table to content.media_content directly.
    // Polymorphic splitting is handled later by migrate_legacy_content_to_polymorphic.
    // ══════════════════════════════════════════════════════════════════════
    let has_public_content: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'content' AND table_type = 'BASE TABLE')"
    )
    .fetch_one(pool)
    .await?;

    if has_public_content {
        let has_target_media_content: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'content' AND table_name = 'media_content')"
        )
        .fetch_one(pool)
        .await?;

        if has_target_media_content {
            let target_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM content.media_content")
                .fetch_one(pool)
                .await
                .unwrap_or(0);

            if target_count == 0 {
                // Empty target — drop it and move+rename the legacy table
                sqlx::query("DROP TABLE IF EXISTS content.media_content CASCADE").execute(pool).await?;
                sqlx::query("ALTER TABLE public.content SET SCHEMA content").execute(pool).await?;
                sqlx::query("ALTER TABLE content.content RENAME TO media_content").execute(pool).await?;
                tracing::info!("✅ Migrated public.content → content.media_content (rename + schema move)");
            } else {
                // Target has data — move legacy table aside for safe merge
                let has_legacy_content = table_exists(pool, "content.legacy_content").await.unwrap_or(false);
                if has_legacy_content {
                    tracing::warn!("⚠️ content.legacy_content exists. Appending from public.content...");
                    let columns: Vec<String> = sqlx::query_scalar(
                        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'content'
                         INTERSECT
                         SELECT column_name FROM information_schema.columns WHERE table_schema = 'content' AND table_name = 'legacy_content'"
                    )
                    .fetch_all(pool)
                    .await?;

                    if !columns.is_empty() {
                        let cols = columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ");
                        let insert_sql = format!(
                            "INSERT INTO content.legacy_content ({}) SELECT {} FROM public.content ON CONFLICT DO NOTHING",
                            cols, cols
                        );
                        if let Err(e) = sqlx::query(&insert_sql).execute(pool).await {
                            tracing::error!("❌ Failed to append public.content → content.legacy_content: {}", e);
                        }
                    }
                    sqlx::query("DROP TABLE IF EXISTS public.content CASCADE").execute(pool).await?;
                } else {
                    sqlx::query("ALTER TABLE public.content SET SCHEMA content").execute(pool).await?;
                    sqlx::query("ALTER TABLE content.content RENAME TO legacy_content").execute(pool).await?;
                    tracing::warn!("⚠️ Moved public.content → content.legacy_content for safe merge");
                }
            }
        } else {
            // No media_content in content schema at all — just move and rename
            sqlx::query("ALTER TABLE public.content SET SCHEMA content").execute(pool).await?;
            sqlx::query("ALTER TABLE content.content RENAME TO media_content").execute(pool).await?;
            tracing::info!("✅ Migrated public.content → content.media_content (rename + schema move)");
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SPECIAL CASE: v1.1.2 `public.content_subtitles` → v1.2.0
    // `content.media_content_subtitles` (rename + column rename)
    // The old table has `content_id`, the new one uses `media_content_id`.
    // ══════════════════════════════════════════════════════════════════════
    let has_public_content_subtitles: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'content_subtitles')"
    )
    .fetch_one(pool)
    .await?;

    if has_public_content_subtitles {
        let has_target: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'content' AND table_name = 'media_content_subtitles')"
        )
        .fetch_one(pool)
        .await?;

        if has_target {
            // Append data with column rename
            tracing::warn!("⚠️ Migrating public.content_subtitles → content.media_content_subtitles (with column rename)...");
            let result = sqlx::query(
                "INSERT INTO content.media_content_subtitles (media_content_id, language, file_path, created_at)
                 SELECT content_id, language, file_path, created_at FROM public.content_subtitles
                 ON CONFLICT (media_content_id, language, file_path) DO NOTHING"
            )
            .execute(pool)
            .await;
            match result {
                Ok(r) => tracing::info!("✅ Migrated {} subtitle records from public.content_subtitles", r.rows_affected()),
                Err(e) => tracing::error!("❌ Failed to migrate content_subtitles: {}", e),
            }
        } else {
            // Move and rename the table + column
            sqlx::query("ALTER TABLE public.content_subtitles SET SCHEMA content").execute(pool).await?;
            sqlx::query("ALTER TABLE content.content_subtitles RENAME TO media_content_subtitles").execute(pool).await?;
            // Rename column
            let has_old_col: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='content' AND table_name='media_content_subtitles' AND column_name='content_id')"
            )
            .fetch_one(pool)
            .await?;
            if has_old_col {
                sqlx::query("ALTER TABLE content.media_content_subtitles RENAME COLUMN content_id TO media_content_id").execute(pool).await?;
            }
            tracing::info!("✅ Migrated public.content_subtitles → content.media_content_subtitles");
        }
        // Always clean up the public copy
        sqlx::query("DROP TABLE IF EXISTS public.content_subtitles CASCADE").execute(pool).await.ok();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Fix sequences after schema moves.
    // ALTER TABLE SET SCHEMA moves the table AND its owned sequences,
    // but we should verify autoincrement starts after the max existing ID.
    // ══════════════════════════════════════════════════════════════════════
    let sequence_tables = [
        // Auth
        ("auth", "users"),
        ("auth", "master_api_keys"),
        ("auth", "devices"),
        ("auth", "user_devices"),
        ("auth", "security_incidents"),
        ("auth", "security_bans"),
        ("auth", "reseller_api_keys"),
        // Content
        ("content", "categories"),
        ("content", "tv_channel_categories"),
        ("content", "media_content"),
        ("content", "movies"),
        ("content", "tv_channels"),
        ("content", "media_streams"),
        ("content", "series"),
        ("content", "seasons"),
        ("content", "episodes"),
        ("content", "media_content_subtitles"),
        ("content", "episode_subtitles"),
        // Billing
        ("billing", "credit_purchases"),
        ("billing", "billing_transactions"),
        ("billing", "user_subscriptions"),
        ("billing", "gift_codes"),
        ("billing", "gift_code_redemptions"),
        ("billing", "reseller_logs"),
        ("billing", "packages"),
        ("billing", "direct_subscriptions"),
        // Activity
        ("activity", "epg_sources"),
        ("activity", "events"),
        ("activity", "event_schedules"),
        ("activity", "tv_providers"),
        ("activity", "user_favorites"),
        ("activity", "blacklisted_tokens"),
        ("activity", "rate_limits"),
        ("activity", "activity_logs"),
        ("activity", "user_login_history"),
        ("activity", "user_viewing_history"),
        ("activity", "user_watch_progress"),
        ("activity", "reseller_api_key_usage"),
        // Core
        ("core", "config"),
        ("core", "system_config"),
        ("core", "tickets"),
        ("core", "support_tickets"),
        ("core", "ticket_messages"),
        ("core", "ticket_message_reads"),
        ("core", "media_watch_folders"),
        ("core", "app_versions"),
        ("core", "password_reset_tokens"),
        ("core", "smtp_config"),
    ];

    for (schema, tbl) in &sequence_tables {
        let qualified = format!("{}.{}", schema, tbl);
        if !table_exists(pool, &qualified).await.unwrap_or(false) {
            continue;
        }
        // Find the sequence owned by the 'id' column
        let seq: Option<String> = sqlx::query_scalar(
            "SELECT pg_get_serial_sequence($1, 'id')"
        )
        .bind(&qualified)
        .fetch_one(pool)
        .await
        .unwrap_or(None);

        if let Some(seq_name) = seq {
            let max_sql = format!("SELECT COALESCE(MAX(id), 0) FROM {}", qualified);
            let max_id: i64 = sqlx::query_scalar(&max_sql)
                .fetch_one(pool)
                .await
                .unwrap_or(0);

            if max_id > 0 {
                let setval_sql = format!("SELECT setval('{}', $1, true)", seq_name.replace('\'', "''"));
                sqlx::query(&setval_sql).bind(max_id).execute(pool).await.ok();
            }
        }
    }

    tracing::info!("✅ Schema migration from public to v1.2.0 schemas completed successfully");
    Ok(())
}

/// Migrate legacy flat content table data into polymorphic tables.
/// Supports legacy sources: public.content, content.legacy_content, or content.media_content (legacy).
async fn migrate_legacy_content_to_polymorphic(pool: &Pool<Postgres>) -> Result<()> {
    if !table_exists(pool, "content.media_content").await? {
        return Ok(());
    }

    let has_public_content = table_exists(pool, "public.content").await.unwrap_or(false);
    let has_legacy_content = table_exists(pool, "content.legacy_content").await.unwrap_or(false);
    let media_content_has_stream_url =
        column_exists(pool, "content", "media_content", "stream_url").await.unwrap_or(false);

    let source_table = if has_public_content {
        "public.content"
    } else if has_legacy_content {
        "content.legacy_content"
    } else if media_content_has_stream_url {
        "content.media_content"
    } else {
        return Ok(());
    };

    tracing::info!(
        "🔄 Migrating legacy content data from {} to polymorphic schema...",
        source_table
    );

    ensure_media_content_columns(pool).await?;
    ensure_media_streams_default_unique(pool).await?;

    // Parse source table schema/name for dynamic column detection (used by ALL inserts below)
    let source_parts: Vec<&str> = source_table.split('.').collect();
    let src_schema = source_parts.first().unwrap_or(&"public");
    let src_table = source_parts.last().unwrap_or(&"content");

    tracing::info!("🔍 Source table: {}.{} — detecting columns...", src_schema, src_table);

    if source_table != "content.media_content" {
        // Check columns needed for media_content INSERT
        let has_category_id = column_exists(pool, src_schema, src_table, "category_id").await.unwrap_or(false);
        let has_title = column_exists(pool, src_schema, src_table, "title").await.unwrap_or(false);
        let has_description = column_exists(pool, src_schema, src_table, "description").await.unwrap_or(false);
        let has_image_url = column_exists(pool, src_schema, src_table, "image_url").await.unwrap_or(false);
        let has_backdrop_url = column_exists(pool, src_schema, src_table, "backdrop_url").await.unwrap_or(false);
        let has_active = column_exists(pool, src_schema, src_table, "active").await.unwrap_or(false);
        let has_created_at = column_exists(pool, src_schema, src_table, "created_at").await.unwrap_or(false);

        if !has_title {
            tracing::warn!("⚠️ Source table {}.{} has no 'title' column — skipping media_content migration", src_schema, src_table);
            return Ok(());
        }

        let insert_media_content_sql = format!(
            r#"
            INSERT INTO content.media_content (id, category_id, title, description, image_url, backdrop_url, media_type, active, created_at)
            SELECT
                c.id,
                {category_id},
                c.title,
                {description},
                {image_url},
                {backdrop_url},
                CASE
                    WHEN cat.category_type = 'VOD' THEN 'movie'
                    WHEN cat.category_type = 'Series' THEN 'series'
                    WHEN cat.category_type = 'TV' THEN 'tv_channel'
                    WHEN cat.category_type = 'Eventos' THEN 'event'
                    WHEN cat.category_type = 'Anime' THEN 'anime'
                    WHEN cat.category_type = 'Kids' THEN 'kids'
                    ELSE 'movie'
                END,
                {active},
                {created_at}
            FROM {source} c
            LEFT JOIN content.categories cat ON {join_condition}
            ON CONFLICT (id) DO NOTHING
            "#,
            category_id = if has_category_id { "c.category_id" } else { "NULL::bigint" },
            description = if has_description { "c.description" } else { "NULL::text" },
            image_url = if has_image_url { "c.image_url" } else { "NULL::text" },
            backdrop_url = if has_backdrop_url { "c.backdrop_url" } else { "NULL::text" },
            active = if has_active { "COALESCE(c.active, true)" } else { "true" },
            created_at = if has_created_at { "c.created_at" } else { "NOW()" },
            source = source_table,
            join_condition = if has_category_id { "c.category_id = cat.id" } else { "false" },
        );
        if let Err(e) = sqlx::query(&insert_media_content_sql).execute(pool).await {
            tracing::warn!("⚠️ media_content migration warning: {}", e);
        }
    }


    // Detect genre column once — used by both movies and TV channels
    let has_genre = column_exists(pool, src_schema, src_table, "genre").await.unwrap_or(false);
    let genre_expr = if has_genre { "c.genre" } else { "NULL::text" };

    if table_exists(pool, "content.movies").await? {
        // Dynamically detect which columns exist in the source table
        let has_year = column_exists(pool, src_schema, src_table, "year").await.unwrap_or(false);
        let has_duration = column_exists(pool, src_schema, src_table, "duration").await.unwrap_or(false);
        let has_rating = column_exists(pool, src_schema, src_table, "rating").await.unwrap_or(false);
        let has_tmdb_id = column_exists(pool, src_schema, src_table, "tmdb_id").await.unwrap_or(false);

        let year_expr = if has_year { "c.year" } else { "NULL::integer" };
        let duration_expr = if has_duration { "c.duration" } else { "NULL::integer" };
        let rating_expr = if has_rating { "c.rating" } else { "NULL::real" };
        let tmdb_expr = if has_tmdb_id { "c.tmdb_id" } else { "NULL::bigint" };

        let insert_movies_sql = format!(
            r#"
            INSERT INTO content.movies (media_content_id, backdrop_url, year, duration, rating, genre, tmdb_id)
            SELECT
                c.id,
                c.backdrop_url,
                {year},
                {duration},
                {rating},
                {genre},
                {tmdb}
            FROM {source} c
            LEFT JOIN content.categories cat ON c.category_id = cat.id
            WHERE COALESCE(cat.category_type, '') NOT IN ('TV', 'Eventos')
            ON CONFLICT (media_content_id) DO NOTHING
            "#,
            year = year_expr,
            duration = duration_expr,
            rating = rating_expr,
            genre = genre_expr,
            tmdb = tmdb_expr,
            source = source_table
        );
        if let Err(e) = sqlx::query(&insert_movies_sql).execute(pool).await {
            tracing::warn!("⚠️ movies migration warning: {}", e);
        }
    }

    if table_exists(pool, "content.tv_channels").await? {
        // Dynamically detect TV channel columns in source table
        let has_channel_number = column_exists(pool, src_schema, src_table, "channel_number").await.unwrap_or(false);
        let has_is_live = column_exists(pool, src_schema, src_table, "is_live").await.unwrap_or(false);
        let has_provider = column_exists(pool, src_schema, src_table, "provider").await.unwrap_or(false);
        let has_country = column_exists(pool, src_schema, src_table, "country").await.unwrap_or(false);
        let has_epg_source = column_exists(pool, src_schema, src_table, "epg_source_id").await.unwrap_or(false);
        let has_epg_channel = column_exists(pool, src_schema, src_table, "epg_channel_id").await.unwrap_or(false);
        let has_epg_offset = column_exists(pool, src_schema, src_table, "epg_offset_minutes").await.unwrap_or(false);

        let insert_tv_channels_sql = format!(
            r#"
            INSERT INTO content.tv_channels (
                media_content_id,
                channel_number,
                is_live,
                provider,
                country,
                channel_category,
                epg_source_id,
                epg_channel_id,
                epg_offset_minutes
            )
            SELECT
                c.id,
                {channel_number},
                {is_live},
                {provider},
                {country},
                {genre},
                {epg_source},
                {epg_channel},
                {epg_offset}
            FROM {source} c
            LEFT JOIN content.categories cat ON c.category_id = cat.id
            WHERE cat.category_type IN ('TV', 'Eventos')
            ON CONFLICT (media_content_id) DO NOTHING
            "#,
            channel_number = if has_channel_number { "c.channel_number" } else { "NULL::integer" },
            is_live = if has_is_live { "c.is_live" } else { "true" },
            provider = if has_provider { "c.provider" } else { "NULL::text" },
            country = if has_country { "c.country" } else { "NULL::text" },
            genre = genre_expr,
            epg_source = if has_epg_source { "c.epg_source_id" } else { "NULL::bigint" },
            epg_channel = if has_epg_channel { "c.epg_channel_id" } else { "NULL::text" },
            epg_offset = if has_epg_offset { "COALESCE(c.epg_offset_minutes, 0)" } else { "0" },
            source = source_table
        );
        if let Err(e) = sqlx::query(&insert_tv_channels_sql).execute(pool).await {
            tracing::warn!("⚠️ tv_channels migration warning: {}", e);
        }
    }

    if table_exists(pool, "content.media_streams").await? {
        // Dynamically detect stream-related columns in source table
        let has_quality = column_exists(pool, src_schema, src_table, "quality").await.unwrap_or(false);
        let has_language = column_exists(pool, src_schema, src_table, "language").await.unwrap_or(false);
        let has_audio_languages = column_exists(pool, src_schema, src_table, "audio_languages").await.unwrap_or(false);
        let has_format = column_exists(pool, src_schema, src_table, "format").await.unwrap_or(false);
        let has_drm_keys = column_exists(pool, src_schema, src_table, "drm_keys").await.unwrap_or(false);
        let has_drm_type = column_exists(pool, src_schema, src_table, "drm_type").await.unwrap_or(false);
        let has_license_server = column_exists(pool, src_schema, src_table, "license_server_url").await.unwrap_or(false);
        let has_drm_headers = column_exists(pool, src_schema, src_table, "drm_headers").await.unwrap_or(false);
        let has_proxy_url = column_exists(pool, src_schema, src_table, "proxy_url").await.unwrap_or(false);
        let has_doh_url = column_exists(pool, src_schema, src_table, "doh_url").await.unwrap_or(false);
        let has_origin = column_exists(pool, src_schema, src_table, "origin").await.unwrap_or(false);
        let has_user_agent = column_exists(pool, src_schema, src_table, "user_agent").await.unwrap_or(false);
        let has_referer = column_exists(pool, src_schema, src_table, "referer").await.unwrap_or(false);
        let has_custom_headers = column_exists(pool, src_schema, src_table, "custom_headers").await.unwrap_or(false);

        let insert_streams_sql = format!(
            r#"
            INSERT INTO content.media_streams (
                media_content_id,
                stream_url,
                stream_type,
                is_default,
                quality,
                language,
                audio_languages,
                format,
                drm_keys,
                drm_type,
                license_server_url,
                drm_headers,
                proxy_url,
                doh_url,
                origin,
                user_agent,
                referer,
                custom_headers
            )
            SELECT
                c.id,
                c.stream_url,
                'main',
                true,
                {quality},
                {language},
                {audio_languages},
                {format},
                {drm_keys},
                {drm_type},
                {license_server},
                {drm_headers},
                {proxy_url},
                {doh_url},
                {origin},
                {user_agent},
                {referer},
                {custom_headers}
            FROM {source} c
            WHERE c.stream_url IS NOT NULL AND c.stream_url <> ''
            ON CONFLICT (media_content_id, is_default) WHERE is_default = true DO NOTHING
            "#,
            quality = if has_quality { "c.quality" } else { "NULL::text" },
            language = if has_language { "c.language" } else { "NULL::text" },
            audio_languages = if has_audio_languages { "c.audio_languages" } else { "NULL::text" },
            format = if has_format { "c.format" } else { "NULL::text" },
            drm_keys = if has_drm_keys { "c.drm_keys" } else { "NULL::text" },
            drm_type = if has_drm_type { "c.drm_type" } else { "NULL::text" },
            license_server = if has_license_server { "c.license_server_url" } else { "NULL::text" },
            drm_headers = if has_drm_headers { "c.drm_headers" } else { "NULL::text" },
            proxy_url = if has_proxy_url { "c.proxy_url" } else { "NULL::text" },
            doh_url = if has_doh_url { "c.doh_url" } else { "NULL::text" },
            origin = if has_origin { "c.origin" } else { "NULL::text" },
            user_agent = if has_user_agent { "c.user_agent" } else { "NULL::text" },
            referer = if has_referer { "c.referer" } else { "NULL::text" },
            custom_headers = if has_custom_headers { "c.custom_headers" } else { "NULL::text" },
            source = source_table
        );
        if let Err(e) = sqlx::query(&insert_streams_sql).execute(pool).await {
            tracing::warn!("⚠️ media_streams migration warning: {}", e);
        }
    }

    reset_table_sequence(pool, "content", "media_content").await?;
    reset_table_sequence(pool, "content", "media_streams").await?;

    if source_table == "public.content" {
        let _ = sqlx::query("DROP TABLE IF EXISTS public.content CASCADE")
            .execute(pool)
            .await;
    }

    tracing::info!("✅ Legacy content migration completed");
    Ok(())
}

async fn reset_table_sequence(pool: &Pool<Postgres>, schema: &str, table: &str) -> Result<()> {
    let qualified = format!("{}.{}", schema, table);
    if !table_exists(pool, &qualified).await? {
        return Ok(());
    }

    let seq: Option<String> = sqlx::query_scalar(
        "SELECT pg_get_serial_sequence($1, 'id')"
    )
    .bind(&qualified)
    .fetch_one(pool)
    .await
    .unwrap_or(None);

    if let Some(seq_name) = seq {
        let max_sql = format!("SELECT COALESCE(MAX(id), 0) FROM {}", qualified);
        let max_id: i64 = sqlx::query_scalar(&max_sql)
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        if max_id > 0 {
            let setval_sql = format!("SELECT setval('{}', $1, true)", seq_name.replace('\'', "''"));
            let _ = sqlx::query(&setval_sql).bind(max_id).execute(pool).await;
        }
    }

    Ok(())
}

/// Move a single table from public schema to its target schema.
/// Handles both empty-target (move) and populated-target (append) scenarios.
async fn migrate_single_table(pool: &Pool<Postgres>, table: &str, target_schema: &str) -> Result<()> {
    let exists_in_public: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)"
    )
    .bind(table)
    .fetch_one(pool)
    .await?;

    if !exists_in_public {
        return Ok(());
    }

    let exists_in_target: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)"
    )
    .bind(target_schema)
    .bind(table)
    .fetch_one(pool)
    .await?;

    if exists_in_target {
        let target_count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}.{}", target_schema, table))
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        if target_count == 0 {
            // Target is empty — drop it and move public table over
            let drop_sql = format!("DROP TABLE IF EXISTS {}.{} CASCADE", target_schema, table);
            sqlx::query(&drop_sql).execute(pool).await?;

            let move_sql = format!("ALTER TABLE public.{} SET SCHEMA {}", table, target_schema);
            sqlx::query(&move_sql).execute(pool).await?;
            tracing::info!("✅ Migrated {} from public → {}", table, target_schema);
        } else {
            // Target has data — append via INSERT ... ON CONFLICT DO NOTHING
            tracing::warn!("⚠️ {}.{} has data. Appending from public.{}...", target_schema, table, table);

            let columns: Vec<String> = sqlx::query_scalar(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1
                 INTERSECT
                 SELECT column_name FROM information_schema.columns WHERE table_schema = $2 AND table_name = $1"
            )
            .bind(table)
            .bind(target_schema)
            .fetch_all(pool)
            .await?;

            if !columns.is_empty() {
                let cols = columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ");
                let insert_sql = format!(
                    "INSERT INTO {}.{} ({}) SELECT {} FROM public.{} ON CONFLICT DO NOTHING",
                    target_schema, table, cols, cols, table
                );
                if let Err(e) = sqlx::query(&insert_sql).execute(pool).await {
                    tracing::error!("❌ Failed to append data to {}.{}: {}", target_schema, table, e);
                } else {
                    tracing::info!("✅ Appended data from public.{} into {}.{}", table, target_schema, table);
                }
            }

            // Clean up public copy
            let drop_public = format!("DROP TABLE IF EXISTS public.{} CASCADE", table);
            sqlx::query(&drop_public).execute(pool).await?;
        }
    } else {
        // Target schema doesn't have the table — just move it
        let move_sql = format!("ALTER TABLE public.{} SET SCHEMA {}", table, target_schema);
        sqlx::query(&move_sql).execute(pool).await?;
        tracing::info!("✅ Migrated {} from public → {}", table, target_schema);
    }

    Ok(())
}

async fn ensure_performance_indexes(pool: &Pool<Postgres>) -> Result<()> {
    if table_exists(pool, "content.media_content").await? {
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_media_content_category_title ON content.media_content(category_id, title)"
        )
        .execute(pool)
        .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_media_content_created_at ON content.media_content(created_at DESC)"
        )
        .execute(pool)
        .await?;
    }

    if table_exists(pool, "auth.users").await? {
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_users_role_created_at ON auth.users(role, created_at)"
        )
        .execute(pool)
        .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_users_role_active_expires ON auth.users(role, active, expires_at)"
        )
        .execute(pool)
        .await?;
        // Index for reseller lookups (users created by a reseller)
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_users_created_by ON auth.users(created_by)")
            .execute(pool)
            .await?;
        // Index for role-only queries
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_users_role ON auth.users(role)")
            .execute(pool)
            .await?;
    }

    // CRITICAL: user_subscriptions indexes for category lookups (fixes N+1 query bottleneck)
    if table_exists(pool, "billing.user_subscriptions").await? {
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON billing.user_subscriptions(user_id)"
        )
        .execute(pool)
        .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_user_subscriptions_category_id ON billing.user_subscriptions(category_id)"
        )
        .execute(pool)
        .await?;
    }

    // Device lookup indexes
    if table_exists(pool, "auth.devices").await? {
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_devices_user_id ON auth.devices(user_id)")
            .execute(pool)
            .await?;
    }

    if table_exists(pool, "auth.user_devices").await? {
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON auth.user_devices(user_id)")
            .execute(pool)
            .await?;
    }

    // Category type indexes for filtering
    if table_exists(pool, "content.categories").await? {
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_categories_category_type ON content.categories(category_type)"
        )
        .execute(pool)
        .await?;
    }

    // Case-insensitive uniqueness for custom TV channel categories.
    // Best-effort: if a legacy DB contains duplicates differing only by case, index creation will fail.
    if table_exists(pool, "content.tv_channel_categories").await? {
        let res = sqlx::query(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_tv_channel_categories_name_lower_unique ON content.tv_channel_categories (LOWER(name))"
        )
        .execute(pool)
        .await;
        if let Err(e) = res {
            println!(
                "⚠️  Could not ensure unique index on tv_channel_categories(name) (case-insensitive): {e}"
            );
        }
    }

    if table_exists(pool, "billing.billing_transactions").await? {
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_billing_tx_status_created_at ON billing.billing_transactions(status, created_at)"
        )
        .execute(pool)
        .await?;
    }

    if table_exists(pool, "auth.security_incidents").await? {
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_security_incidents_type_created_at ON auth.security_incidents(incident_type, created_at)"
        )
        .execute(pool)
        .await?;
        // Enable pg_trgm extension for ILIKE searches (safe to run multiple times)
        let _ = sqlx::query("CREATE EXTENSION IF NOT EXISTS pg_trgm")
            .execute(pool)
            .await;
        // GIN trigram index for fast case-insensitive username searches
        let _ = sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_security_incidents_username_trgm ON auth.security_incidents USING gin (username gin_trgm_ops)"
        )
        .execute(pool)
        .await;
    }

    if table_exists(pool, "auth.security_bans").await? {
        // GIN trigram index for fast case-insensitive username searches
        let _ = sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_security_bans_username_trgm ON auth.security_bans USING gin (username gin_trgm_ops)"
        )
        .execute(pool)
        .await;
    }

    if table_exists(pool, "auth.users").await? {
        // GIN trigram index for admin user search by username
        let _ = sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON auth.users USING gin (username gin_trgm_ops)"
        )
        .execute(pool)
        .await;
    }

    // Series/Seasons/Episodes indexes for faster loading
    if table_exists(pool, "content.series").await? {
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_series_content_id ON content.series(content_id)")
            .execute(pool)
            .await?;
    }

    if table_exists(pool, "content.seasons").await? {
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_seasons_series_id ON content.seasons(series_id)")
            .execute(pool)
            .await?;
    }

    if table_exists(pool, "content.episodes").await? {
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_episodes_season_id ON content.episodes(season_id)")
            .execute(pool)
            .await?;
    }

    // Content indexes for TMDB lookups and channel number searches
    if table_exists(pool, "content.movies").await? {
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON content.movies(tmdb_id)")
            .execute(pool)
            .await?;
    }
    
    if table_exists(pool, "content.tv_channels").await? {
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_tv_channels_channel_number ON content.tv_channels(channel_number)"
        )
        .execute(pool)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_tv_channels_is_live ON content.tv_channels(is_live)")
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn ensure_user_credits_double(pool: &Pool<Postgres>) -> Result<()> {
    if !table_exists(pool, "auth.users").await? {
        return Ok(());
    }

    let data_type = sqlx::query_scalar::<_, String>(
        "SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'credits' AND table_schema IN ('public', 'auth')"
        )
    .fetch_optional(pool)
    .await?;

    if matches!(data_type.as_deref(), Some("real")) {
        sqlx::query("ALTER TABLE auth.users ALTER COLUMN credits TYPE DOUBLE PRECISION USING credits::double precision")
            .execute(pool)
            .await?;
        println!("✅ Migrated 'users.credits' to DOUBLE PRECISION");
    }

    Ok(())
}

pub async fn ensure_user_subscriptions_unique(pool: &Pool<Postgres>) -> Result<()> {
    if !table_exists(pool, "billing.user_subscriptions").await? {
        return Ok(());
    }

    // Remove duplicate rows before applying uniqueness.
    sqlx::query(
        r#"
        DELETE FROM billing.user_subscriptions a
        USING billing.user_subscriptions b
        WHERE a.user_id = b.user_id
          AND a.category_id = b.category_id
          AND a.id > b.id
        "#
        )
    .execute(pool)
    .await?;

    // Enforce uniqueness (idempotent via index name).
    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_unique ON billing.user_subscriptions(user_id, category_id)"
        )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn add_proxy_url_column_if_missing(pool: &Pool<Postgres>) -> Result<()> {
    use sqlx::Row;

    if !table_exists(pool, "content.media_streams").await? {
        return Ok(());
    }

    // Check if 'proxy_url' column exists on 'media_streams' table
    let rows = sqlx::query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = 'media_streams' AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')"
        )
        .fetch_all(pool)
        .await?;

    let mut has_proxy_url = false;
    for row in rows {
        let name: String = row.get("name");
        if name.eq_ignore_ascii_case("proxy_url") {
            has_proxy_url = true;
            break;
        }
    }

    if !has_proxy_url {
        sqlx::query("ALTER TABLE content.media_streams ADD COLUMN proxy_url TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'proxy_url' column to 'media_streams' table");
    }

    Ok(())
}

// --- New tables for external subtitles (movies and episodes) ---

async fn create_content_subtitles_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS content.media_content_subtitles (
            id BIGSERIAL PRIMARY KEY,
            media_content_id BIGINT NOT NULL,
            language TEXT NOT NULL,         -- ISO 639-1 (e.g., 'en', 'es', 'fr')
            file_path TEXT NOT NULL,        -- Absolute path to .srt on disk
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (media_content_id) REFERENCES content.media_content(id) ON DELETE CASCADE,
            UNIQUE(media_content_id, language, file_path)  -- Prevent duplicate subtitles
        )
        "#
        )
    .execute(pool)
    .await?;
    // Indexes for fast lookups
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_media_content_subtitles_content_id ON content.media_content_subtitles(media_content_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_media_content_subtitles_lang ON content.media_content_subtitles(language)"
        )
    .execute(pool)
    .await?;
    Ok(())
}

async fn create_episode_subtitles_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE content.episode_subtitles (
            id BIGSERIAL PRIMARY KEY,
            episode_id BIGINT NOT NULL,
            language TEXT NOT NULL,         -- ISO 639-1 (e.g., 'en', 'es', 'fr')
            file_path TEXT NOT NULL,        -- Absolute path to .srt on disk
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (episode_id) REFERENCES content.episodes(id) ON DELETE CASCADE,
            UNIQUE(episode_id, language, file_path)  -- Prevent duplicate subtitles
        )
        "#
        )
    .execute(pool)
    .await?;
    // Indexes for fast lookups
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_episode_subtitles_episode_id ON content.episode_subtitles(episode_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_episode_subtitles_lang ON content.episode_subtitles(language)"
        )
    .execute(pool)
    .await?;
    Ok(())
}

/// Create media_content_translations table - Multi-language metadata storage
async fn create_media_content_translations_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE content.media_content_translations (
            id BIGSERIAL PRIMARY KEY,
            media_content_id BIGINT NOT NULL,
            language TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(media_content_id, language),
            FOREIGN KEY (media_content_id) REFERENCES content.media_content(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_mct_content_id ON content.media_content_translations(media_content_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_mct_language ON content.media_content_translations(language)")
        .execute(pool)
        .await?;
    Ok(())
}

async fn create_tv_providers_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS activity.tv_providers (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL,
            ttl_minutes INTEGER NOT NULL DEFAULT 120,
            enabled BOOLEAN NOT NULL DEFAULT true,
            last_fetched_at TIMESTAMPTZ,
            next_refresh_at TIMESTAMPTZ,
            last_status TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;

    // Indexes to accelerate scheduler lookups
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tv_providers_enabled ON activity.tv_providers(enabled)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_tv_providers_next_refresh ON activity.tv_providers(next_refresh_at)"
        )
    .execute(pool)
    .await?;

    Ok(())
}

// Add DoH column migration helper (DNS-over-HTTPS per channel)
pub async fn add_doh_url_column_if_missing(pool: &Pool<Postgres>) -> Result<()> {
    use sqlx::Row;

    if !table_exists(pool, "content.media_streams").await? {
        return Ok(());
    }

    // Check if 'doh_url' column exists on 'media_streams' table
    let rows = sqlx::query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = 'media_streams' AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')"
        )
        .fetch_all(pool)
        .await?;

    let mut has_doh_url = false;
    for row in rows {
        let name: String = row.get("name");
        if name.eq_ignore_ascii_case("doh_url") {
            has_doh_url = true;
            break;
        }
    }

    if !has_doh_url {
        sqlx::query("ALTER TABLE content.media_streams ADD COLUMN doh_url TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'doh_url' column to 'media_streams' table");
    }

    Ok(())
}

/// Add category_type column to categories table if missing (and backfill from legacy `type`)
pub async fn add_category_type_column_if_missing(pool: &Pool<Postgres>) -> Result<()> {
    use sqlx::Row;

    if !table_exists(pool, "content.categories").await? {
        return Ok(());
    }

    // Check if 'category_type' column exists on 'categories' table
    let rows = sqlx::query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = 'categories' AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')"
        )
        .fetch_all(pool)
        .await?;

    let mut has_category_type = false;
    for row in rows {
        let name: String = row.get("name");
        if name.eq_ignore_ascii_case("category_type") {
            has_category_type = true;
            break;
        }
    }

    if !has_category_type {
        sqlx::query("ALTER TABLE content.categories ADD COLUMN category_type TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'category_type' column to 'categories' table");

        // Backfill category_type from legacy type column for existing rows
        sqlx::query("UPDATE content.categories SET category_type = type WHERE category_type IS NULL OR category_type = ''")
            .execute(pool)
            .await?;
        println!("ℹ️  Backfilled 'category_type' from legacy 'type' column");
    }

    Ok(())
}

/// Add tmdb_id column to categories table if missing (nullable)
pub async fn add_tmdb_id_column_if_missing(pool: &Pool<Postgres>) -> Result<()> {
    use sqlx::Row;

    if !table_exists(pool, "content.categories").await? {
        return Ok(());
    }

    // Check if 'tmdb_id' column exists on 'categories' table
    let rows = sqlx::query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = 'categories' AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')"
        )
        .fetch_all(pool)
        .await?;

    let mut has_tmdb_id = false;
    for row in rows {
        let name: String = row.get("name");
        if name.eq_ignore_ascii_case("tmdb_id") {
            has_tmdb_id = true;
            break;
        }
    }

    if !has_tmdb_id {
        sqlx::query("ALTER TABLE content.categories ADD COLUMN tmdb_id BIGINT")
            .execute(pool)
            .await?;
        println!("✅ Added 'tmdb_id' column to 'categories' table");
    }

    Ok(())
}

/// Ensure media_content has required columns used by the app
pub async fn ensure_media_content_columns(pool: &Pool<Postgres>) -> Result<()> {
    if !table_exists(pool, "content.media_content").await? {
        return Ok(());
    }

    let has_backdrop_url = column_exists(pool, "content", "media_content", "backdrop_url").await?;
    if !has_backdrop_url {
        sqlx::query("ALTER TABLE content.media_content ADD COLUMN backdrop_url TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'backdrop_url' column to 'media_content' table");
    }

    let has_media_type = column_exists(pool, "content", "media_content", "media_type").await?;
    if !has_media_type {
        sqlx::query("ALTER TABLE content.media_content ADD COLUMN media_type TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'media_type' column to 'media_content' table");
    }

    // Backfill media_type based on category type for legacy rows
    if table_exists(pool, "content.categories").await? {
        sqlx::query(
            r#"
            UPDATE content.media_content mc
            SET media_type = CASE
                WHEN cat.category_type = 'VOD' THEN 'movie'
                WHEN cat.category_type = 'Series' THEN 'series'
                WHEN cat.category_type = 'TV' THEN 'tv_channel'
                WHEN cat.category_type = 'Eventos' THEN 'event'
                WHEN cat.category_type = 'Anime' THEN 'anime'
                WHEN cat.category_type = 'Kids' THEN 'kids'
                ELSE 'movie'
            END
            FROM content.categories cat
            WHERE mc.category_id = cat.id
              AND (mc.media_type IS NULL OR mc.media_type = '')
            "#,
        )
        .execute(pool)
        .await?;
    }

    sqlx::query(
        "UPDATE content.media_content SET media_type = 'movie' WHERE media_type IS NULL OR media_type = ''"
    )
    .execute(pool)
    .await?;

    // Ensure tmdb_id, year, stream_url columns exist (used by series queries and content lookups)
    let has_tmdb_id = column_exists(pool, "content", "media_content", "tmdb_id").await?;
    if !has_tmdb_id {
        sqlx::query("ALTER TABLE content.media_content ADD COLUMN tmdb_id BIGINT")
            .execute(pool)
            .await?;
        println!("✅ Added 'tmdb_id' column to 'media_content' table");
    }

    let has_year = column_exists(pool, "content", "media_content", "year").await?;
    if !has_year {
        sqlx::query("ALTER TABLE content.media_content ADD COLUMN year BIGINT")
            .execute(pool)
            .await?;
        println!("✅ Added 'year' column to 'media_content' table");
    }

    let has_stream_url = column_exists(pool, "content", "media_content", "stream_url").await?;
    if !has_stream_url {
        sqlx::query("ALTER TABLE content.media_content ADD COLUMN stream_url TEXT DEFAULT ''")
            .execute(pool)
            .await?;
        println!("✅ Added 'stream_url' column to 'media_content' table");
    }

    Ok(())
}

/// Ensure a single default stream per content
pub async fn ensure_media_streams_default_unique(pool: &Pool<Postgres>) -> Result<()> {
    if !table_exists(pool, "content.media_streams").await? {
        return Ok(());
    }

    // Deduplicate default streams if needed
    sqlx::query(
        r#"
        DELETE FROM content.media_streams a
        USING content.media_streams b
        WHERE a.media_content_id = b.media_content_id
          AND a.is_default = true
          AND b.is_default = true
          AND a.id > b.id
        "#,
    )
    .execute(pool)
    .await?;

    let res = sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_media_streams_default_unique ON content.media_streams (media_content_id, is_default) WHERE is_default = true"
    )
    .execute(pool)
    .await;

    if let Err(e) = res {
        println!("⚠️  Could not ensure unique default stream index: {e}");
    }

    Ok(())
}

/// Ensure favorites uniqueness by content_id
pub async fn ensure_user_favorites_unique(pool: &Pool<Postgres>) -> Result<()> {
    if !table_exists(pool, "activity.user_favorites").await? {
        return Ok(());
    }

    let has_content_id = column_exists(pool, "activity", "user_favorites", "content_id").await?;
    if !has_content_id {
        return Ok(());
    }

    sqlx::query(
        r#"
        DELETE FROM activity.user_favorites a
        USING activity.user_favorites b
        WHERE a.user_id = b.user_id
          AND a.content_type = b.content_type
          AND a.content_id = b.content_id
          AND a.id > b.id
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_favorites_unique ON activity.user_favorites(user_id, content_type, content_id)"
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Create gift_codes and gift_code_redemptions tables
async fn create_gift_codes_table(pool: &Pool<Postgres>) -> Result<()> {
    tracing::info!("Creating gift_codes and gift_code_redemptions tables...");
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS billing.gift_codes (
            id BIGSERIAL PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            duration_days INTEGER NOT NULL,
            uses_total INTEGER NOT NULL DEFAULT 1,
            uses_remaining INTEGER NOT NULL DEFAULT 1,
            expires_at TIMESTAMPTZ NULL,
            allowed_categories TEXT NULL,
            max_devices INTEGER NULL,
            created_by BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_gift_codes_code ON billing.gift_codes(code)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS billing.gift_code_redemptions (
            id BIGSERIAL PRIMARY KEY,
            gift_code_id BIGINT NOT NULL,
            redeemer_user_id BIGINT NULL,
            redeemer_username TEXT NULL,
            redeemer_email TEXT NULL,
            redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            duration_days_granted INTEGER NOT NULL,
            granted_categories TEXT NULL,
            granted_max_devices INTEGER NULL,
            FOREIGN KEY (gift_code_id) REFERENCES billing.gift_codes(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_gcredeem_giftcode_id ON billing.gift_code_redemptions(gift_code_id)"
        )
    .execute(pool)
    .await?;
    tracing::info!("✅ gift_codes tables created");
    Ok(())
}

/// Ensure required public endpoint config keys exist with sensible defaults
/// - public_demo_enabled: "true"
/// - public_redeem_enabled: "true"
/// - demo_creation_threshold: "3"
/// - demo_ban_duration_days: "15"
pub async fn ensure_public_endpoints_config(pool: &Pool<Postgres>) -> Result<()> {
    // Flags to enable/disable public endpoints from Admin UI
    sqlx::query(
        "INSERT INTO core.config (key, value) VALUES ('public_demo_enabled', 'true') ON CONFLICT (key) DO NOTHING"
        )
        .execute(pool)
        .await?;
    sqlx::query(
        "INSERT INTO core.config (key, value) VALUES ('public_redeem_enabled', 'true') ON CONFLICT (key) DO NOTHING"
        )
    .execute(pool)
    .await?;

    // Demo abuse control defaults
    sqlx::query(
        "INSERT INTO core.config (key, value) VALUES ('demo_creation_threshold', '3') ON CONFLICT (key) DO NOTHING"
        )
    .execute(pool)
    .await?;
    sqlx::query(
        "INSERT INTO core.config (key, value) VALUES ('demo_ban_duration_days', '15') ON CONFLICT (key) DO NOTHING"
        )
    .execute(pool)
    .await?;
    sqlx::query(
        "INSERT INTO core.config (key, value) VALUES ('demo_duration_hours', '12') ON CONFLICT (key) DO NOTHING"
        )
        .execute(pool)
        .await?;

    Ok(())
}

/// Create media_watch_folders table for automatic folder monitoring
async fn create_media_watch_folders_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS core.media_watch_folders (
            id BIGSERIAL PRIMARY KEY,
            folder_path TEXT NOT NULL UNIQUE,
            media_type TEXT NOT NULL CHECK(media_type IN ('movies', 'series', 'kids', 'anime')),
            category_id BIGINT NOT NULL,
            check_interval_minutes INTEGER DEFAULT 30,
            last_check TIMESTAMPTZ,
            enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES content.categories(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;

    // Indexes for fast lookups
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_media_watch_folders_enabled ON core.media_watch_folders(enabled)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_media_watch_folders_media_type ON core.media_watch_folders(media_type)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Migration: Remove duplicate subtitles and add UNIQUE constraint
/// This should be run once to clean up existing databases
pub async fn migrate_deduplicate_subtitles(pool: &Pool<Postgres>) -> Result<()> {
    println!("🔧 Running subtitle deduplication migration...");

    // Step 1: Remove duplicate media_content_subtitles (keep oldest by id)
    sqlx::query(
        r#"
        DELETE FROM content.media_content_subtitles
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM content.media_content_subtitles
            GROUP BY media_content_id, language, file_path
        )
        "#
        )
    .execute(pool)
    .await?;

    // Step 2: Remove duplicate episode_subtitles (keep oldest by id)
    sqlx::query(
        r#"
        DELETE FROM content.episode_subtitles
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM content.episode_subtitles
            GROUP BY episode_id, language, file_path
        )
        "#
        )
    .execute(pool)
    .await?;

    // Step 3: Create UNIQUE indexes if they don't exist
    // Note: SQLite doesn't support adding UNIQUE constraints to existing tables directly
    // So we use UNIQUE indexes instead
    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_media_content_subtitles_unique ON content.media_content_subtitles(media_content_id, language, file_path)"
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_episode_subtitles_unique ON content.episode_subtitles(episode_id, language, file_path)"
    )
    .execute(pool)
    .await?;

    println!("✅ Subtitle deduplication migration completed");
    Ok(())
}

/// Migration: Create media_watch_folders table if it doesn't exist
pub async fn migrate_create_media_watcher(pool: &Pool<Postgres>) -> Result<()> {
    println!("🔧 Creating media_watch_folders table...");
    create_media_watch_folders_table(pool).await?;
    println!("✅ Media watcher table created");
    Ok(())
}

/// Create password_reset_tokens table for password reset functionality
pub async fn create_password_reset_tokens_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            used BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON auth.password_reset_tokens(token)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON auth.password_reset_tokens(user_id)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Add 2FA columns to users table if they don't exist
pub async fn add_2fa_columns_if_missing(pool: &Pool<Postgres>) -> Result<()> {
    use sqlx::Row;

    if !table_exists(pool, "auth.users").await? {
        return Ok(());
    }

    let rows = sqlx::query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = 'users' AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')"
        )
        .fetch_all(pool)
        .await?;

    let mut has_totp_secret = false;
    let mut has_totp_enabled = false;
    let mut has_totp_backup_codes = false;

    for row in rows {
        let name: String = row.get("name");
        match name.as_str() {
            "totp_secret" => has_totp_secret = true,
            "totp_enabled" => has_totp_enabled = true,
            "totp_backup_codes" => has_totp_backup_codes = true,
            _ => {}
        }
    }

    if !has_totp_secret {
        sqlx::query("ALTER TABLE auth.users ADD COLUMN totp_secret TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'totp_secret' column to 'users' table");
    }

    if !has_totp_enabled {
        sqlx::query("ALTER TABLE auth.users ADD COLUMN totp_enabled BOOLEAN DEFAULT false")
            .execute(pool)
            .await?;
        println!("✅ Added 'totp_enabled' column to 'users' table");
    }

    if !has_totp_backup_codes {
        sqlx::query("ALTER TABLE auth.users ADD COLUMN totp_backup_codes TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'totp_backup_codes' column to 'users' table");
    }

    Ok(())
}

/// Migration: Setup password reset and 2FA tables/columns
pub async fn migrate_auth_security_features(pool: &Pool<Postgres>) -> Result<()> {
    // Create password reset tokens table
    create_password_reset_tokens_table(pool).await?;

    // Add 2FA columns to users
    add_2fa_columns_if_missing(pool).await?;

    Ok(())
}

/// Create smtp_config table for storing SMTP settings
pub async fn create_smtp_config_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS core.smtp_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            enabled BOOLEAN DEFAULT false,
            host TEXT,
            port INTEGER DEFAULT 587,
            username TEXT,
            password_encrypted TEXT,
            from_name TEXT DEFAULT 'StreamCore',
            from_email TEXT,
            use_tls BOOLEAN DEFAULT true,
            frontend_url TEXT DEFAULT 'http://localhost:5000',
            app_name TEXT DEFAULT 'StreamCore',
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_by BIGINT,
            FOREIGN KEY (updated_by) REFERENCES auth.users(id)
        )
        "#
        )
    .execute(pool)
    .await?;

    // Insert default row if not exists
    sqlx::query(
        "INSERT INTO core.smtp_config (id, enabled) VALUES (1, false) ON CONFLICT (id) DO NOTHING"
        )
    .execute(pool)
    .await?;

    Ok(())
}

/// Ensure smtp_config table exists
pub async fn ensure_smtp_config_table(pool: &Pool<Postgres>) -> Result<()> {
    create_smtp_config_table(pool).await
}

/// Add Widevine/PlayReady DRM columns to content table if they don't exist
pub async fn add_drm_columns_if_missing(pool: &Pool<Postgres>) -> Result<()> {
    use sqlx::Row;

    if !table_exists(pool, "content.media_streams").await? {
        return Ok(());
    }

    let rows = sqlx::query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = 'media_streams' AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')"
        )
        .fetch_all(pool)
        .await?;

    let mut has_drm_type = false;
    let mut has_license_server_url = false;
    let mut has_drm_headers = false;

    for row in rows {
        let name: String = row.get("name");
        match name.as_str() {
            "drm_type" => has_drm_type = true,
            "license_server_url" => has_license_server_url = true,
            "drm_headers" => has_drm_headers = true,
            _ => {}
        }
    }

    if !has_drm_type {
        sqlx::query("ALTER TABLE content.media_streams ADD COLUMN drm_type TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'drm_type' column to 'media_streams' table");
    }

    if !has_license_server_url {
        sqlx::query("ALTER TABLE content.media_streams ADD COLUMN license_server_url TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'license_server_url' column to 'media_streams' table");
    }

    if !has_drm_headers {
        sqlx::query("ALTER TABLE content.media_streams ADD COLUMN drm_headers TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added 'drm_headers' column to 'media_streams' table");
    }

    Ok(())
}

/// Create reseller_api_keys table for reseller public API access

/// Add episode_id column to media_streams for per-episode multi-stream support
pub async fn add_episode_id_to_media_streams(pool: &Pool<Postgres>) -> Result<()> {
    use sqlx::Row;

    if !table_exists(pool, "content.media_streams").await? {
        return Ok(());
    }

    let rows = sqlx::query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = 'media_streams' AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')"
    )
    .fetch_all(pool)
    .await?;

    let mut has_episode_id = false;
    for row in &rows {
        let name: String = row.get("name");
        if name == "episode_id" {
            has_episode_id = true;
        }
    }

    if !has_episode_id {
        // Make media_content_id nullable so streams can belong to either content or episode
        sqlx::query("ALTER TABLE content.media_streams ALTER COLUMN media_content_id DROP NOT NULL")
            .execute(pool)
            .await
            .ok(); // Ignore if already nullable

        sqlx::query("ALTER TABLE content.media_streams ADD COLUMN episode_id BIGINT REFERENCES content.episodes(id) ON DELETE CASCADE")
            .execute(pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_media_streams_episode_id ON content.media_streams (episode_id) WHERE episode_id IS NOT NULL")
            .execute(pool)
            .await?;

        println!("✅ Added 'episode_id' column to 'media_streams' table for per-episode multi-stream support");
    }

    Ok(())
}

/// Create reseller_api_keys table for reseller public API access
async fn create_reseller_api_keys_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS auth.reseller_api_keys (
            id BIGSERIAL PRIMARY KEY,
            reseller_id BIGINT NOT NULL,
            key_name TEXT NOT NULL,
            api_key_hash TEXT NOT NULL UNIQUE,
            api_key_prefix TEXT NOT NULL,
            
            -- Granular permissions (JSON array)
            permissions TEXT NOT NULL DEFAULT '["users:read","credits:read"]',
            
            -- CORS and security
            allowed_origins TEXT DEFAULT '*',
            ip_whitelist TEXT DEFAULT NULL,
            
            -- Rate limiting
            rate_limit_per_minute INTEGER DEFAULT 60,
            rate_limit_per_day INTEGER DEFAULT 10000,
            
            -- Status and audit
            is_active BOOLEAN DEFAULT true,
            last_used_at TIMESTAMPTZ,
            total_requests INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMPTZ DEFAULT NULL,
            
            FOREIGN KEY (reseller_id) REFERENCES auth.users(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;

    // Indexes for fast lookups
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_reseller_api_keys_hash ON auth.reseller_api_keys(api_key_hash)"
        )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_reseller_api_keys_reseller ON auth.reseller_api_keys(reseller_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_reseller_api_keys_active ON auth.reseller_api_keys(is_active)"
        )
    .execute(pool)
    .await?;

    Ok(())
}

/// Create reseller_api_key_usage table for rate limiting tracking
async fn create_reseller_api_key_usage_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS activity.reseller_api_key_usage (
            id BIGSERIAL PRIMARY KEY,
            api_key_id BIGINT NOT NULL,
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL,
            status_code INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            request_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            response_time_ms INTEGER,
            FOREIGN KEY (api_key_id) REFERENCES auth.reseller_api_keys(id) ON DELETE CASCADE
        )
        "#
        )
    .execute(pool)
    .await?;

    // Indexes for rate limiting queries
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_time ON activity.reseller_api_key_usage(api_key_id, request_timestamp)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Create app_versions table for in-app update management
async fn create_app_versions_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS core.app_versions (
            id BIGSERIAL PRIMARY KEY,
            app_type TEXT NOT NULL CHECK (app_type IN ('phone', 'tv')),
            version TEXT NOT NULL,
            version_code INTEGER NOT NULL,
            apk_filename TEXT NOT NULL UNIQUE,
            file_size BIGINT NOT NULL,
            file_hash TEXT NOT NULL,
            force_update BOOLEAN DEFAULT FALSE,
            release_notes TEXT,
            min_required_version TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        "#
        )
    .execute(pool)
    .await?;

    // Index for quick lookups by app type and active status
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_app_versions_type_active ON core.app_versions(app_type, is_active)")
        .execute(pool)
        .await?;

    Ok(())
}

/// Add missing columns to event_schedules table for existing installations
pub async fn add_event_schedules_columns_if_missing(pool: &Pool<Postgres>) -> Result<()> {
    use sqlx::Row;

    if !table_exists(pool, "activity.event_schedules").await? {
        return Ok(());
    }

    let rows = sqlx::query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = 'event_schedules' AND table_schema IN ('public', 'auth', 'content', 'billing', 'activity', 'core')"
        )
        .fetch_all(pool)
        .await?;

    let mut has_schedule_date = false;
    let mut has_title = false;
    let mut has_description = false;
    let mut has_image_url = false;

    for row in rows {
        let name: String = row.get("name");
        match name.as_str() {
            "schedule_date" => has_schedule_date = true,
            "title" => has_title = true,
            "description" => has_description = true,
            "image_url" => has_image_url = true,
            _ => {}
        }
    }

    if !has_schedule_date {
        sqlx::query("ALTER TABLE activity.event_schedules ADD COLUMN schedule_date DATE")
            .execute(pool)
            .await?;
        println!("✅ Added schedule_date column to event_schedules");
    }

    if !has_title {
        sqlx::query("ALTER TABLE activity.event_schedules ADD COLUMN title TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added title column to event_schedules");
    }

    if !has_description {
        sqlx::query("ALTER TABLE activity.event_schedules ADD COLUMN description TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added description column to event_schedules");
    }

    if !has_image_url {
        sqlx::query("ALTER TABLE activity.event_schedules ADD COLUMN image_url TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added image_url column to event_schedules");
    }

    Ok(())
}

// --- Direct subscription system tables ---

/// Create packages table - Admin-defined subscription packages for direct end users
async fn create_packages_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE billing.packages (
            id              BIGSERIAL PRIMARY KEY,
            name            TEXT NOT NULL,
            description     TEXT,
            price_cents     INT NOT NULL,
            currency        TEXT NOT NULL DEFAULT 'usd',
            billing_mode    TEXT NOT NULL DEFAULT 'recurring'
                            CHECK (billing_mode IN ('recurring', 'one_time')),
            billing_interval TEXT DEFAULT 'month'
                            CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year')),
            duration_days   INT,
            max_devices     INT NOT NULL DEFAULT 1,
            category_ids    JSONB NOT NULL DEFAULT '[]',
            features        JSONB DEFAULT '{}',
            stripe_price_id TEXT,
            badge_text      TEXT,
            badge_color     TEXT,
            active          BOOLEAN NOT NULL DEFAULT true,
            sort_order      INT NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;
    println!("✅ Created billing.packages table");
    Ok(())
}

/// Create direct_subscriptions table - Tracks Stripe subscriptions for direct end users
async fn create_direct_subscriptions_table(pool: &Pool<Postgres>) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE billing.direct_subscriptions (
            id                      BIGSERIAL PRIMARY KEY,
            user_id                 BIGINT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            package_id              BIGINT NOT NULL REFERENCES billing.packages(id),
            stripe_customer_id      TEXT,
            stripe_subscription_id  TEXT UNIQUE,
            stripe_session_id       TEXT,
            status                  TEXT NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','active','past_due','canceled','expired')),
            current_period_start    TIMESTAMPTZ,
            current_period_end      TIMESTAMPTZ,
            cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_direct_subs_user ON billing.direct_subscriptions(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_direct_subs_stripe ON billing.direct_subscriptions(stripe_subscription_id)")
        .execute(pool)
        .await?;

    println!("✅ Created billing.direct_subscriptions table");
    Ok(())
}

/// Add columns for direct subscription system to auth.users (safe on existing DBs)
async fn add_direct_subscription_user_columns(pool: &Pool<Postgres>) -> Result<()> {
    // subscription_source: how this user was created
    let has_sub_source: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='subscription_source')",
    )
    .fetch_one(pool)
    .await?;
    if !has_sub_source {
        sqlx::query("ALTER TABLE auth.users ADD COLUMN subscription_source TEXT DEFAULT 'reseller'")
            .execute(pool)
            .await?;
        println!("✅ Added subscription_source column to auth.users");
    }

    // email_verified
    let has_email_verified: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email_verified')",
    )
    .fetch_one(pool)
    .await?;
    if !has_email_verified {
        sqlx::query("ALTER TABLE auth.users ADD COLUMN email_verified BOOLEAN DEFAULT false")
            .execute(pool)
            .await?;
        println!("✅ Added email_verified column to auth.users");
    }

    // email_verify_token
    let has_verify_token: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email_verify_token')",
    )
    .fetch_one(pool)
    .await?;
    if !has_verify_token {
        sqlx::query("ALTER TABLE auth.users ADD COLUMN email_verify_token TEXT")
            .execute(pool)
            .await?;
        println!("✅ Added email_verify_token column to auth.users");
    }

    // email_verify_expires
    let has_verify_expires: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email_verify_expires')",
    )
    .fetch_one(pool)
    .await?;
    if !has_verify_expires {
        sqlx::query("ALTER TABLE auth.users ADD COLUMN email_verify_expires TIMESTAMPTZ")
            .execute(pool)
            .await?;
        println!("✅ Added email_verify_expires column to auth.users");
    }

    Ok(())
}

// === SCHEMA NORMALIZATION v1.2.0 ===

/// Rename `media_content_id` → `content_id` in tables that had the old column name.
/// Idempotent: checks if the old column exists before attempting rename.
async fn normalize_column_names(pool: &Pool<Postgres>) -> Result<()> {
    let renames = [
        ("content", "series", "media_content_id", "content_id"),
        ("activity", "events", "media_content_id", "content_id"),
        ("activity", "user_watch_progress", "media_content_id", "content_id"),
        ("activity", "user_viewing_history", "media_content_id", "content_id"),
        ("activity", "user_favorites", "media_content_id", "content_id"),
    ];

    for (schema, table, old_col, new_col) in &renames {
        let has_old: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3)",
        )
        .bind(schema)
        .bind(table)
        .bind(old_col)
        .fetch_one(pool)
        .await?;

        if has_old {
            let sql = format!(
                "ALTER TABLE {}.{} RENAME COLUMN {} TO {}",
                schema, table, old_col, new_col
            );
            sqlx::query(&sql).execute(pool).await?;
            println!("✅ Renamed {}.{}.{} → {}", schema, table, old_col, new_col);
        }
    }

    Ok(())
}

/// Create a `content` VIEW in the public schema that maps to `content.media_content`.
/// This allows old SQL dumps that reference `FROM content` to keep working after import.
/// Idempotent: uses CREATE OR REPLACE VIEW.
async fn normalize_legacy_content_view(pool: &Pool<Postgres>) -> Result<()> {
    if !table_exists(pool, "content.media_content").await? {
        return Ok(());
    }

    // Don't overwrite if 'content' exists as a real TABLE (old flat schema)
    let is_table: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content' AND table_type='BASE TABLE')",
    )
    .fetch_one(pool)
    .await?;

    if is_table {
        return Ok(());
    }

    sqlx::query(
        "CREATE OR REPLACE VIEW public.content AS SELECT * FROM content.media_content"
    )
    .execute(pool)
    .await?;
    println!("✅ Created public.content VIEW → content.media_content");

    Ok(())
}

/// Ensure `content_subtitles` data lives in the canonical `content.media_content_subtitles`.
/// If an old `content_subtitles` table exists, migrate data then drop it.
/// Idempotent: safe to re-run.
async fn normalize_subtitle_tables(pool: &Pool<Postgres>) -> Result<()> {
    let has_canonical: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='content' AND table_name='media_content_subtitles')",
    )
    .fetch_one(pool)
    .await?;

    if !has_canonical {
        return Ok(());
    }

    let has_old_table: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='content' AND table_name='content_subtitles' AND table_type='BASE TABLE')",
    )
    .fetch_one(pool)
    .await?;

    if has_old_table {
        sqlx::query(
            r#"
            INSERT INTO content.media_content_subtitles (media_content_id, language, file_path, created_at)
            SELECT content_id, language, file_path, created_at
            FROM content.content_subtitles
            ON CONFLICT (media_content_id, language, file_path) DO NOTHING
            "#,
        )
        .execute(pool)
        .await
        .ok(); // Ignore errors if constraint doesn't exist yet

        sqlx::query("DROP TABLE IF EXISTS content.content_subtitles").execute(pool).await.ok();
        println!("✅ Migrated content_subtitles → content.media_content_subtitles");
    }

    Ok(())
}

/// Migrate master_api_keys from plaintext to hashed storage
async fn migrate_master_api_keys_to_hash(pool: &Pool<Postgres>) -> Result<()> {
    let has_api_key: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='master_api_keys' AND column_name='api_key')"
    )
    .fetch_one(pool)
    .await?;

    if has_api_key {
        // Truncate table since old keys cannot be securely hashed without the plaintext which defeats the purpose
        sqlx::query("TRUNCATE TABLE auth.master_api_keys").execute(pool).await?;
        
        sqlx::query("ALTER TABLE auth.master_api_keys DROP COLUMN api_key").execute(pool).await?;
        sqlx::query("ALTER TABLE auth.master_api_keys ADD COLUMN key_prefix VARCHAR(16) NOT NULL").execute(pool).await?;
        sqlx::query("ALTER TABLE auth.master_api_keys ADD COLUMN key_hash TEXT NOT NULL").execute(pool).await?;
        
        tracing::warn!("⚠️ Migrated auth.master_api_keys to secure hashed storage. All existing legacy API keys were invalidated.");
    }

    Ok(())
}
