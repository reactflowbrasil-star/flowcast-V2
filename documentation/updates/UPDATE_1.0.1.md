# StreamCore v1.0.1 Update Notes

**Release Date:** January 2026

This update brings significant improvements including a database migration from SQLite to PostgreSQL, performance optimizations, full internationalization support, and critical bug fixes.

---

## ⚠️ BEFORE UPGRADING: Backup Your SQLite Database

If you are upgrading from v1.0.0 (SQLite), you **must** backup your `iptv.db` file before proceeding.

### How to Find iptv.db

**Quick Command:**
```bash
# Search in all Docker volumes
sudo find /var/lib/docker/volumes -name "iptv.db" 2>/dev/null
```

**Other Methods:**
```bash
# Inspect the backend-data volume
docker volume inspect $(docker volume ls -q | grep backend-data)

# Copy the database from container to your current folder
docker cp streamcore-backend:/data/iptv.db ./iptv.db

# If running without Docker, the file is at:
# backend/iptv.db
```

**Location Inside Container:**
The database is always at `/data/iptv.db` inside the `streamcore-backend` container.

### Create Backup
```bash
# Create a timestamped backup
cp iptv.db backup/iptv_$(date +%Y%m%d_%H%M%S).db

# Or from Docker container
docker cp streamcore-backend:/data/iptv.db ./iptv_backup_$(date +%Y%m%d).db
```

---

## Preserve Media Paths for Compatibility

Your scanned media files (movies, series, local content) must be accessible at the **same path** in the new Docker setup. The database stores absolute paths to your files.

### Check Your Current Media Mount

In your **old** docker-compose.yml, find the media volume:
```yaml
volumes:
  - /media:/media           # Example: host /media -> container /media
  - /mnt/movies:/mnt/movies # Example: host /mnt/movies -> container /mnt/movies
```

### Keep the Same Paths in New Setup

Your **new** docker-compose.yml must use the **exact same paths**:
```yaml
backend:
  volumes:
    - backend-data:/data
    - /media:/media           # ← Must match your old configuration!
    - /mnt/movies:/mnt/movies # ← Add all paths you had before
```

### Why This Matters

| Old Path | New Path | Content Works? |
|----------|----------|----------------|
| `/media:/media` | `/media:/media` | ✅ Yes |
| `/media:/media` | `/storage:/media` | ❌ No - paths don't match |
| `/mnt/data:/mnt/data` | `/mnt/data:/mnt/data` | ✅ Yes |

**If paths don't match:** Your imported content (movies, series, local channels) will show "file not found" errors because the database references the old paths.

---

## Database Migration: SQLite -> PostgreSQL

### What Changed
- **Complete migration from SQLite to PostgreSQL 16**
- Support for cloud PostgreSQL providers (Neon, Supabase)
- Connection pooling with configurable limits
- Automatic migrations on startup
- `pg_dump` based backup system

### New Environment Variables
```env
DATABASE_URL=postgres://user:password@host:5432/database
ALLOW_PG_POOLER=false
PG_MAX_CONNECTIONS=10
PG_MIN_CONNECTIONS=0
PG_ACQUIRE_TIMEOUT_SECS=30
PG_IDLE_TIMEOUT_SECS=300
```

### Docker Improvements
- PostgreSQL 16 container included
- Healthcheck ensures backend waits for database
- Centralized configuration in `docker-compose.yml`
- No `.env` file needed - edit docker-compose.yml directly
- Backend Dockerfile now installs `postgresql-client-16` from official PostgreSQL apt repo (fixes pg_dump version mismatch)
- Database export feature now works correctly with PostgreSQL 16

---

## 🚀 Performance Improvements

### N+1 Query Fixes
- Fixed N+1 queries in content listing endpoints
- Batch loading for related entities
- Reduced database round trips by up to 90%

### Legacy Import Optimization
- Improved M3U/M3U8 import performance
- Batch processing for large playlists
- Progress tracking for background imports

---

## 🌍 Complete Internationalization (8 Languages)

### Languages Fully Translated
- **English (EN)** - Complete (Default)
- **Spanish (ES)** - Complete
- **French (FR)** - Complete
- **Portuguese (PT)** - Complete
- **Russian (RU)** - Complete
- **Turkish (TR)** - Complete
- **Slovak (SK)** - Complete
- **Chinese (ZH)** - Complete

### Coverage
| Component | Languages |
|-----------|-----------|
| Frontend Web Panel | EN, ES, FR, PT, RU, TR, SK, ZH |
| Android TV App | EN (default), ES, FR, PT, RU, TR, SK, ZH |
| Android Phone App | EN, ES, FR, PT, RU, TR, SK, ZH |
| Email Templates | EN, ES |

### Changes
- Android TV App: Default language changed from Spanish to English
- Added `values-es/` directory for Spanish translations

---

## 🔐 Security Fixes

### Auth Token Leakage Fix (Critical)
**Problem:** JWT authorization tokens were being sent to external streaming URLs (Google Cloud Storage, YouTube, third-party CDNs), potentially exposing user credentials.

**Solution:** 
- Added `requiresAuth` flag to content delivery API
- Backend now identifies internal vs external URLs
- Apps only inject Authorization header for internal StreamCore URLs
- External streams (GCS, Akamai, YouTube) no longer receive JWT tokens

**Files Changed:**
- Backend: `ContentDeliveryResponse` now includes `requires_auth`, `is_internal_stream`
- TV App: `ExoPlayerManager.createDataSourceFactory()` checks `requiresAuth`
- Phone App: Already had domain-based protection

### Custom Headers Fix
Channel-specific headers (`user_agent`, `referer`, `origin`, `custom_headers`) are now properly passed through to stream requests without interference from auth headers.

---

## 🐛 Bug Fixes

### Backend
- Fixed channel ordering not persisting after bulk operations
- Fixed EPG import timeout on large XMLTV files
- Fixed duplicate subtitle entries in database
- Fixed media watcher not detecting new files
- Fixed CORS issues with preflight requests

### Frontend
- Fixed theme not persisting after page refresh
- Fixed search results not updating on category change
- Fixed player controls disappearing too quickly
- Fixed infinite loading on empty content categories
- Fixed admin UI overflow in inputs/selects (e.g., long EPG channel IDs, API key previews, reset-password values)

### Android TV App
- Fixed D-pad navigation getting stuck on certain cards
- Fixed channel preview not stopping when exiting
- Fixed audio track selection not persisting
- Fixed EPG timezone display issues
- Fixed custom headers not being applied to streams

### Android Phone App
- Fixed video orientation lock issues
- Fixed PiP mode not working on some devices
- Fixed notification controls not responding

---

## 📱 Android App Improvements

### TV App
- Improved focus handling for hero carousel
- Added loading states for all screens
- Better error messages with retry options
- Optimized image caching

### Phone App
- Improved gesture controls
- Better tablet layout support
- Reduced APK size by 15%

---

## 🛠️ Docker Improvements

### Simplified Configuration
Before (v1.0.0):
```bash
cp .env.example .env
nano .env  # Edit 20+ variables
docker-compose up -d --build
```

After (v1.0.1):
```bash
# Edit docker-compose.yml directly (top section)
docker compose up -d --build
```

### New Docker Structure
```yaml
services:
  postgres:    # PostgreSQL 16 with healthcheck
  backend:     # Rust API server
  frontend:    # Next.js web app
  # nginx-proxy (optional, for production SSL)
```

---

## 📝 Documentation Updates

- Updated all SQLite references to PostgreSQL
- New Docker deployment section
- Added cloud PostgreSQL setup guides (Neon, Supabase)
- Updated backup/restore procedures for pg_dump

---

## ⬆️ Upgrade Instructions

### From v1.0.0 (SQLite) to v1.0.1 (PostgreSQL)

1. **Backup your SQLite database:**
   ```bash
   cp backend/iptv.db backup/iptv_backup.db
   ```

2. **Install PostgreSQL or use cloud provider**

3. **Update environment variables:**
   ```env
   DATABASE_URL=postgres://user:pass@localhost:5432/streamcore
   ```

4. **Run data migration (optional):**
   Contact support for SQLite → PostgreSQL migration script

5. **Start the new version:**
   ```bash
   docker compose up -d --build
   ```

### Breaking Changes
- `DATABASE_URL` format changed from `sqlite:./iptv.db` to PostgreSQL URL
- Backup configuration now uses `pg_dump` instead of `VACUUM INTO`

---

## 📦 Files Changed Summary

| Category | Files Modified |
|----------|----------------|
| Backend | 15+ Rust files |
| Frontend | 8 translation files |
| TV App | 12 Kotlin files |
| Phone App | 8 Kotlin files |
| Docker | docker-compose.yml, Dockerfile |
| Documentation | index.html, codecanyon-description.html |

---

**Full Changelog:** See commit history for detailed changes.

**Support:** Use CodeCanyon item support for assistance.
