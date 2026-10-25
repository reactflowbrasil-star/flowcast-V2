use std::env;

fn main() {
    println!("cargo:rerun-if-env-changed=DATABASE_URL");
    println!("cargo:rerun-if-changed=src/modules/db_structure.rs");

    dotenvy::dotenv().ok();

    let db_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/iptv".to_string());

    // Propagate DATABASE_URL to the compiler so sqlx macros can use it
    println!("cargo:rustc-env=DATABASE_URL={}", db_url);

    // For PostgreSQL, schema initialization happens at runtime, not build time.
    // This avoids requiring a database connection during compilation.
    // SQLite-specific build-time schema validation is no longer needed.

    if db_url.starts_with("sqlite:") {
        println!("cargo:warning=SQLite URLs are no longer supported. Please use PostgreSQL.");
    }

    // PostgreSQL schema is created at runtime by the Database::new() function.
    // No build-time database operations needed.
}
