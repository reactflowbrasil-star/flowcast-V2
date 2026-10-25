'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BarChart3, User, Smartphone, TrendingUp, AlertTriangle } from 'lucide-react';
import { DeviceStats } from '@/services/device';

interface DeviceStatisticsProps {
  deviceStats?: DeviceStats;
  isLoading: boolean;
}

export default function DeviceStatistics({ deviceStats, isLoading }: DeviceStatisticsProps) {
  const nsLoading = useLoadNamespace('admin/devices');
  const { t } = useTranslation('admin/devices');
  if (nsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('common.loading', { ns: 'translation' })}
          </CardTitle>
          <CardDescription>
            {t('common.loading', { ns: 'translation' })}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('devices.deviceStatistics.title')}
          </CardTitle>
          <CardDescription>
            {t('devices.activeList.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!deviceStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('devices.deviceStatistics.title')}
          </CardTitle>
          <CardDescription>
            {t('devices.activeList.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('devices.noDevicesFoundTitle')}
            </h3>
            <p className="text-gray-500">
              {t('devices.noDevicesRegistered')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getUsagePercentage = (deviceCount: number, maxDevices: number) => {
    return Math.min((deviceCount / maxDevices) * 100, 100);
  };

  const getUsageBadge = (deviceCount: number, maxDevices: number) => {
    const percentage = getUsagePercentage(deviceCount, maxDevices);
    
    if (deviceCount > maxDevices) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {t('devices.limits.badges.exceeded')}
        </Badge>
      );
    } else if (percentage >= 100) {
      return (
        <Badge variant="destructive">
          {t('devices.atLimit')}
        </Badge>
      );
    } else if (percentage >= 80) {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          {t('devices.limits.badges.warning')}
        </Badge>
      );
    } else if (percentage >= 50) {
      return (
        <Badge variant="secondary">
          {t('devices.moderateUsage', { defaultValue: 'Moderate' })}
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline">
          {t('devices.lowUsage')}
        </Badge>
      );
    }
  };

  const devicesByUser = deviceStats.devices_by_user || [];

  const averageDevicesPerUser = devicesByUser.length > 0
    ? (deviceStats.total_devices / devicesByUser.length).toFixed(1)
    : '0';

  const usersAtLimit = devicesByUser.filter(user =>
    user.device_count >= user.max_devices
  ).length;

  const totalCapacity = devicesByUser.reduce((sum, user) =>
    sum + user.max_devices, 0
  );

  const capacityUtilization = totalCapacity > 0 
    ? ((deviceStats.total_devices / totalCapacity) * 100).toFixed(1)
    : '0';
  const usageDistributionItems = [
    {
      label: t('devices.lowUsageRange', { defaultValue: 'Low Usage (0-49%)' }),
      count: devicesByUser.filter(u => getUsagePercentage(u.device_count, u.max_devices) < 50).length,
      color: 'bg-green-500'
    },
    {
      label: t('devices.moderateUsageRange', { defaultValue: 'Moderate (50-79%)' }),
      count: devicesByUser.filter(u => {
        const p = getUsagePercentage(u.device_count, u.max_devices);
        return p >= 50 && p < 80;
      }).length,
      color: 'bg-blue-500'
    },
    {
      label: t('devices.highUsageRange', { defaultValue: 'High Usage (80-99%)' }),
      count: devicesByUser.filter(u => {
        const p = getUsagePercentage(u.device_count, u.max_devices);
        return p >= 80 && p < 100;
      }).length,
      color: 'bg-yellow-500'
    },
    {
      label: t('devices.atOrOverLimitRange', { defaultValue: 'At/Over Limit (100%+)' }),
      count: devicesByUser.filter(u => u.device_count >= u.max_devices).length,
      color: 'bg-red-500'
    }
  ];

  return (
      <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          {t('devices.deviceStatistics.title')}
        </CardTitle>
        <CardDescription>
          {t('devices.activeList.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">{t('devices.avgDevicesPerUser')}</span>
            </div>
            <div className="text-2xl font-bold">{averageDevicesPerUser}</div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium">{t('devices.usersAtLimit')}</span>
            </div>
            <div className="text-2xl font-bold">{usersAtLimit}</div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">{t('devices.totalCapacity')}</span>
            </div>
            <div className="text-2xl font-bold">{totalCapacity}</div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">{t('devices.utilization')}</span>
            </div>
            <div className="text-2xl font-bold">{capacityUtilization}%</div>
          </div>
        </div>

        {/* User Device Breakdown */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">{t('devices.deviceUsageByUser.title', { defaultValue: 'Device Usage by User' })}</h3>
          
          {devicesByUser.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('devices.table.user')}</TableHead>
                  <TableHead>{t('devices.limits.table.deviceUsage')}</TableHead>
                  <TableHead>{t('devices.usageProgress', { defaultValue: 'Usage Progress' })}</TableHead>
                  <TableHead>{t('devices.table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devicesByUser
                  .sort((a, b) => {
                    // Sort by usage percentage (highest first)
                    const aPercentage = getUsagePercentage(a.device_count, a.max_devices);
                    const bPercentage = getUsagePercentage(b.device_count, b.max_devices);
                    return bPercentage - aPercentage;
                  })
                  .map((user) => {
                    const usagePercentage = getUsagePercentage(user.device_count, user.max_devices);
                    
                    return (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{user.username}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Smartphone className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {user.device_count}/{user.max_devices}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              ({usagePercentage.toFixed(0)}%)
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="w-full max-w-[200px]">
                            <Progress 
                              value={usagePercentage} 
                              className="w-full h-2"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {getUsageBadge(user.device_count, user.max_devices)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t('devices.deviceUsageByUser.none')}
              </h3>
              <p className="text-gray-500">
                {t('devices.noDevicesRegistered')}
              </p>
            </div>
          )}
        </div>

        {/* Usage Distribution */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">{t('devices.usageDistribution')}</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-3">{t('devices.byUsageLevel')}</h4>
              <div className="space-y-2">
                {usageDistributionItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-3">{t('devices.systemHealth.title')}</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t('devices.activeDevices')}</span>
                  <span className="font-medium">{deviceStats.active_devices}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t('devices.registeredDevices')}</span>
                  <span className="font-medium">{deviceStats.total_devices}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t('devices.totalCapacity')}</span>
                  <span className="font-medium">{totalCapacity}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t('devices.utilizationRate', { defaultValue: 'Utilization Rate' })}</span>
                  <span className="font-medium">{capacityUtilization}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
