// API service with axios configuration

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { toast } from 'sonner';
import { API_CONFIG, STORAGE_KEYS } from '@/constants';
import { getAdminHeaders } from '@/config/adminPanel';
import { ApiError, ApiResult } from '@/types';
import i18n from '@/lib/i18n';
import { isEncryptionEnabled, computeHmacSignature, decryptApiResponse } from '@/lib/crypto';

interface HttpError {
  response?: {
    data?: {
      error?: string;
      details?: string;
      timestamp?: string;
    };
  };
  request?: unknown;
  message?: string;
}

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token and admin panel headers
    this.client.interceptors.request.use(
      (config) => {
        // Respect explicit Authorization set by the caller (e.g., pending admin token)
        const callerAuth = (config.headers as any)?.Authorization || (config.headers as any)?.authorization;
        const token = this.getStoredToken();
        if (!callerAuth && token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add Accept-Language header based on browser locale
        if (typeof window !== 'undefined' && navigator.languages && navigator.languages.length > 0) {
          const acceptLanguage = navigator.languages.map((lang, index) => {
            return index === 0 ? lang : `${lang};q=${Math.max(0.1, 1 - index * 0.1).toFixed(1)}`;
          }).join(', ');

          if (!config.headers['Accept-Language'] && !config.headers['accept-language']) {
            (config.headers as any)['Accept-Language'] = acceptLanguage;
          }
        }

        // Add admin panel headers for admin-panel, reseller endpoints, and streaming endpoints
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
          const headers = (config.headers ?? {}) as any;
          delete headers['Content-Type'];
          delete headers['content-type'];
          config.headers = headers;
        }

        const url: string = (config?.url ?? '') as string;
        const isAdminPanelRequest =
          url.startsWith('/api/admin') ||
          url.startsWith('/api/reseller') ||
          url.includes('/stream'); // Add stream endpoints to get proper DRM handling

        if (isAdminPanelRequest) {
          const adminHeaders = getAdminHeaders();
          const headers = (config.headers ?? {}) as any;
          for (const [k, v] of Object.entries(adminHeaders)) {
            headers[k] = v as any;
          }
          config.headers = headers;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // HMAC signature interceptor for API encryption
    this.client.interceptors.request.use(
      async (config) => {
        if (isEncryptionEnabled() && config.url) {
          try {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const method = (config.method || 'GET').toUpperCase();
            // Extract the path from the URL (remove base URL)
            let path = config.url;
            if (config.baseURL && path.startsWith(config.baseURL)) {
              path = path.substring(config.baseURL.length);
            }
            if (!path.startsWith('/')) {
              path = '/' + path;
            }

            const signature = await computeHmacSignature(method, path, timestamp);
            if (signature) {
              (config.headers as any)['X-SC-Sig'] = signature;
              (config.headers as any)['X-SC-Ts'] = timestamp;
            }
          } catch (e) {
            // Silently fail — server will reject if signature is required
            console.warn('Failed to compute HMAC signature:', e);
          }
        }
        return config;
      }
    );

    // Response interceptor — decrypt encrypted responses, then handle errors
    this.client.interceptors.response.use(
      async (response) => {
        // Check if response is encrypted
        const encrypted = response.headers?.['x-encrypted'];
        if (encrypted === 'aes256gcm' && isEncryptionEnabled()) {
          try {
            const decryptedJson = await decryptApiResponse(response.data);
            response.data = JSON.parse(decryptedJson);
            // Restore content-type for downstream consumers
            response.headers['content-type'] = 'application/json';
          } catch (e) {
            console.error('Failed to decrypt API response:', e);
            // Return as-is if decryption fails
          }
        }
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Handle device disconnected error (401 with "Device disconnected" message)
        if (error.response?.status === 401 &&
          error.response?.data?.error === 'Device disconnected') {
          this.clearAuth();
          if (typeof window !== 'undefined') {
            toast.error(i18n.t('common.deviceDisconnectedTitle'), {
              description: i18n.t('common.deviceDisconnectedDescription')
            });
            window.location.href = '/login';
          }
          return Promise.reject(error);
        }

        // Handle 401 errors (token expired) - but NOT for refresh endpoint or login endpoint
        if (error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/api/auth/refresh') &&
          !originalRequest.url?.includes('/api/auth/login')) {
          originalRequest._retry = true;

          try {
            await this.refreshToken();
            const token = this.getStoredToken();
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed: clear auth and redirect to login
            this.clearAuth();
            this.forceLogoutRedirect();
            return Promise.reject(refreshError);
          }
        }

        // If it's a 401 on refresh endpoint, clear auth and redirect
        if (error.response?.status === 401 && originalRequest.url?.includes('/api/auth/refresh')) {
          this.clearAuth();
          this.forceLogoutRedirect();
        }

        // Handle 403 Forbidden - user doesn't have permission (token may be for deleted/changed user)
        if (error.response?.status === 403 &&
          !originalRequest.url?.includes('/api/auth/') &&
          // Also ignore if it's a 2FA required error - we handle this in AuthContext
          !error.response?.data?.error?.toLowerCase().includes('two-factor')) {
          // Check if this might be a stale token issue
          const errorMsg = error.response?.data?.error?.toLowerCase() || '';
          if (errorMsg.includes('forbidden') || errorMsg.includes('not found') || errorMsg.includes('invalid')) {
            this.clearAuth();
            this.forceLogoutRedirect();
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private getStoredToken(): string | null {
    if (typeof window !== 'undefined') {
      // Try localStorage first
      const localToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (localToken) return localToken;

      // Fallback to cookies
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === STORAGE_KEYS.AUTH_TOKEN) {
          return value;
        }
      }
    }
    return null;
  }

  private setStoredToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);

      // Also set in cookies for middleware access
      document.cookie = `${STORAGE_KEYS.AUTH_TOKEN}=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    }
  }

  private clearAuth(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
      // Clear any legacy keys
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');

      // Also clear cookies under common paths
      const names = [STORAGE_KEYS.AUTH_TOKEN, 'iptv_user_data', 'auth_token', 'user_data'];
      const paths = ['/', '/admin', '/reseller'];
      for (const name of names) {
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        for (const p of paths) {
          document.cookie = `${name}=; path=${p}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      }
    }
  }

  private forceLogoutRedirect(): void {
    if (typeof window !== 'undefined') {
      // Only redirect if not already on login page or public pages
      const publicPaths = ['/login', '/demo', '/redeem', '/forgot-password', '/reset-password'];
      const isPublicPath = publicPaths.some(p => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`));

      if (!isPublicPath) {
        // Use replace to prevent back button issues
        window.location.replace('/login?session=expired');
      }
    }
  }

  private async refreshToken(): Promise<void> {
    const response = await this.client.post('/api/auth/refresh');
    const { token } = response.data;
    this.setStoredToken(token);
  }

  private handleError(error: unknown): ApiError {
    const httpError = error as HttpError;

    const data: any = httpError.response?.data;
    if (data !== undefined) {
      if (typeof data === 'string') {
        // Backend returned plain text (e.g., axum handler returning (StatusCode, String))
        return {
          error: i18n.t('common.error'),
          details: data,
          timestamp: new Date().toISOString()
        };
      }
      // JSON error shape
      return {
        error: data.error || i18n.t('common.error'),
        details: data.details ?? httpError.message ?? i18n.t('common.unexpectedErrorDescription'),
        timestamp: data.timestamp || new Date().toISOString()
      };
    }

    if (httpError.request) {
      return {
        error: i18n.t('common.networkErrorTitle'),
        details: i18n.t('common.networkErrorDescription'),
        timestamp: new Date().toISOString()
      };
    }

    return {
      error: i18n.t('common.error'),
      details: httpError.message || i18n.t('common.unexpectedErrorDescription'),
      timestamp: new Date().toISOString()
    };
  }

  // Generic request method
  async request<T>(config: AxiosRequestConfig): Promise<ApiResult<T>> {
    try {
      const response: AxiosResponse<T> = await this.client(config);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  // HTTP method helpers
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    // Special handling for scan-folder endpoint - override timeout completely
    if (url.includes('/scan-folder')) {
      const scanConfig = {
        ...config,
        method: 'POST' as const,
        url,
        data,
        timeout: 600000, // Force 10 minutes for scanning operations
      };
      return this.request<T>(scanConfig);
    }

    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  // Auth helpers
  setAuthToken(token: string): void {
    this.setStoredToken(token);
  }

  clearAuthToken(): void {
    this.clearAuth();
  }
}

// Export singleton instance
export const apiService = new ApiService();
export const apiClient = apiService; // Alias for compatibility
export default apiService;
