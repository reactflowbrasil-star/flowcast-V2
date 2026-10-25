'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services';
import { STORAGE_KEYS } from '@/constants';

export interface TokenPayload {
  sub: string;
  device_id?: string | null;
  exp: number;
  iat: number;
  role: string;
  username: string;
}

export function useTokenManager() {
  const router = useRouter();
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Decode JWT token
  const decodeToken = useCallback((token: string): TokenPayload | null => {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return null;
      const paddedPayload = payloadPart
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
      const payload = JSON.parse(atob(paddedPayload));
      return payload;
    } catch {
      return null;
    }
  }, []);

  // Check if token is expired
  const isTokenExpired = useCallback((token: string): boolean => {
    const payload = decodeToken(token);
    if (!payload) return true;
    
    const currentTime = Date.now() / 1000;
    return payload.exp < currentTime;
  }, [decodeToken]);

  // Check if token will expire soon (within 5 minutes)
  const isTokenExpiringSoon = useCallback((token: string): boolean => {
    const payload = decodeToken(token);
    if (!payload) return true;
    
    const currentTime = Date.now() / 1000;
    const fiveMinutes = 5 * 60;
    return payload.exp < (currentTime + fiveMinutes);
  }, [decodeToken]);

  // Get time until token expires
  const getTimeUntilExpiry = useCallback((token: string): number => {
    const payload = decodeToken(token);
    if (!payload) return 0;
    
    const currentTime = Date.now() / 1000;
    return Math.max(0, payload.exp - currentTime);
  }, [decodeToken]);

  // Refresh token
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const result = await authService.refreshToken();
      if (result.success) {
        authService.setAuthToken(result.data.token);
        return true;
      }
      // If refresh fails, clear auth data
      authService.clearStoredUser();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('iptv_auth_token');
      }
      return false;
    } catch {
      // Clear auth data on any error
      authService.clearStoredUser();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('iptv_auth_token');
      }
      return false;
    }
  }, []);

  // Clear refresh timeout
  const clearRefreshTimeout = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  // Schedule token refresh
  const scheduleTokenRefresh = useCallback((token: string) => {
    clearRefreshTimeout();
    
    const timeUntilExpiry = getTimeUntilExpiry(token);
    if (timeUntilExpiry <= 0) return;
    
    // Schedule refresh 2 minutes before expiry
    const refreshTime = Math.max(0, (timeUntilExpiry - 120) * 1000);
    
    refreshTimeoutRef.current = setTimeout(async () => {
      const success = await refreshToken();
      if (!success) {
        // Refresh failed, clear auth and let higher-level guards decide navigation
        authService.clearStoredUser();
      } else {
        // Schedule next refresh
        const newToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (newToken) {
          scheduleTokenRefresh(newToken);
        }
      }
    }, refreshTime);
  }, [getTimeUntilExpiry, refreshToken, clearRefreshTimeout, router]);

  // Validate current token
  const validateToken = useCallback(async (): Promise<boolean> => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) return false;
    
    if (isTokenExpired(token)) {
      // Token is expired, try to refresh
      const success = await refreshToken();
      if (!success) {
        authService.clearStoredUser();
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        return false;
      }
      return true;
    }
    
    if (isTokenExpiringSoon(token)) {
      // Token is expiring soon, refresh proactively
      await refreshToken();
    }
    
    return true;
  }, [isTokenExpired, isTokenExpiringSoon, refreshToken]);

  // Initialize token management
  useEffect(() => {
    const initTokenManager = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) return;
      
      const isValid = await validateToken();
      if (isValid) {
        const currentToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (currentToken) {
          scheduleTokenRefresh(currentToken);
        }
      }
    };
    
    initTokenManager();
    
    // Cleanup on unmount
    return () => {
      clearRefreshTimeout();
    };
  }, [validateToken, scheduleTokenRefresh, clearRefreshTimeout]);

  // Listen for storage changes (multiple tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.AUTH_TOKEN) {
        if (e.newValue) {
          // Token was updated in another tab
          scheduleTokenRefresh(e.newValue);
        } else {
          // Token was removed in another tab; stop refresh scheduling
          clearRefreshTimeout();
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [scheduleTokenRefresh, clearRefreshTimeout, router]);

  // Listen for page visibility changes
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Page became visible, validate token (do not auto-redirect here)
        await validateToken();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [validateToken, router]);

  return {
    decodeToken,
    isTokenExpired,
    isTokenExpiringSoon,
    getTimeUntilExpiry,
    refreshToken,
    validateToken,
    scheduleTokenRefresh};
}
