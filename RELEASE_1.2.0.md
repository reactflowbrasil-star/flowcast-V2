# StreamCore v1.2.0 — Release Notes

**Release Date:** March 2026

---

## 🛡️ Security Hardening

### Master API Keys — Complete Overhaul
- API keys are now **cryptographically hashed** (bcrypt) on creation. The plaintext key is shown **only once** — it is never stored in the database.
- Keys are prefixed with `sk_live_` for easy identification and display a truncated `key_prefix` in the admin panel.
- Old plaintext keys are automatically wiped on upgrade.

### Authentication & Authorization
- Introduced **`UserRole::System`** for Master API Keys — a dedicated virtual role with strict scoping that replaces the previous blanket admin bypass.
- Master API Keys are now **restricted to `/api/admin` routes only**, preventing them from hitting end-user endpoints.
- All admin authorization checks across the entire backend (100+ locations) now consistently support both `Admin` and `System` roles.
- **2FA fail-open vulnerability patched** — a database outage can no longer silently bypass 2FA verification. The system now refuses login if the 2FA status cannot be confirmed.
- **Token refresh fail-closed** — if device blacklist cannot be verified during token refresh, the refresh is denied instead of silently allowed.
- **Password reset race condition fixed** — token consumption is now atomic (`UPDATE ... RETURNING`), preventing parallel requests from using the same reset token.

### IP Security
- `X-Forwarded-For` / `X-Real-IP` header spoofing permanently patched.
- Client IP extraction now uses Axum's physical TCP `ConnectInfo` as the source of truth.
- Proxy headers are only trusted from loopback/unspecified peers by default. Explicit opt-in via `TRUST_ALL_PRIVATE_PROXIES=true` environment variable for Docker setups.

### Webhook & Payment Security
- **Stripe webhook double-credit prevention** — replaced the non-atomic check-then-act pattern with a single atomic `INSERT ON CONFLICT DO UPDATE WHERE status != 'completed'`, guaranteeing credit is applied exactly once per checkout session regardless of webhook retries.
- **Gift code double-spend prevention** — redemption queries now use `SELECT ... FOR UPDATE` row locks within transactions, preventing parallel requests from over-consuming `uses_remaining`.
- **Stripe subscription status hardening** — unknown/unexpected Stripe states now default to `inactive` instead of `active`, preventing free access grants from edge-case webhook events (`paused`, unrecognized statuses). Added explicit mappings for `trialing`, `incomplete`, `incomplete_expired`, and `paused`.

### Public Endpoint Protection
- Public gift code redemption (`public_redeem_enabled`) and demo creation (`public_demo_enabled`) now default to **disabled** if the database config is unreachable, preventing unauthorized access during outages.
- Email verification tokens now use cryptographically secure 64-character random strings instead of predictable timestamp-based XOR masks.

---

## 🔧 Bug Fixes

### Database & Migrations
- **Schema search_path reordered** — application schemas (`auth`, `content`, `billing`, `activity`, `core`) now take priority over `public`, preventing accidental resolution to wrong-schema objects.
- **Schema-qualified all migration DDL** — `DROP TABLE`, `USING` clauses, and legacy table detection in subtitle migrations now explicitly specify their target schema, eliminating cross-schema hazards.
- **Security table index mismatch fixed** — `security_incidents` and `security_bans` index creation now correctly checks the `auth` schema instead of `activity`.
- **Subtitle migration hardened** — `content_subtitles` migration now detects only the `content` schema copy and uses `IF NOT EXISTS` on table creation.
- **`table_exists()` strictness** — the function now requires fully qualified `schema.table` names and returns an error for bare table names, preventing silent legacy-table matches.
- **Reseller API key usage** — usage logging now writes to the correct `activity.reseller_api_key_usage` table instead of `auth`.
- **Legacy content split automation** — legacy flat `content` rows now auto-populate `media_content`, `movies`, `tv_channels`, and `media_streams`, preserving stream URLs, DRM, and EPG fields.
- **Postgres import compatibility** — SQL imports now strip `\restrict`, extension metadata, and `OWNER TO` directives to avoid role/pg_dump version failures in both append and replace modes.
- **Favorites & viewing history alignment** — fixed column drift (`content_id`) with safe deduplication and unique index enforcement.

### Content Editing
- **Series/Anime edit dialog routing fixed** — Series and Anime content now correctly opens the `EditSeriesDialog` (with seasons/episodes management) instead of falling through to the generic `EditContentDialog`. Root cause was a case-mismatch between database values (`Series`, `Anime`) and frontend lowercase comparisons.
- **Events edit dialog routing fixed** — added `'eventos'` alias to correctly route Events content to `EditEventDialog` (database stores `Eventos` while code expected `events`).
- **Episode management dialog i18n fixes** — fixed broken `t('admin.content.actions.preview')` translation key (wrong namespace) replaced with `t('episodes.preview')`, and replaced hardcoded Spanish string `'Probando...'` with proper i18n key `t('episodes.testingEpisodes')`.

### API & Middleware
- **Public API middleware no longer kills successful responses** — if usage logging fails transiently, the original API response is preserved and the error is traced instead of propagated.
- **Bulk user update SQL fixed** — removed duplicate field builder that was generating invalid `SET` clauses with repeated columns.
- **Rate limit fail-open patched** — `.unwrap_or(0)` calls in rate limiting replaced with strict error propagation, preventing rate limits from being silently bypassed during database issues.

### ClearKey DRM
- Ensured consistent `kid_hex:key_hex` format across backend storage, API responses, admin panel display, and mobile app consumption.
- Both phone and TV apps now correctly build ClearKey JSON from hex pairs.
- **ClearKey k/kid swap fix (v1.1.2 regression)** — diagnosed that the deployed backend (v1.1.2) was generating `drm_keys_exo` JSON with `k` and `kid` base64url values swapped. Root cause: admin panel label previously said `key_hex:kid_hex` but backend code expected `kid_hex:key_hex`. The v1.2.0 backend generates the JSON correctly; both apps now trust the backend's `drm_keys_exo` JSON as priority.

### Phone App DRM & Playback
- **Referer header restored** — removed code in `ExoPlayerManager.kt` that actively stripped the `Referer` header from stream requests, causing 403 Forbidden errors on CDNs (e.g., Sensa) that require it.
- **DASH manifest parser rewrite** — `InjectClearKeyDashManifestParser.kt` completely rewritten to correctly force ClearKey DRM on DASH streams. Now strips existing Widevine/PlayReady `ContentProtection` elements and injects ClearKey `ContentProtection` with the correct PSSH box derived from the KID.
- **ClearKey payload priority** — `ExoPlayerManager.createDrmSessionManager()` prefers `drmKeysExo` (backend JSON) for efficiency, falling back to `drmKeysHex` if unavailable.

### TV App DRM
- **ClearKey JSON priority normalized** — `DrmHelper.getClearKeyJson()` reordered to standard priority: backend JSON first → parsed kid/key fields → hex format fallback. Matches the corrected backend v1.2.0 flow.

### Device Registration
- **Persistent device registration** — phone app no longer prompts for device registration on every launch. Registration status is now cached locally via DataStore Preferences (`DEVICE_REGISTERED_KEY` in `TokenManager`). The `SplashViewModel` checks the local flag first, falling back to the API only if no local flag exists — API failures are treated leniently to avoid blocking users.

### Episode DRM Streaming
- **Episode DRM inheritance** — episodes now inherit DRM keys, type, license server URL, and headers from their parent Series/Anime content via SQL JOIN against `content.media_streams`.
- **Subtitle URL priority** — legacy single-URL `subtitle_url` field now prefers English tracks before falling back to the first available, preventing random language selection.
- **Legacy SQL references fixed** — 3 episode streaming queries updated from `JOIN content` to `JOIN content.media_content`.

---

## ✨ Enhancements

### Upload System
- **Per-file upload progress bars** — real-time percentage display using XHR progress events, replacing the previous indeterminate spinner.

### Live TV
- **EPG display fixed on phone app** — phone app now calls the correct bulk EPG endpoint (`/api/tv/epg`) with proper query parameters, matching the TV app's implementation.
- **Live TV overlay redesigned** — modern left-aligned transparent sidebar with spatial navigation, showing EPG info below each channel name while keeping the video visible in the background.

### TV App
- **HEVC 10-bit playback improvements** — client-side decoder configuration adjustments for better compatibility with Xiaomi MiTV devices.
- **Overlay menu navigation** — new overlay-based channel navigation with number-key channel selection and spatial focus management.

### Billing
- **Billing entry generation** — immediate billing record creation on premium package assignment with proper unique constraint handling and type alignment.
- **Billing type UI** — Android TV app billing type selector now shows only the package's configured billing type.

### Content Management
- **Series creation overhaul** — backend now accepts full season/episode data in a single request, including episode numbers, titles, and video URLs. Anime content manually created via the UI is now correctly categorized under the Anime category instead of defaulting to Series.
- **Per-episode multi-stream support** — episodes now support multiple streams with independent quality, language, audio tracks, format, and DRM settings (ClearKey/Widevine/PlayReady), matching the full feature set available for VOD/movie content. New `episode_id` column on `media_streams` table with dedicated CRUD API at `/api/admin/episodes/:id/streams`.
- **Episode stream editor UI** — each episode in the Episodes Management Dialog now has a full-featured inline stream manager with ⭐ set-default, ✏️ edit, and 🗑️ delete actions, plus an Add/Edit form with Quality, Language, Audio, Format, DRM Type, and DRM Keys (multi-line Textarea) fields.
- **Frontend form improvements** — URL validation relaxed to accept local filesystem paths (`/media/...`), creation dialogs are now responsive across mobile/tablet/desktop, TMDB year auto-fill no longer crashes on missing release dates, and episode upload logic is hardened with failure tracking.
- **Watch progress API** — new `GET /api/user/progress/:content_id/:episode_id` endpoint for granular episode watch position queries.

### Email Security
- **SMTP password encryption** — upgraded from reversible Base64 to AES-256-GCM encryption with `aes256:` prefix, using the `STREAMCORE_SMTP_KEY` environment variable. Legacy Base64 passwords continue to work for backward compatibility.

---

## ⚙️ Configuration

### New Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `TRUST_ALL_PRIVATE_PROXIES` | `false` | Trust `X-Forwarded-For` from all private IPs (for Docker/reverse proxy setups) |
| `PG_MIN_CONNECTIONS` | `0` | Minimum PostgreSQL pool connections |
| `PG_MAX_CONNECTIONS` | `10` | Maximum PostgreSQL pool connections |
| `PG_ACQUIRE_TIMEOUT_SECS` | `30` | Connection acquire timeout |

### New Config Keys (via Admin Panel → Settings)
| Key | Default | Description |
|-----|---------|-------------|
| `public_redeem_enabled` | `false` | Enable/disable public gift code redemption |
| `public_demo_enabled` | `false` | Enable/disable public demo user creation |
| `demo_duration_hours` | `12` | Duration of demo accounts in hours |
| `demo_creation_threshold` | `3` | Max demo creations per IP per 24h before auto-ban |
| `demo_ban_duration_days` | `15` | Auto-ban duration for exceeding demo threshold |

> [!IMPORTANT]
> After upgrading, you must explicitly enable `public_redeem_enabled` and `public_demo_enabled` in your admin panel settings if you use these features. They now default to **disabled** for security.

---

## 🗄️ Database Migration Notes

All migrations run automatically on startup. Notable changes:
- Master API keys table is truncated and restructured (old keys are invalidated — you must regenerate them after upgrade).
- `search_path` now prioritizes application schemas over `public`.
- Subtitle table migration is fully idempotent and schema-qualified.
- `media_streams` table gains an `episode_id` column (FK to `content.episodes`) and `media_content_id` becomes nullable, enabling per-episode multi-stream support.

**v1.1.2 Backup Compatibility**
The system includes a fully automatic migration engine that handles v1.1.2 SQL backups in **both** upgrade scenarios:

1. **Upgrading an existing server**: When you update the backend binary and restart, the system detects your legacy tables in the `public` schema and moves them to their correct v1.2.0 schemas automatically.
2. **Clean install + SQL import**: After a fresh deployment, if a client imports a v1.1.2 `.sql` backup via the Settings panel, the migration runs automatically after the import completes.

The migration handles:
- **44 tables** moved from `public` to their correct schemas (`auth`, `content`, `billing`, `activity`, `core`)
- **Table renames**: `content` → `media_content`, `content_subtitles` → `media_content_subtitles` (with column rename `content_id` → `media_content_id`)
- **FK-safe ordering**: Child tables are processed before parents to prevent CASCADE data loss
- **Sequence auto-fix**: All 49 auto-increment sequences are reset to avoid duplicate key errors
- **Append mode**: If the target schema already has data, records are merged via `INSERT ... ON CONFLICT DO NOTHING`
- **Idempotent**: Safe to re-run if the server restarts mid-migration
- **Polymorphic split**: Legacy flat content is automatically split into `media_content`, `movies`, `tv_channels`, and `media_streams` without dropping legacy data.
- **Import hardening**: SQL imports strip `\restrict` and extension/owner metadata for cross-version compatibility.

> [!WARNING]
> If you had existing Master API Keys, they will be **invalidated** after this upgrade. Please regenerate them from the Admin Panel → API Keys section.

---

## 📋 Technical Debt Addressed
- **64→0 Clippy warnings** — all compiler warnings resolved, including eliminating 7 `#[allow(clippy::...)]` suppressions.
- **Removed 6 dangerous `.unwrap()` calls** that could lead to panics in production.
- **Closed 4 fail-open security patterns** to ensure proper fail-closed behavior on database errors.
- Removed unused imports and dead code across 15+ modules.
- Standardized error handling patterns (fail-closed by default) and parameter structures.
- Unified role-based access control across all handlers and services.

---

## 📝 Detailed Changelog (by Development Phase)

### Phase 1 — Secure Master API Keys
- Replaced plaintext `api_key` column with `key_hash` (bcrypt) + `key_prefix` in `db_structure.rs`.
- Auto-migration `migrate_master_api_keys_to_hash` truncates old data and adds new columns on startup.
- `MasterApiKeyService` now generates 64-char prefixed keys (`sk_live_...`).
- Frontend can only view the key once at creation time.

### Phase 2 — Remove Global Auth Bypass
- `master_api_key_middleware` no longer skips `auth_middleware` entirely.
- New `UserRole::System` role introduced for Master API Key virtual claims.
- Master API Keys restricted to `/api/admin` routes only — rejected from all end-user endpoints.

### Phase 3 — Secure IP Extraction
- `extract_client_ip` rewritten to use Axum `ConnectInfo<SocketAddr>` as ground truth.
- `X-Forwarded-For` / `X-Real-IP` spoofing patched — proxy headers only trusted from loopback peers.
- Added `TRUST_ALL_PRIVATE_PROXIES=true` env var for Docker/reverse proxy setups.

### Phase 4 — Deep Review Catch-ups
- **Schema Drifts (C-04):** Qualified 10+ unqualified tables across `db_structure.rs` and `gift_codes.rs`.
- **Crypto Tokens (C-05):** Replaced predictable XOR-based email verification token with cryptographically secure 64-char random string via `rand` crate.

### Phase 5 — Edge Cases & Secondary Review
- **Reseller API Limit Fail-Open:** Replaced `.unwrap_or(0)` with strict `?` error propagation in `check_rate_limit`.
- **Reseller API Schema Drift:** Fixed `reseller_api_key_usage` inserts to use `activity` schema instead of `auth`.
- **System Authorization Parity:** Updated handler conditionals in `crud.rs`, `ticket/mod.rs`, `services/user/mod.rs` to include `UserRole::System`.
- **`table_exists` Strictness:** Now requires schema-qualified names (`auth.users`), errors on bare names.
- **Clippy `never_loop`:** Fixed `while let Some` → `if let Some` in upload helpers.

### Phase 6 — Runtime Crash & Quality Control
- **`ensure_table!` Macro Fix:** Injected schema namespaces into all macro invocations to prevent startup crashes.
- **Schema Target Corrections:** `activity.security_incidents` → `auth.security_incidents`, same for `security_bans` and `event_schedules`.
- **Index Targeting Fix:** `idx_raku_apikey` now targets `activity.reseller_api_key_usage` instead of `auth`.
- **Global Role Sweep:** 100+ locations across `src/handlers` converted from `!= UserRole::Admin` to `matches!(role, Admin | System)`.
- **Full Clippy Silence:** Pruned dead code in `series.rs`, `validation.rs`, `build.rs` — zero warnings achieved.

### Phase 7 — Race Conditions & Advanced Edge Cases
- **Stripe Webhook Idempotency:** Replaced `SELECT EXISTS ... FOR UPDATE` with atomic `INSERT ON CONFLICT DO UPDATE WHERE status != 'completed' RETURNING id`.
- **Gift Code Double-Spend:** Added `FOR UPDATE` row locks in both `redeem_and_create_user` and `redeem_and_extend_user` transactions.
- **API Middleware Failure Isolation:** Usage logging failure in public API middleware no longer overrides successful responses with 500 errors.
- **2FA Fail-Open Closed:** Replaced `unwrap_or(false)` with `map_err` + `?` on TOTP status query — login is now denied if 2FA check fails.
- **Final Role Parity Sweep:** Scoured `src/services` for un-macroized `!= UserRole::Admin` checks using fully qualified module paths.

### Phase 8 — Comprehensive Audit (`todo_fix.md`)
Full audit pass addressing 13 high-priority items from bug tracker:

**Database (6 items):**
- **DB-001:** Reordered `search_path` from `public, auth, ...` → `auth, content, billing, activity, core, public`.
- **DB-002:** Qualified `DROP TABLE IF EXISTS reseller_logs` → `billing.reseller_logs`.
- **DB-003:** Schema-qualified all subtitle migration references (`content_subtitles` → `content.content_subtitles`).
- **DB-004:** Qualified `USING user_subscriptions b` → `billing.user_subscriptions b` in deduplication query.
- **DB-005:** Fixed `table_exists` check: `activity.security_incidents` → `auth.security_incidents`.
- **DB-006:** Fixed `table_exists` check: `activity.security_bans` → `auth.security_bans`.

**Security (4 items):**
- **SEC-001:** Atomicized password reset token consumption — single `UPDATE ... SET used=true WHERE token=$1 AND used=false RETURNING user_id` prevents parallel use of same token.
- **SEC-004:** Fixed refresh token fail-open — device blacklist check now propagates errors (`map_err` + `?`) instead of `unwrap_or(false)`.
- **SEC-010:** Public gift code redemption defaults to **disabled** (`false`) if config DB is unreachable.
- **SEC-011:** Public demo creation defaults to **disabled** (`false`) if config DB is unreachable.

**Authorization (2 items):**
- **AUTH-002:** `verify_admin_permissions` SQL now matches `role IN ('admin', 'system')` instead of only `'admin'`.
- **AUTH-004:** Activity log handler `match` now includes `UserRole::System` alongside `UserRole::Admin` for full log access.

**Business Logic (1 item):**
- **BIZ-004:** Removed duplicate field builder in `bulk_update_users` that was generating invalid SQL with repeated `active/max_devices/credits` SET clauses.

### Phase 9 — Deep System Audit & Streaming Fixes
Full-system audit identifying 6 new issues and fixing critical streaming, financial, and security bugs.

**Stripe Webhook Hardening:**
- **Status Mapping Fix:** Default `_ => "active"` changed to `_ => "inactive"` in `handle_subscription_updated`, preventing unknown Stripe states (e.g. `paused`) from granting free access.
- Added explicit mappings for `trialing`, `incomplete`, `incomplete_expired`, and `paused` states.

**Episode DRM Inheritance (Critical Fix):**
- `EpisodeDeliveryResponse` struct expanded with `drm_keys`, `drm_type`, `license_server_url`, and `drm_headers` fields (with `skip_serializing_if` for clean JSON).
- `get_episode_for_delivery_with_tracking` now queries parent Series' `content.media_streams` via SQL JOIN and populates DRM fields in the response, enabling ExoPlayer to decrypt DRM-protected episodes.
- `From<EpisodeWithDecryptedUrl>` implementation updated to initialize DRM fields as `None`.
- Admin episode edit endpoint (`get_episode_for_admin_edit`) also updated with DRM field placeholders.

**Subtitle URL Priority:**
- Changed `subtitle_records.first()` to prefer English subtitles (`language.starts_with("en")`), falling back to first available — fixing random subtitle language selection for legacy single-URL clients.

**Legacy Table Reference Fixes:**
- Replaced `JOIN content c ON ser.content_id = c.id` → `JOIN content.media_content c ON ser.content_id = c.id` in 3 episode SQL queries (`get_episode_for_delivery_with_tracking`, `get_episode_for_download`, viewing history tracker).

**Series Creation Overhaul:**
- `CreateSeriesManualRequest` expanded: `total_seasons` now `Option<i32>`, added `seasons: Option<Vec<SeasonInput>>`, `active`, `poster_url`, `backdrop_url`, `category_type` fields.
- New `SeasonInput` and `EpisodeInput` structs for typed episode data from frontend.
- Handler maps `SeasonInput` → `ServiceSeasonInput` for backend service consumption.
- `category_type` passthrough enables creating Anime content under the correct category instead of always defaulting to Series.
- Episode update no longer drops `duration`, `tmdb_id`, and `air_date` fields.

**Frontend Form Fixes:**
- **URL Validation Relaxed:** `ManualMovieForm`, `ManualSeriesForm`, and `SpecializedContentForm` now accept local paths (`/media/...`) and `[Pending Upload]` placeholders instead of requiring strict `https://` URLs.
- **Dialog Responsiveness:** All creation/edit dialogs changed from fixed `65vw` to responsive breakpoints (`90vw` mobile → `80vw` tablet → `65vw` desktop).
- **Year Parsing NaN Fix:** TMDB auto-fill no longer crashes on missing `release_date` — uses safe `isNaN` guard before setting year.
- **Anime Manual Creation:** `SpecializedContentForm` now routes anime with chapters through `createSeries` with `category_type: 'Anime'` instead of flat `createAnimeContent`.
- **Upload Robustness:** `ManualSeriesForm` upload logic hardened with failure counter, null guards on `seasonData?.episodes?.[episodeIdx]`, and filter on undefined subtitle files.

**Backend Infrastructure:**
- `main.rs` updated to use `into_make_service_with_connect_info::<SocketAddr>()` for proper IP extraction.
- New route: `GET /api/user/progress/:content_id/:episode_id` for granular watch progress queries.
- SMTP password decryption upgraded: supports `aes256:` prefixed AES-256-GCM encrypted passwords alongside legacy Base64, using `STREAMCORE_SMTP_KEY` env var for the 32-byte key.

### Phase 10 — Mobile App DRM & Registration Fixes
Full diagnosis and fix of ClearKey decryption failures and device registration UX issues across both Android apps.

**ClearKey k/kid Swap (Root Cause Analysis):**
- Traced `ERROR_DRM_NO_LICENSE` decryption error to the deployed backend (v1.1.2) generating `drm_keys_exo` JSON with `k` (key) and `kid` (key ID) base64url values swapped.
- Verified via API request to production: `drm_keys` hex was correct (`kid:key`), but `drm_keys_exo` JSON had `k=base64url(KID)` and `kid=base64url(KEY)` — inverted.
- Confirmed v1.2.0 backend `drm.rs` generates the JSON correctly. Both apps normalized to trust backend JSON as priority.

**Phone App (`ExoPlayerManager.kt`):**
- Removed active `Referer` header stripping that caused 403 Forbidden on DRM-protected CDNs.
- `createDrmSessionManager()` now prefers `drmKeysExo` (backend JSON) over `drmKeysHex` for the standard v1.2.0 flow.
- Added logging to indicate ClearKey payload source (`exo_json` vs `hex`).

**Phone App (`InjectClearKeyDashManifestParser.kt`):**
- Complete rewrite: strips existing Widevine/PlayReady `ContentProtection` elements from DASH manifests and injects ClearKey `ContentProtection` with a correctly formatted PSSH box.
- Generates ClearKey-standard PSSH from KID UUID, ensuring ExoPlayer initializes the ClearKey CDM.

**TV App (`DrmHelper.kt`):**
- `getClearKeyJson()` priority reordered to standard flow: backend JSON → parsed kid/key fields → hex format.
- Removed Windows-style line endings (`\r\n` → `\n`).

**Phone App (Device Registration Persistence):**
- `TokenManager.kt`: Added `DEVICE_REGISTERED_KEY` boolean, `saveDeviceRegistered()`, `isDeviceRegistered()` using DataStore Preferences.
- `AuthRepository.kt` / `AuthRepositoryImpl.kt`: Added `isDeviceRegisteredLocally()` and `saveDeviceRegisteredLocally()` methods.
- `AuthRepositoryImpl.registerDevice()`: Now calls `tokenManager.saveDeviceRegistered(true)` on success.
- `SplashViewModel.isCurrentDeviceRegistered()`: Checks local flag first; falls back to API on miss; API failures treated as "registered" to avoid blocking users.

---

## 📁 Files Modified (Summary)

| Area | Files |
|------|-------|
| **Database** | `database.rs`, `db_structure.rs` |
| **Auth/Security** | `handlers/auth.rs`, `handlers/password_reset.rs`, `handlers/public_api/auth.rs`, `middleware.rs`, `models/user.rs` |
| **Payments** | `handlers/payments.rs`, `handlers/end_user_subscription.rs` |
| **Gift Codes** | `handlers/gift_codes.rs`, `services/gift_codes.rs` |
| **Demos** | `handlers/demo.rs`, `services/user/demos.rs` |
| **User Management** | `services/user/mod.rs`, `handlers/device.rs`, `handlers/scanner.rs`, `handlers/smtp_config.rs` |
| **Content** | `handlers/content/crud.rs`, `handlers/content/admin.rs`, `handlers/content/categories.rs`, `handlers/content/streaming.rs`, `handlers/content/tv_admin.rs`, `handlers/content/tv_channels.rs`, `handlers/content/delivery.rs`, `handlers/content/bulk_import.rs`, `handlers/content/tmdb_admin.rs`, `handlers/content/movies.rs` |
| **Series/Episodes** | `handlers/series.rs`, `services/content/series.rs` |
| **Admin** | `handlers/admin/imports/stats.rs`, `handlers/admin/imports/users.rs`, `handlers/activity_log.rs`, `handlers/notifications.rs` |
| **Admin (Import)** | `handlers/admin/imports/db_import.rs` |
| **Tickets** | `handlers/ticket/mod.rs` |
| **API Keys** | `handlers/master_api_key.rs`, `services/reseller_api_keys.rs` |
| **Uploads** | `handlers/upload/helpers.rs` |
| **Email** | `services/email.rs` |
| **Frontend** | `ManualMovieForm.tsx`, `ManualSeriesForm.tsx`, `SpecializedContentForm.tsx`, `CreateContentDialog.tsx`, `EditContentDialog.tsx`, `proxyUtils.ts`, `device.ts`, `validation.ts`, `en.json`, `content.ts` (types) |
| **Frontend (Pages)** | `reseller/page.tsx`, `register/page.tsx`, `login/page.tsx`, `user/search/page.tsx`, `user/history/page.tsx`, `user/content/page.tsx`, `user/products/page.tsx`, `credits/cancel/page.tsx`, `credits/success/page.tsx` |
| **Server** | `main.rs`, `lib.rs` |
| **Phone App** | `ExoPlayerManager.kt`, `InjectClearKeyDashManifestParser.kt`, `TokenManager.kt`, `AuthRepository.kt`, `AuthRepositoryImpl.kt`, `SplashViewModel.kt` |
| **TV App** | `DrmHelper.kt` |
| **Other** | `handlers/app_versions.rs`, `services/subscription.rs`, `validation.rs`, `build.rs` |
| **Deployment** | `docker-compose.yml`, `install.sh`, `.env.example` [NEW] |

---

## ⚙️ New Environment Variables (Phase 9)

| Variable | Default | Description |
|----------|---------|-------------|
| `STREAMCORE_SMTP_KEY` | *(required for AES)* | 64 hex chars (32 bytes) for AES-256-GCM SMTP password encryption |

---

### Phase 11 — Code Quality & Security Audit
- **Eliminated all `#[allow(clippy::...)]` suppressions**:
  - Replaced complex nested tuples with named structs with `sqlx::FromRow` (`DrmInfo` in `series.rs`, `SmtpConfigRow` in `email.rs`).
  - Refactored functions with too many arguments to use parameter structs (`ApiKeyUsageRecord`, `ContentViewingEvent`, `SimpleViewingEvent`, `DeviceSecurityInput`, `ScanFolderIngestResult`).
- **Removed dangerous `.unwrap()` calls**:
  - `favorites.rs`: Extracted nested struct fields before loops to avoid repetitive and unsafe `.unwrap()` mutations.
- **Fail-Open Security Fixes**:
  - `middleware.rs`: Device blacklist checks now properly propagate database errors instead of defaulting to `false` (allowed).
  - `public_api/users.rs`: `EXISTS` database checks now return proper 500 errors on database failure rather than misleading 404s.
- **API Caller Updates**:
  - Updated 9 call sites across `auth.rs`, `delivery.rs`, `vor.rs`, `series.rs`, `scan.rs`, and `device_security.rs` to support the new struct-based, type-safe APIs.

### Phase 12 — Frontend P0 & P1 Fixes
Comprehensive fix pass across the admin panel and user-facing frontend, resolving 11 issues across 13 files.

**P0 — Critical (4 fixes):**
- **Proxy Auth Endpoint:** Frontend proxy token validator was calling non-existent `/api/auth/me` — fixed to use `/api/protected`.
- **Reseller Deep Links:** Backend notification URLs use `?tab=` parameter but frontend was reading `?view=` — harmonized to `?tab=` with `?view=` fallback for backwards compatibility.
- **Registration Token Storage:** Post-registration auto-login stored the token as `auth_token` but the auth flow reads `iptv_auth_token` — key mismatch prevented auto-login after registration.
- **Device API Contract Mismatches:**
  - `getAllDevices`: backend returns non-paginated `{devices}` but frontend expected `{devices, total, page, limit, total_pages}` — added response wrapping.
  - `getUserDevicesById`: backend returns `{user_id, devices, device_count}` but frontend expected raw `Device[]` — added response unwrapping.
  - Removed dead `updateDeviceActivity` method that called non-existent `PUT /api/devices/:id/activity` route.

**P1 — Important (7 fixes):**
- **Validation i18n Keys:** All 20+ references to `errors.invalidData` in `validation.ts` corrected to `common.invalidData` (the actual key path in `en.json`).
- **Session Expired Key:** Login page referenced `auth.sessionExpired` instead of `auth.session.sessionExpired`.
- **Search Sort-by-Rating Bug:** "Sort by Rating" was a copy-paste of the year sort logic — now correctly sorts by `rating` field. Added `rating?: number` to `DeliveryContent` type.
- **Duplicate Sidebar Renders:** `user/layout.tsx` already renders `ModernUserSidebar`, but 3 child pages (`history`, `content`, `products`) were rendering it again — removed duplicates.
- **Broken Support Link:** Credits cancel page linked to non-existent `/support` route — changed to `/reseller?tab=tickets`.
- **Episode Upload Toast Keys:** Added missing `createContent.uploadingEpisodesSuccess` and `createContent.uploadingEpisodesError` to `en.json`.
- **Deep Link Consistency:** Remaining `?view=credits` links in `credits/cancel` and `credits/success` pages updated to `?tab=credits`.

### Phase 13 — Deployment Config Audit
Audit and update of `docker-compose.yml`, `install.sh`, and deployment documentation to ensure consistency with all v1.2.0 changes.

**docker-compose.yml:**
- **`TRUST_ALL_PRIVATE_PROXIES: "true"`** — critical for Docker deployments: without this, the backend ignores `X-Forwarded-For` from the nginx-proxy container and logs Docker bridge IPs instead of real client IPs.
- Added `PG_MIN_CONNECTIONS`, `PG_MAX_CONNECTIONS`, `PG_ACQUIRE_TIMEOUT_SECS` (commented, with defaults).
- Added `STREAMCORE_SMTP_KEY` (commented, with generation instructions).
- Added `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` (commented, for direct subscriptions).
- Added `VIDEO_UPLOAD_MAX_BYTES` and `ADMIN_IMPORT_MAX_BYTES` (commented, with defaults).
- Added `MEDIA_STORAGE_PATH: "/media"` for local file serving.

**install.sh:**
- Added SMTP encryption key generation prompt — auto-generates 64-hex-char key via `openssl rand -hex 32`.
- `apply_config()` now uncomments and sets `STREAMCORE_SMTP_KEY` in docker-compose if user opted in.

**New file: `.env.example`:**
- Comprehensive reference documenting all 26 backend environment variables with descriptions, defaults, and generation commands.

### Phase 14 — Admin UI Config Settings (DB-Backed)
Moved Stripe payment config and server settings from env-var-only to the admin UI, stored in the `core.config` database table.

**Pattern:** DB-first with env var fallback — the backend reads config from the database first, falling back to environment variables if not set. This means:
- Existing env var deployments keep working with zero changes
- Admin UI settings override env vars without a restart
- Sensitive values (Stripe keys) are encrypted at rest with AES-256-GCM

**Backend changes:**
- `validation.rs`: Added 8 new config keys: `stripe_secret_key`, `stripe_webhook_secret`, `stripe_subscription_webhook_secret`, `stripe_currency`, `stripe_success_url`, `stripe_cancel_url`, `public_base_url`, `content_overview_multiplier`. Added `is_sensitive_config_key()` helper.
- `config.rs`: Added `get_dynamic_config_value()` (DB → env fallback), `encrypt_config_value()`, `mask_sensitive_value()`, AES-256-GCM encrypt/decrypt helpers.
- `users.rs` (update_config handler): Now encrypts sensitive keys before storing to DB.
- `users.rs`: Added `GET /api/admin/payment-config` endpoint returning masked payment settings.
- `payments.rs`: `create_checkout_session` and `stripe_webhook` now use `get_dynamic_config_value()` for all Stripe reads.
- `end_user_subscription.rs`: `create_checkout` and `subscription_webhook` use dynamic config.
- `billing.rs`: `get_billing_overview` and `create_offline_payment` use dynamic currency.

**Frontend changes:**
- `PaymentSettings.tsx` [NEW]: Admin settings component with:
  - Stripe API Keys section (masked, per-field save, encrypted at rest)
  - Payment Settings (currency, success/cancel URLs)
  - Server Configuration (public base URL, content multiplier)
  - Warning banner when no Stripe key is configured
- `SettingsPage.tsx`: Added "Payments" tab with `CreditCard` icon, lazy-loading `PaymentSettings`.

**Internationalization:**
- All 8 locale files updated (en, es, fr, pt, ru, sk, tr, zh) with 27 new translation keys for the Payments tab and form labels.
- `PaymentSettings.tsx` uses `useTranslation` for all labels, placeholders, descriptions, and messages.

**Deployment config updates:**
- `docker-compose.yml`: Stripe env vars annotated as fallback-only; `STREAMCORE_SMTP_KEY` docs now mention Stripe encryption.
- `.env.example` and `backend/.env.example`: Stripe section updated with Admin UI fallback notes; added `STREAMCORE_SMTP_KEY` and `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` entries.
- `install.sh`: Stripe prompts now default to empty with Admin UI hint, no longer use test placeholders.

### Phase 15 — Android API Contract Alignment (Phone + TV)
Final API compatibility pass across both Android clients against backend v1.2.0 routes and payloads.

- **Removed non-existent episode details route usage:**
  - Backend does not expose `GET /api/episodes/:id`.
  - Removed this endpoint from both Android Retrofit interfaces.
  - Android TV repository now resolves episode details via supported `GET /api/episodes/:id/stream` fallback mapping.

- **Watch progress contract parity:**
  - Phone app uses backend canonical watch-progress payload (`contentId`, `contentType`, `episodeId`, `positionSeconds`, `durationSeconds`) and snake_case progress response fields.
  - TV app progress normalization hardened to accept both `0..1` and `0..100` values and properly map `progress_percent` fallback when duration is unavailable.

- **Device endpoints hardening (`/api/user/device-status`, `/api/user/devices`, `/api/devices`):**
  - TV DTOs now accept both nested and flat device status shapes.
  - TV backend device DTOs now support alternate field names and nullable-safe parsing for mixed payloads.
  - Device limit flow now falls back to profile `max_devices` when `/api/devices` does not provide a valid value.

- **History/continue-watching deserialization robustness:**
  - TV watch history now tolerates nullable `content_id` values from backend history records.
  - Continue watching timestamps are now nullable-safe when syncing local cache.

- **Backend/Android behavior sync for unsupported auth endpoints:**
  - TV auth repository keeps explicit unsupported handling for missing backend routes (`/api/auth/device/activate`, `/api/auth/user-agent`) instead of issuing failing network calls.

### Phase 16 — Performance Benchmarks & Quality Assurance

Production-grade load testing, automated test suite, and system hardening verification.

#### Load Test Results — 500 Concurrent Workers, Unlimited RPS

Tool: `hey` - Docker (localhost) - 15s per endpoint - 0 errors across all tests.

##### Throughput (Requests/Second)

| Endpoint | RPS |
|----------|-----|
| `GET /content/categories` | 77,732 |
| `GET /content/movies` | 75,923 |
| `GET /api/health` | 31,227 |
| `GET /admin/users` (JWT) | 6,472 |
| `GET /payment-config` (JWT) | 3,637 |

##### Latency Breakdown

| Endpoint | Avg | P99 | Slowest | Status |
|----------|-----|-----|---------|--------|
| `GET /api/health` | 16ms | 25ms | 49ms | 200 |
| `GET /content/movies` | 7.5ms | 21ms | 63ms | 200 |
| `GET /content/categories` | 7.5ms | 20ms | 64ms | 200 |
| `GET /admin/users` (JWT) | 77ms | 106ms | 146ms | 200 |
| `GET /payment-config` (JWT) | 137ms | 169ms | 178ms | 200 |

##### KPI Snapshot

| Metric | Value |
|--------|-------|
| Peak RPS | 77K+ |
| Avg Latency (content endpoints) | 7.5ms |
| Errors (all tests) | 0 |
| Concurrent Workers | 500 |

> Note: JWT = authenticated endpoints. Benchmarks were run with `hey` against a Docker Compose stack on development hardware. Production throughput may vary by server specs and database load.

#### Automated Test Suite

| Category | Tests | Coverage |
|----------|-------|----------|
| **Unit tests** (config, validation, pricing, DRM) | 62 | AES encryption, Stripe key validation, pricing calculations |
| **Integration tests** (real PostgreSQL) | 20 | Auth flow, admin CRUD, authorization guards, error handling |
| **API smoke test** | 1 script | curl-based production endpoint verification |
| **Load test** | 1 script | `hey`-based throughput and latency benchmarks |
| **Total** | **82 tests + 2 scripts** | |

```bash
# Run all tests
cargo test                        # 82 passed, 0 failed

# Run specific suites
cargo test --lib                  # 62 unit tests
cargo test --test integration     # 20 integration tests
./tests/smoke_test.sh             # API smoke test
./tests/load_test.sh              # Load test benchmarks
```

#### System Hardening Additions

- **IP-based login rate limiting** — In-memory sliding window: 10 attempts/min, 50/hr per IP. Returns `429 Too Many Requests` with `Retry-After` header. Background cleanup task every 10 minutes.
- **Enhanced health check** (`GET /api/health`) — Verifies database connectivity with `SELECT 1`, reports server version and uptime. Returns `503 Service Unavailable` if database is unreachable.
- **Graceful shutdown** — Handles `SIGTERM` and `SIGINT` (Ctrl+C) signals. Drains active connections before exiting, preventing data corruption during deployments.
