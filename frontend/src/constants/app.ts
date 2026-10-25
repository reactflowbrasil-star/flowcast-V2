// Application constants

// Centralized app name - change via NEXT_PUBLIC_APP_NAME env variable
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'LifeRoute';

export const APP_CONFIG = {
  NAME: APP_NAME,
  VERSION: '1.1.2'} as const;

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DEMO: '/demo',
  REDEEM: '/redeem',
  DASHBOARD: '/dashboard',

  // Admin routes
  ADMIN: {
    BASE: '/admin',
    USERS: '/admin/users',
    CONTENT: '/admin/content',
    CATEGORIES: '/admin/categories',
    SERIES: '/admin/series',
    ANALYTICS: '/admin/analytics'},

  // Reseller routes
  RESELLER: {
    BASE: '/reseller',
    CUSTOMERS: '/reseller/customers',
    CONTENT: '/reseller/content',
    ANALYTICS: '/reseller/analytics'},

  // End user routes
  USER: {
    BASE: '/user',
    DASHBOARD: '/user',
    CONTENT: '/user/content',
    DEVICES: '/user/devices',
    PROFILE: '/user/profile',
    PRODUCTS: '/user/products',
    LIVE: '/user/live',
    MOVIES: '/user/movies',
    SHOWS: '/user/shows',
    FAVORITES: '/user/favorites',
    HISTORY: '/user/history',
    SEARCH: '/user/search',
    KIDS: '/user/kids',
    ANIME: '/user/anime',
    EVENTS: '/user/events'},

  // Content routes
  CONTENT: {
    BROWSE: '/user/content',
    SEARCH: '/content/search',
    WATCH: (contentId: number) => `/user/content/${contentId}/watch`,
    SERIES: (seriesId: number) => `/content/series/${seriesId}`,
    EPISODE: (seriesId: number, seasonId: number, episodeId: number) =>
      `/content/series/${seriesId}/season/${seasonId}/episode/${episodeId}`}} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE: 1} as const;

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'iptv_auth_token',
  USER_DATA: 'iptv_user_data',
  THEME: 'iptv_theme',
  LANGUAGE: 'iptv_language'} as const;

export const THEME = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
  MIDNIGHT: 'midnight',
  DARK_BLUE: 'dark_blue'} as const;

export const DEFAULT_THEME = THEME.LIGHT;

export const DEVICE_LIMITS = {
  DEFAULT_MAX_DEVICES: 3,
  ADMIN_MAX_DEVICES: 10} as const;
