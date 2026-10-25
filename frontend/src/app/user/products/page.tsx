'use client';

import { useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { UserRoute } from '@/components/auth/ProtectedRoute';

import { useAuth } from '@/contexts/AuthContext';
import { useBannedRedirect } from '@/hooks/useBannedRedirect';
import { ROUTES } from '@/constants/app';
import { contentService, userProfileService } from '@/services';
import { apiErrorMessage } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  MonitorSmartphone,
  Search
} from 'lucide-react';
import type { Category } from '@/types';
import { getCategoryIcon } from '@/constants/categoryIcons';
import i18n from '@/lib/i18n';

type CategoryType = Category['category_type'] | string;

function getIconForCategoryType(categoryType: CategoryType) {
  const key = String(categoryType || '').trim();
  return getCategoryIcon(key);
}

function UserProductsPageInner() {
  const { t } = useTranslation();
  const { user } = useAuth();

  useBannedRedirect();

  const { data: allCategories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () => {
      const res = await contentService.getCategories();
      if (res.success && res.data) return res.data;
      throw new Error(apiErrorMessage(res.error, t('products.errors.loadCategoriesFailed')));
    },
    staleTime: 5 * 60 * 1000
  });

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['user', 'profile-basic'],
    queryFn: async () => {
      const res = await userProfileService.getProfile();
      if (res.success && res.data) return res.data;
      throw new Error(apiErrorMessage(res.error, t('products.errors.loadProfileFailed')));
    },
    staleTime: 5 * 60 * 1000
  });

  const products = useMemo(() => {
    const acc: Array<{ id: number; name: string; category_type: string }> = [];

    const pushUnique = (obj?: Partial<Category> | null) => {
      if (!obj) return;
      const id = Number(obj.id ?? 0);
      const name = String(obj.name ?? obj.category_type ?? '').trim();
      const typ = String(obj.category_type ?? obj.name ?? '').trim();
      if (!name && !typ) return;
      const key = (typ || name).toLowerCase();
      if (acc.find((x) => (x.category_type || x.name).toLowerCase() === key)) return;
      acc.push({ id: Number.isFinite(id) && id > 0 ? id : 0, name: name || typ, category_type: typ || name });
    };

    const direct = (user as any)?.subscribed_categories as Array<any> | undefined;
    if (Array.isArray(direct) && direct.length) {
      if (typeof direct[0] === 'object') {
        direct.forEach((c) => pushUnique(c));
      } else {
        const ids = direct as number[];
        ids.forEach((id) => pushUnique(allCategories.find((c) => c.id === id)));
      }
    }

    if (!acc.length) {
      const ids = (profile as any)?.subscribed_categories as number[] | undefined;
      if (ids && ids.length && allCategories.length) {
        ids.forEach((id) => pushUnique(allCategories.find((c) => c.id === id)));
      }
    }

    const weight: Record<string, number> = {
      VOD: 10,
      TV: 20,
      Series: 30,
      Kids: 40,
      Anime: 50,
      Events: 55
    };
    return acc.sort((a, b) => (weight[a.category_type] ?? 999) - (weight[b.category_type] ?? 999));
  }, [user, profile, allCategories]);

  const tMenu = (label: string) => {
    const l = (label || '').toLowerCase().trim();
    let key = 'custom';
    if (l === 'tv') key = 'liveTv';
    else if (l === 'vod' || l === 'movies' || l === 'movie') key = 'movies';
    else if (l === 'series' || l === 'shows' || l === 'show') key = 'series';
    else if (l === 'kids' || l === 'children') key = 'kids';
    else if (l === 'anime') key = 'anime';
    else if (l === 'events' || l === 'eventos') key = 'events';
    return t(`user.menu.${key}`, label);
  };

  const displayProductName = (p: { name: string; category_type: string }) => {
    const raw = String(p.name || p.category_type || '').trim();
    const lower = raw.toLowerCase();
    if (['tv', 'vod', 'movies', 'movie', 'series', 'shows', 'kids', 'anime', 'events'].includes(lower)) {
      return tMenu(raw);
    }
    return raw;
  };

  const exploreHref = (p: { id: number; name: string; category_type: string }) => {
    const ttyp = (p.category_type || p.name).toLowerCase();
    if (ttyp === 'tv') return `${ROUTES.CONTENT.BROWSE}?tab=live`;
    if (ttyp === 'vod' || ttyp === 'movies' || ttyp === 'movie') return `${ROUTES.CONTENT.BROWSE}?tab=movies`;
    if (ttyp === 'series' || ttyp === 'shows' || ttyp === 'show') return `${ROUTES.CONTENT.BROWSE}?tab=shows`;
    return `${ROUTES.CONTENT.BROWSE}?category=${encodeURIComponent(p.name)}`;
  };

  const loading = loadingCats || loadingProfile;

  return (
    <UserRoute>
      <div className="min-h-screen bg-slate-950 text-white">
        <main className="relative overflow-x-hidden pb-24">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10 sm:px-10">
            <header className="space-y-3">
              <Badge variant="secondary" className="bg-white/10 text-xs uppercase tracking-wide text-white">
                {t('products.badge')}
              </Badge>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {t('products.title')}
                  </h1>
                  <p className="text-sm text-slate-300">
                    {t('products.subtitle')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={ROUTES.CONTENT.SEARCH} className="inline-flex items-center gap-2 border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-blue-500/40 hover:text-white rounded-md px-3 py-2 text-sm font-medium transition-colors">
                    <Search className="h-4 w-4" /> {t('products.search')}
                  </Link>
                  <Link href={ROUTES.USER.DEVICES} className="inline-flex items-center gap-2 border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-blue-500/40 hover:text-white rounded-md px-3 py-2 text-sm font-medium transition-colors">
                    <MonitorSmartphone className="h-4 w-4" /> {t('products.devices')}
                  </Link>
                </div>
              </div>
            </header>

            <section>
              <Card className="border-slate-900 bg-slate-900/60">
                <CardHeader>
                  <CardTitle className="text-lg text-white">
                    {t('products.list.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="py-16">
                      <EmptyState title={t('common.loading')} description={t('products.loading')} />
                    </div>
                  ) : null}

                  {!loading && !products.length ? (
                    <div className="py-16">
                      <EmptyState
                        title={t('products.empty.title')}
                        description={t('products.empty.description')}
                      />
                    </div>
                  ) : null}

                  {products.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {products.map((p) => {
                        const Icon = getIconForCategoryType(p.category_type);
                        return (
                          <div key={`${p.category_type}-${p.id}-${p.name}`} className="group flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-950/70 p-5">
                            <div className="flex items-center gap-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900/80">
                                <Icon className="h-5 w-5 text-blue-300" />
                              </span>
                              <div>
                                <p className="text-base font-medium text-white">{displayProductName(p)}</p>
                                <p className="text-xs text-slate-400 capitalize">{tMenu(p.category_type)}</p>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                              <Badge variant="outline" className="border-slate-800 bg-slate-900/50 text-slate-200">
                                {t('products.badgeIncluded')}
                              </Badge>
                              <Link
                                href={exploreHref(p)}
                                className="inline-flex items-center justify-center gap-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                              >
                                {t('products.cta.explore')}
                              </Link>
                            </div>
                          </div>
                        );
                      })}
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

export default function UserProductsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">{i18n.t('common.loading')}</div>}>
      <UserProductsPageInner />
    </Suspense>
  );
}
