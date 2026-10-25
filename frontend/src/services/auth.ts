// Authentication service

import { apiService } from './api';
import { API_ENDPOINTS } from '@/constants';
import type { TokenPayload } from '@/hooks/useTokenManager';
import {
  LoginRequest,
  LoginResponse,
  TokenResponse,
  MessageResponse,
  ApiResult
} from '@/types';

export class AuthService {
  async login(credentials: LoginRequest): Promise<ApiResult<LoginResponse>> {
    return apiService.post<LoginResponse>(API_ENDPOINTS.AUTH.LOGIN, {
      username: credentials.username,
      password: credentials.password,
      totp_code: credentials.totp_code,
      device_id: credentials.device_id});
  }

  async refreshToken(): Promise<ApiResult<TokenResponse>> {
    return apiService.post<TokenResponse>(API_ENDPOINTS.AUTH.REFRESH);
  }

  async logout(): Promise<ApiResult<MessageResponse>> {
    const result = await apiService.post<MessageResponse>(API_ENDPOINTS.AUTH.LOGOUT);
    
    // Clear local storage regardless of API response
    apiService.clearAuthToken();
    
    return result;
  }

  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    
    const token = localStorage.getItem('iptv_auth_token');
    return !!token;
  }

  getStoredUser() {
    if (typeof window === 'undefined') return null;
    
    const userData = localStorage.getItem('iptv_user_data');
    return userData ? JSON.parse(userData) : null;
  }

  setStoredUser(user: unknown): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('iptv_user_data', JSON.stringify(user));
    }
  }

  clearStoredUser(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('iptv_user_data');
    }
  }

  setAuthToken(token: string): void {
    apiService.setAuthToken(token);
  }

  decodeToken(token: string): TokenPayload | null {
    try {
      // JWT tokens have 3 parts separated by dots
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Decode the payload (second part)
      const payload = parts[1];
      // Add padding if needed
      const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
      const decoded = atob(paddedPayload);

      return JSON.parse(decoded);
    } catch (error) {
      console.error('Failed to decode token:', error);
      return null;
    }
  }
}

export const authService = new AuthService();
