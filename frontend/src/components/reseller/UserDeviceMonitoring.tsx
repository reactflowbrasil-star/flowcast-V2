'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Smartphone, Monitor, Tablet, Tv, AlertCircle, CheckCircle, XCircle, Eye, Trash2, Clock, Users } from 'lucide-react';
import { userService } from '@/services';
import { resellerService } from '@/services/reseller';
import { User } from '@/types';
import { Device } from '@/types/device';
import { useAuth } from '@/contexts/AuthContext';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface UserDeviceMonitoringProps {
  className?: string;
}

export default function UserDeviceMonitoring({ className }: UserDeviceMonitoringProps) {
  useLoadNamespace('reseller/userDeviceMonitoring');
  const { t } = useTranslation(['reseller/userDeviceMonitoring', 'reseller', 'translation']);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  // const [selectedDevices, setSelectedDevices] = useState<Device[]>([]);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  // Fetch reseller's users
  const { data: endUsers, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['reseller-users', currentUser?.id],
    queryFn: async () => {
      const result = await resellerService.getEndUsers();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!currentUser?.id});

  // Fetch devices for selected user
  const { data: userDevicesResponse, isLoading: devicesLoading } = useQuery({
    queryKey: ['user-devices', selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser?.id) throw new Error(t('error.noUserSelected', { ns: 'reseller/userDeviceMonitoring' }));
      const result = await resellerService.getUserDevices(selectedUser.id);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!selectedUser?.id});

  // Extract devices array from response
  const userDevices = userDevicesResponse?.devices || [];

  // Fetch device counts for all users
  const { data: userDeviceCounts } = useQuery({
    queryKey: ['user-device-counts', endUsers?.map(u => u.id)],
    queryFn: async () => {
      if (!endUsers) return {};
      const counts: Record<number, number> = {};

      // Fetch device count for each user
      for (const user of endUsers) {
        try {
          const result = await resellerService.getUserDevices(user.id);
          if (result.success) {
            counts[user.id] = result.data.device_count;
          } else {
            counts[user.id] = 0;
          }
        } catch {
          counts[user.id] = 0;
        }
      }
      return counts;
    },
    enabled: !!endUsers && endUsers.length > 0,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Remove device mutation
  const removeDeviceMutation = useMutation({
    mutationFn: async ({ userId, deviceId }: { userId: number; deviceId: string }) => {
      const result = await userService.removeUserDevice(userId, deviceId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-devices', selectedUser?.id] });
    }});

  const handleViewDevices = (user: User) => {
    setSelectedUser(user);
    setIsDeviceDialogOpen(true);
  };

  const handleRemoveDevice = (deviceId: string) => {
    if (selectedUser) {
      removeDeviceMutation.mutate({
        userId: selectedUser.id,
        deviceId});
    }
  };

  const getDeviceIcon = (deviceName: string) => {
    const name = deviceName.toLowerCase();
    if (name.includes('phone') || name.includes('mobile')) {
      return <Smartphone className="h-4 w-4" />;
    } else if (name.includes('tablet') || name.includes('ipad')) {
      return <Tablet className="h-4 w-4" />;
    } else if (name.includes('tv') || name.includes('android tv') || name.includes('fire tv')) {
      return <Tv className="h-4 w-4" />;
    } else {
      return <Monitor className="h-4 w-4" />;
    }
  };

  const formatLastSeen = (lastSeen: string) => {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) {
      return t('time.justNow', { ns: 'reseller/userDeviceMonitoring' });
    } else if (diffInMinutes < 60) {
      return t('time.minutesAgo', { ns: 'reseller/userDeviceMonitoring', count: diffInMinutes });
    } else if (diffInMinutes < 1440) {
      return t('time.hoursAgo', { ns: 'reseller/userDeviceMonitoring', count: Math.floor(diffInMinutes / 60) });
    } else {
      return t('time.daysAgo', { ns: 'reseller/userDeviceMonitoring', count: Math.floor(diffInMinutes / 1440) });
    }
  };

  const getDeviceStatusBadge = (device: Device) => {
    const lastActiveDate = new Date(device.last_active);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - lastActiveDate.getTime()) / (1000 * 60));

    if (diffInMinutes < 5) {
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          {t('deviceStatus.online', { ns: 'reseller/userDeviceMonitoring' })}
        </Badge>
      );
    } else if (diffInMinutes < 60) {
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          {t('deviceStatus.recent', { ns: 'reseller/userDeviceMonitoring' })}
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          {t('deviceStatus.offline', { ns: 'reseller/userDeviceMonitoring' })}
        </Badge>
      );
    }
  };

  if (usersLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('title', { ns: 'reseller/userDeviceMonitoring' })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (usersError) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('title', { ns: 'reseller/userDeviceMonitoring' })}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('error.loadFailed', { ns: 'reseller/userDeviceMonitoring', message: usersError.message })}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('title', { ns: 'reseller/userDeviceMonitoring' })}</CardTitle>
        <CardDescription>
          {t('description', { ns: 'reseller/userDeviceMonitoring' })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {endUsers && endUsers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.username', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                <TableHead>{t('table.deviceLimit', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                <TableHead>{t('table.activeDevices', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                <TableHead>{t('table.status', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                <TableHead>{t('table.actions', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {user.max_devices || 3} {t('table.devices', { ns: 'reseller/userDeviceMonitoring' })}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      <Smartphone className="h-3 w-3 mr-1" />
                      {userDeviceCounts?.[user.id] ?? 0} {t('table.active', { ns: 'reseller/userDeviceMonitoring' })}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.active ? 'default' : 'destructive'}>
                      {user.active ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('userStatus.active', { ns: 'reseller/userDeviceMonitoring' })}
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" />
                          {t('userStatus.suspended', { ns: 'reseller/userDeviceMonitoring' })}
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDevices(user)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {t('actions.viewDevices', { ns: 'reseller/userDeviceMonitoring' })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('empty.noUsers', { ns: 'reseller/userDeviceMonitoring' })}</h3>
            <p className="text-gray-500">{t('empty.noUsersDescription', { ns: 'reseller/userDeviceMonitoring' })}</p>
          </div>
        )}

        {/* Device Details Dialog */}
        <Dialog open={isDeviceDialogOpen} onOpenChange={setIsDeviceDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {t('dialog.title', { ns: 'reseller/userDeviceMonitoring', username: selectedUser?.username || '' })}
              </DialogTitle>
              <DialogDescription>
                {t('dialog.description', { ns: 'reseller/userDeviceMonitoring', limit: selectedUser?.max_devices || 3 })}
              </DialogDescription>
            </DialogHeader>
            
            {devicesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : userDevices && userDevices.length > 0 ? (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('table.device', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                      <TableHead>{t('table.deviceId', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                      <TableHead>{t('table.lastSeen', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                      <TableHead>{t('table.status', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                      <TableHead>{t('table.actions', { ns: 'reseller/userDeviceMonitoring' })}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userDevices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDeviceIcon(device.device_name)}
                            <span className="font-medium">{device.device_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {device.device_id.substring(0, 8)}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {formatLastSeen(device.last_active)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getDeviceStatusBadge(device)}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={removeDeviceMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                {t('actions.remove', { ns: 'reseller/userDeviceMonitoring' })}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('dialog.removeTitle', { ns: 'reseller/userDeviceMonitoring' })}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('dialog.removeDescription', {
                                    ns: 'reseller/userDeviceMonitoring',
                                    deviceName: device.device_name,
                                    username: selectedUser?.username || ''
                                  })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('actions.cancel', { ns: 'reseller/userDeviceMonitoring' })}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveDevice(device.device_id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {t('actions.removeDevice', { ns: 'reseller/userDeviceMonitoring' })}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {removeDeviceMutation.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('error.removeDevice', { ns: 'reseller/userDeviceMonitoring', message: removeDeviceMutation.error.message })}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Smartphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('empty.noDevices', { ns: 'reseller/userDeviceMonitoring' })}</h3>
                <p className="text-gray-500">
                  {t('empty.noDevicesDescription', { ns: 'reseller/userDeviceMonitoring' })}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
