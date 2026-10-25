'use client';

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, User, Smartphone, Settings, CheckCircle, XCircle } from 'lucide-react';
import { DeviceStats } from '@/services/device';
import { userService } from '@/services/user';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface DeviceLimitWarningProps {
  deviceStats?: DeviceStats;
  isLoading: boolean;
}

interface UserDeviceInfo {
  user_id: number;
  username: string;
  device_count: number;
  max_devices: number;
  usage_percentage: number;
  warning_level: 'safe' | 'warning' | 'critical' | 'exceeded';
}

export default function DeviceLimitWarning({ deviceStats, isLoading }: DeviceLimitWarningProps) {
  // const [selectedUser, setSelectedUser] = useState<UserDeviceInfo | null>(null);
  
  const queryClient = useQueryClient();
  useLoadNamespace('admin/devices');
  const { t } = useTranslation('admin/devices');

  // Update user device limit mutation
  const updateDeviceLimitMutation = useMutation({
    mutationFn: async ({ userId, maxDevices }: { userId: number; maxDevices: number }) => {
      const result = await userService.updateUser(userId, { max_devices: maxDevices });
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-devices'] });
      // setSelectedUser(null);
    }});

  const getWarningLevel = (deviceCount: number, maxDevices: number): UserDeviceInfo['warning_level'] => {
    const percentage = (deviceCount / maxDevices) * 100;
    
    if (deviceCount > maxDevices) return 'exceeded';
    if (percentage >= 100) return 'critical';
    if (percentage >= 80) return 'warning';
    return 'safe';
  };

  const getWarningBadge = (level: UserDeviceInfo['warning_level']) => {
    switch (level) {
      case 'safe':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            {t('devices.limits.badges.safe')}
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 text-yellow-700">
            <AlertTriangle className="h-3 w-3" />
            {t('devices.limits.badges.warning')}
          </Badge>
        );
      case 'critical':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {t('devices.limits.badges.critical')}
          </Badge>
        );
      case 'exceeded':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            {t('devices.limits.badges.exceeded')}
          </Badge>
        );
    }
  };

  // const getProgressColor = (level: UserDeviceInfo['warning_level']) => {
  //   switch (level) {
  //     case 'safe':
  //       return 'bg-green-500';
  //     case 'warning':
  //       return 'bg-yellow-500';
  //     case 'critical':
  //     case 'exceeded':
  //       return 'bg-red-500';
  //   }
  // };

  const handleIncreaseLimit = (user: UserDeviceInfo) => {
    updateDeviceLimitMutation.mutate({
      userId: user.user_id,
      maxDevices: user.max_devices + 1});
  };

  // Process device stats into user device info
  const userDeviceInfo: UserDeviceInfo[] = deviceStats?.devices_by_user?.map(user => {
    const usagePercentage = (user.device_count / user.max_devices) * 100;
    const warningLevel = getWarningLevel(user.device_count, user.max_devices);

    return {
      user_id: user.user_id,
      username: user.username,
      device_count: user.device_count,
      max_devices: user.max_devices,
      usage_percentage: Math.min(usagePercentage, 100),
      warning_level: warningLevel};
  }) || [];

  // Filter users that need attention (warning, critical, or exceeded)
  const usersNeedingAttention = userDeviceInfo.filter(user => 
    user.warning_level !== 'safe'
  );

  // Sort by warning level priority
  const sortedUsers = usersNeedingAttention.sort((a, b) => {
    const levelPriority = { exceeded: 4, critical: 3, warning: 2, safe: 1 };
    return levelPriority[b.warning_level] - levelPriority[a.warning_level];
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('devices.limits.title')}</CardTitle>
          <CardDescription>
            {t('devices.limits.subtitle')}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('devices.limits.title')}</CardTitle>
        <CardDescription>
          {t('devices.limits.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('devices.limits.summary.warningTitle')}</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userDeviceInfo.filter(u => u.warning_level === 'warning').length}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('devices.limits.summary.warningDescription')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('devices.limits.summary.criticalTitle')}</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userDeviceInfo.filter(u => u.warning_level === 'critical').length}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('devices.limits.summary.criticalDescription')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('devices.limits.summary.exceededTitle')}</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userDeviceInfo.filter(u => u.warning_level === 'exceeded').length}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('devices.limits.summary.exceededDescription')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Users Needing Attention */}
        {sortedUsers.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t('devices.limits.attention.title')}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('devices.table.user')}</TableHead>
                  <TableHead>{t('devices.limits.table.deviceUsage')}</TableHead>
                  <TableHead>{t('devices.limits.table.progress')}</TableHead>
                  <TableHead>{t('devices.limits.table.warningLevel')}</TableHead>
                  <TableHead>{t('devices.common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map((user) => (
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
                          {t('devices.overview.deviceCount', { count: user.device_count, max: user.max_devices })}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ({user.usage_percentage.toFixed(0)}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="w-full">
                        <Progress 
                          value={user.usage_percentage} 
                          className="w-full h-2"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      {getWarningBadge(user.warning_level)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.warning_level === 'exceeded' || user.warning_level === 'critical' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleIncreaseLimit(user)}
                            disabled={updateDeviceLimitMutation.isPending}
                          >
                            <Settings className="h-3 w-3 mr-1" />
                            {t('devices.limits.actions.increaseLimit')}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                          >
                            {t('devices.limits.actions.monitor')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('devices.limits.allSafeTitle')}
            </h3>
            <p className="text-gray-500">
              {t('devices.limits.allSafeDescription')}
            </p>
          </div>
        )}

        {/* All Users Overview */}
        {userDeviceInfo.length > 0 && (
          <div className="mt-8 space-y-4">
            <h3 className="text-lg font-medium">{t('devices.limits.allUsersTitle')}</h3>
            <div className="grid gap-2">
              {userDeviceInfo.map((user) => (
                <div key={user.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{user.username}</span>
                    <span className="text-sm text-muted-foreground">
                      {t('devices.overview.deviceCount', { count: user.device_count, max: user.max_devices })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24">
                      <Progress 
                        value={user.usage_percentage} 
                        className="h-2"
                      />
                    </div>
                    {getWarningBadge(user.warning_level)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Display */}
        {updateDeviceLimitMutation.error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {updateDeviceLimitMutation.error.message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
