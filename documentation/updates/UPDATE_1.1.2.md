# StreamCore v1.1.2 Update Notes

**Release Date:** February 2026  
**Type:** Stability + Security + Multi-Platform Expansion

This release consolidates the work done after `v1.1.0` and brings StreamCore to `v1.1.2` with major fixes, URL/streaming hardening, UI improvements, Android TV refinements, and the launch/integration of the Android Phone app.

---

## Highlights

- Fixed multiple platform bugs and version inconsistencies.
- Strengthened URL handling and validation rules for streaming/proxy flows.
- Improved admin and end-user UI across web panels.
- Enhanced Android TV update/UX behavior.
- Added full Android Phone app project and backend compatibility.
- Expanded security, automation, and operational tooling.

---

## What’s New In v1.1.2 (Compared to v1.1.0)

### 1) Versioning System Alignment

The runtime/platform version values are now aligned to `1.1.2`:

- System config API version output updated.
- Frontend app constant updated.
- Android TV + Android Phone app build version bumped.
- TV device registration now reports app version from `BuildConfig.VERSION_NAME` (no more hardcoded dev string).

---

### 2) Database + URL Regulation Improvements

Focused hardening around URL inputs and streaming behavior:

- Added stricter URL format rules in Live TV forms for:
  - stream URL
  - proxy URL (`http://user:pass@ip:port`)
  - DoH URL (`http(s)://...`)
  - license server URL
- Added backend-side validation for provider URLs (`http/https` only).
- Improved normalization/absolutization of metadata and stream URLs for clients.
- Added/maintained schema support for advanced Live TV URL fields (`proxy_url`, `doh_url`, `license_server_url`).

---

### 3) Streaming Proxy Security Hardening

Web streaming/subtitle proxy flows were reinforced to reduce SSRF and misuse risk:

- Upstream URL validation now rejects:
  - invalid URLs
  - non-HTTP(S) schemes
  - embedded credentials in URLs
  - localhost/private ranges (unless explicitly allowed)
- Host allowlist support via environment configuration.
- Optional auth requirement for proxy endpoints.
- Safer subtitle proxy behavior for relative/internal paths.

---

### 4) Backend Feature Expansion

New and improved backend capabilities included in this release cycle:

- Password reset flow (forgot/verify/reset token).
- SMTP settings management + SMTP test endpoint.
- 2FA management (setup/verify/disable/backup codes) for admin/reseller roles.
- Gift code validation/redeem flow for public use.
- Reseller API Keys management (CRUD + permissions + regenerate).
- Master API Key management (admin).
- Public API v1 endpoints with API-key authentication.
- TV Provider management + auto-sync refresh cycle.
- Media Watcher folders with periodic background scan and ingest.
- Expanded security operations (incidents, bans, blacklist handling).

---

### 5) Frontend/UI Improvements

The web UI received broad quality improvements:

- App Versions management improved for both **TV** and **Phone** tracks.
- System Configuration now supports login backdrop management from admin panel.
- Security panel/tables expanded for incidents, bans, and blacklisted devices.
- Tickets/chat, reseller, and admin operational flows improved.
- Wider i18n coverage and namespace loading fixes across admin/user/reseller sections.

---

### 6) Android TV Improvements

Additional Android TV refinements beyond previous fixes:

- Better update dialog behavior for mandatory/recommended updates.
- Improved D-pad focus and primary action focus targeting.
- Better download state UX in update flow.
- Continued player and screen stability improvements across navigation/content flows.

---

### 7) Android Phone App Launch

`v1.1.2` includes the Android Phone app as a first-class project:

- Dedicated app module under `Apps/phone_app`.
- Full screen/navigation structure for phone UX (home, live TV, movies/shows, search, favorites, profile, settings, etc.).
- Update manager flow with download status and file hash verification support.
- Backend integration for app version checks (`app_type=phone`), device, and content APIs.

---

## Representative Files Updated

- `backend/src/handlers/admin/imports.rs`
- `backend/src/modules/db_structure.rs`
- `backend/src/handlers/app_versions.rs`
- `backend/src/handlers/password_reset.rs`
- `backend/src/handlers/smtp_config.rs`
- `backend/src/handlers/two_factor.rs`
- `backend/src/handlers/gift_codes.rs`
- `backend/src/handlers/reseller_api_keys.rs`
- `backend/src/handlers/master_api_key.rs`
- `backend/src/services/media_watcher.rs`
- `backend/src/services/content/tv_providers.rs`
- `frontend/src/app/api/proxy/proxyUtils.ts`
- `frontend/src/app/api/proxy/stream/route.ts`
- `frontend/src/app/api/proxy/subtitle/route.ts`
- `frontend/src/components/content/LiveTVContentForm.tsx`
- `frontend/src/components/admin/EditTVChannelDialog.tsx`
- `frontend/src/components/admin/systemConfiguration/LoginBackdropsCard.tsx`
- `frontend/src/constants/app.ts`
- `Apps/tv_app/app/build.gradle`
- `Apps/tv_app/app/src/main/java/com/tv/liferoute/app/data/repository/AuthRepositoryImpl.kt`
- `Apps/phone_app/app/build.gradle`
- `Apps/phone_app/app/src/main/java/com/streamcore/phone/presentation/update/UpdateManager.kt`

---

## Upgrade Notes (from v1.1.0 -> v1.1.2)

1. Replace `backend/` and `frontend/` with `v1.1.2`.
2. Add/update Android projects under `Apps/tv_app` and `Apps/phone_app`.
3. Rebuild services:
   ```bash
   docker compose build backend frontend
   docker compose up -d
   ```
4. If using proxy profile:
   ```bash
   docker compose --profile proxy up -d nginx-proxy
   ```
5. Rebuild Android apps to pick up version and update-flow changes.

---

## Breaking Changes

None expected for standard deployments.  
This update is backward-compatible and migration-safe under the existing PostgreSQL schema bootstrap flow.

