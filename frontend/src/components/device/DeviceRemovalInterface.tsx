'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Smartphone, User, Trash2, AlertTriangle, CheckCircle, Ban } from 'lucide-react';
import { deviceService, DeviceWithUser } from '@/services/device';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface DeviceRemovalInterfaceProps {
  devicesData?: {
    devices: DeviceWithUser[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  isLoading: boolean;
}

export default function DeviceRemovalInterface({ devicesData, isLoading }: DeviceRemovalInterfaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  useLoadNamespace('admin/devices');
  const { t } = useTranslation('admin/devices');
  
  const queryClient = useQueryClient();

  // Remove single device mutation (without blacklisting)
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
      queryClient.invalidateQueries({ queryKey: ['blacklisted-devices'] });
    }});

  // Remove and blacklist device mutation
  const removeAndBlacklistDeviceMutation = useMutation({
    mutationFn: async ({ userId, deviceId }: { userId: number; deviceId: string }) => {
      // Use the new API endpoint for remove and blacklist
      const result = await deviceService.removeAndBlacklistUserDevice(userId, deviceId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-stats'] });
      queryClient.invalidateQueries({ queryKey: ['blacklisted-devices'] });
    }});

  // Blacklist device mutation (without removing)
  const blacklistDeviceMutation = useMutation({
    mutationFn: async ({ userId, deviceId }: { userId: number; deviceId: string }) => {
      const result = await deviceService.blacklistUserDevice(userId, deviceId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-stats'] });
      queryClient.invalidateQueries({ queryKey: ['blacklisted-devices'] });
    }});

  // Remove multiple devices mutation
  const removeBulkDevicesMutation = useMutation({
    mutationFn: async (deviceIds: string[]) => {
      const devices = devicesData?.devices.filter(device => 
        deviceIds.includes(`${device.user_id}-${device.device_id}`)
      ) || [];
      
      const results = await Promise.allSettled(
        devices.map(device => 
          deviceService.removeUserDevice(device.user_id, device.device_id)
        )
      );
      
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length > 0) {
        throw new Error(t('devices.removal.bulkRemoveFailed', { count: failures.length }));
      }
      
      return { removed: devices.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-stats'] });
      setSelectedDevices(new Set());
      setShowConfirmDialog(false);
    }});

  const handleSingleRemove = (device: DeviceWithUser) => {
    removeDeviceMutation.mutate({
      userId: device.user_id,
      deviceId: device.device_id});
  };

  const handleRemoveAndBlacklist = (device: DeviceWithUser) => {
    removeAndBlacklistDeviceMutation.mutate({
      userId: device.user_id,
      deviceId: device.device_id});
  };

  const handleBlacklist = (device: DeviceWithUser) => {
    blacklistDeviceMutation.mutate({
      userId: device.user_id,
      deviceId: device.device_id});
  };

  const handleBulkRemove = () => {
    if (selectedDevices.size > 0) {
      removeBulkDevicesMutation.mutate(Array.from(selectedDevices));
    }
  };

  const handleSelectDevice = (deviceKey: string, checked: boolean) => {
    const newSelected = new Set(selectedDevices);
    if (checked) {
      newSelected.add(deviceKey);
    } else {
      newSelected.delete(deviceKey);
    }
    setSelectedDevices(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allDeviceKeys = filteredDevices.map(device => 
        `${device.user_id}-${device.device_id}`
      );
      setSelectedDevices(new Set(allDeviceKeys));
    } else {
      setSelectedDevices(new Set());
    }
  };

  const getUserDeviceCount = (userId: number) => {
    if (!devicesData) return 0;
    return devicesData.devices.filter(device => device.user_id === userId).length;
  };

  const isUserAtLimit = (device: DeviceWithUser) => {
    const deviceCount = getUserDeviceCount(device.user_id);
    return deviceCount >= device.max_devices;
  };

  // Filter devices based on search query
  const filteredDevices = devicesData?.devices.filter(device => 
    device.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    device.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    device.device_id.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const selectedDevicesList = filteredDevices.filter(device => 
    selectedDevices.has(`${device.user_id}-${device.device_id}`)
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('devices.deviceRemoval')}</CardTitle>
          <CardDescription>
            {t('devices.description')}
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
            <CardTitle>{t('devices.deviceRemoval')}</CardTitle>
            <CardDescription>
              {t('devices.description')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {selectedDevices.size > 0 && (
              <Button
                variant="destructive"
                onClick={() => setShowConfirmDialog(true)}
                disabled={removeBulkDevicesMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('devices.removeSelected', { count: selectedDevices.size })}
              </Button>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('devices.placeholder.searchDevices')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredDevices.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedDevices.size === filteredDevices.length && filteredDevices.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>{t('devices.table.device')}</TableHead>
                <TableHead>{t('devices.table.user')}</TableHead>
                <TableHead>{t('devices.table.deviceLimit')}</TableHead>
                <TableHead>{t('devices.table.riskLevel')}</TableHead>
                <TableHead>{t('devices.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((device) => {
                const deviceKey = `${device.user_id}-${device.device_id}`;
                const atLimit = isUserAtLimit(device);
                
                return (
                  <TableRow key={deviceKey}>
                    <TableCell>
                      <Checkbox
                        checked={selectedDevices.has(deviceKey)}
                        onCheckedChange={(checked) => handleSelectDevice(deviceKey, checked as boolean)}
                      />
                    </TableCell>
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
                      <Badge 
                        variant={atLimit ? "destructive" : "outline"}
                        className="flex items-center gap-1"
                      >
                        {atLimit && <AlertTriangle className="h-3 w-3" />}
                        {getUserDeviceCount(device.user_id)}/{device.max_devices}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {atLimit ? (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {t('devices.risk.high')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {t('devices.risk.safe')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
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
                              <AlertDialogTitle>{t('devices.removeDeviceTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('devices.removeDeviceConfirmation', { name: device.device_name, username: device.username })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('devices.common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleSingleRemove(device)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                {t('devices.removeDevice')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={removeAndBlacklistDeviceMutation.isPending}
                                className="border-red-300 text-red-600 hover:bg-red-50"
                              >
                                <Ban className="h-3 w-3 mr-1" />
                                {t('devices.removeAndBlacklistAction')}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('devices.removeAndBlacklistTitle')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('devices.removeAndBlacklistDescription', { name: device.device_name, username: device.username })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('devices.common.cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveAndBlacklist(device)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {t('devices.removeAndBlacklistAction')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={blacklistDeviceMutation.isPending}
                                className="border-orange-300 text-orange-600 hover:bg-orange-50"
                              >
                                <Ban className="h-3 w-3 mr-1" />
                                {t('devices.blacklistOnly')}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('devices.blacklistTitle')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('devices.blacklistDescription', { name: device.device_name, username: device.username })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('devices.common.cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleBlacklist(device)}
                                  className="bg-orange-600 hover:bg-orange-700"
                                >
                                  {t('devices.blacklistAction')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8">
            <Smartphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('devices.noDevicesFoundTitle')}
            </h3>
            <p className="text-gray-500 mb-4">
              {searchQuery
                ? t('devices.noDevicesFoundFor', { query: searchQuery })
                : t('devices.noDevicesRegistered')
              }
            </p>
          </div>
        )}

        {/* Bulk Removal Confirmation Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
              <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('devices.removeMultipleTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('devices.removeMultipleDescription', { count: selectedDevices.size })}
                <br /><br />
                <strong>{t('devices.devicesToBeRemovedLabel')}</strong>
                <ul className="mt-2 space-y-1">
                  {selectedDevicesList.slice(0, 5).map((device) => (
                    <li key={`${device.user_id}-${device.device_id}`} className="text-sm">
                      • {device.device_name} ({device.username})
                    </li>
                  ))}
                  {selectedDevicesList.length > 5 && (
                    <li className="text-sm text-muted-foreground">
                      {t('devices.moreDevices', { count: selectedDevicesList.length - 5 })}
                    </li>
                  )}
                </ul>
                <br />
                {t('devices.bulkWarning')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('devices.common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkRemove}
                className="bg-red-600 hover:bg-red-700"
                disabled={removeBulkDevicesMutation.isPending}
              >
                {removeBulkDevicesMutation.isPending ? t('devices.removing') : t('devices.removeAllSelected')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Error Display */}
        {(removeDeviceMutation.error || removeBulkDevicesMutation.error) && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {removeDeviceMutation.error?.message || removeBulkDevicesMutation.error?.message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
