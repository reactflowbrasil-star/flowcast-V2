'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Video, UserCheck, BarChart3, Settings } from 'lucide-react';
import { userService, configService } from '@/services';
import { UserRole } from '@/types';
import { StatsCardSkeleton } from '@/components/ui/skeleton-loader';
import { SystemMetrics } from '@/components/admin/SystemMetrics';
import { AdminSectionHeader } from './AdminSectionHeader';

export default function AdminOverview() {
  const router = useRouter();
  useLoadNamespace('admin/overview');
  const { t } = useTranslation('admin/overview');

  // Fetch total users with auto-refresh
  const { data: totalUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-stats-users'],
    queryFn: async () => {
      const result = await userService.getUsers();
      if (result.success) {
        return result.data?.length ?? 0;
      }
      return 0;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false
  });

  // Fetch system stats (includes content totals with multiplier)
  const { data: systemStats, isLoading: loadingSystemStats } = useQuery({
    queryKey: ['admin-system-stats'],
    queryFn: async () => {
      const result = await configService.getSystemStats();
      if (result.success && result.data) {
        return result.data;
      }
      return undefined;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false
  });

  // Fetch active resellers with auto-refresh
  const { data: activeResellers, isLoading: loadingResellers } = useQuery({
    queryKey: ['admin-stats-resellers'],
    queryFn: async () => {
      const result = await userService.getUsers({ role: UserRole.RESELLER, active: true });
      if (result.success) {
        return result.data?.length ?? 0;
      }
      return 0;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false
  });

  const isLoading = loadingUsers || loadingSystemStats || loadingResellers;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={BarChart3}
        title={t('sidebar.overview', { ns: 'translation', defaultValue: 'Overview' })}
        description={t('layout.adminDashboard', { ns: 'translation', defaultValue: 'Admin Dashboard' })}
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loadingUsers ? (
          <StatsCardSkeleton />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">{t('overview.totalUsers')}</p>
                  <p className="text-2xl font-bold text-foreground">{totalUsers || 0}</p>
                  <p className="text-xs text-muted-foreground">{t('overview.allSystemUsers')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loadingSystemStats ? (
          <StatsCardSkeleton />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Video className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">{t('overview.contentItems')}</p>
                  <p className="text-2xl font-bold text-foreground">{systemStats?.total_content ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{t('overview.moviesTvSeries')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loadingResellers ? (
          <StatsCardSkeleton />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <UserCheck className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">{t('overview.activeResellers')}</p>
                  <p className="text-2xl font-bold text-foreground">{activeResellers || 0}</p>
                  <p className="text-xs text-muted-foreground">{t('overview.currentlyActive')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <BarChart3 className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">{t('overview.systemStatus')}</p>
                <p className="text-2xl font-bold text-green-600">{t('layout.online')}</p>
                <p className="text-xs text-muted-foreground">{t('overview.allSystemsOperational')} · <span className="font-medium">v1.2.0</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-foreground">{t('overview.quickActions')}</h3>
            <p className="text-sm text-muted-foreground">{t('overview.commonTasks')}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              variant="outline"
              className="h-20 flex flex-col"
              onClick={() => router.push('/admin?tab=resellers')}
            >
              <UserCheck className="h-6 w-6 mb-2" />
              <span className="text-sm">{t('overview.manageResellers')}</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex flex-col"
              onClick={() => router.push('/admin?tab=content')}
            >
              <Video className="h-6 w-6 mb-2" />
              <span className="text-sm">{t('overview.manageContent')}</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex flex-col"
              onClick={() => router.push('/admin?tab=settings')}
            >
              <Settings className="h-6 w-6 mb-2" />
              <span className="text-sm">{t('overview.systemConfig')}</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex flex-col"
              onClick={() => router.push('/admin?tab=devices')}
            >
              <BarChart3 className="h-6 w-6 mb-2" />
              <span className="text-sm">{t('overview.viewReports')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Real-Time System Metrics Graphs */}
      <SystemMetrics />

      {/* System Health */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-foreground">{t('overview.systemHealth')}</h3>
            <p className="text-sm text-muted-foreground">{t('overview.systemStatusDescription')}</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                <span className="text-sm font-medium text-foreground">{t('overview.apiServices')}</span>
              </div>
              <span className="text-sm text-green-600">{t('overview.operational')}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                <span className="text-sm font-medium text-foreground">{t('overview.database')}</span>
              </div>
              <span className="text-sm text-green-600">{t('overview.operational')}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                <span className="text-sm font-medium text-foreground">{t('overview.contentDelivery')}</span>
              </div>
              <span className="text-sm text-green-600">{t('overview.operational')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
