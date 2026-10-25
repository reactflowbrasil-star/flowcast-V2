# StreamCore IPTV/VOD Platform

A comprehensive IPTV/VOD streaming platform with support for live TV channels, movies, series, and more. Built with Next.js, Rust/Axum, and Kotlin.

## ⚠️ Legal & Content Disclaimer

StreamCore is a self‑hosted streaming management platform. It does **not** ship with any IPTV playlists, streams, channels, EPG sources, or copyrighted media.  
You are solely responsible for ensuring that any content you add or distribute through StreamCore is properly licensed or owned by you.  
Do not use this software with infringing or unauthorized sources. The author does not condone piracy.

## 📋 Project Structure

```
streamcore_full/
├── frontend/              # Next.js 15 web application
│   ├── src/
│   │   ├── app/          # App router and pages
│   │   ├── components/   # React components
│   │   ├── services/     # API services and business logic
│   │   ├── contexts/     # React contexts (Auth, Theme, etc)
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utilities and helpers
│   │   ├── types/        # TypeScript type definitions
│   │   └── utils/        # Utility functions
│   ├── public/           # Static assets
│   └── package.json      # Node.js dependencies
├── backend/              # Rust/Axum API server
│   ├── src/
│   │   ├── handlers/     # API endpoint handlers
│   │   ├── models/       # Data models
│   │   ├── services/     # Business logic
│   │   ├── db/           # Database layer
│   │   └── utils/        # Helper functions
│   └── Cargo.toml        # Rust dependencies
├── Apps/
│   ├── tv_app/           # Kotlin Android TV application
│   │   ├── app/src/      # Android TV source code
│   │   └── build.gradle  # TV build configuration
│   └── phone_app/        # Kotlin Android Phone application
│       ├── app/src/      # Android Phone source code
│       └── build.gradle  # Phone build configuration
```

## 🚀 Quick Start

### Prerequisites
- **Node.js:** 20+ (LTS recommended)
- **Rust:** 1.70+
- **Kotlin:** 2.0+ (for Android app)
- **PostgreSQL:** 14+ (local, Neon, or Supabase)

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables (see below)
cp .env.example .env.local

# Development (runs on port 5000)
npm run dev

# Build for production
npm run build
npm run start

# Linting & testing
npm run lint
npm run test
```

### Backend Setup

```bash
cd backend

# Build
cargo build

# Run development server
cargo run

# Run with environment variables
RUST_LOG=debug cargo run

# Tests
cargo test
```

### Android App Setup

```bash
cd Apps/tv_app

# Configure backend URL and branding (local file; not committed)
cp local.properties.template local.properties
# Edit local.properties:
# branding.name=Your App Name
# backend.url=http://10.0.2.2:3000  (for emulator)

# Build
./gradlew build

# Run on emulator/device
./gradlew installDebug
```

Android Phone app:
```bash
cd Apps/phone_app
cp local.properties.template local.properties
./gradlew build
./gradlew installDebug
```

## 🔧 Environment Configuration

### Frontend (`frontend/.env.local`)

```bash
# Backend API URL
# Development: http://localhost:3000
# Production: https://your-backend-domain.com
NEXT_PUBLIC_API_URL=http://localhost:3000

# Optional (server-only): internal backend URL for Next.js rewrites (Docker/private network)
INTERNAL_API_URL=http://localhost:3000

# Next.js server proxy security (SSRF protection)
# Comma-separated upstream host allowlist for /api/proxy/* (no scheme). Use "*" only for local dev.
STREAMCORE_PROXY_ALLOWED_HOSTS=
STREAMCORE_PROXY_REQUIRE_AUTH=true
STREAMCORE_PROXY_ALLOW_PRIVATE=false
```

### Backend (`backend/.env`)

```bash
# Database (PostgreSQL)
# Local: postgres://postgres:password@localhost:5432/iptv
# Neon:  postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/iptv?sslmode=require
# Supabase: postgres://postgres:password@db.xxx.supabase.co:5432/postgres
DATABASE_URL=postgres://postgres:password@localhost:5432/iptv

# Server address and port
# Backend: port 3000, Frontend: port 5000
SERVER_ADDRESS=0.0.0.0:3000

# Public URL for generating stream URLs
PUBLIC_BASE_URL=http://localhost:3000

# CORS (comma-separated list of allowed frontend origins; use "*" only for local dev)
CORS_ALLOWED_ORIGINS=http://localhost:5000

# JWT Secret (generate with: openssl rand -hex 32)
JWT_SECRET=your_secure_random_string_minimum_32_chars

# Logging
RUST_LOG=iptv_backend=debug,tower_http=debug,sqlx=warn
DEBUG_MODE=true

# Backups
BACKUP_ENABLED=true
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=30
BACKUP_INTERVAL_HOURS=24

# Stripe Payments (optional)
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
STRIPE_SUCCESS_URL=http://localhost:5000/credits/success
STRIPE_CANCEL_URL=http://localhost:5000/credits/cancel
STRIPE_CURRENCY=usd
```

### Android App (create `Apps/tv_app/local.properties`)

```properties
# Copy from local.properties.template first (local-only file)
# App branding name
branding.name=Your App Name

# Backend URL (without /api suffix)
# For emulator: http://10.0.2.2:3000
# For production: https://api.yourdomain.com
backend.url=http://10.0.2.2:3000
```

### Login Backdrops (Web UI)

- Default images live in `frontend/public/backdrops/` and are referenced by `frontend/src/constants/backdrops.ts`.
- To change them from the Admin UI: Admin → System Configuration → Login Backdrops. This saves `ui_login_series_backdrops` / `ui_login_movies_backdrops` in the database and the login page reads them from `GET /api/public/config/ui`.
- Values are a comma/newline-separated list of URLs or `/backdrops/*` paths. Leave empty to fall back to defaults.

## 🔐 Production Security

### Important Security Notes

1. **Set Admin Password**: On first run the backend creates `admin`. Set `ADMIN_DEFAULT_PASSWORD` in `backend/.env` before starting, or use the temporary password printed to the backend console and change it after first login.

2. **JWT Secret**: Generate a secure random string for `JWT_SECRET`:
   ```bash
   openssl rand -hex 32
   ```

3. **CORS Configuration**: Set `CORS_ALLOWED_ORIGINS` in `backend/.env` to your frontend origin(s) (comma-separated) and avoid `*` in production.

4. **HTTPS**: Always use HTTPS in production. Configure SSL/TLS via reverse proxy (nginx, Caddy) or load balancer.

5. **Database**: This build uses PostgreSQL. Ensure the database is reachable and credentials are correct.

## 📦 Dependencies Management

### Frontend

Core packages are pinned to patched versions to keep the frontend predictable. Install dependencies with `npm ci` to respect `package-lock.json` and run `npm audit` if you want to verify security warnings.

### Backend

Rust dependencies are locked via `Cargo.lock`. Build with `cargo build --release` and optionally run `cargo audit` to check for security issues.

## 🔒 Security & Code Quality

### Type Safety

- **TypeScript:** Strict mode enabled
- **@ts-ignore:** All 8 instances removed, proper typing used instead
- **`any` types:** Gradually being replaced (183 instances identified for refactoring)

### Linting

```bash
cd frontend
npm run lint    # ESLint check
npm run test    # Run unit tests
```

## 🗄️ Database

### Schema Management

**The system creates the database automatically.** No manual migrations required.

When starting the backend:
1. Creates all tables automatically (`db_structure.rs`)
3. Creates the default admin user (username: `admin`, password from `ADMIN_DEFAULT_PASSWORD` or a temporary password printed to the backend console on first run)
4. Creates default categories

**Control variables:**
```bash
# In backend/.env
SKIP_MIGRATIONS=false  # true to skip schema creation (debugging)
```

**Reset database (local Postgres):**
```bash
# Drop and recreate the schema
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

### Backup & Recovery

Automatic backups (PostgreSQL) are created by the backend using `pg_dump` and stored in `BACKUP_DIR` as `iptv_export_YYYYMMDD_HHMMSS.sql` (see the env vars below). Manual backups are also possible:

```bash
# Backup (PostgreSQL)
pg_dump "$DATABASE_URL" -f backup/iptv_$(date +%Y%m%d).sql

# Restore (append)
psql "$DATABASE_URL" -f backup/iptv_backup.sql

# The system also supports configurable automatic backups:
# BACKUP_ENABLED=true
# BACKUP_DIR=./backups
# BACKUP_RETENTION_DAYS=30
# BACKUP_INTERVAL_HOURS=24
```

## 🧪 Testing

### Frontend

```bash
cd frontend

# Run tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Backend

```bash
cd backend

# Run all tests
cargo test

# Run specific test
cargo test test_name

# With logging
RUST_LOG=debug cargo test -- --nocapture
```

## 📊 Performance & Monitoring

### Frontend Performance

- Next.js Image Optimization enabled
- Code splitting with dynamic imports
- CSS-in-JS with emotion (optimized)
- Suspense boundaries for loading states

### Backend Performance

- Connection pooling (20 connections default)
- Streaming response support
- Gzip compression enabled
- PostgreSQL by default

Monitor with:
```bash
# Backend health check
curl http://localhost:3000/api/health
```

## 🐛 Troubleshooting

### Common Issues

**1. npm install fails**
```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

**2. Database connection error**
- Check `DATABASE_URL` in `backend/.env`
- Ensure Postgres is running and credentials are correct
- For docker-compose: check the `postgres` service health

**3. Cargo build issues**
```bash
cargo clean
cargo build  # Will recompile everything
```

**4. Android build fails**
```bash
cd Apps/tv_app
./gradlew clean
./gradlew build
```

## 📚 Documentation

- **Changelog:** `../updates/CHANGELOG.md`
- **Update Notes:** `../updates/UPDATE_1.0.1.md`, `../updates/UPDATE_1.1.0.md`, `../updates/UPDATE_1.1.2.md`
- **Upgrade Guide:** `../guides/HOW_TO_UPDATE.md`
- **Updates (HTML):** `../updates/updates_overview.html`
- **Install/Update (HTML):** `../guides/how_to_install_update.html`
- **License:** `../../LICENSE`

## 🐳 Docker (Optional)

This package includes `backend/Dockerfile`, `frontend/Dockerfile`, and `docker-compose.yml` for a simple local deployment:
```bash
docker compose up --build
```

### Production Hardening Profile

Use `docker-compose.prod.yml` as a secure override on top of the base compose file.

```bash
# 1) Prepare production env vars
cp .env.production.example .env.production

# 2) Review and set secure values
nano .env.production

# 3) Validate merged compose syntax (base + prod)
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml config

# 4) Start hardened production stack (with built-in nginx proxy profile)
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml --profile proxy up -d --build
```

Notes:
- This does not change default dev behavior (`docker-compose.yml` alone still works as before).
- In hardened mode, `backend`, `frontend`, and `postgres` are not exposed as public host ports.
- Set restrictive values for `CORS_ALLOWED_ORIGINS` and `STREAMCORE_PROXY_ALLOWED_HOSTS` (never use `*` in production).

## 📄 License

This project is licensed under the Envato Market licenses (Regular/Extended) - see the [LICENSE](../../LICENSE) file for details.

## 📞 Support

For support and questions:
1. Check the documentation in this README
2. Review `../updates/CHANGELOG.md` and `../updates/UPDATE_1.1.2.md` for the current release notes
3. Contact support through your purchase platform

---

## 🎬 Media & Codec Support (Android)

With the consolidation on **Media3 (ExoPlayer) + FFmpeg Extension**, the platform supports a wide range of formats with hardware priority and software fallback:

| Category | Supported Formats |
| :--- | :--- |
| **Streaming** | HLS, DASH, RTSP, RTMP (Native), RTMPS, HTTP/HTTPS, MMS |
| **Video** | H.264 (AVC), H.265 (HEVC), VP8, VP9, AV1, MPEG-2, MPEG-4, VC-1 |
| **Audio** | AAC, AC3 (Dolby), E-AC3 (Dolby+), DTS, DTS-HD, TrueHD, FLAC, MP3 |
| **Containers** | MP4, MKV, TS, AVI, FLV, WMV, MOV, WEBM, MPG |

---

**Last Updated:** 2026-02-09  
**Version:** 1.1.2  
**Status:** Production Ready (Media3 Unified)
