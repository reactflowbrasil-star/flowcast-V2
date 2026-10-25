'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useMemo, useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MonitorSmartphone,
  RefreshCcw,
  Trash2,
  Search
} from 'lucide-react';
import { toast } from 'sonner';

import { UserRoute } from '@/components/auth/ProtectedRoute';
import LogoutButton from '@/components/auth/LogoutButton';
import { useAuth } from '@/contexts/AuthContext';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import { useBannedRedirect } from '@/hooks/useBannedRedirect';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { apiErrorMessage, cn } from '@/lib/utils';
import { deviceService, contentService, userProfileService } from '@/services';
import { ROUTES } from '@/constants/app';
import { getOrCreateBrowserDevice } from '@/utils/device';
import { changeLanguageWithPreload } from '@/lib/i18n';
import type { Device, Category } from '@/types';

function getPlatformName() {
  if (typeof navigator === 'undefined') {
    return 'Unknown device';
  }
  const { userAgent, platform } = navigator;
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  if (/win/i.test(platform)) return 'Windows';
  if (/mac/i.test(platform)) return 'macOS';
  if (/linux/i.test(platform)) return 'Linux';
  return 'Unknown device';
}

function DevicesPageInner() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState(getPlatformName());

  // Prefill device form with this browser fingerprint if empty
  useEffect(() => {
    try {
      const { id, name } = getOrCreateBrowserDevice();
      setDeviceId((prev) => prev || id);
      setDeviceName((prev) => prev || name);
    } catch {
      // ignore
    }
  }, []);

  useBannedRedirect();

  // All categories for mapping ids -> objects (to build sidebar)
  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories', 'all'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getCategories();
      if (res.success && res.data) return res.data;
      return [];
    }
  });

  // Basic user profile (may contain subscribed_categories ids depending on backend)
  const { data: profile } = useQuery({
    queryKey: ['user', 'profile-basic'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await userProfileService.getProfile();
      if (res.success && res.data) return res.data;
      throw new Error(apiErrorMessage(res.error, t('products.errors.loadProfileFailed')));
    }
  });

  // Normalize subscriptions into objects for menu building
  const userCategoryObjs = useMemo(() => {
    const acc: Array<{ id: number; name: string; category_type: string }> = [];
    const push = (obj?: Partial<Category> | null) => {
      if (!obj) return;
      const id = Number(obj.id ?? 0);
      const name = String(obj.name ?? obj.category_type ?? '').trim();
      const type = String(obj.category_type ?? obj.name ?? '').trim();
      if (!name && !type) return;
      const key = (type || name).toLowerCase();
      if (acc.find((x) => (x.category_type || x.name).toLowerCase() === key)) return;
      acc.push({ id: Number.isFinite(id) && id > 0 ? id : 0, name: name || type, category_type: type || name });
    };

    // 1) Try from runtime user object
    const raw = (user as any)?.subscribed_categories as any[] | undefined;
    if (Array.isArray(raw) && raw.length) {
      if (typeof raw[0] === 'object') raw.forEach((c) => push(c));
      else (raw as number[]).forEach((id) => push(allCategories.find((c: any) => c.id === id)));
    }

    // 2) Fallback from profile ids
    if (!acc.length) {
      const ids = (profile as any)?.subscribed_categories as number[] | undefined;
      if (ids && ids.length && allCategories.length) {
        ids.forEach((id) => push(allCategories.find((c: any) => c.id === id)));
      }
    }

    return acc;
  }, [user?.subscribed_categories, (profile as any)?.subscribed_categories, allCategories]);


  const { data, isLoading } = useQuery({
    queryKey: ['user-devices'],
    queryFn: async () => {
      const result = await deviceService.getUserDevices();
      if (result.success && result.data) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('device.errors.loadFailed')));
    }
  });

  const registerDevice = useMutation({
    mutationFn: async () => {
      if (!deviceId.trim() || !deviceName.trim()) {
        throw new Error(t('user.devices.register.validation'));
      }
      const result = await deviceService.registerDevice({
        device_id: deviceId.trim(),
        device_name: deviceName.trim()
      });
      if (!result.success) {
        throw new Error(apiErrorMessage(result.error, t('common.serverError')));
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success(t('common.success'));
      queryClient.invalidateQueries({ queryKey: ['user-devices'] });
      const onboarding = searchParams.get('onboarding');
      if (onboarding) {
        setTimeout(() => router.push(ROUTES.USER.BASE), 300);
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('common.serverError');
      toast.error(message);
    }
  });

  const removeDevice = useMutation({
    mutationFn: async (id: string) => {
      const result = await deviceService.removeDevice(id);
      if (!result.success) {
        throw new Error(apiErrorMessage(result.error, t('user.devices.list.removeError')));
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success(t('user.devices.list.removeSuccess'));
      queryClient.invalidateQueries({ queryKey: ['user-devices'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('user.devices.list.removeError');
      toast.error(message);
    }
  });

  const devices = data?.devices ?? [];
  const maxDevices = data?.max_devices ?? user?.max_devices ?? 0;
  const utilization = useMemo(() => {
    if (maxDevices <= 0) return 0;
    return Math.min(100, Math.round((devices.length / maxDevices) * 100));
  }, [devices.length, maxDevices]);

  // Browser-device onboarding helpers
  const { id: thisDeviceId, name: thisDeviceName } = useMemo(() => getOrCreateBrowserDevice(), []);
  const isThisDeviceRegistered = useMemo(
    () => devices.some((d) => d.device_id === thisDeviceId),
    [devices, thisDeviceId],
  );
  const onboarding = searchParams.get('onboarding');
  const isAtDeviceLimit = maxDevices > 0 && devices.length >= maxDevices;
  const canRegisterNewDevice = maxDevices <= 0 || devices.length < maxDevices;

  const generateDeviceId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      setDeviceId(crypto.randomUUID());
      return;
    }
    setDeviceId(`device-${Date.now()}`);
  };

  return (
    <UserRoute>
      <div className="min-h-screen bg-slate-950 text-white">
        <main className="relative overflow-x-hidden pb-24 h-full">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10 sm:px-10">
            <header className="space-y-3">
              <Badge variant="secondary" className="bg-white/10 text-xs uppercase tracking-wide text-white">
                {t('user.devices.badge')}
              </Badge>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {t('user.devices.title')}
                  </h1>
                  <p className="text-sm text-slate-300">
                    {t('user.devices.subtitle')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={ROUTES.CONTENT.SEARCH} className="inline-flex items-center gap-2 border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-blue-500/40 hover:text-white rounded-md px-3 py-2 text-sm font-medium transition-colors">
                    <Search className="h-4 w-4" /> {t('common.search')}
                  </Link>
                  {/* Language selector like on the user home */}
                  <div className="ml-2">
                    <label htmlFor="user-language-select" className="sr-only">{t('user.language.placeholder')}</label>
                    <select
                      id="user-language-select"
                      value={typeof window !== 'undefined' ? (localStorage.getItem('iptv_language') || i18n.language || 'en') : (i18n.language || 'en')}
                      onChange={async (e) => {
                        try {
                          const lang = e.target.value;
                          await changeLanguageWithPreload(lang);
                          if (typeof window !== 'undefined') localStorage.setItem('iptv_language', lang);
                          // refresh the route so server components and any SSR data re-evaluate for the new language
                          router.refresh();
                        } catch { }
                      }}
                      className="h-9 rounded-lg border border-slate-800 bg-slate-900/60 px-3 text-sm text-slate-200"
                    >
                      <option value="en">{`${t('user.languages.en_native')} · ${t('user.languages.en')}`}</option>
                      <option value="es">{`${t('user.languages.es_native')} · ${t('user.languages.es')}`}</option>
                      <option value="fr">{`${t('user.languages.fr_native')} · ${t('user.languages.fr')}`}</option>
                      <option value="pt">{`${t('user.languages.pt_native')} · ${t('user.languages.pt')}`}</option>
                      <option value="ru">{`${t('user.languages.ru_native')} · ${t('user.languages.ru')}`}</option>
                      <option value="tr">{`${t('user.languages.tr_native')} · ${t('user.languages.tr')}`}</option>
                      <option value="sk">{`${t('user.languages.sk_native')} · ${t('user.languages.sk')}`}</option>
                      <option value="zh">{`${t('user.languages.zh_native')} · ${t('user.languages.zh')}`}</option>
                    </select>
                  </div>
                </div>
              </div>
            </header>

            {onboarding ? (
              <section>
                {isThisDeviceRegistered ? (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-6 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                          <MonitorSmartphone className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium text-green-100">{t('user.devices.onboarding.already', {})}</p>
                          <p className="text-xs text-green-300">{thisDeviceName}</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => router.push(ROUTES.USER.BASE)}
                        className="bg-green-600 text-white hover:bg-green-500"
                      >
                        {t('common.continue', {})}
                      </Button>
                    </div>
                  </div>
                ) : isAtDeviceLimit ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-sm">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
                          <MonitorSmartphone className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                          <p className="font-medium text-amber-100">{t('user.devices.onboarding.limitTitle', {})}</p>
                          <p className="text-amber-200 mt-1">
                            {t('user.devices.onboarding.limitBody', {
                              count: devices.length,
                              max: maxDevices
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-md bg-amber-950/50 p-3 text-xs text-amber-200">
                        <p className="font-medium mb-1">{t('user.devices.onboarding.deviceInfo')}</p>
                        <p className="font-mono text-amber-300">{thisDeviceName} ({thisDeviceId.slice(0, 8)}...)</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-6 text-sm">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
                          <MonitorSmartphone className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-blue-100">{t('user.devices.onboarding.title', {})}</p>
                          <p className="text-blue-200 mt-1">
                            {t('user.devices.onboarding.body', {})}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-md bg-blue-950/50 p-3 text-xs text-blue-200">
                        <p className="font-medium mb-1">{t('user.devices.onboarding.deviceInfo', {})}</p>
                        <p><span className="text-blue-400">{t('common.name')}:</span> {thisDeviceName}</p>
                        <p><span className="text-blue-400">{t('user.devices.register.deviceId')}:</span> <span className="font-mono">{thisDeviceId.slice(0, 16)}...</span></p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => {
                            setDeviceId(thisDeviceId);
                            setDeviceName(thisDeviceName);
                            registerDevice.mutate();
                          }}
                          disabled={registerDevice.isPending}
                          className="bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          {registerDevice.isPending
                            ? t('user.devices.register.working', {})
                            : t('user.devices.onboarding.cta', {})}
                        </Button>
                        {maxDevices > 0 && (
                          <span className="flex items-center text-xs text-blue-300">
                            {t('user.devices.onboarding.slots', { available: maxDevices - devices.length, max: maxDevices })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {/* Show register form only when NOT in onboarding with device already registered, or when not at limit */}
            {!(onboarding && isThisDeviceRegistered) && (
              <section className="grid gap-6 md:grid-cols-[2fr_3fr]">
                {/* Hide manual registration form during onboarding if at limit - user should delete first */}
                {!(onboarding && isAtDeviceLimit) && (
                  <Card className="border-slate-900 bg-slate-900/60">
                    <CardHeader>
                      <CardTitle className="text-lg text-white">
                        {t('user.devices.register.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Quick register button for this browser when in onboarding */}
                      {onboarding && !isThisDeviceRegistered && canRegisterNewDevice && (
                        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 mb-4">
                          <Button
                            className="w-full bg-blue-600 text-white hover:bg-blue-500"
                            onClick={() => {
                              setDeviceId(thisDeviceId);
                              setDeviceName(thisDeviceName);
                              registerDevice.mutate();
                            }}
                            disabled={registerDevice.isPending}
                          >
                            <MonitorSmartphone className="h-4 w-4 mr-2" />
                            {registerDevice.isPending
                              ? t('user.devices.register.working')
                              : t('user.devices.onboarding.quickRegister')}
                          </Button>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label htmlFor="device-id" className="text-sm text-slate-300">
                          {t('user.devices.register.deviceId')}
                        </label>
                        <Input
                          id="device-id"
                          value={deviceId}
                          onChange={(event) => setDeviceId(event.target.value)}
                          placeholder={t('user.devices.register.deviceIdPlaceholder')}
                          className="bg-slate-950/50 text-white placeholder:text-slate-500"
                        />
                        <Button variant="ghost" size="sm" className="text-xs text-blue-300" onClick={generateDeviceId}>
                          {t('user.devices.register.generate')}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="device-name" className="text-sm text-slate-300">
                          {t('user.devices.register.deviceName')}
                        </label>
                        <Input
                          id="device-name"
                          value={deviceName}
                          onChange={(event) => setDeviceName(event.target.value)}
                          placeholder={t('user.devices.register.deviceNamePlaceholder')}
                          className="bg-slate-950/50 text-white placeholder:text-slate-500"
                        />
                      </div>
                      <Button
                        className="w-full bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                        onClick={() => registerDevice.mutate()}
                        disabled={registerDevice.isPending || isAtDeviceLimit}
                      >
                        {registerDevice.isPending
                          ? t('user.devices.register.working')
                          : isAtDeviceLimit
                            ? t('user.devices.onboarding.limitTitle')
                            : t('user.devices.register.cta')}
                      </Button>
                      <p className="text-xs text-slate-500">
                        {t('user.devices.register.help')}
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-slate-900 bg-slate-900/60">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">
                      {t('user.devices.status.title')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-slate-400">
                        <span>{t('user.devices.status.progressLabel')}</span>
                        <span>
                          {devices.length}/{maxDevices || '—'}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                          style={{ width: `${utilization}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                        <p className="text-slate-300">{t('user.devices.status.tipTitle')}</p>
                        <p className="mt-2">
                          {t('user.devices.status.tipBody')}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                        <p className="text-slate-300">{t('user.devices.status.syncTitle')}</p>
                        <p className="mt-2">
                          {t('user.devices.status.syncBody')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            <section>
              <Card className={cn(
                "border-slate-900 bg-slate-900/60",
                onboarding && isAtDeviceLimit && "border-amber-500/30"
              )}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg text-white">
                      {t('user.devices.list.title')}
                    </CardTitle>
                    {onboarding && isAtDeviceLimit && (
                      <p className="text-xs text-amber-300 mt-1">
                        {t('user.devices.onboarding.limitBody', {
                          count: devices.length,
                          max: maxDevices
                        })}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-white"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['user-devices'] })}
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="py-12">
                      <EmptyState
                        title={t('common.loading')}
                        description={t('user.devices.list.loading')}
                      />
                    </div>
                  ) : null}

                  {!isLoading && !devices.length ? (
                    <div className="py-12">
                      <EmptyState
                        title={t('user.devices.list.emptyTitle')}
                        description={t('user.devices.list.emptyDescription')}
                      />
                    </div>
                  ) : null}

                  {devices.length ? (
                    <div className="space-y-3">
                      {devices.map((device: Device) => (
                        <div
                          key={device.id}
                          className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900/80">
                              <MonitorSmartphone className="h-5 w-5 text-blue-300" />
                            </span>
                            <div>
                              <p className="text-sm font-medium text-white">{device.device_name}</p>
                              <p className="text-xs text-slate-400">{device.device_id}</p>
                              <p className="text-xs text-slate-500">
                                {t('user.devices.list.lastActive', {
                                  date: new Date(device.last_active).toLocaleString(i18n.language || undefined)
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="border-green-400/40 bg-green-400/10 text-green-200">
                              {t('user.devices.list.statusActive')}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                              onClick={() => removeDevice.mutate(device.device_id)}
                              disabled={removeDevice.isPending}
                              aria-label={t('user.devices.list.remove')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </section>
          </div>
        </main>
      </div>
    </UserRoute>
  );
}
export default function DevicesPage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">{t('common.loading')}</div>}>
      <DevicesPageInner />
    </Suspense>
  );
}
