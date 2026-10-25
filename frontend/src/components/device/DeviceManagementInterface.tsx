'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Smartphone, Users, BarChart3, AlertTriangle } from 'lucide-react';
import { deviceService } from '@/services/device';
import ActiveDeviceList from './ActiveDeviceList';
import DeviceRemovalInterface from './DeviceRemovalInterface';
import DeviceLimitWarning from './DeviceLimitWarning';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { AdminSectionHeader } from '@/components/admin/AdminSectionHeader';


interface DeviceManagementInterfaceProps {
  className?: string;
}

export default function DeviceManagementInterface({ className }: DeviceManagementInterfaceProps) {
  const [activeTab, setActiveTab] = useState('overview');
  // Load admin/devices namespace and use it exclusively to avoid raw dotted keys
  useLoadNamespace('admin/devices');
  const { t } = useTranslation('admin/devices');

  // Fetch device statistics
  const { data: deviceStats, isLoading: isStatsLoading, error: statsError } = useQuery({
    queryKey: ['device-stats'],
    queryFn: async () => {
      const result = await deviceService.getDeviceStats();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    }
  });

  // Fetch all devices for admin view
  const { data: allDevicesData, isLoading: isDevicesLoading, error: devicesError } = useQuery({
    queryKey: ['all-devices'],
    queryFn: async () => {
      const result = await deviceService.getAllDevices();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    }
  });

  if (statsError || devicesError) {
    return (
      <div className={`space-y-6 max-w-[1400px] mx-auto w-full ${className || ''}`}>
        <AdminSectionHeader
          icon={Smartphone}
          title={t('devices.title')}
          description={t('devices.description')}
        />
        <Card>
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t('devices.errors.loadFailed')}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 max-w-[1400px] mx-auto w-full ${className || ''}`}>
      <AdminSectionHeader
        icon={Smartphone}
        title={t('devices.title')}
        description={t('devices.description')}
      />

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                {t('devices.overviewTitle')}
              </TabsTrigger>
              <TabsTrigger value="active-devices" className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                {t('devices.activeDevices')}
              </TabsTrigger>
              <TabsTrigger value="device-removal" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t('devices.deviceRemoval')}
              </TabsTrigger>
              <TabsTrigger value="warnings" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t('devices.warnings')}
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Total Devices */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('devices.totalDevices')}</CardTitle>
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isStatsLoading ? '...' : deviceStats?.total_devices || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('devices.registeredDevices')}
                    </p>
                  </CardContent>
                </Card>

                {/* Active Devices */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('devices.activeDevices')}</CardTitle>
                    <Smartphone className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isStatsLoading ? '...' : deviceStats?.active_devices || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('devices.currentlyConnected')}
                    </p>
                  </CardContent>
                </Card>

                {/* Users with Devices */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('devices.usersWithDevices')}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isStatsLoading ? '...' : deviceStats?.users_with_devices || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('devices.activeUsers')}
                    </p>
                  </CardContent>
                </Card>

                {/* Device Limit Warnings */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('devices.limitWarnings')}</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isStatsLoading ? '...' : deviceStats?.users_at_limit || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('devices.usersAtLimit')}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Device Statistics Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    {t('devices.deviceStatistics.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('devices.statsDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Summary Metrics */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">{t('devices.avgDevicesPerUser')}</span>
                      </div>
                      <div className="text-2xl font-bold">
                        {isStatsLoading ? '...' : deviceStats?.avg_devices_per_user?.toFixed(1) || '0'}
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-medium">{t('devices.usersAtLimit')}</span>
                      </div>
                      <div className="text-2xl font-bold">
                        {isStatsLoading ? '...' : deviceStats?.users_at_limit || 0}
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Smartphone className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">{t('devices.totalCapacity')}</span>
                      </div>
                      <div className="text-2xl font-bold">
                        {isStatsLoading ? '...' : deviceStats?.total_capacity || 0}
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium">{t('devices.utilization')}</span>
                      </div>
                      <div className="text-2xl font-bold">
                        {isStatsLoading ? '...' : `${deviceStats?.utilization || 0}%`}
                      </div>
                    </div>
                  </div>

                  {/* Device Usage by User */}
                  <div>
                    <h3 className="text-lg font-medium mb-4">{t('devices.usageByUserTitle')}</h3>
                    {!deviceStats?.devices_by_user || deviceStats.devices_by_user.length === 0 ? (
                      <div className="text-center py-8">
                        <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                        <h3 className="mb-2 text-lg font-medium text-foreground">
                          {t('devices.deviceUsageByUser.none')}
                        </h3>
                        <p className="text-muted-foreground">
                          {t('devices.usageByUserDescription')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {deviceStats.devices_by_user.map((user) => (
                          <div key={user.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{user.username}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-muted-foreground">
                                {t('devices.overview.deviceCount', { count: user.device_count, max: user.max_devices })}
                              </span>
                              <div className="h-2 w-24 rounded-full bg-muted">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${Math.min((user.device_count / user.max_devices) * 100, 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Usage Distribution */}
                  <div>
                    <h3 className="text-lg font-medium mb-4">{t('devices.usageDistribution')}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-medium mb-2">{t('devices.byUsageLevel')}</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                              <span className="text-sm">{t('devices.lowUsage')}</span>
                            </div>
                            <span className="text-sm font-medium">0</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium mb-2">{t('devices.systemHealth.title')}</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{t('devices.activeDevices')}</span>
                            <span className="text-sm font-medium">{deviceStats?.active_devices || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Active Devices Tab */}
            <TabsContent value="active-devices">
              <ActiveDeviceList
                devicesData={allDevicesData}
                isLoading={isDevicesLoading}
              />
            </TabsContent>

            {/* Device Removal Tab */}
            <TabsContent value="device-removal">
              <DeviceRemovalInterface
                devicesData={allDevicesData}
                isLoading={isDevicesLoading}
              />
            </TabsContent>

            {/* Warnings Tab */}
            <TabsContent value="warnings">
              <DeviceLimitWarning
                deviceStats={deviceStats}
                isLoading={isStatsLoading}
              />
            </TabsContent>


          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
