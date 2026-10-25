'use client';

import { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useRouter } from 'next/navigation';
import { useBannedRedirect } from '@/hooks/useBannedRedirect';
import { useLicense } from '@/hooks/useLicense';
import { Loader2 } from 'lucide-react';

import { AdminRoute } from '@/components/auth/ProtectedRoute';
import AdminLayout from '@/components/layout/AdminLayout';
import LicenseActivation from '@/components/admin/LicenseActivation';
import LicenseRequiredOverlay from '@/components/admin/LicenseRequiredOverlay';
import { useTranslation } from 'react-i18next';

// Lazy load heavy components
const AdminOverview = lazy(() => import('@/components/admin/AdminOverview'));
const ResellerManagement = lazy(() => import('@/components/admin/ResellerManagement'));
const AdminEndUserManagement = lazy(() => import('@/components/admin/EndUserManagement'));
const ContentManagement = lazy(() => import('@/components/admin/ContentManagement'));
const GiftCodesManagement = lazy(() => import('@/components/admin/GiftCodesManagement'));
const DemosManagement = lazy(() => import('@/components/admin/DemosManagement'));
const SystemConfiguration = lazy(() => import('@/components/admin/SystemConfiguration'));
const CreditsPricingConfig = lazy(() => import('@/components/admin/CreditsPricingConfig'));
const SettingsPage = lazy(() => import('@/components/admin/SettingsPage'));
const DeviceManagementInterface = lazy(() => import('@/components/device/DeviceManagementInterface'));
const ActivityLogs = lazy(() => import('@/components/admin/ActivityLogs'));
const TicketManagement = lazy(() => import('@/components/admin/TicketManagement'));
const SecurityPanel = lazy(() => import('@/components/admin/SecurityPanel'));
const MasterApiKeyManagement = lazy(() => import('@/components/admin/MasterApiKeyManagement'));
const EpgManagement = lazy(() => import('@/components/admin/EpgManagement'));
const MediaScannerSimple = lazy(() => import('@/components/admin/MediaScannerSimple'));
const BillingDashboard = lazy(() => import('@/components/admin/BillingDashboard'));
const EmailSettings = lazy(() => import('@/components/admin/EmailSettings'));
const AppVersionsManagement = lazy(() => import('@/components/admin/AppVersionsManagement'));
const PackageManagement = lazy(() => import('@/components/admin/PackageManagement'));
const DirectSubscriptionsDashboard = lazy(() => import('@/components/admin/DirectSubscriptionsDashboard'));

// Loading fallback component
function TabLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  );
}


function AdminDashboardContent() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams?.get('tab') ?? 'overview';
  const { t } = useTranslation();

  // License state
  const { status: licenseStatus, isLoading: licenseLoading, isExtended, isLicensed, refreshType } = useLicense();
  const [licenseGateDismissed, setLicenseGateDismissed] = useState(false);

  // Redirect banned users
  useBannedRedirect();

  // Redirect to login if not authenticated (after loading completes)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login?redirect=/admin');
    }
  }, [isLoading, isAuthenticated, router]);

  const breadcrumbMap: Record<string, { label: string; href?: string }[]> = useMemo(() => ({
    overview: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.overview') }],
    resellers: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.resellers') }],
    users: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.users') }],
    demos: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.demos') }],
    content: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.content') }],
    'media-scanner': [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.media-scanner') }],
    'gift-codes': [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.gift-codes') }],
    devices: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.devices') }],
    tickets: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.tickets') }],
    logs: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.logs') }],
    security: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.security') }],
    'master-keys': [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.master-keys') }],
    billing: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.billing') }],
    email: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.email') }],
    'app-versions': [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.app-versions') }],
    settings: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.settings') }],
    epg: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.epg') }],
    packages: [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.packages') }],
    'direct-subscriptions': [{ label: t('breadcrumb.admin'), href: '/admin' }, { label: t('sidebar.direct-subscriptions') }]
  }), [t]);

  const isReady = !isLoading && isAuthenticated && user?.role === 'admin';

  // Early returns to prevent re-rendering
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Will redirect via useEffect, show loading in the meantime
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-destructive">{t('admin.dashboard.accessDenied')}</div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-foreground">{t('admin.dashboard.preparing')}</div>
      </div>
    );
  }

  // License activation gate — show on first access if no license found
  if (!licenseLoading && !licenseGateDismissed && licenseStatus && !licenseStatus.licensed) {
    return (
      <LicenseActivation
        onActivated={() => {
          setLicenseGateDismissed(true);
          refreshType();
        }}
      />
    );
  }

  // Helper: tabs that require Extended License (monetization features)
  const extendedOnlyTabs = ['billing', 'resellers', 'gift-codes'];
  const showExtendedOverlay = extendedOnlyTabs.includes(activeTab) && !isExtended;

  // Helper: tabs that require ANY license (end-user features)
  const licensedOnlyTabs = ['users', 'packages', 'direct-subscriptions'];
  const showLicenseOverlay = licensedOnlyTabs.includes(activeTab) && !isLicensed && !licenseGateDismissed;

  return (
    <AdminRoute>
      <AdminLayout breadcrumbs={breadcrumbMap[activeTab] ?? [{ label: t('breadcrumb.admin'), href: '/admin' }]}>
        <Suspense fallback={<TabLoadingFallback />}>
          {/* License overlay REPLACES gated tab content entirely */}
          {showExtendedOverlay ? (
            <LicenseRequiredOverlay
              featureName={
                activeTab === 'billing' ? 'Billing' :
                  activeTab === 'resellers' ? 'Reseller Management' :
                    'Gift Codes'
              }
              requiredLicense="Extended License"
            />
          ) : showLicenseOverlay ? (
            <LicenseRequiredOverlay
              featureName="End User Management"
              requiredLicense="any"
            />
          ) : (
            <>
              {activeTab === 'overview' && <AdminOverview />}
              {activeTab === 'resellers' && <ResellerManagement />}
              {activeTab === 'users' && <AdminEndUserManagement />}
              {activeTab === 'content' && <ContentManagement />}
              {activeTab === 'media-scanner' && <MediaScannerSimple />}
              {activeTab === 'demos' && <DemosManagement />}
              {activeTab === 'devices' && <DeviceManagementInterface />}
              {activeTab === 'tickets' && <TicketManagement />}
              {activeTab === 'logs' && <ActivityLogs />}
              {activeTab === 'security' && <SecurityPanel />}
              {activeTab === 'master-keys' && <MasterApiKeyManagement />}
              {activeTab === 'billing' && <BillingDashboard />}
              {activeTab === 'email' && <EmailSettings />}
              {activeTab === 'settings' && <SettingsPage />}
              {activeTab === 'epg' && <EpgManagement />}
              {activeTab === 'gift-codes' && <GiftCodesManagement />}
              {activeTab === 'app-versions' && <AppVersionsManagement />}
              {activeTab === 'packages' && <PackageManagement />}
              {activeTab === 'direct-subscriptions' && <DirectSubscriptionsDashboard />}
            </>
          )}
        </Suspense>
      </AdminLayout>
    </AdminRoute>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}
