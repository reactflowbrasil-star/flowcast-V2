# Third‑Party Licenses

This project depends on third‑party open‑source software across three components:
backend (Rust), frontend (Next.js/React), and the Android app (Kotlin/Compose).

This file summarizes notable third‑party components and where to find their license
texts inside this package. The package does not ship an auto‑generated license BOM.

## Notable third‑party components

**Backend**
- Web framework & runtime: Axum, Tokio, Tower, Tower‑HTTP
- Data & auth: Serde, SQLx, Chrono, UUID, jsonwebtoken, bcrypt
- Networking & utilities: Reqwest, Regex, dotenvy, tracing‑subscriber, lettre, totp‑rs
- See `backend/Cargo.toml`.

**Frontend**
- Framework: Next.js, React, ReactDOM
- UI & state: Material UI, Radix UI, TanStack Query, React Hook Form
- Media: Shaka Player, HLS.js
- Utilities: Axios, i18next, Zod, Recharts, date‑fns
- See `frontend/package.json`.

**Bundled web vendor JS**
- hls.js (Apache-2.0)
- Shaka Player (Apache-2.0)
- See `frontend/public/vendor` and `licenses/APACHE-2.0.txt`.

**Android**
- UI: Jetpack Compose, Material3, Navigation‑Compose
- DI & storage: Hilt, Room, DataStore
- Media: AndroidX Media3/ExoPlayer, Media3 FFmpeg decoder (software fallback)
- Networking: Retrofit, OkHttp, Gson, Coil
- See `Apps/tv_app/app/build.gradle`.

## Special notes

- The FFmpeg decoder extension may carry LGPL obligations.
  Verify their licenses and include their license texts in your final distribution.

### Android packaging note

This project intentionally keeps a copy of common license texts inside the Android APK/AAB via Gradle packaging rules.
Do not exclude `META-INF/AL2.0` or `META-INF/LGPL2.1` from the Android build output.
