use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use iptv_backend::{Config, Database};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Display startup logo
    println!(
        r#"
    ╔════════════════════════════════════════════════════════════════╗
    ║                                                                ║
    ║    _____ _                           _____                     ║
    ║   / ____| |                         / ____|                    ║
    ║  | (___ | |_ _ __ ___  __ _ _ __ __| |     ___  _ __ ___       ║
    ║   \___ \| __| '__/ _ \/ _` | '_ ` _ \ |    / _ \| '__/ _ \     ║
    ║   ____) | |_| | |  __/ (_| | | | | | |___| (_) | | |  __/     ║
    ║  |_____/ \__|_|  \___|\__,_|_| |_| |______\___/|_|  \___|     ║
    ║                                                                ║
    ║           ██╗██████╗ ████████╗██╗   ██╗                        ║
    ║           ██║██╔══██╗╚══██╔══╝██║   ██║                        ║
    ║           ██║██████╔╝   ██║   ██║   ██║                        ║
    ║           ██║██╔═══╝    ██║   ╚██╗ ██╔╝                        ║
    ║           ██║██║        ██║    ╚████╔╝                         ║
    ║           ╚═╝╚═╝        ╚═╝     ╚═══╝                          ║
    ║                                                                ║
    ║   ┌────────────────────────────────────────────────────────┐   ║
    ║   │  🎬  PREMIUM IPTV SERVICES  📺                         │   ║
    ║   │  ──────────────────────────────────────────────────    │   ║
    ║   │  Backend v1.2.0  ·  Rust + Axum + PostgreSQL          │   ║
    ║   │  High-Performance Streaming Infrastructure             │   ║
    ║   └────────────────────────────────────────────────────────┘   ║
    ║                                                                ║
    ╚════════════════════════════════════════════════════════════════╝
"#
    );

    println!("🚀 Initializing STREAMCORE PREMIUM IPTV SERVICES Backend...");
    println!("📡 Preparing high-quality IPTV services");
    println!("🔐 Configuring authentication and security");
    println!();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "iptv_backend=info,tower_http=warn".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = Config::from_env()?;

    // Initialize database
    let database = Database::new(&config.database_url).await?;

    // Start automatic PostgreSQL backups (pg_dump), if enabled via env vars.
    iptv_backend::services::backup::spawn_postgres_backup_task(database.pool.clone());

    // Run migrations (safe to run multiple times)
    if let Err(e) = iptv_backend::db_structure::migrate_deduplicate_subtitles(&database.pool).await
    {
        tracing::warn!(
            "⚠️  Subtitle deduplication migration failed (may be already applied): {}",
            e
        );
    }
    if let Err(e) = iptv_backend::db_structure::migrate_create_media_watcher(&database.pool).await {
        tracing::warn!(
            "⚠️  Media watcher migration failed (may be already applied): {}",
            e
        );
    }

    // Build application router
    let app = iptv_backend::create_app(database, config.clone()).await?;

    // Start server with custom configuration for long operations
    let listener = tokio::net::TcpListener::bind(&config.server_address).await?;

    println!("✅ Database connected successfully");
    println!("🌐 Server started at: {}", config.server_address);
    println!("📊 Status: READY TO ACCEPT CONNECTIONS");
    println!("🔥 STREAMCORE PREMIUM IPTV SERVICES - Backend operational!");
    println!("⏱️  Config: Extended timeouts enabled for long operations (scan folders)");
    println!();

    tracing::info!(
        server_address = %config.server_address,
        "🚀 STREAMCORE Backend started - ready to process login and IPTV content requests"
    );

    // Configure server with extended timeouts for long operations like folder scanning
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .tcp_nodelay(true)
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    println!("👋 Server stopped gracefully");
    Ok(())
}

/// Wait for a SIGTERM or SIGINT (Ctrl+C) signal for graceful shutdown.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            println!("\n🛑 Received Ctrl+C — shutting down gracefully...");
        },
        _ = terminate => {
            println!("\n🛑 Received SIGTERM — shutting down gracefully...");
        },
    }
}
