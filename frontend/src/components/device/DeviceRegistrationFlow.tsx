'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Smartphone, Plus, Trash2, AlertTriangle, CheckCircle, Clock, Wifi } from 'lucide-react';
import { deviceService } from '@/services/device';
import { RegisterDeviceRequest } from '@/types';
import { useDeviceId } from '@/hooks/useDeviceId';


export default function DeviceRegistrationFlow() {
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [showDeviceLimitDialog, setShowDeviceLimitDialog] = useState(false);
  const { t } = useTranslation();
  const { deviceId, deviceName, isRegistered, markAsRegistered, updateDeviceName } = useDeviceId();

  const deviceRegistrationSchema = z.object({
    device_id: z.string().min(1, t('device.validation.deviceIdRequired')).max(100, t('device.validation.deviceIdTooLong')),
    device_name: z.string().min(1, t('device.validation.deviceNameRequired')).max(100, t('device.validation.deviceNameTooLong'))});

  type DeviceRegistrationData = z.infer<typeof deviceRegistrationSchema>;

  const queryClient = useQueryClient();

  const form = useForm<DeviceRegistrationData>({
    resolver: zodResolver(deviceRegistrationSchema),
    defaultValues: {
      device_id: deviceId,
      device_name: deviceName}});

  // Update form when deviceId and deviceName are loaded
  useEffect(() => {
    if (deviceId && deviceName) {
      form.setValue('device_id', deviceId);
      form.setValue('device_name', deviceName);
    }
  }, [deviceId, deviceName, form]);

  // Fetch user's current devices
  const { data: userDevicesData, isLoading, error } = useQuery({
    queryKey: ['user-devices'],
    queryFn: async () => {
      const result = await deviceService.getUserDevices();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    }});

  // Check if current device is already registered
  useEffect(() => {
    if (userDevicesData && deviceId) {
      const currentDeviceRegistered = userDevicesData.devices.some(
        (device) => device.device_id === deviceId
      );
      if (currentDeviceRegistered && !isRegistered) {
        markAsRegistered();
      }

      // Auto-show registration form if device is not registered
      if (!currentDeviceRegistered && !isRegistered) {
        if (canAddMoreDevices()) {
          setShowRegistrationForm(true);
        } else {
          // Show device limit dialog if at limit
          setShowDeviceLimitDialog(true);
        }
      }
    }
  }, [userDevicesData, deviceId, isRegistered, markAsRegistered]);

  // Register device mutation
  const registerDeviceMutation = useMutation({
    mutationFn: async (data: RegisterDeviceRequest) => {
      const result = await deviceService.registerDevice(data);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-devices'] });
      markAsRegistered();
      if (variables.device_name !== deviceName) {
        updateDeviceName(variables.device_name);
      }
      form.reset();
      setShowRegistrationForm(false);
    }});

  // Remove device mutation
  const removeDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const result = await deviceService.removeDevice(deviceId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-devices'] });
    }});

  const handleRegisterDevice = (data: DeviceRegistrationData) => {
    registerDeviceMutation.mutate(data);
  };

  const handleRemoveDevice = (deviceId: string) => {
    removeDeviceMutation.mutate(deviceId);
  };

  const formatLastActive = (lastActive: string) => {
    const date = new Date(lastActive);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return t('device.time.justNow');
    if (diffInMinutes < 60) return t('device.time.minutesAgo', { count: diffInMinutes });
    if (diffInMinutes < 1440) return t('device.time.hoursAgo', { count: Math.floor(diffInMinutes / 60) });
    return t('device.time.daysAgo', { count: Math.floor(diffInMinutes / 1440) });
  };

  const isDeviceActive = (lastActive: string) => {
    const date = new Date(lastActive);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    return diffInMinutes < 5; // Consider active if last seen within 5 minutes
  };

  const canAddMoreDevices = () => {
    if (!userDevicesData) return false;
    return userDevicesData.devices.length < userDevicesData.max_devices;
  };

  const getDeviceStatusBadge = (lastActive: string) => {
    const active = isDeviceActive(lastActive);
    return (
      <Badge variant={active ? "default" : "secondary"} className="flex items-center gap-1">
        <Wifi className="h-3 w-3" />
        {active ? t('common.active') : t('common.inactive')}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('device.title')}</CardTitle>
          <CardDescription>
            {t('device.description')}
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

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('device.title')}</CardTitle>
          <CardDescription>
            {t('device.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('device.errors.loadFailed')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('device.title')}</CardTitle>
            <CardDescription>
              {t('device.description')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
              <Badge variant="outline">
              {userDevicesData?.devices.length || 0}/{userDevicesData?.max_devices || 0} {t('device.devices')}
            </Badge>
            {canAddMoreDevices() && (
              <Button
                onClick={() => setShowRegistrationForm(true)}
                disabled={registerDeviceMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('device.addDevice')}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Device Limit Status */}
        <div className="mb-6 p-4 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">{t('device.limitStatus')}</h3>
            {userDevicesData && userDevicesData.devices.length >= userDevicesData.max_devices ? (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t('device.atLimit')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                {t('device.available')}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('device.youHaveDevices', { count: userDevicesData?.devices.length || 0, max: userDevicesData?.max_devices || 0 })}
            {!canAddMoreDevices() && userDevicesData && userDevicesData.devices.length > 0 && (
              <span className="text-red-600 font-medium">
                {' '}{t('device.toAddRemove')}
              </span>
            )}
          </p>
        </div>

        {/* Current Devices */}
        {userDevicesData && userDevicesData.devices.length > 0 ? (
          <div className="space-y-4">
            <h3 className="font-medium">{t('device.yourRegisteredDevices')}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('device.table.device')}</TableHead>
                  <TableHead>{t('device.table.status')}</TableHead>
                  <TableHead>{t('device.table.lastActive')}</TableHead>
                  <TableHead>{t('device.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userDevicesData.devices.map((device) => (
                  <TableRow key={device.device_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{device.device_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {t('device.deviceIdLabel', { id: device.device_id })}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getDeviceStatusBadge(device.last_active)}
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
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                            variant="destructive"
                            size="sm"
                            disabled={removeDeviceMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            {t('common.delete')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>{t('device.removeDeviceTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('device.removeDeviceDescription', { name: device.device_name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveDevice(device.device_id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {t('device.removeDevice')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8">
            <Smartphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('device.noDevices')}
            </h3>
            <p className="text-gray-500 mb-4">
              {t('device.registerFirstDescription')}
            </p>
            {canAddMoreDevices() && (
              <Button
                onClick={() => setShowRegistrationForm(true)}
                disabled={registerDeviceMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('device.registerFirstButton')}
              </Button>
            )}
          </div>
        )}

        {/* Registration Form Dialog */}
        {showRegistrationForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle>{t('device.registerNewTitle')}</CardTitle>
                <CardDescription>
                  {t('device.registerNewDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(handleRegisterDevice)} className="space-y-4">
                  <div>
                    <Label htmlFor="device_id">{t('device.label.deviceId')}</Label>
                    <Input
                      id="device_id"
                      {...form.register('device_id')}
                      placeholder={t('device.placeholder.id')}
                    />
                    {form.formState.errors.device_id && (
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.device_id.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="device_name">{t('device.label.deviceName')}</Label>
                    <Input
                      id="device_name"
                      {...form.register('device_name')}
                      placeholder={t('device.placeholder.name')}
                    />
                    {form.formState.errors.device_name && (
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.device_name.message}
                      </p>
                    )}
                  </div>

                    <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowRegistrationForm(false);
                        form.reset();
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="submit"
                      disabled={registerDeviceMutation.isPending}
                    >
                      {registerDeviceMutation.isPending ? t('device.registering') : t('device.registerDevice')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Error Display */}
        {(registerDeviceMutation.error || removeDeviceMutation.error) && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {registerDeviceMutation.error?.message || removeDeviceMutation.error?.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Device Limit Dialog */}
        {showDeviceLimitDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-2xl mx-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  {t('device.limitReached')}
                </CardTitle>
                <CardDescription>
                  {t('device.limitReachedDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert>
                    <AlertDescription>
                      {t('device.currentDeviceInfo')}: <strong>{deviceName}</strong>
                    </AlertDescription>
                  </Alert>

                  <h3 className="font-medium">{t('device.selectDeviceToRemove')}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('device.table.name')}</TableHead>
                        <TableHead>{t('device.table.id')}</TableHead>
                        <TableHead>{t('device.table.lastActive')}</TableHead>
                        <TableHead>{t('device.table.status')}</TableHead>
                        <TableHead className="text-right">{t('device.table.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userDevicesData?.devices.map((device) => (
                        <TableRow key={device.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-4 w-4" />
                              {device.device_name}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {device.device_id.substring(0, 20)}...
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3 w-3" />
                              {formatLastActive(device.last_active)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getDeviceStatusBadge(device.last_active)}
                          </TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={removeDeviceMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  {t('device.remove')}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('device.confirmRemove')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('device.confirmRemoveDescription', { name: device.device_name })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => {
                                      handleRemoveDevice(device.device_id);
                                      setShowDeviceLimitDialog(false);
                                      setShowRegistrationForm(true);
                                    }}
                                  >
                                    {t('device.remove')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setShowDeviceLimitDialog(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
