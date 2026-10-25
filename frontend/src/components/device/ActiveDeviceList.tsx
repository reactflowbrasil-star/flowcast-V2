'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Search, Smartphone, User, Clock, Trash2, AlertTriangle, Wifi, WifiOff, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { deviceService, DeviceWithUser } from '@/services/device';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface ActiveDeviceListProps {
  devicesData?: {
    devices: DeviceWithUser[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  isLoading: boolean;
}

export default function ActiveDeviceList({ devicesData, isLoading }: ActiveDeviceListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  // const [selectedDevice, setSelectedDevice] = useState<DeviceWithUser | null>(null);

  const queryClient = useQueryClient();
  useLoadNamespace('admin/devices');
  const { t } = useTranslation('admin/devices');

  // Force disconnect device mutation
  const forceDisconnectMutation = useMutation({
    mutationFn: async ({ userId, deviceId }: { userId: number; deviceId: string }) => {
      const result = await deviceService.forceDisconnectDevice(userId, deviceId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-stats'] });
      // setSelectedDevice(null);
    }});

  // Remove device mutation
  const removeDeviceMutation = useMutation({
    mutationFn: async ({ userId, deviceId }: { userId: number; deviceId: string }) => {
      const result = await deviceService.removeUserDevice(userId, deviceId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-stats'] });
      // setSelectedDevice(null);
    }});

  const handleForceDisconnect = (device: DeviceWithUser) => {
    forceDisconnectMutation.mutate({
      userId: device.user_id,
      deviceId: device.device_id});
  };

  const handleRemoveDevice = (device: DeviceWithUser) => {
    removeDeviceMutation.mutate({
      userId: device.user_id,
      deviceId: device.device_id});
  };

  const formatLastActive = (lastActive: string) => {
    const date = new Date(lastActive);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return t('devices.activeList.time.justNow');
    if (diffInMinutes < 60) return t('devices.activeList.time.minutesAgo', { count: diffInMinutes });
    if (diffInMinutes < 1440) return t('devices.activeList.time.hoursAgo', { count: Math.floor(diffInMinutes / 60) });
    return t('devices.activeList.time.daysAgo', { count: Math.floor(diffInMinutes / 1440) });
  };

  const isDeviceActive = (lastActive: string) => {
    const date = new Date(lastActive);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    return diffInMinutes < 5; // Consider active if last seen within 5 minutes
  };

  const getDeviceStatusBadge = (device: DeviceWithUser) => {
    const active = isDeviceActive(device.last_active);
    return (
      <Badge variant={active ? "default" : "secondary"} className="flex items-center gap-1">
        {active ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {active ? t('devices.common.active') : t('devices.common.inactive')}
      </Badge>
    );
  };

  const getUserDeviceCount = (userId: number) => {
    if (!devicesData) return 0;
    return devicesData.devices.filter(device => device.user_id === userId).length;
  };

  const isUserAtLimit = (device: DeviceWithUser) => {
    const deviceCount = getUserDeviceCount(device.user_id);
    return deviceCount >= device.max_devices;
  };

  // Get unique users for filter
  const uniqueUsers = React.useMemo(() => {
    if (!devicesData?.devices) return [];
    const users = new Set(devicesData.devices.map(d => d.username));
    return Array.from(users).sort();
  }, [devicesData]);

  // Filter devices based on search query, status, and user
  const filteredDevices = React.useMemo(() => {
    if (!devicesData?.devices) return [];

    return devicesData.devices.filter(device => {
      // Search filter
      const matchesSearch =
        device.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.device_id.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isDeviceActive(device.last_active)) ||
        (statusFilter === 'inactive' && !isDeviceActive(device.last_active));

      // User filter
      const matchesUser = userFilter === 'all' || device.username === userFilter;

      return matchesSearch && matchesStatus && matchesUser;
    });
  }, [devicesData, searchQuery, statusFilter, userFilter]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('devices.activeDevices')}</CardTitle>
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('devices.activeDevices')}</CardTitle>
            <CardDescription>
              {t('devices.activeList.description')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('devices.activeList.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t('devices.filters.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('devices.filters.all')}</SelectItem>
                <SelectItem value="active">{t('devices.filters.active')}</SelectItem>
                <SelectItem value="inactive">{t('devices.filters.inactive')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('devices.filters.user')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('devices.filters.allUsers')}</SelectItem>
                {uniqueUsers.map(username => (
                  <SelectItem key={username} value={username}>{username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredDevices.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('devices.table.device')}</TableHead>
                <TableHead>{t('devices.table.user')}</TableHead>
                <TableHead>{t('devices.table.status')}</TableHead>
                <TableHead>{t('devices.table.lastActive')}</TableHead>
                <TableHead>{t('devices.table.deviceLimit')}</TableHead>
                <TableHead>{t('devices.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((device) => (
                <TableRow key={`${device.user_id}-${device.device_id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{device.device_name}</div>
                      <div className="text-sm text-muted-foreground">
                          {t('devices.activeList.deviceId', { id: device.device_id })}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{device.username}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getDeviceStatusBadge(device)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {formatLastActive(device.last_active)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={isUserAtLimit(device) ? "destructive" : "outline"}
                        className="flex items-center gap-1"
                      >
                        {isUserAtLimit(device) && <AlertTriangle className="h-3 w-3" />}
                        {getUserDeviceCount(device.user_id)}/{device.max_devices}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleForceDisconnect(device)}
                        disabled={forceDisconnectMutation.isPending}
                      >
                        <WifiOff className="h-3 w-3 mr-1" />
                        {t('devices.activeList.actions.disconnect')}
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={removeDeviceMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            {t('devices.remove')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('devices.activeList.removeDialog.title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('devices.activeList.removeDialog.description', { device: device.device_name, user: device.username })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('devices.common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveDevice(device)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {t('devices.removeDevice')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8">
            <Smartphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('devices.activeList.emptyTitle')}
            </h3>
            <p className="text-gray-500 mb-4">
              {searchQuery
                ? t('devices.activeList.noDevicesSearch', { query: searchQuery })
                : t('devices.activeList.noDevicesDescription')
              }
            </p>
          </div>
        )}

        {/* Error Display */}
        {(forceDisconnectMutation.error || removeDeviceMutation.error) && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {forceDisconnectMutation.error?.message || removeDeviceMutation.error?.message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
