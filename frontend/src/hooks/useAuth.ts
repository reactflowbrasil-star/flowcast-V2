// Authentication hook

'use client';

import { useState, useEffect, useCallback } from 'react';
import { authService } from '@/services';
import { authCleanup } from '@/utils/authCleanup';
import { User, LoginRequest, UserRole } from '@/types';
import { normalizeRole } from '@/utils/auth';

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // Initialize auth state
  useEffect(() => {
    const initAuth = () => {
      try {
        const storedUser = authService.getStoredUser();
        const hasToken = authService.isAuthenticated();
        
        if (storedUser && hasToken) {
          // Normalize stored user role and ensure defaults
          const roleNormalized = normalizeRole((storedUser as any).role as any);
          const userWithDefaults: User = {
            ...(storedUser as any),
            role: roleNormalized,
            active: (storedUser as any).active ?? true,
            created_at: (storedUser as any).created_at ?? new Date().toISOString()};
          setUser(userWithDefaults);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
        // Clear potentially corrupted data
        authService.clearStoredUser();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (credentials: LoginRequest) => {
    setIsLoading(true);
    
    try {
      const result = await authService.login(credentials);
      
      if (result.success) {
        const { token, user: userData } = result.data;
        
        // Store auth data
        authService.setAuthToken(token);
        authService.setStoredUser(userData);

        // Convert UserInfo to User format
        const userWithDefaults: User = {
          ...userData,
          active: true,
          created_at: new Date().toISOString()};
        setUser(userWithDefaults);
        
        return { success: true };
      } else {
        return { 
          success: false, 
          error: result.error.details || 'Login failed' 
        };
      }
    } catch {
      return {
        success: false,
        error: 'An unexpected error occurred during login'
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Call logout API (will clear token regardless of response)
      await authService.logout();
    } catch (err) {
      console.error('Logout API error:', err);
    } finally {
      // Always clear local state
      authService.clearStoredUser();
      authCleanup.clearAllAuthData();
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const hasRole = useCallback((role: UserRole): boolean => {
    return user?.role === role;
  }, [user]);

  const hasAnyRole = useCallback((roles: UserRole[]): boolean => {
    return user ? roles.includes(user.role) : false;
  }, [user]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    hasRole,
    hasAnyRole};
}
