# Changelog

All notable changes to this project are documented here.

## [1.2.0] - 2026-03

### Added
- End-user self-registration with automatic activation and package selection
- Package-based subscription system — free packages activate instantly, paid via Stripe
- Direct subscription tracking via `billing.direct_subscriptions`
- Category-based content access — users only see subscribed categories in sidebar and content pages
- Regular License enforcement — only free packages allowed
- API response encryption (AES-256-GCM) for end-user clients (`API_ENCRYPTION_KEY`)
- Per-episode multi-stream support with DRM per episode
- Stripe payment settings configurable from Admin UI (DB-first, env fallback)
- IP-based login rate limiting (10 attempts/min, 50/hr per IP)
- 82 automated tests (62 unit + 20 integration)
- Watch progress API for granular episode position tracking

### Changed
- Master API Keys now bcrypt-hashed, shown once, `sk_live_` prefixed
- Sidebar and mobile nav dynamically built from user's subscribed categories
- Google Fonts dependency removed — local Outfit font bundled for Docker reliability
- Schema search_path reordered — app schemas now take priority over `public`

### Fixed
- ClearKey DRM fully fixed across phone and TV apps (k/kid swap, DASH parser rewrite)
- Subscription flow: max_devices, categories, free redirect all work correctly
- List view image fallback in Anime, Movies, and Shows pages
- Episode DRM inheritance from parent series
- 2FA fail-open vulnerability patched
- Stripe webhook double-credit prevention
- 64→0 Clippy warnings, 6 dangerous `.unwrap()` calls removed

### Security
- IP spoofing patched — uses TCP ConnectInfo
- Gift code double-spend prevention with FOR UPDATE row locks
- Password reset race condition fixed with atomic token consumption
- SMTP password encryption upgraded to AES-256-GCM

### Notes
- Full release detail: `UPDATE_1.2.0.md` and `RELEASE_1.2.0.md`

## [1.1.3] - 2026-02

### Added
- Bulk import improvements for Movies and Series from M3U/M3U8 playlists.
- Better parser compatibility for playlist variants:
  - blank lines between `#EXTINF` and stream URL
  - unquoted attributes (e.g. `tvg-name=...`)
  - URL-only playlist fallback when `#EXTINF` is missing

### Changed
- Release notes and deployment references are now documented with generic/default placeholders only.

### Fixed
- Manual content/series ingest now accepts more real-world M3U/M3U8 provider formats without dropping valid entries.

### Notes
- Full release detail: `UPDATE_1.1.3.md`

## [1.1.2] - 2026-02

### Added
- Android Phone app project (`Apps/phone_app`) integrated into the main package.
- Password reset flow (`forgot`, `verify token`, `reset`) with SMTP-backed email delivery.
- 2FA management for admin/reseller accounts (setup, verify, disable, backup codes).
- Reseller API keys + permissions and Master API key management.
- Public UI config endpoint for login backdrops.
- TV provider sync + media watcher automation for ingest workflows.

### Changed
- Versioning aligned to `1.1.2` across backend/frontend/android runtime values.
- URL/stream validation hardened for proxy and Live TV headers (proxy/DoH/license URL rules).
- Stream/subtitle proxy protections improved (host rules, scheme checks, private/local restrictions).
- UI/UX improvements across admin, reseller, and end-user panels.
- Android TV and Android Phone update flows improved.

### Fixed
- Multiple bug fixes across backend handlers, frontend panels, and Android clients.
- Removed stale hardcoded app version reporting in Android TV device registration flow.

### Notes
- Full release detail: `UPDATE_1.1.2.md`

## [1.1.0] - 2026-01

- Security hardening (anti-injection / server-side validation).
- Android TV EPG and update dialog fixes.
- App version upload reliability improvements.
- Nginx upload limit support.
- TMDB cast endpoint and mobile compatibility improvements.

Full details: `UPDATE_1.1.0.md`

## [1.0.1] - 2026-01

- Database migration from SQLite to PostgreSQL.
- Backup/export improvements.
- Performance and i18n updates.
- Security fixes and platform stabilization.

Full details: `UPDATE_1.0.1.md`
