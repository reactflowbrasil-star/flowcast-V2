'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types';
import { getDefaultRoute, sanitizeRedirectPath } from '@/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Shield, ArrowLeft } from 'lucide-react';
import { deviceService } from '@/services';
import { getOrCreateBrowserDevice } from '@/utils/device';
import { ROUTES } from '@/constants/app';


interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  fallbackComponent?: React.ComponentType;
  showUnauthorized?: boolean;
}

function LoadingSpinner() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">{t('common.loading')}</p>
      </div>
    </div>
  );
}

function UnauthorizedAccess({ userRole, requiredRoles }: { userRole: UserRole; requiredRoles: UserRole[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();

  const handleGoToDashboard = () => {
    const defaultRoute = getDefaultRoute(userRole);
    router.push(defaultRoute);
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <Shield className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-xl font-semibold text-gray-900">
            {t('auth.accessDenied')}
          </CardTitle>
          <CardDescription>
            {t('auth.noPermissionDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm">
                <p className="text-red-800 font-medium">{t('auth.noPermissionTitle')}</p>
                <p className="text-red-700 mt-1">
                  {t('auth.permissionDetail', { role: userRole, required: requiredRoles.join(', ') })}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={handleGoToDashboard}
              className="flex-1"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('auth.goToDashboard')}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="flex-1"
            >
              {t('common.logout')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProtectedRoute({ 
  children, 
  requiredRoles, 
  fallbackComponent: FallbackComponent,
  showUnauthorized = true 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, hasAnyRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setHasCheckedAuth(true);

      if (!isAuthenticated) {
        const safePath = sanitizeRedirectPath(pathname) ?? '/';
        const loginUrl = `/login?redirect=${encodeURIComponent(safePath)}`;
        router.push(loginUrl);
        return;
      }

      if (requiredRoles && user && !hasAnyRole(requiredRoles)) {
        if (!showUnauthorized) {
          const defaultRoute = getDefaultRoute(user.role);
          router.push(defaultRoute);
        }
        return;
      }
    }
  }, [isAuthenticated, isLoading, user, hasAnyRole, requiredRoles, router, pathname, showUnauthorized, hasCheckedAuth]);

  // Enforce device registration for end users across all protected routes
  React.useEffect(() => {
    if (!hasCheckedAuth || isLoading) return;
    if (!isAuthenticated || !user) return;
    // Only for end users
    if (user.role !== UserRole.END_USER) return;

    const path = pathname || '';
    // Allow device page itself
    if (path.startsWith(ROUTES.USER.DEVICES)) return;

    let mounted = true;
    (async () => {
      try {
        const { id: thisDeviceId } = getOrCreateBrowserDevice();
        const res = await deviceService.getUserDevices();
        if (!mounted) return;
        if (!res.success || !res.data) return;

        const devices = res.data.devices || [];
        const max = res.data.max_devices ?? user.max_devices ?? 0;
        const exists = devices.some((d: any) => d.device_id === thisDeviceId);

        if (!exists) {
          if (max > 0 && devices.length >= max) {
            router.push(`${ROUTES.USER.DEVICES}?onboarding=limit`);
          } else {
            router.push(`${ROUTES.USER.DEVICES}?onboarding=1`);
          }
        }
      } catch {
        // fail-open to avoid breaking navigation if API fails
      }
    })();
    return () => { mounted = false; };
  }, [hasCheckedAuth, isLoading, isAuthenticated, user?.role, pathname, router]);

  if (isLoading || !hasCheckedAuth) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <LoadingSpinner />;
  }

  if (requiredRoles && user) {
    if (!hasAnyRole(requiredRoles)) {
      if (showUnauthorized) {
        return <UnauthorizedAccess userRole={user.role} requiredRoles={requiredRoles} />;
      } else {
        return <LoadingSpinner />;
      }
    }
  }

  if (FallbackComponent) {
    return <FallbackComponent />;
  }

  return <>{children}</>;
}

// Higher-order component for easier usage
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  requiredRoles?: UserRole[],
  options?: {
    showUnauthorized?: boolean;
    fallbackComponent?: React.ComponentType;
  }
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute 
        requiredRoles={requiredRoles}
        showUnauthorized={options?.showUnauthorized}
        fallbackComponent={options?.fallbackComponent}
      >
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

// Specific role-based protection components
export function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      {children}
    </ProtectedRoute>
  );
}

export function ResellerRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.RESELLER]}>
      {children}
    </ProtectedRoute>
  );
}

export function UserRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.RESELLER, UserRole.END_USER]}>
      {children}
    </ProtectedRoute>
  );
}
