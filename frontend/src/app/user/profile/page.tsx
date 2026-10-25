'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import LogoutButton from '@/components/auth/LogoutButton';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useBannedRedirect } from '@/hooks/useBannedRedirect';
import { ROUTES } from '@/constants/app';
import { apiErrorMessage, cn } from '@/lib/utils';
import { contentService, userProfileService } from '@/services';
import packagesService from '@/services/packages';
import type { UserProfile } from '@/types';
import { toast } from 'sonner';
import {
  ShieldCheck,
  UserRound,
  Mail,
  CalendarClock,
  Crown,
  Lock,
  Home,
  Tv,
  Film,
  Clapperboard,
  Search,
  Stars,
  Wand2,
  Clock,
  Sparkles,
  MonitorSmartphone
} from 'lucide-react';

function ProfileLoading() {
  const { t } = useTranslation();
  return <div className="p-6 text-slate-400">{t('common.loading')}</div>;
}

const infoBadgeStyles =
  'rounded-full bg-slate-900/70 px-3 py-1 text-xs text-slate-300 border border-slate-800';

function ProfilePageInner() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [emailDraft, setEmailDraft] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useBannedRedirect();

  // Load current subscription & plan
  const { data: subStatus } = useQuery({
    queryKey: ['user-subscription'],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await packagesService.getSubscription();
      if (res.data) return res.data;
      return null;
    }
  });

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const result = await userProfileService.getProfile();
      if (result.success && result.data) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('products.errors.loadProfileFailed')));
    }
  });

  useEffect(() => {
    if (profileData?.email) {
      setEmailDraft(profileData.email);
    } else if (user?.email) {
      setEmailDraft(user.email);
    }
  }, [profileData?.email, user?.email]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      const result = await userProfileService.updateProfile({
        email: emailDraft.trim() || null
      });
      if (!result.success || !result.data) {
        throw new Error(
          apiErrorMessage(result.error, t('profile.updateFailed')),
        );
      }
      return result.data;
    },
    onSuccess: (updatedProfile) => {
      toast.success(t('user.profile.update.success'));
      queryClient.setQueryData<UserProfile>(['user-profile'], updatedProfile);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : t('user.profile.update.error');
      toast.error(message);
    }
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const result = await userProfileService.changePassword({
        current_password: currentPassword,
        new_password: newPassword
      });
      if (!result.success || !result.data) {
        throw new Error(
          apiErrorMessage(
            result.error,
            t('profile.updatePasswordFailed'),
          ),
        );
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success(t('user.profile.password.success'));
      setCurrentPassword('');
      setNewPassword('');
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : t('user.profile.password.error');
      toast.error(message);
    }
  });

  // Timestamps and profile access
  const profile = profileData;
  const createdAt = profile?.created_at ? new Date(profile.created_at) : null;
  const expiresAt = profile?.expires_at ? new Date(profile.expires_at) : null;

  // Load all categories (id -> object mapping) to resolve user subscriptions
  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories', 'all'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getCategories();
      if (res.success && res.data) return res.data;
      return [];
    }
  });

  // Normalize user subscribed categories (can be array of objects or array of IDs)
  const userCategoryObjs = useMemo(() => {
    // Normalize from multiple possible shapes:
    // - user.subscribed_categories: Array<{id,name,category_type}> OR Array<number>
    // - profile.subscribed_categories: Array<number>
    // Fallback to names if present even when IDs can't be resolved.
    const result: Array<{ id: number; name: string; category_type: string }> =
      [];

    const pushUnique = (cat?: {
      id?: number;
      name?: string;
      category_type?: string;
    } | null) => {
      if (!cat) return;
      const id = Number(cat.id ?? 0);
      const name = String(cat.name ?? cat.category_type ?? '').trim();
      const type = String(cat.category_type ?? cat.name ?? '').trim();
      if (!name && !type) return;
      const key = (type || name).toLowerCase();
      if (result.find((x) => (x.category_type || x.name).toLowerCase() === key))
        return;
      result.push({
        id: Number.isFinite(id) && id > 0 ? id : 0,
        name: name || type,
        category_type: type || name
      });
    };

    // 1) Try direct from user (objects or IDs)
    const direct = (user as any)?.subscribed_categories as Array<any> | undefined;
    if (Array.isArray(direct) && direct.length) {
      // If they are objects, push directly
      if (typeof direct[0] === 'object') {
        direct.forEach((c) => pushUnique(c));
      } else {
        // They are IDs, resolve via allCategories if available
        const ids = direct as number[];
        ids.forEach((id) => {
          const found = allCategories.find((c: any) => c.id === id);
          if (found) pushUnique(found);
        });
      }
    }

    // 2) If still empty, use profile IDs
    if (result.length === 0) {
      const ids = (profile as any)?.subscribed_categories as number[] | undefined;
      if (ids && ids.length && allCategories.length) {
        ids.forEach((id) => {
          const found = allCategories.find((c: any) => c.id === id);
          if (found) pushUnique(found);
        });
      }
    }

    return result;
  }, [user?.subscribed_categories, (profile as any)?.subscribed_categories, allCategories]);

  // Build sidebar menu based on subscriptions. Keep Inicio and Buscar at ends.
  const menuItems = useMemo(() => {
    type MenuItem = { typeKey: string; label: string; href: string; icon: any; basePath: string };
    const add = new Map<string, MenuItem>();

    const byType = (typ: string): MenuItem | null => {
      const typeLower = (typ || '').toLowerCase();
      if (typeLower === 'tv') {
        return {
          typeKey: 'tv',
          label: t('user.menu.liveTv'),
          href: `${ROUTES.CONTENT.BROWSE}?tab=live`,
          icon: Tv,
          basePath: ROUTES.CONTENT.BROWSE
        };
      }
      if (typeLower === 'vod' || typeLower === 'movies' || typeLower === 'movie') {
        return {
          typeKey: 'vod',
          label: t('user.menu.movies'),
          href: `${ROUTES.CONTENT.BROWSE}?tab=movies`,
          icon: Film,
          basePath: ROUTES.CONTENT.BROWSE
        };
      }
      if (typeLower === 'series' || typeLower === 'shows' || typeLower === 'show') {
        return {
          typeKey: 'series',
          label: t('user.menu.series'),
          href: `${ROUTES.CONTENT.BROWSE}?tab=shows`,
          icon: Clapperboard,
          basePath: ROUTES.CONTENT.BROWSE
        };
      }
      if (typeLower === 'kids') {
        return {
          typeKey: 'kids',
          label: t('user.menu.kids'),
          href: `${ROUTES.CONTENT.BROWSE}?category=Kids`,
          icon: Stars,
          basePath: ROUTES.CONTENT.BROWSE
        };
      }
      if (typeLower === 'anime') {
        return {
          typeKey: 'anime',
          label: t('user.menu.anime'),
          href: `${ROUTES.CONTENT.BROWSE}?category=Anime`,
          icon: Wand2,
          basePath: ROUTES.CONTENT.BROWSE
        };
      }
      if (typeLower === 'events' || typeLower === 'event') {
        return {
          typeKey: 'events',
          label: t('user.menu.events'),
          href: `${ROUTES.CONTENT.BROWSE}?tab=events`,
          icon: Clock,
          basePath: ROUTES.CONTENT.BROWSE
        };
      }
      return null;
    };

    for (const c of userCategoryObjs) {
      const mi = byType(c.category_type || '');
      if (mi) add.set(mi.typeKey, mi);
    }

    const weight: Record<string, number> = {
      vod: 10,
      tv: 20,
      series: 30,
      kids: 40,
      anime: 50,
      events: 55
    };
    const subs = Array.from(add.values()).sort(
      (a, b) => (weight[a.typeKey] ?? 999) - (weight[b.typeKey] ?? 999),
    );

    const homeItem: MenuItem = {
      typeKey: 'home',
      label: t('user.menu.home'),
      href: ROUTES.USER.BASE,
      icon: Home,
      basePath: ROUTES.USER.BASE
    };
    const searchItem: MenuItem = {
      typeKey: 'search',
      label: t('user.menu.search'),
      href: ROUTES.CONTENT.SEARCH,
      icon: Search,
      basePath: ROUTES.CONTENT.SEARCH
    };

    // No defaults fallback — only show categories the user has access to
    if (!subs.length) {
      return [homeItem, searchItem];
    }

    return [homeItem, ...subs, searchItem];
  }, [t, userCategoryObjs, ROUTES.CONTENT.BROWSE, ROUTES.CONTENT.SEARCH, ROUTES.USER.BASE]);

  const usernameLabel = useMemo(
    () => user?.username || t('user.dashboard.guest'),
    [t, user?.username],
  );

  const statusLabel = useMemo(() => {
    if (!profile) return t('user.profile.status.unknown');
    if (!profile.active) return t('user.profile.status.banned');
    if (!profile.expires_at)
      return t('user.profile.status.noExpiry');
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return t('user.profile.status.expired');
    }
    return t('user.profile.status.active');
  }, [profile, expiresAt, t]);

  // Active state for sidebar items
  const isItemActive = (itemHref: string, basePath: string) => {
    let isActive = false;
    const baseActive =
      pathname === basePath || pathname.startsWith(`${basePath}/`);

    if (basePath === ROUTES.CONTENT.BROWSE) {
      const currentTab = (searchParams.get('tab') || '').toLowerCase();
      const currentCategory = (searchParams.get('category') || '').toLowerCase();

      let itemTab = '';
      let itemCategory = '';
      try {
        const u = new URL(itemHref, 'https://local');
        itemTab = (u.searchParams.get('tab') || '').toLowerCase();
        itemCategory = (u.searchParams.get('category') || '').toLowerCase();
      } catch {
        // ignore
      }

      if (itemTab) {
        isActive = pathname === ROUTES.CONTENT.BROWSE && currentTab === itemTab;
      } else if (itemCategory) {
        isActive =
          pathname === ROUTES.CONTENT.BROWSE && currentCategory === itemCategory;
      } else {
        isActive = false;
      }
    } else {
      isActive = baseActive;
    }
    return isActive;
  };

  // Translate sidebar menu labels at render-time to the "user.menu.*" namespace
  const tMenu = (label: string) => {
    const l = (label || '').toLowerCase().trim();
    let key = 'custom';
    if (l === 'home') key = 'home';
    else if (l.includes('tv')) key = 'liveTv';
    else if (l === 'movies' || l === 'movie') key = 'movies';
    else if (l === 'series' || l === 'shows' || l === 'show') key = 'series';
    else if (l === 'kids' || l === 'children') key = 'kids';
    else if (l === 'anime') key = 'anime';
    else if (l === 'events' || l === 'event') key = 'events';
    else if (l === 'search') key = 'search';
    return t(`user.menu.${key}`);
  };

  return (
    <UserRoute>
      <div className="min-h-screen bg-slate-950 text-white">
        {/* Main content */}
        <main className="relative overflow-x-hidden pb-24 h-full">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10 sm:px-10">
            <header className="space-y-3">
              <Badge
                variant="secondary"
                className="bg-white/10 text-xs uppercase tracking-wide text-white"
              >
                {t('user.profile.badge')}
              </Badge>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {t('user.profile.title')}
                  </h1>
                  <p className="text-sm text-slate-300">
                    {t('user.profile.subtitle')}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'border-slate-800 px-4 py-2',
                    profile?.active
                      ? 'text-green-200 border-green-400/40 bg-green-400/10'
                      : 'text-red-200 border-red-400/40 bg-red-400/10',
                  )}
                >
                  {statusLabel}
                </Badge>
              </div>
            </header>

            {isLoading ? (
              <div className="py-20">
                <EmptyState
                  title={t('user.common.loading')}
                  description={t('common.loading')}
                />
              </div>
            ) : null}

            {!isLoading && !profile ? (
              <div className="py-20">
                <EmptyState
                  title={t('user.profile.noDataTitle')}
                  description={t('user.profile.noDataDescription')}
                />
              </div>
            ) : null}

            {profile ? (
              <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <div className="space-y-6">
                  {/* Basic info */}
                  <Card className="rounded-lg border-slate-900 bg-slate-900/60">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-lg text-white">
                        <UserRound className="h-5 w-5 text-blue-300" />
                        {t('user.profile.info.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-slate-300">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {t('user.profile.info.username')}
                          </p>
                          <p className="mt-1 text-base text-white">
                            {profile.username}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {t('user.profile.info.role')}
                          </p>
                          <p className="mt-1 text-base text-white capitalize">
                            {profile.role}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {t('user.profile.info.createdAt')}
                          </p>
                          <p className="mt-1 text-base text-white">
                            {createdAt
                              ? createdAt.toLocaleDateString(i18n.language || undefined)
                              : t('user.profile.info.unknown')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {t('user.profile.info.expiresAt')}
                          </p>
                          <p className="mt-1 text-base text-white">
                            {expiresAt
                              ? expiresAt.toLocaleDateString(i18n.language || undefined)
                              : t('user.profile.info.noExpiry')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Contact */}
                  <Card className="rounded-lg border-slate-900 bg-slate-900/60">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-lg text-white">
                        <Mail className="h-5 w-5 text-blue-300" />
                        {t('user.profile.contact.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label
                          htmlFor="email"
                          className="text-xs uppercase tracking-wide text-slate-500"
                        >
                          {t('user.profile.contact.emailLabel')}
                        </label>
                        <Input
                          id="email"
                          type="email"
                          value={emailDraft}
                          onChange={(event) => setEmailDraft(event.target.value)}
                          placeholder={t('user.profile.contact.emailPlaceholder')}
                          className="bg-slate-950/50 text-white placeholder:text-slate-500"
                        />
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500">
                          {t('user.profile.contact.hint')}
                        </p>
                        <Button
                          onClick={() => updateProfile.mutate()}
                          disabled={updateProfile.isPending}
                          className="sm:w-auto"
                        >
                          {updateProfile.isPending
                            ? t('user.profile.contact.saving')
                            : t('user.profile.contact.save')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Password */}
                  <Card className="rounded-lg border-slate-900 bg-slate-900/60">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-lg text-white">
                        <Lock className="h-5 w-5 text-blue-300" />
                        {t('user.profile.password.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label
                            htmlFor="current-password"
                            className="text-xs uppercase tracking-wide text-slate-500"
                          >
                            {t('user.profile.password.current')}
                          </label>
                          <Input
                            id="current-password"
                            type="password"
                            value={currentPassword}
                            onChange={(event) =>
                              setCurrentPassword(event.target.value)
                            }
                            placeholder={t('user.profile.password.currentPlaceholder')}
                            className="bg-slate-950/50 text-white placeholder:text-slate-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor="new-password"
                            className="text-xs uppercase tracking-wide text-slate-500"
                          >
                            {t('user.profile.password.new')}
                          </label>
                          <Input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(event) =>
                              setNewPassword(event.target.value)
                            }
                            placeholder={t('user.profile.password.newPlaceholder')}
                            className="bg-slate-950/50 text-white placeholder:text-slate-500"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500">
                          {t('user.profile.password.hint')}
                        </p>
                        <Button
                          onClick={() => changePassword.mutate()}
                          disabled={changePassword.isPending}
                          className="sm:w-auto"
                        >
                          {changePassword.isPending
                            ? t('user.profile.password.saving')
                            : t('user.profile.password.save')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right column */}
                <div className="space-y-6">
                  {/* Plan state */}
                  <Card className="rounded-lg border-slate-900 bg-slate-900/60">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-sm text-white">
                        <ShieldCheck className="h-4 w-4 text-blue-300" />
                        {t('user.profile.plan.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs text-slate-400">
                      {subStatus?.package && (
                        <div className="rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-300 border border-blue-500/30">
                          Plan: {subStatus.package.name}
                        </div>
                      )}
                      <div className={infoBadgeStyles}>
                        {t('user.profile.plan.devices', {
                          count: profile.device_count,
                          max: subStatus?.package?.max_devices ?? profile.max_devices
                        })}
                      </div>
                      {subStatus?.subscription && (
                        <div className={infoBadgeStyles}>
                          Status: {subStatus.subscription.status}
                        </div>
                      )}
                      <div className={infoBadgeStyles}>
                        {expiresAt
                          ? t('user.profile.plan.expires', {
                            date: expiresAt.toLocaleDateString(i18n.language || undefined)
                          })
                          : t('user.profile.plan.withoutExpiry')}
                      </div>
                      <a
                        href="/plans"
                        className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 mt-1"
                      >
                        <Sparkles className="h-3 w-3" />
                        {subStatus?.subscription ? 'Change Plan' : 'Choose a Plan'}
                      </a>
                    </CardContent>
                  </Card>

                  {/* Enabled categories (now resolved) */}
                  <Card className="rounded-lg border-slate-900 bg-slate-900/60">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-sm text-white">
                        <Crown className="h-4 w-4 text-amber-300" />
                        {t('user.profile.categories.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {userCategoryObjs.length ? (
                        <div className="flex flex-wrap gap-2">
                          {userCategoryObjs.map((category, index) => (
                            <Badge
                              key={`${category.id || category.name}-${index}`}
                              variant="outline"
                              className="border-slate-800 bg-slate-950/60 text-slate-200"
                            >
                              {category.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          {t('user.profile.categories.empty')}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Quick actions */}
                  <Card className="rounded-lg border-slate-900 bg-slate-900/60">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-sm text-white">
                        <CalendarClock className="h-4 w-4 text-blue-300" />
                        {t('user.profile.actions.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 text-xs text-slate-400">
                      <a
                        href={ROUTES.USER.DEVICES}
                        className="inline-flex items-center justify-start gap-2 border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-blue-500/40 hover:text-white rounded-md px-3 py-2 text-sm font-medium transition-colors"
                      >
                        {t('user.profile.actions.manageDevices')}
                      </a>
                      <a
                        href={ROUTES.USER.BASE}
                        className="inline-flex items-center justify-start gap-2 border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-blue-500/40 hover:text-white rounded-md px-3 py-2 text-sm font-medium transition-colors"
                      >
                        {t('user.profile.actions.exploreContent')}
                      </a>
                      <a
                        href={ROUTES.REDEEM}
                        className="inline-flex items-center justify-start gap-2 border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-blue-500/40 hover:text-white rounded-md px-3 py-2 text-sm font-medium transition-colors"
                      >
                        {t('user.profile.actions.extendMembership')}
                      </a>
                    </CardContent>
                  </Card>


                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </UserRoute>
  );
}
export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfilePageInner />
    </Suspense>
  );
}
