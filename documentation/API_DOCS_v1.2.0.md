# StreamCore API Docs v1.2.0

Esta es la referencia actualizada de la API para StreamCore `v1.2.0`.

## Fuentes oficiales

- OpenAPI JSON (docs): `documentation/openapi.json`
- OpenAPI JSON (servido por backend): `backend/static/swagger.json`
- Swagger UI (runtime): `/api/docs`
- Swagger spec (runtime): `/api/docs/swagger.json`
- Guia por equipo con curl listos: `documentation/API_DOCS_v1.2.0_BY_TEAM.md`

> Estado: spec sincronizada a `v1.2.0` (242 rutas documentadas).

## Base URL

- Produccion: `https://<tu-dominio>`
- Prefijo API: `/api`

Ejemplo:

```text
GET https://<tu-dominio>/api/health
```

## Autenticacion

- `BearerAuth` (JWT): `Authorization: Bearer <token>`
- Cookie de sesion web compatible: `iptv_auth_token`
- `MasterApiKey`: `X-Master-API-Key` (solo contexto admin/system)
- `ResellerApiKey`: `X-API-Key` (solo `/api/v1/*`)

## Grupos de endpoints (completo)

- `Health`: salud del backend
- `Auth`: login/logout/refresh + 2FA
- `PasswordReset`: forgot/verify/reset
- `Public`: registro, verificacion email, paquetes publicos, UI config
- `APIv1`: endpoints reseller via API key
- `Devices`: registro/listado/remocion y chequeo de dispositivos
- `User`: profile, progreso, historial, continue watching, suscripcion
- `Favorites`: CRUD favoritos por tipo/contenido
- `Content` / `Movies` / `TV` / `Series` / `Episodes` / `Delivery` / `Specialized`
- `EPG`: EPG entrega + admin EPG
- `TMDB`: integracion metadata
- `Admin`: usuarios, resellers, config, seguridad, billing, paquetes, import/export
- `Reseller`: gestion de usuarios, creditos, tickets y API keys
- `Tickets`, `Notifications`, `ActivityLogs`, `Security`, `SMTP`, `MediaWatcher`, `Uploads`, `AppVersions`, `Imports`, `Billing`

## Contratos clave (v1.2.0)

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`

### User progress

- Guardar progreso: `POST /api/user/progress`
  - Request esperado (camelCase):

```json
{
  "contentId": 123,
  "contentType": "movie",
  "episodeId": null,
  "positionSeconds": 120,
  "durationSeconds": 3600
}
```

- Consultar progreso:
  - `GET /api/user/progress/:content_id`
  - `GET /api/user/progress/:content_id/:episode_id`
- Response usa snake_case (`position_seconds`, `duration_seconds`, `progress_percent`, `updated_at`, etc.).

### Devices

- Estado dispositivos: `GET /api/user/device-status`
  - Shape principal:

```json
{
  "success": true,
  "data": {
    "current_devices": 1,
    "max_devices": 3,
    "has_space": true,
    "devices": []
  }
}
```

- Listados:
  - `GET /api/user/devices` -> `{ devices, max_devices? }`
  - `GET /api/devices` -> `{ devices, max_devices }`

### EPG

- Endpoint soportado: `GET /api/tv/epg?channel_ids=1,2&start=...&end=...`
- No existe endpoint por canal individual (`/api/tv/epg/{channelId}`).

### Suscripciones y pagos end-user

- `GET /api/public/packages`
- `GET /api/user/subscription`
- `POST /api/user/subscribe`
- `POST /api/user/subscription/cancel`
- `POST /api/user/subscription/resubscribe`
- Webhooks Stripe:
  - `POST /api/payments/stripe/webhook`
  - `POST /api/payments/stripe/subscription-webhook`

### Versionado de apps (Android TV/Phone)

- `GET /api/app/version?app_type=phone|tv&current_version_code=<int>`
- `GET /api/app/download/:filename`

## Notas de compatibilidad clientes Android

- Correcto usar:
  - `GET /api/episodes/:id/stream`
  - `POST /api/user/progress`
  - `GET /api/tv/epg` (bulk)
- No usar rutas no implementadas en backend:
  - `/api/auth/device/activate`
  - `/api/auth/user-agent`
  - `/api/episodes/:id` (details directo)

## Recomendacion de consumo

- Para integraciones nuevas: usar `documentation/openapi.json` como fuente de generacion de cliente.
- Para debug operativo: usar `/api/docs` y probar requests con JWT o API keys segun el grupo.
