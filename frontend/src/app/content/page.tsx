'use client';

import { useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { Play } from 'lucide-react';

import { UserRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useBannedRedirect } from '@/hooks/useBannedRedirect';
import { ROUTES } from '@/constants/app';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, apiErrorMessage } from '@/lib/utils';
import { contentService } from '@/services';
import type { DeliveryContent, DeliveryContentListResponse } from '@/types';

const fallbackBackgrounds = [
  'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  'linear-gradient(135deg, #0f172a 0%, #1e3a8a 80%)',
  'linear-gradient(135deg, #111827 0%, #1e293b 90%)',
];

function toBackgroundImage(src?: string, index: number = 0) {
  if (!src || !src.trim()) {
    return fallbackBackgrounds[index % fallbackBackgrounds.length];
  }
  const trimmed = src.trim();
  if (trimmed.startsWith('linear-gradient') || trimmed.startsWith('url(')) {
    return trimmed;
  }
  return `url(${trimmed})`;
}

function ContentBrowsePageInner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useBannedRedirect();

  // Load all categories to normalize user subscriptions (can be IDs or objects)
  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories', 'all'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getCategories();
      if (res.success && res.data) return res.data;
      return [];
    }});

  const rawSubscribed = (user as any)?.subscribed_categories as any[] | undefined;

  const userCategoryObjs = useMemo(() => {
    const result: Array<{ id: number; name: string; category_type: string }> = [];
    const push = (cat?: any) => {
      if (!cat) return;
      const id = Number(cat.id ?? 0);
      const name = String(cat.name ?? cat.category_type ?? '').trim();
      const type = String(cat.category_type ?? cat.name ?? '').trim();
      if (!name && !type) return;

      // Filter out XXX/Adult content completely (CodeCanyon compliance)
      const isAdultContent = ['xxx', 'adult', 'adultos'].includes(type.toLowerCase()) ||
        ['xxx', 'adult', 'adultos'].includes(name.toLowerCase());
      if (isAdultContent) return;

      const key = (type || name).toLowerCase();
      if (result.find((x) => (x.category_type || x.name).toLowerCase() === key)) return;
      result.push({ id: Number.isFinite(id) && id > 0 ? id : 0, name: name || type, category_type: type || name });
    };

    if (Array.isArray(rawSubscribed) && rawSubscribed.length) {
      if (typeof rawSubscribed[0] === 'object') {
        rawSubscribed.forEach((c) => push(c));
      } else {
        (rawSubscribed as number[]).forEach((id) => push(allCategories.find((c: any) => c.id === id)));
      }
    }

    // No fallback: if user has no subscriptions assigned, they see no categories
    // This enforces proper permission control - no categories = no access

    return result;
  }, [rawSubscribed, allCategories]);

  const orderedCategories = useMemo(() => {
    // Hide TV from the category pills; live TV is handled in /user/content?tab=live
    return [...userCategoryObjs]
      .filter((c) => String(c.category_type || c.name || '').toLowerCase() !== 'tv')
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [userCategoryObjs]);

  const selectedCategoryId = useMemo(() => {
    const tab = (searchParams.get('tab') || '').toLowerCase();
    const categoryParam = searchParams.get('category');

    const resolveByType = (type: string) => {
      const t = type.toLowerCase();
      const map: Record<string, string> = {
        movies: 'VOD', movie: 'VOD', vod: 'VOD',
        shows: 'Series', show: 'Series', series: 'Series',
        live: 'TV', tv: 'TV',
        kids: 'Kids', anime: 'Anime', events: 'Eventos'};
      const target = map[t];
      if (!target) return null;
      const cat = orderedCategories.find((c) => String(c.category_type).toLowerCase() === target.toLowerCase())
        || (allCategories as any[]).find((c) => String(c.category_type).toLowerCase() === target.toLowerCase());
      return cat?.id ?? null;
    };

    if (categoryParam) {
      const parsed = Number.parseInt(categoryParam, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
      const nameLc = categoryParam.toLowerCase();
      const categoryAliases: Record<string, string> = {
        movie: 'vod',
        movies: 'vod',
        show: 'series',
        shows: 'series',
        event: 'eventos',
        events: 'eventos'
      };
      const normalizedName = categoryAliases[nameLc] ?? nameLc;
      const cat = orderedCategories.find((c) => String(c.name).toLowerCase() === nameLc || String(c.category_type).toLowerCase() === nameLc)
        || (allCategories as any[]).find((c) => String(c.name).toLowerCase() === nameLc || String(c.category_type).toLowerCase() === nameLc)
        || orderedCategories.find((c) => String(c.name).toLowerCase() === normalizedName || String(c.category_type).toLowerCase() === normalizedName)
        || (allCategories as any[]).find((c) => String(c.name).toLowerCase() === normalizedName || String(c.category_type).toLowerCase() === normalizedName);
      if (cat) {
        return cat.id;
      }
    }

    if (tab) {
      const resolved = resolveByType(tab);
      if (resolved) return resolved;
    }

    return orderedCategories[0]?.id ?? (allCategories as any[])[0]?.id ?? null;
  }, [searchParams, orderedCategories, allCategories]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedCategoryId]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage} = useInfiniteQuery<DeliveryContentListResponse, Error, DeliveryContentListResponse, [string, number | null]>({
    queryKey: ['content-browse', selectedCategoryId],
    enabled: !!selectedCategoryId,
    initialPageParam: 1,
    getNextPageParam: (lastPage: DeliveryContentListResponse, pages: DeliveryContentListResponse[]) => (lastPage.has_more ? pages.length + 1 : undefined),
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      if (!selectedCategoryId) {
        const empty: DeliveryContentListResponse = {
          content: [],
          total: 0,
          page: 1,
          limit: 0,
          has_more: false};
        return empty;
      }
      const result = await contentService.getContentByCategory(selectedCategoryId, page, 24);
      if (result.success && result.data) {
        return result.data as DeliveryContentListResponse;
      }
      throw new Error(apiErrorMessage(result.error, t('common.serverError')));
    }});

  const infiniteData = data as unknown as InfiniteData<DeliveryContentListResponse> | undefined;
  const contentItems = useMemo<DeliveryContent[]>(
    () => (infiniteData?.pages ?? []).flatMap((page) => page.content),
    [infiniteData?.pages]
  );

  const handleCategoryChange = (categoryId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('category', categoryId.toString());
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const selectedCategory = orderedCategories.find((category) => category.id === selectedCategoryId) ?? null;

  const handleLoadMore = () => {
    if (hasNextPage) {
      fetchNextPage();
    }
  };

  return (
    <UserRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-10 sm:px-10">
          <header className="space-y-6">
            <Badge variant="secondary" className="bg-slate-800/50 border-slate-600/50 text-xs uppercase tracking-wide text-slate-300">
              {t('user.content.browse.badge')}
            </Badge>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-3">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  {t('user.content.browse.title')}
                </h1>
                <p className="text-lg text-slate-400">
                  {t('user.content.browse.subtitle')}
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span>{t('user.content.browse.totalCategories', {
                  count: orderedCategories.length})}</span>
                <span className="hidden sm:inline">•</span>
                <Link href={ROUTES.CONTENT.SEARCH} className="text-blue-400 hover:text-blue-300 transition-colors">
                  {t('user.content.browse.goToSearch')}
                </Link>
              </div>
            </div>
          </header>

          {orderedCategories.length ? (
            <div className="flex flex-wrap gap-3">
              {orderedCategories.map((category) => {
                const isActive = category.id === selectedCategoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleCategoryChange(category.id)}
                    className={cn(
                      'rounded-full border px-6 py-3 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'border-blue-500 bg-blue-600/20 text-white shadow-lg shadow-blue-500/25 backdrop-blur-sm'
                        : 'border-slate-600/50 bg-slate-800/30 text-slate-300 hover:border-slate-500 hover:bg-slate-700/50 hover:text-white backdrop-blur-sm'
                    )}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          ) : null}

          {selectedCategory ? (
            <section className="space-y-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {selectedCategory.name}
                  </h2>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {selectedCategory.category_type}
                  </p>
                </div>
                <span className="text-sm text-slate-400">
                  {t('user.content.browse.itemCount', {
                    count: infiniteData?.pages?.[0]?.total ?? 0})}
                </span>
              </div>

              {isLoading && !contentItems.length ? (
                <div className="py-20">
                  <EmptyState
                    title={t('common.loading')}
                    description={t('user.content.browse.loadingDescription')}
                  />
                </div>
              ) : null}

              {!isLoading && !contentItems.length ? (
                <div className="py-20">
                  <EmptyState
                    title={t('user.content.browse.emptyTitle')}
                    description={t('user.content.browse.emptyDescription')}
                  />
                </div>
              ) : null}

              {contentItems.length ? (
                <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {contentItems.map((item: DeliveryContent, index) => (
                    <Link
                      key={`${item.id}-${index}`}
                      href={ROUTES.CONTENT.WATCH(item.id)}
                      className="group relative overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:border-blue-500/60 hover:shadow-xl hover:shadow-blue-500/20"
                    >
                      <div
                        className="aspect-[2/3] bg-cover bg-center"
                        style={{ backgroundImage: toBackgroundImage(item.image_url ?? item.backdrop_url, index) }}
                      >
                        <div className="flex h-full w-full flex-col justify-between bg-gradient-to-t from-slate-950 via-transparent to-transparent p-4">
                          <div className="flex items-center gap-2 text-xs text-slate-300">
                            <span className="rounded-full bg-slate-900/80 px-2 py-0.5 uppercase tracking-wide">
                              {item.category?.category_type || t('contentTypeExtended.content')}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-base font-semibold text-white line-clamp-2 group-hover:text-blue-200">
                              {item.title}
                            </h3>
                            <p className="text-xs text-slate-300 line-clamp-2">
                              {item.description || t('user.content.browse.noDescription')}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                        <span>{item.year ?? 'UHD'}</span>
                        <span className="flex items-center gap-2">
                          <Play className="h-4 w-4 text-blue-300" />
                          {t('user.content.browse.watch')}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}

              {hasNextPage ? (
                <div className="flex justify-center">
                  <Button onClick={handleLoadMore} disabled={isFetchingNextPage} className="min-w-[200px]">
                    {isFetchingNextPage
                      ? t('user.content.browse.loadingMore')
                      : t('user.content.browse.loadMore')}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : (
            <div className="py-20">
              <EmptyState
                title={t('user.content.browse.noCategoriesTitle')}
                description={t('user.content.browse.noCategoriesDescription')}
              />
            </div>
          )}
        </div>
      </div>
    </UserRoute>
  );
}
export default function ContentBrowsePage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">{t('common.loading')}</div>}>
      <ContentBrowsePageInner />
    </Suspense>
  );
}
