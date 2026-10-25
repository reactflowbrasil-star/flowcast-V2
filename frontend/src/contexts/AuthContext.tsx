'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService } from '@/services';
import { apiErrorMessage } from '@/lib/utils';
import { User, LoginRequest, UserRole, UserInfo } from '@/types';
import { getDefaultRoute } from '@/utils';
import { normalizeRole } from '@/utils/auth';
import { useTranslation } from 'react-i18next';
import { useTokenManager } from '@/hooks/useTokenManager';
import { authCleanup } from '@/utils/authCleanup';
import { ROUTES } from '@/constants';
import { mapLoginErrorMessage } from './authErrorMapping';


interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsAdminValidation: boolean; // Deprecated, always false
  pendingToken: string | null; // Deprecated, always null
  login: (credentials: LoginRequest) => Promise<{ success: boolean; error?: string; needsAdminValidation?: boolean; token?: string; user?: UserInfo }>;
  logout: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
  canAccessAdminRoutes: () => boolean;
  canAccessResellerRoutes: () => boolean;
  canManageUsers: () => boolean;
  canManageContent: () => boolean;
  refreshUser: () => Promise<void>;
  isBanned: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<boolean>(false);
  // Deprecated: needsAdminValidation and pendingToken no longer used
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { validateToken, scheduleTokenRefresh } = useTokenManager();

  const isAuthenticated = !!user;

  const isPublicPath = useMemo(() => {
    const exactRoutes = [ROUTES.HOME, ROUTES.LOGIN, ROUTES.DEMO, ROUTES.REDEEM, '/forgot-password', '/reset-password', '/banned', '/register', '/plans'];
    const prefixRoutes = [ROUTES.DEMO, ROUTES.REDEEM, '/plans'];
    if (!pathname) {
      return false;
    }
    // Use safer comparison to avoid TypeScript literal union mismatch
    return (
      exactRoutes.some((r) => r === pathname) ||
      prefixRoutes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    );
  }, [pathname]);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Perform auth health check first
        const isHealthy = authCleanup.performHealthCheck();
        if (!isHealthy) {
          setAuthError(true);
          setIsLoading(false);
          return;
        }

        const storedUser = authService.getStoredUser();
        const hasToken = authService.isAuthenticated();

        if (storedUser && hasToken && !authError) {
          const isTokenValid = await validateToken();

          if (isTokenValid) {
            const userWithDefaults: User = {
              ...storedUser,
              active: storedUser.active ?? true,
              created_at: storedUser.created_at ?? new Date().toISOString()
            };
            setUser(userWithDefaults);
            setAuthError(false);

            // Ensure token is also in cookies for middleware
            const token = typeof window !== 'undefined' ? localStorage.getItem('iptv_auth_token') : null;
            if (token && typeof window !== 'undefined') {
              document.cookie = `iptv_auth_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
            }
          } else {
            authService.clearStoredUser();
            setAuthError(true);
            if (!isPublicPath) {
              setTimeout(() => {
                router.push('/login');
              }, 100);
            }
          }
        } else {
          setUser(null);
          authService.clearStoredUser();
          if (!isPublicPath) {
            router.push('/login');
          }
        }
      } catch {
        authService.clearStoredUser();
        setAuthError(true);
        if (!isPublicPath) {
          setTimeout(() => {
            router.push('/login');
          }, 100);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [validateToken, authError, router, isPublicPath]);

  const login = useCallback(async (credentials: LoginRequest) => {
    setIsLoading(true);

    try {
      const result = await authService.login(credentials);

      if (result.success) {
        const { token, user: userData } = result.data;

        // Normalize role for all users
        const normalizedRoleStr = normalizeRole(String(userData.role) as any);
        const normalizedUserData = {
          ...(userData as any),
          role: normalizedRoleStr
        };

        // Store auth data for all users (no special validation needed)
        authService.setAuthToken(token);
        authService.setStoredUser(normalizedUserData);

        // Ensure cookie for middleware immediately after login
        if (typeof window !== 'undefined') {
          document.cookie = `iptv_auth_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
        }

        // Schedule token refresh
        scheduleTokenRefresh(token);

        // Convert UserInfo to User format
        const userWithDefaults: User = {
          ...(normalizedUserData as any),
          active: (normalizedUserData as any).active ?? true,
          created_at: new Date().toISOString(),
          role: normalizedRoleStr
        };
        setUser(userWithDefaults);

        // Note: Do NOT redirect here - let the caller (login page) handle routing
        // This prevents double navigation and weird refresh behavior

        return {
          success: true,
          user: userData,
          needsAdminValidation: false
        };
      } else {
        const errorMessage = apiErrorMessage(result as unknown, 'Login failed');
        const userFriendlyError = mapLoginErrorMessage(errorMessage, t);

        return {
          success: false,
          error: userFriendlyError
        };
      }
    } catch (error) {
      console.error('AuthContext - Login error:', error);
      return {
        success: false,
        error: t('common.networkErrorDescription')
      };
    } finally {
      setIsLoading(false);
    }
  }, [scheduleTokenRefresh, router]);

  // Deprecated: These validation functions are no longer needed
  // Admin/Reseller validation is now handled automatically by the backend based on role

  const logout = useCallback(async () => {
    setIsLoading(true);

    try {
      await authService.logout();
    } catch {
      // Logout API error handled silently
    } finally {
      setUser(null);
      setAuthError(false);
      authService.clearStoredUser();
      authCleanup.clearAllAuthData();
      setUser(null);
      setIsLoading(false);

      try {
        router.replace('/login');
      } catch {
        // Fallback to hard reload
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const storedUser = authService.getStoredUser();
      if (storedUser) {
        const userWithDefaults: User = {
          ...storedUser,
          active: storedUser.active ?? true,
          created_at: storedUser.created_at ?? new Date().toISOString()
        };
        setUser(userWithDefaults);
      }
    } catch {
      // Error refreshing user handled silently
    }
  }, []);

  // Role checking functions
  const hasRole = useCallback((role: UserRole): boolean => {
    return user?.role === role;
  }, [user]);

  const hasAnyRole = useCallback((roles: UserRole[]): boolean => {
    return user ? roles.includes(user.role) : false;
  }, [user]);

  const canAccessAdminRoutes = useCallback((): boolean => {
    return user?.role === UserRole.ADMIN;
  }, [user]);

  const canAccessResellerRoutes = useCallback((): boolean => {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.RESELLER;
  }, [user]);

  const canManageUsers = useCallback((): boolean => {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.RESELLER;
  }, [user]);

  const canManageContent = useCallback((): boolean => {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.RESELLER;
  }, [user]);

  const isBanned = useCallback((): boolean => {
    return user ? !user.active : false;
  }, [user]);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    needsAdminValidation: false, // Deprecated, always false
    pendingToken: null, // Deprecated, always null
    login,
    logout,
    hasRole,
    hasAnyRole,
    canAccessAdminRoutes,
    canAccessResellerRoutes,
    canManageUsers,
    canManageContent,
    refreshUser,
    isBanned
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// HOC for protected routes
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  requiredRoles?: UserRole[]
) {
  return function AuthenticatedComponent(props: P) {
    const { isAuthenticated, isLoading, user, hasAnyRole } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading) {
        if (!isAuthenticated) {
          router.push('/login');
          return;
        }

        if (requiredRoles && user && !hasAnyRole(requiredRoles)) {
          // Redirect to appropriate dashboard based on user role
          const defaultRoute = getDefaultRoute(user.role);
          router.push(defaultRoute);
          return;
        }
      }
    }, [isAuthenticated, isLoading, user, hasAnyRole, router]);

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return null; // Will redirect in useEffect
    }

    if (requiredRoles && user && !hasAnyRole(requiredRoles)) {
      return null; // Will redirect in useEffect
    }

    return <Component {...props} />;
  };
}
