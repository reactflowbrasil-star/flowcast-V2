# StreamCore v1.1.0 Update Notes

**Release Date:** January 2026

This update brings critical security improvements, API anti-injection protection, EPG fixes for Android TV, and various bug fixes across the platform.

---

## 🔐 Critical Security: Anti-Injection Protection

### SQL Injection Prevention
All user inputs are now properly sanitized and validated before database operations:

- **Search queries**: Special SQL characters escaped (`%`, `_`, `'`, `"`, etc.)
- **Filter parameters**: Server-side validation for all filter inputs
- **Activity logging**: Safe parameter binding in log queries

**Files Changed:**
- `backend/src/services/activity_log.rs` - Safe SQL parameter handling
- `backend/src/handlers/admin/content.rs` - Input sanitization for search/filters

### Input Validation Improvements
- Added server-side validation for all API endpoints
- Removed reliance on client-side validation only
- Proper escaping of special characters in search queries

---

## 📺 Android TV App Improvements

### EPG Grid Display Fix
**Problem:** EPG programs were not showing in the channel selector grid.

**Root Cause:** EPG sources returned programs for future dates, but the grid only displayed a 6-hour window from current time.

**Solution:** Extended EPG grid time window from 6 hours to 24 hours to capture scheduled programs.

**Files Changed:**
- `tv_app/presentation/screens/livetv/ChannelSelectorV2Screen.kt`
  - Added `slotHours = 24` parameter to grid component

### EPG Debug Logging
Added comprehensive logging to diagnose EPG issues:
- System time vs program times comparison
- Program filtering details
- Backend response validation

---

## 🌐 Frontend Improvements

### API URL Configuration Fix
**Problem:** App versions upload was connecting to wrong URL (`streamcore.syruum.com:3000` instead of API URL).

**Solution:** 
- Simplified `getDirectBackendUrl()` to use centralized `API_CONFIG.BASE_URL`
- Removed redundant fallback logic that caused URL mismatches
- Consistent URL handling across all services

**Files Changed:**
- `frontend/src/services/appVersion.ts` - Uses API_CONFIG.BASE_URL

### Upload Size Limits
Increased file upload limits for large APK and movie files:

| Endpoint | New Limit |
|----------|-----------|
| APK uploads | 5 GB |
| Movie uploads | 10 GB |
| Nginx proxy | 5 GB |

**Files Changed:**
- `backend/src/handlers/app_versions.rs` - 5GB limit
- `nginx/custom.conf` - 5GB `client_max_body_size`

---

## 🐳 Docker Improvements

### Nginx Configuration
Added custom nginx configuration file for easy customization:

```
nginx/custom.conf
```

Contents:
```nginx
client_max_body_size 5000M;
```

This is mounted into the nginx-proxy container for persistent configuration.

**Files Changed:**
- `docker-compose.yml` - Added nginx config volume mount
- `nginx/custom.conf` - New file for custom nginx settings

---

## 🛠️ Bug Fixes

### Backend
- Fixed activity log SQL injection vulnerability
- Fixed EPG API returning wrong channel IDs for programs
- Fixed body size limits for large file uploads
- Improved error messages for multipart form parsing
- Fixed translation function `t()` used outside React components in `EndUserManagement.tsx`
- Fixed `useCallback` missing dependency for translation hook

### Frontend
- Fixed API URL falling back to wrong host:port
- Fixed app version upload failing with connection errors
- Removed hardcoded port 3000 fallback in API services
- Fixed translation namespace loading for admin sections
- Fixed `getResellerName` useCallback dependencies

### Android TV
- Extended EPG time window to show future programs
- Added debug logging for EPG data flow
- Fixed programs being filtered out when scheduled for next day
- **Fixed Update Dialog focus issues** - D-pad navigation now works correctly
- **Added download progress tracking** - Dialog stays open showing real progress
- **Added FocusRequester** for automatic focus on Install button
- Added new string resources for update states

---

## 🎬 New Feature: Cast/Credits API

### TMDB Cast Integration
Added new endpoint to fetch movie and TV show cast from TMDB:

**Endpoint:** `GET /api/tmdb/credits/:media_type/:id`

**Examples:**
- `/api/tmdb/credits/movie/550` (Fight Club)
- `/api/tmdb/credits/tv/1396` (Breaking Bad)

**Response:**
```json
{
  "cast": [
    {
      "id": 287,
      "name": "Brad Pitt",
      "character": "Tyler Durden",
      "profile_url": "https://image.tmdb.org/t/p/w185/..."
    }
  ]
}
```

**Features:**
- Returns top 10 cast members per content
- Full profile image URLs included
- Supports both movies and TV shows
- Available to all authenticated users

**Files Changed:**
- `backend/src/models/content.rs` - Added `TmdbCastMember`, `TmdbCredits` structs
- `backend/src/services/tmdb.rs` - Added `get_movie_credits()`, `get_tv_credits()`
- `backend/src/handlers/tmdb.rs` - Added `/credits/:media_type/:id` endpoint

**Android Apps:** Cast UI components already implemented (`CastSection`, `CastMemberCard`)

---

## 📱 Mobile App Compatibility

### New: Android Mobile App Support
This update ensures full backend compatibility for external Android mobile applications:

**Device Management**
- Mobile devices supported in device limit tracking
- Device replacement API works across TV and mobile platforms
- Unified device status endpoint for all device types

**Streaming Compatibility**
- HLS/DASH streaming endpoints compatible with mobile players
- DRM (Widevine/ClearKey) support for mobile devices
- Existing streaming APIs work seamlessly with mobile apps

**API Compatibility**
- `userAgent` field included in device responses
- Mobile device type recognition in device registration
- Authentication flow consistent across all platforms

> **Note:** The Android Mobile App is available as a separate product. This update ensures the backend fully supports mobile app integration.

---

## 📱 Android TV Update Dialog Improvements

### Focus Navigation Fix
**Problem:** Update dialog focus was stuck at bottom, unusable with D-pad.

**Solution:** 
- Added `FocusRequester` for automatic focus on Install button
- All buttons now properly focusable with `.focusable()` modifier
- Larger dialog size (480dp) for better TV visibility

### Download Progress Feedback
**Problem:** After clicking Install, no feedback was shown.

**Solution:**
- Dialog now stays open during download
- Real-time progress bar (0-100%)
- Shows "Preparing download..." at start
- Shows "Installation prompt will appear shortly"
- Auto-closes after download completes

**Files Changed:**
- `tv_app/presentation/update/UpdateDialog.kt` - Focus handling & larger buttons
- `tv_app/presentation/MainViewModel.kt` - Download progress tracking
- `tv_app/presentation/MainActivity.kt` - Progress state management
- `tv_app/res/values/strings.xml` - New update-related strings

---

## 🌐 Internationalization Improvements

### New Translations
Added Spanish (es) and Portuguese (pt-BR) translations for:
- End user management section
- Settings screens
- Player controls
- Error messages

### Translation Loading Fix
- Fixed `useLoadNamespace` hook for dynamic translation loading
- Fixed translation function usage in utility functions

---

## ⬆️ Upgrade Instructions

### From v1.0.1 to v1.1.0

1. **Download v1.1.0 from CodeCanyon and extract**

2. **Replace backend and frontend folders** (keep your docker-compose.yml config)

3. **Copy the new nginx config file:**
   ```bash
   cp nginx/custom.conf /path/to/your/installation/nginx/
   ```

4. **Rebuild containers:**
   ```bash
   docker compose build backend frontend
   docker compose up -d
   ```

5. **If using nginx-proxy, recreate it:**
   ```bash
   docker compose --profile proxy up -d nginx-proxy
   ```

6. **Rebuild Android TV app** to get update dialog fixes

---

## 📦 Files Changed Summary

| Category | Files Modified |
|----------|----------------|
| Backend | 5 Rust files + API enhancements for mobile compatibility |
| Frontend | 4 TypeScript files |
| TV App | 5 Kotlin files, 1 XML |
| Docker | docker-compose.yml |
| Nginx | nginx/custom.conf (new) |

---

## Breaking Changes

None. This is a fully backward-compatible update.

---

**Full Changelog:** See commit history for detailed changes.

**Support:** Use CodeCanyon item support for assistance.

