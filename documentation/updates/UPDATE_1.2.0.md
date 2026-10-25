# StreamCore v1.2.0 Update Notes

**Release Date:** March 2026  
**Type:** Major Security + Features + Subscriptions + Mobile Fixes

This is a **major release** with 90+ changes across security hardening, subscription system, category-based content filtering, ClearKey DRM fixes, admin panel improvements, and full mobile app compatibility.

---

## Highlights

- 🛡️ **9+ security fixes** — bcrypt API keys, IP spoofing patched, Stripe idempotency, 2FA fail-open closed, rate limiting
- 🎬 **End-user subscription system** — self-registration, free/paid packages, direct billing, category-based content access
- 📱 **ClearKey DRM fully fixed** across phone and TV apps — DASH manifest parser rewritten
- ⚡ **77K+ RPS** on content endpoints, 82 automated tests, 0 Clippy warnings
- 🔐 **API response encryption** — optional AES-256-GCM encryption for end-user API responses
- 🗄️ **Automatic v1.1.2 → v1.2.0 migration** — 44 tables, FK-safe ordering, sequence auto-fix

---

## What's New In v1.2.0

### 1) Security Hardening

- Master API Keys — bcrypt hashed, shown once, `sk_live_` prefixed
- `UserRole::System` for API keys — no more blanket admin bypass
- IP spoofing patched — uses TCP `ConnectInfo`, proxy headers trusted only from loopback
- Stripe webhook idempotency — atomic `INSERT ON CONFLICT` prevents double-credits
- Gift code double-spend prevention with `FOR UPDATE` row locks
- SMTP password encryption upgraded to AES-256-GCM
- 2FA fail-open vulnerability patched
- Password reset race condition fixed with atomic token consumption
- IP-based login rate limiting — 10 attempts/min, 50/hr per IP

---

### 2) End-User Subscription System

- **Self-registration** — end-users can register accounts and select packages
- **Package-based subscriptions** — free packages activate instantly, paid packages go through Stripe checkout
- **Direct subscription tracking** — `billing.direct_subscriptions` table tracks user, package, status, Stripe session
- **Category-based content access** — users only see content from their subscribed categories
- **Regular License enforcement** — only free packages allowed under Regular License
- **Dynamic sidebar** — navigation menu built dynamically from user's permitted categories
- **Profile & security page** — shows correct plan name, status, max devices

---

### 3) Content & Category Filtering

- Sidebar (`ModernUserSidebar`) and mobile nav (`MobileBottomNav`) now dynamically built from authenticated user categories
- Removed all hardcoded "show everything" defaults — users only see what they're subscribed to
- List view image fallback across Anime, Movies, and Shows pages
- Backend content endpoints filter by `subscribed_categories` for end-users

---

### 4) ClearKey DRM — Complete Fix

- Consistent `kid_hex:key_hex` format across backend, API, admin panel, and mobile apps
- Phone app: removed Referer header stripping causing 403s
- DASH manifest parser completely rewritten for correct ClearKey injection
- TV app: ClearKey JSON priority normalized
- Episode DRM inheritance from parent series via SQL JOIN

---

### 5) Mobile Apps (Phone & TV)

- ClearKey DRM fully fixed across both platforms
- Device registration persistence — no more re-prompts on launch
- Watch progress contract parity between phone/TV/backend
- Device endpoints hardened for mixed payload shapes
- HEVC 10-bit playback improvements for Android TV
- EPG display fixed on phone app

---

### 6) Database & Migrations

- Automatic v1.1.2 → v1.2.0 migration (44 tables, FK-safe ordering)
- Polymorphic content split: flat → `media_content` + `movies` + `tv_channels` + `streams`
- Schema-qualified all migration DDL
- Sequence auto-fix for all 49 auto-increment sequences
- `media_streams` gains `episode_id` column for per-episode multi-stream

---

### 7) Admin Panel & Frontend

- Per-file upload progress bars with real-time percentage
- Per-episode multi-stream support (quality, language, DRM per episode)
- Episode stream editor UI with set-default, edit, delete
- Stripe payment settings in admin panel (DB-first, env fallback)
- Admin-configurable Stripe keys, currency, and URLs
- URL validation relaxed for local filesystem paths
- Responsive dialogs (90vw mobile → 80vw tablet → 65vw desktop)
- Google Fonts dependency removed — local Outfit font for Docker reliability

---

### 8) Performance & Quality

- 77K+ RPS on content endpoints, 7.5ms average latency
- 82 automated tests (62 unit + 20 integration) — 0 failures
- 64→0 Clippy warnings, removed 6 dangerous `.unwrap()` calls
- Graceful shutdown with connection draining on SIGTERM
- Enhanced `/api/health` with DB connectivity check + uptime

---

## New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_ENCRYPTION_KEY` | *(optional)* | 64 hex chars — AES-256-GCM encryption for end-user API responses |
| `STREAMCORE_SMTP_KEY` | *(optional)* | 64 hex chars — AES-256-GCM for SMTP passwords and Stripe keys |
| `TRUST_ALL_PRIVATE_PROXIES` | `false` | Trust `X-Forwarded-For` from private IPs (Docker setups) |
| `PG_MIN_CONNECTIONS` | `0` | Minimum PostgreSQL pool connections |
| `PG_MAX_CONNECTIONS` | `10` | Maximum PostgreSQL pool connections |
| `MEDIA_STORAGE_PATH` | `/media` | Local file serving path |

---

## Upgrade Instructions (from v1.1.x → v1.2.0)

1. **Backup your database:**
   ```bash
   docker exec streamcore-postgres pg_dump -U streamcore streamcore > backup_pre_1.2.0.sql
   ```

2. **Replace source files:**
   - Replace `backend/` and `frontend/` directories with v1.2.0 files
   - Update `docker-compose.yml` with new environment variables

3. **Rebuild and deploy:**
   ```bash
   docker compose build --no-cache backend frontend
   docker compose up -d
   ```

4. **If using SSL proxy:**
   ```bash
   docker compose --profile proxy up -d
   ```

5. **Rebuild Android apps** to pick up DRM, device registration, and API changes.

6. **Post-upgrade:**
   - Regenerate Master API Keys (old keys are invalidated after upgrade)
   - Enable `public_redeem_enabled` and `public_demo_enabled` in admin settings if needed
   - Configure Stripe settings in Admin Panel → Settings → Payments

---

## Breaking Changes

- **Master API Keys invalidated** — must regenerate after upgrade
- **Public gift code redemption** and **public demo creation** now default to **disabled**
- **Schema search_path reordered** — application schemas now take priority over `public`

---

Full technical changelog: `RELEASE_1.2.0.md`
