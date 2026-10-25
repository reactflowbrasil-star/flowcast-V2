'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import { 
  Activity, 
  Users, 
  Eye, 
  Shield, 
  TrendingUp,
  Monitor,
  Smartphone,
  Tv,
  AlertTriangle,
  RefreshCw,
  Clock,
  Play
} from 'lucide-react';
import { userActivityService } from '@/services/userActivity';
import { apiErrorMessage } from '@/lib/utils';
import SecurityAlerts from './SecurityAlerts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

interface HourlyActivityData {
  hour: number;
  login_count: number;
  view_count: number;
}

export default function ActivityDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  useLoadNamespace('admin/activityDashboard');
  const { t, i18n } = useTranslation(['admin/activityDashboard', 'admin', 'translation']);

      const { data: metrics, isLoading, error, refetch } = useQuery({
        queryKey: ['dashboard-metrics'],
        queryFn: async () => {
          const result = await userActivityService.getDashboardMetrics();
          if (result.success) {
            return result.data;
          }
          throw new Error(apiErrorMessage(result.error, t('admin.activity.errorLoadingDashboardFallback')));
        },
        refetchInterval: autoRefresh ? 30000 : false, // Auto-refresh every 30 seconds
      });

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />;
      case 'tablet':
        return <Smartphone className="h-4 w-4" />;
      case 'smart tv':
      case 'tv':
        return <Tv className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const formatHourlyData = (hourlyActivity: HourlyActivityData[]) => {
    return hourlyActivity.map(item => ({
      hour: `${item.hour}:00`,
      logins: item.login_count,
      views: item.view_count,
      total: item.login_count + item.view_count
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              {t('admin.activity.errorLoadingDashboard', { message: error.message })}
            </p>
            <Button onClick={() => refetch()} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('activityDashboard.tryAgain')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Auto-refresh Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('activityDashboard.title')}</h2>
          <p className="text-muted-foreground">{t('activityDashboard.activitySubtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{t('activityDashboard.autoRefreshState', { state: autoRefresh ? t('activityDashboard.on') : t('activityDashboard.off') })}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? t('activityDashboard.disable') : t('activityDashboard.enable')}
            </Button>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('activityDashboard.refresh')}
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('activityDashboard.loginsToday')}</p>
                <p className="text-2xl font-bold">{metrics?.total_logins_today || 0}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('activityDashboard.activeUsers')}</p>
                <p className="text-2xl font-bold">{metrics?.unique_active_users || 0}</p>
                <p className="text-xs text-muted-foreground">{t('activityDashboard.last7Days')}</p>
              </div>
              <Users className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('activityDashboard.contentViews')}</p>
                <p className="text-2xl font-bold">{metrics?.total_content_views || 0}</p>
                <p className="text-xs text-muted-foreground">{t('activityDashboard.last7Days')}</p>
              </div>
              <Eye className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('activityDashboard.failedLogins')}</p>
                <p className="text-2xl font-bold text-red-600">{metrics?.failed_login_attempts || 0}</p>
                <p className="text-xs text-muted-foreground">{t('activityDashboard.today')}</p>
              </div>
              <Shield className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Activity Chart */}
        <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('activityDashboard.activity24h')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={formatHourlyData(metrics?.hourly_activity || [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                  <Area 
                  type="monotone" 
                  dataKey="logins" 
                  stackId="1"
                  stroke="#8884d8" 
                  fill="#8884d8" 
                  name={t('activityDashboard.logins')}
                />
                <Area 
                  type="monotone" 
                  dataKey="views" 
                  stackId="1"
                  stroke="#82ca9d" 
                  fill="#82ca9d" 
                  name={t('activityDashboard.views')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Device Distribution */}
        <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              {t('activityDashboard.deviceDistribution')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.device_distribution && metrics.device_distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={metrics.device_distribution as any[]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props: any) => `${props.device_type} (${(props.percentage as number).toFixed(1)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {metrics.device_distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('activityDashboard.noDeviceData')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Viewed Content */}
        <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              {t('activityDashboard.mostViewedContent')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.most_viewed_content && metrics.most_viewed_content.length > 0 ? (
              <div className="space-y-4">
                {metrics.most_viewed_content.slice(0, 5).map((content, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-600">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium">{content.content_title}</p>
                        <Badge variant="secondary" className="text-xs">
                          {content.content_type.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{content.view_count}</p>
                      <p className="text-xs text-muted-foreground">{t('activityDashboard.views')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                <div className="text-center">
                  <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('activityDashboard.noViewingData')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Users with Multiple Devices */}
        <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('activityDashboard.multiDeviceUsers')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.users_multiple_devices && metrics.users_multiple_devices.length > 0 ? (
              <div className="space-y-4">
                {metrics.users_multiple_devices.slice(0, 5).map((user, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <div className="flex gap-1 mt-1">
                        {user.devices.map((device, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {getDeviceIcon(device)}
                            <span className="ml-1">{device}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{user.device_count}</p>
                      <p className="text-xs text-muted-foreground">{t('activityDashboard.devicesLabel')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                <div className="text-center">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('activityDashboard.noMultiDeviceUsers')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Security Alerts */}
      <SecurityAlerts />
    </div>
  );
}
