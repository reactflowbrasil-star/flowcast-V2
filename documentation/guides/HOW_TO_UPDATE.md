# StreamCore - Install and Update Guide

This guide covers:
- **Quick Docker install** with the interactive root script: `install.sh`
- **Safe update flow** for existing installations
- **Legacy migration** from SQLite (`v1.0.0`) to PostgreSQL (`v1.0.1+`)

---

## 0) Quick Docker Install (Recommended)

Use the root installer script for the fastest setup.

### What the script does

`install.sh` automates:
- Docker/Docker Compose detection and installation (if missing)
- Interactive configuration (app name, domains/IP, DB credentials, JWT, admin password, proxy/security options, backups)
- Direct update of `docker-compose.yml` values (with timestamped backup)
- Build and startup of the stack

### Run it

From the project root:

```bash
chmod +x install.sh
sudo bash install.sh
```

Then choose:
- `1) New Installation` for first-time setup
- `2) Update` to rebuild backend/frontend while keeping DB and config

### Important behavior

- The script requires root (`sudo`) and writes changes to `docker-compose.yml`.
- A backup is created automatically: `docker-compose.yml.bak.YYYYMMDD_HHMMSS`.
- If you choose domain mode with automatic proxy, it starts with:
  - `docker compose --profile proxy up -d --build`
- Otherwise it starts with:
  - `docker compose up -d --build`

### After install

Default admin login is:
- User: `admin`
- Password: the `Admin default password` you entered in the script

Useful commands:

```bash
docker compose logs -f
docker compose logs -f backend frontend postgres
docker compose up -d
docker compose down
```

---

This document consolidates the relevant parts of `../updates/UPDATE_1.0.1.md`, `../updates/UPDATE_1.1.0.md`, `../updates/UPDATE_1.1.2.md`, and `../updates/UPDATE_1.2.0.md`, and explains the recommended upgrade path from an older **SQLite** installation (v1.0.0) to the **PostgreSQL** stack introduced in **v1.0.1** (and continued through v1.2.0).

> Important: migrating containers alone does **not** migrate your data. You must explicitly **import** the legacy SQLite database into PostgreSQL.

---

## 1) What Changed

### v1.0.1
- Database migration: **SQLite -> PostgreSQL 16**.
- Backups via `pg_dump`.
- Security fix: do not send JWT Authorization to external stream URLs.
- Performance improvements and i18n updates.

### v1.1.0
- Security hardening (anti-injection / server-side validation).
- Android TV fixes (EPG window, update dialog UX).
- Nginx upload limit support via `nginx/custom.conf`.

### v1.1.2
- Versioning alignment across backend/frontend/android projects.
- URL regulation hardening for proxy/streaming and Live TV fields (proxy/DoH/license URL rules).
- Android Phone app launch + phone update flow support.
- Security/ops expansion (2FA, password reset, SMTP tooling, API keys, tickets, media watcher, TV provider sync).
- Additional UI and i18n improvements across admin/reseller/end-user panels.

### v1.2.0
- **9+ security fixes**: bcrypt API keys, IP spoofing patched, Stripe idempotency, 2FA hardened, rate limiting.
- **End-user subscription system**: self-registration, free/paid packages, category-based content access.
- **ClearKey DRM fully fixed** across phone and TV apps (DASH manifest parser rewritten).
- **Per-episode multi-stream** with DRM per episode.
- **Admin panel**: Stripe payment settings UI (DB-first, env fallback), upload progress bars.
- **Dynamic sidebar/mobile nav** — built from user subscribed categories only.
- **API response encryption** (AES-256-GCM) for end-user clients.
- **Automatic v1.1.2 → v1.2.0 migration** (44 tables, FK-safe, sequence auto-fix).
- **77K+ RPS** on content endpoints, 82 automated tests, 0 Clippy warnings.
- **Breaking**: Master API Keys invalidated, public features default to disabled.

---

## 2) Pre-Upgrade Checklist

- Back up your current `docker-compose.yml` (or at least your mounts).
- Identify your media mounts (example: `/media:/media`).
- Make sure you have (or set):
  - `JWT_SECRET`
  - `ADMIN_DEFAULT_PASSWORD`
  - correct URLs/domains (`PUBLIC_BASE_URL`, `NEXT_PUBLIC_API_URL`, CORS)
- Plan maintenance/downtime.

---

## 3) Step-by-Step Upgrade (v1.0.0 SQLite → v1.2.0 PostgreSQL)

### Step A - Stop the old stack and back up SQLite

1) Stop the old stack:
```bash
docker compose down
```

2) Copy the SQLite database from the backend container (typical location: `/data/iptv.db`):
```bash
docker cp streamcore-backend:/data/iptv.db ./iptv.db
```

3) Create a timestamped backup:
```bash
mkdir -p ./backup
cp ./iptv.db ./backup/iptv_$(date +%Y%m%d_%H%M%S).db
```

> If you were not using Docker, the file is commonly at `backend/iptv.db`.


### Step B - Prepare the new PostgreSQL-based version

1) Download/extract the new version (v1.2.0) and update your deployment folders as needed.

2) **Preserve media paths**.
- If your old stack mounted `/media` inside the container, keep `/media` inside the new stack.
- If you change the in-container paths, DB references can break and content may show as missing.

3) Configure PostgreSQL in `docker-compose.yml`:
- Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- Set `backend.environment.DATABASE_URL` to match the Postgres service credentials.

4) Set the initial admin password:
- `ADMIN_DEFAULT_PASSWORD` (in `docker-compose.yml` or environment).


### Step C - Start the new stack (creates schema + default admin)

Start services:
```bash
docker compose up -d --build
```

The backend runs migrations automatically on startup.


### Step D - Import SQLite into PostgreSQL (one-time)

This import is an **admin-only** API.

#### D1) Copy `iptv.db` into the backend container

Recommended:
```bash
docker cp ./iptv.db streamcore-backend:/tmp/iptv.db
```

#### D2) Get an Admin token

Login (default username is `admin`):
```bash
TOKEN=$(curl -s -X POST 'http://localhost:3000/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASSWORD"}' | \
  python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
```

Notes:
- `YOUR_ADMIN_PASSWORD` is the `ADMIN_DEFAULT_PASSWORD` you configured, or the temporary password printed by the backend on first run.


#### D3) Import by path (sync)

```bash
curl -s -X POST 'http://localhost:3000/api/admin/import/sqlite' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"path":"/tmp/iptv.db"}'
```


#### D4) Import in background (async) + monitor

For large databases:
```bash
curl -s -X POST 'http://localhost:3000/api/admin/import/sqlite?async=true' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"path":"/tmp/iptv.db"}'
```

Monitor tasks:
```bash
curl -s -X GET 'http://localhost:3000/api/admin/import/tasks' \
  -H "Authorization: Bearer $TOKEN"
```

Or a specific task:
```bash
curl -s -X GET 'http://localhost:3000/api/admin/import/tasks/<task_id>' \
  -H "Authorization: Bearer $TOKEN"
```


#### D5) Alternative: upload the DB file

```bash
curl -s -X POST 'http://localhost:3000/api/admin/import/sqlite/upload' \
  -H "Authorization: Bearer $TOKEN" \
  -F 'db=@./iptv.db'
```


Import behavior notes:
- Imports tables in a safe order.
- Uses `ON CONFLICT DO NOTHING` (duplicates are skipped).
- Updates sequences for tables with `id`.


### Step E - Post-migration verification

Validate in the panel/API:
- users
- categories
- Live TV channels
- VOD/Series content
- EPG sources

Test local media playback:
- If playback fails due to missing files, your container media paths likely changed (fix mounts).


### Step F - v1.1.x extra deployment steps

If you use the `proxy` profile (nginx-proxy), ensure `nginx/custom.conf` exists and is mounted.

Recommended rebuild:
```bash
docker compose build backend frontend
docker compose up -d
```

If using `--profile proxy`:
```bash
docker compose --profile proxy up -d nginx-proxy
```

Android rebuild recommendation:
- Rebuild `Apps/tv_app` for the latest TV update-flow fixes.
- Build/deploy `Apps/phone_app` if you are enabling the Android Phone app.

---

## 4) Backups (PostgreSQL)

After migration, create a Postgres backup.

Option A (API):
```bash
curl -s -X POST 'http://localhost:3000/api/admin/db/export' \
  -H "Authorization: Bearer $TOKEN"
```

Option B (manual):
```bash
pg_dump --no-owner --no-privileges \
  "postgres://USER:PASS@HOST:5432/DB" > iptv_export.sql
```

---

## 5) Rollback (if needed)

- Keep your original `iptv.db` backup and your old deployment.
- To rollback:
  1) stop the new stack
  2) start the old SQLite-based stack using the backed up `iptv.db`

Avoid deleting Postgres volumes unless you are sure (destructive).

---

## 6) Quick Troubleshooting

- **403 Forbidden on import**: not an admin token, or missing/invalid Authorization header.
- **"SQLite file not found"**: the `path` does not exist inside the container or is not a `.db` file.
- **"file not found" in playback**: container media mount paths changed compared to old setup.
- **Import takes long**: use `?async=true` and monitor `/api/admin/import/tasks`.
