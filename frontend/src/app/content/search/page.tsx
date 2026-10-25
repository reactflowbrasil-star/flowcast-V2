'use client';

import { useMemo, useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Clapperboard, Film, Tv } from 'lucide-react';

import { UserRoute } from '@/components/auth/ProtectedRoute';
import UserSidebar from '@/components/user/UserSidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ROUTES } from '@/constants/app';
import { contentService } from '@/services';
import { apiErrorMessage } from '@/lib/utils';
import type { DeliveryContent } from '@/types';

function ContentSearchPageInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();

  const initialQ = useMemo(() => params.get('q') || '', [params]);
  const [q, setQ] = useState<string>(initialQ);

  useEffect(() => {
    // Keep local state in sync if user navigates with back/forward and query changes
    const current = params.get('q') || '';
    setQ(current);
  }, [params]);

  const { data: results = [], isFetching, isError, error } = useQuery({
    queryKey: ['content', 'search', q],
    enabled: q.trim().length > 0,
    queryFn: async (): Promise<DeliveryContent[]> => {
      const res = await contentService.searchContent({ q: q.trim(), limit: 30 });
      if (res.success && res.data) return res.data.content as DeliveryContent[];
      throw new Error(apiErrorMessage(res.error, t('common.serverError')));
    },
    staleTime: 2 * 60 * 1000});

  const submitSearch = (next: string) => {
    const trimmed = (next || '').trim();
    const base = ROUTES.CONTENT.SEARCH;
    const url = trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base;
    router.push(url);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitSearch(q);
  };

  const mediaIcon = (c?: DeliveryContent) => {
    const categoryType = String(c?.category?.category_type || c?.category?.name || '').toLowerCase();
    if (categoryType === 'tv') return <Tv className="h-4 w-4" />;
    if (categoryType === 'series') return <Clapperboard className="h-4 w-4" />;
    return <Film className="h-4 w-4" />;
  };

  return (
    <UserRoute>
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
          <UserSidebar />
          <main className="relative overflow-x-hidden pb-24">
            <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10">
              <header className="mb-6 space-y-3">
                <Card className="border-slate-900 bg-slate-900/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg text-white">
                      <Search className="h-5 w-5" />
                      {t('user.content.search.title', {})}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <Input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder={t('user.content.search.placeholder', {})}
                          className="h-10 bg-slate-950/50 pl-9 text-white placeholder:text-slate-500"
                        />
                      </div>
                      <Button type="submit" className="sm:w-auto">
                        {t('common.search', {})}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </header>

              <section>
                {!q.trim().length ? (
                  <div className="py-16">
                    <EmptyState
                      title={t('user.content.search.emptyTitle', {})}
                      description={t('user.content.search.emptyDesc', {
                      })}
                    />
                  </div>
                ) : isFetching ? (
                  <div className="py-16">
                    <EmptyState
                      title={t('common.loading', {})}
                      description={t('user.content.search.loading', {})}
                    />
                  </div>
                ) : isError ? (
                  <div className="py-16">
                    <EmptyState
                      title={t('user.content.search.error', {})}
                      description={String((error as any)?.message || t('common.error'))}
                    />
                  </div>
                ) : !results.length ? (
                  <div className="py-16">
                    <EmptyState
                      title={t('user.content.search.noResults', {})}
                      description={t('user.content.search.tryAgain', {
                      })}
                    />
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {results.map((c) => {
                      const poster = c.image_url || '';
                      const backdrop = c.backdrop_url || c.image_url || '';
                      const href = ROUTES.CONTENT.WATCH(c.id);
                      const categoryLabel = c.category?.name || c.category?.category_type || t('contentTypeExtended.content');
                      return (
                        <Link
                          key={`res-${c.id}`}
                          href={href}
                          className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition-transform hover:-translate-y-0.5"
                        >
                          <div
                            className="h-40 w-full bg-cover bg-center"
                            style={{ backgroundImage: poster ? `url(${poster})` : backdrop ? `url(${backdrop})` : undefined }}
                          />
                          <div className="p-4">
                            <div className="flex items-center justify-between">
                              <h3 className="line-clamp-2 text-sm font-semibold text-white">{c.title}</h3>
                              <Badge variant="outline" className="ml-2 border-slate-700 bg-slate-900/60 text-slate-200">
                                <span className="inline-flex items-center gap-1">
                                  {mediaIcon(c)}
                                  <span className="capitalize">{categoryLabel}</span>
                                </span>
                              </Badge>
                            </div>
                            {c.year ? (
                              <p className="mt-1 text-xs text-slate-400">{c.year}</p>
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </main>
        </div>
      </div>
    </UserRoute>
  );
}
export default function ContentSearchPage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">{t('common.loading')}</div>}>
      <ContentSearchPageInner />
    </Suspense>
  );
}
