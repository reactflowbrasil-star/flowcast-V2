# StreamCore API v1.2.0 - By Team (curl ready)

This guide gives copy/paste API examples by team.

Official spec sources:
- `documentation/openapi.json`
- `backend/static/swagger.json`
- Runtime docs: `/api/docs` and `/api/docs/swagger.json`

## 1) Shared setup

```bash
export BASE_URL="https://your-domain.com"
export JWT_TOKEN="<end_user_jwt_or_admin_jwt>"
export MASTER_API_KEY="<master_api_key>"
export RESELLER_API_KEY="<reseller_x_api_key>"
```

Health check:

```bash
curl -sS "$BASE_URL/api/health"
```

---

## 2) Frontend Team (web app)

### 2.1 Public pages (no auth)

List public packages:

```bash
curl -sS "$BASE_URL/api/public/packages"
```

Check if email is available:

```bash
curl -sS -X POST "$BASE_URL/api/public/check-email" \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com"}'
```

Direct register (if enabled):

```bash
curl -sS -X POST "$BASE_URL/api/public/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"newuser",
    "password":"StrongPass123",
    "email":"newuser@example.com"
  }'
```

### 2.2 Auth + profile

Login:

```bash
curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"newuser",
    "password":"StrongPass123",
    "device_id":"web-chrome-001"
  }'
```

Get current profile:

```bash
curl -sS "$BASE_URL/api/user/profile" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Update profile email:

```bash
curl -sS -X PUT "$BASE_URL/api/user/profile" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"newmail@example.com"}'
```

### 2.3 Subscription checkout flow

Get current subscription state:

```bash
curl -sS "$BASE_URL/api/user/subscription" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Create Stripe checkout session:

```bash
curl -sS -X POST "$BASE_URL/api/user/subscribe" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"package_id": 1}'
```

Cancel subscription:

```bash
curl -sS -X POST "$BASE_URL/api/user/subscription/cancel" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Resume subscription:

```bash
curl -sS -X POST "$BASE_URL/api/user/subscription/resubscribe" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 2.4 User content + history

Search content (delivery endpoint):

```bash
curl -sS "$BASE_URL/api/delivery/content/search?q=matrix&page=1&limit=20" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Get continue watching:

```bash
curl -sS "$BASE_URL/api/user/continue-watching" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Save watch progress (v1.2.0 contract):

```bash
curl -sS -X POST "$BASE_URL/api/user/progress" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contentId": 123,
    "contentType": "movie",
    "episodeId": null,
    "positionSeconds": 120,
    "durationSeconds": 3600
  }'
```

Get content progress:

```bash
curl -sS "$BASE_URL/api/user/progress/123" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

## 3) Android Phone Team

### 3.1 Login + device registration

Login with device id:

```bash
curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"phone_user",
    "password":"StrongPass123",
    "device_id":"phone-android-123"
  }'
```

Register device:

```bash
curl -sS -X POST "$BASE_URL/api/devices" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"phone-android-123",
    "device_name":"Pixel 8"
  }'
```

### 3.2 Device endpoints used by app

Get device status (nested `data` shape):

```bash
curl -sS "$BASE_URL/api/user/device-status" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Get devices with max limit:

```bash
curl -sS "$BASE_URL/api/devices" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Remove a device:

```bash
curl -sS -X DELETE "$BASE_URL/api/devices/phone-android-123" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 3.3 Playback, progress, EPG

Content stream:

```bash
curl -sS "$BASE_URL/api/content/100/stream" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Episode stream:

```bash
curl -sS "$BASE_URL/api/episodes/501/stream" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Bulk EPG (supported endpoint):

```bash
curl -sS "$BASE_URL/api/tv/epg?channel_ids=1,2,3&start=2026-02-21T00:00:00Z&end=2026-02-21T23:59:59Z" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

App version check (phone):

```bash
curl -sS "$BASE_URL/api/app/version?app_type=phone&current_version_code=120"
```

---

## 4) Android TV Team

### 4.1 Core endpoints

TV channels:

```bash
curl -sS "$BASE_URL/api/tv/channels?page=1&limit=10000" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

TV categories:

```bash
curl -sS "$BASE_URL/api/tv/categories" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Series by content id:

```bash
curl -sS "$BASE_URL/api/series/by-content/200" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Season episodes:

```bash
curl -sS "$BASE_URL/api/episodes/season/77" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Episode stream fallback for details/playback:

```bash
curl -sS "$BASE_URL/api/episodes/501/stream" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 4.2 Watch state and devices

Continue watching:

```bash
curl -sS "$BASE_URL/api/user/continue-watching" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Watch history:

```bash
curl -sS "$BASE_URL/api/user/history?page=1&limit=50" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Save progress:

```bash
curl -sS -X POST "$BASE_URL/api/user/progress" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contentId": 501,
    "contentType": "episode",
    "episodeId": 501,
    "positionSeconds": 840,
    "durationSeconds": 2400
  }'
```

Device status:

```bash
curl -sS "$BASE_URL/api/user/device-status" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

App version check (tv):

```bash
curl -sS "$BASE_URL/api/app/version?app_type=tv&current_version_code=120"
```

---

## 5) External Integrations Team

### 5.1 Reseller API v1 (X-API-Key)

Get credit balance:

```bash
curl -sS "$BASE_URL/api/v1/credits/balance" \
  -H "X-API-Key: $RESELLER_API_KEY"
```

List end users:

```bash
curl -sS "$BASE_URL/api/v1/users?page=1&limit=20" \
  -H "X-API-Key: $RESELLER_API_KEY"
```

Create end user:

```bash
curl -sS -X POST "$BASE_URL/api/v1/users" \
  -H "X-API-Key: $RESELLER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"client_001",
    "password":"StrongPass123",
    "email":"client001@example.com",
    "max_devices":2,
    "duration_months":1,
    "duration_days":0,
    "category_ids":[1,2]
  }'
```

Extend user:

```bash
curl -sS -X POST "$BASE_URL/api/v1/users/123/extend" \
  -H "X-API-Key: $RESELLER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"duration_months":1,"duration_days":0}'
```

Deactivate user:

```bash
curl -sS -X PUT "$BASE_URL/api/v1/users/123/status" \
  -H "X-API-Key: $RESELLER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"active":false}'
```

### 5.2 Admin automation (Master API Key)

Important: Master API Key is restricted to `/api/admin/*` routes.

List admin-side users:

```bash
curl -sS "$BASE_URL/api/admin/users" \
  -H "X-Master-API-Key: $MASTER_API_KEY"
```

Get payment config (masked values):

```bash
curl -sS "$BASE_URL/api/admin/payment-config" \
  -H "X-Master-API-Key: $MASTER_API_KEY"
```

Get import tasks:

```bash
curl -sS "$BASE_URL/api/admin/import/tasks" \
  -H "X-Master-API-Key: $MASTER_API_KEY"
```

---

## 6) Compatibility notes (v1.2.0)

- Supported EPG endpoint is bulk only: `GET /api/tv/epg`.
- Watch progress request uses camelCase input and snake_case output.
- Do not rely on these non-existent routes:
  - `/api/auth/device/activate`
  - `/api/auth/user-agent`
  - `/api/episodes/:id` (details)

For full schema details, use `documentation/openapi.json`.
