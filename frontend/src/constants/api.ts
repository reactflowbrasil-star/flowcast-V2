// API configuration constants

const isBrowser = typeof window !== 'undefined';

const envBaseUrl =
  typeof process !== 'undefined' ? ((process as any)?.env?.NEXT_PUBLIC_API_URL as string | undefined) : undefined;

// Optional server-only base URL for Next.js rewrites / internal Docker networking.
const internalBaseUrl =
  typeof process !== 'undefined' ? ((process as any)?.env?.INTERNAL_API_URL as string | undefined) : undefined;

export const API_CONFIG = {
  // Prefer explicit env when provided; otherwise, in dev when frontend runs on 5000/5173/etc,
  // talk directly to backend on 3000 to avoid proxy/rewrite issues.
  BASE_URL: isBrowser
    ? (
      envBaseUrl ||
      ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : window.location.origin)
    )
    : internalBaseUrl || envBaseUrl || 'http://localhost:3000',
  TIMEOUT: 600000, // 10 minutes - increased for long operations like folder scanning
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: '/api/auth/login',
    REFRESH: '/api/auth/refresh',
    LOGOUT: '/api/auth/logout',
    // Password Reset
    FORGOT_PASSWORD: '/api/auth/forgot-password',
    VERIFY_RESET_TOKEN: '/api/auth/verify-reset-token',
    RESET_PASSWORD: '/api/auth/reset-password',
    // Two-Factor Authentication
    TWO_FACTOR_STATUS: '/api/auth/2fa/status',
    TWO_FACTOR_SETUP: '/api/auth/2fa/setup',
    TWO_FACTOR_VERIFY: '/api/auth/2fa/verify',
    TWO_FACTOR_DISABLE: '/api/auth/2fa/disable',
    TWO_FACTOR_BACKUP_CODES: '/api/auth/2fa/backup-codes'
  },

  // User Management
  USERS: {
    BASE: '/api/admin/users',
    CREATE_ADMIN: '/api/admin/admins',
    CREATE_RESELLER: '/api/admin/resellers',
    CREATE_END_USER: '/api/admin/users',
    UPDATE_CREDITS: (userId: number) => `/api/admin/users/${userId}/credits`,
    SET_ACTIVE: (userId: number) => `/api/admin/users/${userId}/status`
  },

  // User Profile (self-service)
  USER_PROFILE: {
    GET: '/api/user/profile',
    UPDATE: '/api/user/profile',
    CHANGE_PASSWORD: '/api/user/profile/password'
  },

  // Admin Management
  ADMIN: {
    USERS: '/api/admin/users',
    RESELLERS: '/api/admin/resellers',
    CONTENT: '/api/admin/content',
    CONTENT_TMDB_ENRICH: '/api/admin/content/tmdb/enrich',
    TV_CHANNELS: '/api/admin/content/tv-channels',
    TV_CHANNELS_BULK: '/api/admin/content/tv-channels/bulk',
    CONTENT_BULK_IMPORT: '/api/admin/content/content/bulk-import',
    TV_CHANNEL_CATEGORIES: '/api/admin/content/tv-channel-categories',
    TV_CHANNEL_CATEGORY: (categoryId: number) => `/api/admin/content/tv-channel-categories/${categoryId}`,
    TV_PROVIDERS: '/api/admin/content/tv-providers',
    TV_PROVIDER: (id: number) => `/api/admin/content/tv-providers/${id}`,
    TV_PROVIDER_SYNC: (id: number) => `/api/admin/content/tv-providers/${id}/sync`,
    USER_PASSWORD: (userId: number) => `/api/admin/users/${userId}/password`,
    SERIES: '/api/admin/series',
    SERIES_TMDB: '/api/admin/series/tmdb',
    EPISODES_UPDATE: (episodeId: number) => `/api/admin/series/episodes/${episodeId}`,
    EVENTS: '/api/admin/specialized/events',
    EVENT_SCHEDULES: '/api/admin/specialized/events/schedules',
    KIDS_CONTENT: '/api/admin/specialized/kids',
    ANIME_CONTENT: '/api/admin/specialized/anime',
    ANIME_SERIES_TMDB: '/api/admin/specialized/anime/series/tmdb',
    DEVICES: '/api/admin/devices',
    DEVICE_STATS: '/api/admin/devices/stats',
    CONFIG: '/api/admin/config',
    BILLING: {
      OVERVIEW: '/api/admin/billing/overview',
      TRANSACTIONS: '/api/admin/billing/transactions',
      OFFLINE_PAYMENT: '/api/admin/billing/transactions/offline-payment'
    },
    CREDITS_PRICING_CONFIG: '/api/admin/credits/pricing-config',
    STATS: '/api/admin/stats',
    EPG: {
      SOURCES: '/api/admin/epg/sources',
      SOURCE_BY_ID: (id: number) => `/api/admin/epg/sources/${id}`,
      SOURCE_CHANNELS: (id: number) => `/api/admin/epg/sources/${id}/channels`,
      TV_CHANNEL_EPG: (id: number) => `/api/admin/content/tv-channels/${id}/epg`
    },
    INGEST: {
      SCAN_FOLDER: '/api/admin/ingest/scan-folder'
    },
    SMTP: {
      GET: '/api/admin/smtp',
      UPDATE: '/api/admin/smtp',
      TEST: '/api/admin/smtp/test'
    },
    SQLITE_IMPORT_UPLOAD: '/api/admin/import/sqlite/upload',
    IMPORT_TASKS: '/api/admin/import/tasks',
    IMPORT_TASK: (taskId: string) => `/api/admin/import/tasks/${taskId}`,
    DB: {
      EXPORT: '/api/admin/db/export',
      IMPORT: '/api/admin/db/import',
      DOWNLOAD: (file: string) => `/api/admin/db/export/${file}`
    },
    LICENSE: {
      ACTIVATE: '/api/admin/license/activate',
      STATUS: '/api/admin/license/status'
    }
  },

  // License (public — no auth)
  LICENSE: {
    TYPE: '/api/license/type'
  },

  // Reseller Management
  RESELLER: {
    USERS: '/api/reseller/users',
    CREDITS: '/api/reseller/credits',
    CREDIT_RATES: '/api/reseller/credits/rates',
    CHECKOUT_SESSION: '/api/reseller/credits/checkout-session',
    CALCULATE_CREDITS: (devices: number) => `/api/reseller/credits/calculate/${devices}`,
    USER_DEVICES: (userId: number) => `/api/reseller/users/${userId}/devices`,
    DEMOS: '/api/reseller/demos',
    DEMO_STATS: '/api/reseller/demos/stats'
  },

  // Device Management
  DEVICES: {
    BASE: '/api/devices',
    CHECK: (deviceId: string) => `/api/devices/${deviceId}/check`,
    REMOVE: (deviceId: string) => `/api/devices/${deviceId}`
  },

  // Content Management
  CONTENT: {
    CATEGORIES: '/api/public/content/categories',
    BY_CATEGORY: (categoryId: number) => `/api/delivery/content/category/${categoryId}`,
    SEARCH: '/api/delivery/content/search',
    STREAM: (contentId: number) => `/api/content/${contentId}/stream`,
    CREATE: '/api/content',
    UPDATE: (contentId: number) => `/api/content/${contentId}`,
    DELETE: (contentId: number) => `/api/content/${contentId}`
  },

  // Series and Episodes
  SERIES: {
    BASE: '/api/series',
    BY_CONTENT: (contentId: number) => `/api/series/by-content/${contentId}`,
    SEASONS: (seriesId: number) => `/api/series/${seriesId}/seasons`,
    CREATE: '/api/series',
    UPDATE: (seriesId: number) => `/api/series/${seriesId}`,
    DELETE: (seriesId: number) => `/api/series/${seriesId}`
  },

  EPISODES: {
    BY_SEASON: (seasonId: number) => `/api/episodes/season/${seasonId}`,
    STREAM: (episodeId: number) => `/api/episodes/${episodeId}/stream`,
    SUBTITLES: (episodeId: number) => `/api/episodes/${episodeId}/subtitles`,
    CREATE: '/api/episodes',
    UPDATE: (episodeId: number) => `/api/episodes/${episodeId}`,
    DELETE: (episodeId: number) => `/api/episodes/${episodeId}`
  },

  // Specialized Content
  SPECIALIZED: {
    BASE: '/api/specialized',
    KIDS: '/api/specialized/kids',
    ANIME: '/api/specialized/anime',
    EVENTS: '/api/specialized/events',
    EVENT_BY_ID: (eventId: number) => `/api/specialized/events/${eventId}`,
    EVENTS_BY_DATE: '/api/specialized/events/date',
    SCHEDULE_STREAM: (scheduleId: number) => `/api/delivery/schedules/${scheduleId}/stream`
  },

  // Movies and TV
  MOVIES: {
    BASE: '/api/movies'
  },

  TV: {
    CHANNELS: '/api/tv/channels',
    CATEGORIES: '/api/tv/categories',
    EPG: '/api/tv/epg'
  },

  // TMDB Integration
  TMDB: {
    STATUS: '/api/tmdb/status',
    SEARCH: '/api/tmdb/search',
    MOVIE: (tmdbId: number) => `/api/tmdb/movie/${tmdbId}`,
    TV: (tmdbId: number) => `/api/tmdb/tv/${tmdbId}`,
    SEASON: (tmdbId: number, seasonNumber: number) => `/api/tmdb/tv/${tmdbId}/season/${seasonNumber}`
  },

  DISCOVERY: {
    OVERVIEW: '/api/delivery/discovery'
  }
} as const;

export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH'
} as const;

export const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM_DATA: 'multipart/form-data',
  URL_ENCODED: 'application/x-www-form-urlencoded'
} as const;
