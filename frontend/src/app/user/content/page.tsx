'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Radio, List, Calendar } from 'lucide-react';

import { UserRoute } from '@/components/auth/ProtectedRoute';

import { cn } from '@/lib/utils';
import { contentService } from '@/services';
import { Input } from '@/components/ui/input';
import LiveTVPlayer from '@/components/ui/LiveTVPlayer';
import ContentBrowsePage from '@/app/content/page';
import type { Content } from '@/types';

function LiveTVContent() {
  const { t } = useTranslation();

  const { data: channels = [], isLoading } = useQuery<Content[]>({
    queryKey: ['user-content', 'live-tv', 'channels'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getTVChannels({ page: 1, limit: 200 });
      if (res.success && res.data) return res.data;
      return [];
    }
  });

  const [selected, setSelected] = React.useState<number>(0);
  const [streamUrl, setStreamUrl] = React.useState<string | null>(null);
  const [drmKeys, setDrmKeys] = React.useState<string | null>(null);
  const [drmKeysExo, setDrmKeysExo] = React.useState<string | null>(null);
  const [loadingStream, setLoadingStream] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<'channels' | 'guide'>('channels');
  const [search, setSearch] = React.useState<string>('');
  const [activeFilter, setActiveFilter] = React.useState<'all' | 'movies' | 'sports' | 'kids'>('all');

  const classify = (c: Content): 'movies' | 'sports' | 'kids' | 'other' => {
    const text = `${c?.title ?? ''} ${c?.provider ?? ''}`.toLowerCase();
    if (text.includes('espn') || text.includes('fox sports') || text.includes('deportes') || text.includes('sport')) return 'sports';
    if (text.includes('nick') || text.includes('disney junior') || text.includes('cartoon') || text.includes('kids')) return 'kids';
    if (text.includes('hbo') || text.includes('movie') || text.includes('cinema') || text.includes('film')) return 'movies';
    return 'other';
  };

  const filtered = React.useMemo(() => {
    return channels.filter((c) => {
      const text = `${c?.title ?? ''} ${c?.provider ?? ''} ${c?.channel_number ?? ''}`.toLowerCase();
      const hit = !search || text.includes(search.toLowerCase());
      if (!hit) return false;
      if (activeFilter === 'all') return true;
      return classify(c) === activeFilter;
    });
  }, [channels, search, activeFilter]);

  React.useEffect(() => {
    let off = false;
    async function load() {
      setLoadingStream(true);
      setError(null);
      setStreamUrl(null);
      try {
        const ch = filtered[selected] || filtered[0] || channels[0];
        if (!ch?.id) {
          setLoadingStream(false);
          return;
        }
        const res = await contentService.getStreamUrl(ch.id);
        if (!off) {
          if (res.success && res.data?.stream_url) {
            const drmKeysValue = res.data.drm_keys || null;
            const drmKeysExoValue = res.data.drm_keys_exo || null;
            setStreamUrl(res.data.stream_url);
            setDrmKeys(drmKeysValue);
            setDrmKeysExo(drmKeysExoValue);
          } else {
            setError(t('user.dashboard.liveStreamError'));
          }
        }
      } catch {
        if (!off) setError(t('user.dashboard.liveLoadError'));
      } finally {
        if (!off) setLoadingStream(false);
      }
    }
    if (filtered.length) load();
    return () => { off = true; };
  }, [channels, filtered, selected, t]);

  React.useEffect(() => {
    setSelected(0);
  }, [search, activeFilter]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6 sm:px-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-sky-500/15 p-2 ring-1 ring-sky-500/20">
            <Radio className="h-5 w-5 text-sky-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-100">{t('user.dashboard.liveTv')}</h3>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 p-1">
          <button
            onClick={() => setViewMode('channels')}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm',
              viewMode === 'channels' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white',
            )}
          >
            <span className="inline-flex items-center"><List className="mr-1 h-4 w-4" />{t('user.dashboard.liveChannels')}</span>
          </button>
          <button
            onClick={() => setViewMode('guide')}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm',
              viewMode === 'guide' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white',
            )}
          >
            <span className="inline-flex items-center"><Calendar className="mr-1 h-4 w-4" />{t('user.dashboard.liveGuide')}</span>
          </button>
        </div>
      </div>

      {viewMode === 'channels' ? (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('user.dashboard.searchChannels')}
              className="mb-3 h-10 border-slate-700 bg-slate-800/60 text-slate-200 placeholder:text-slate-500"
            />
            <div className="mb-3 flex flex-wrap gap-2">
              {(['all', 'movies', 'sports', 'kids'] as const).map((k) => (
                <button
                  key={`flt-${k}`}
                  onClick={() => setActiveFilter(k)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-all',
                    activeFilter === k
                      ? 'border-sky-500 bg-sky-500/20 text-sky-100'
                      : 'border-slate-700 bg-slate-900/50 text-slate-200 hover:bg-slate-800/70',
                  )}
                >
                  {k === 'all' ? t('common.all') : k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>

            <div className="max-h-[58vh] overflow-y-auto pr-1">
              <ul className="space-y-1">
                {filtered.map((c, i) => {
                  const active = i === selected;
                  return (
                    <li key={`tvch-${c.id}-${i}`}>
                      <button
                        onClick={() => setSelected(i)}
                        className={cn(
                          'w-full rounded-lg px-3 py-2 text-left transition-colors flex items-center gap-3',
                          active ? 'bg-slate-800 text-white ring-1 ring-sky-500/30' : 'text-slate-200 hover:bg-slate-800/60',
                        )}
                      >
                        <span
                          className="h-10 w-10 rounded-md bg-cover bg-center flex-shrink-0 ring-1 ring-slate-700"
                          style={{ backgroundImage: `url(${c.image_url || c.backdrop_url || ''})` }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.title}</p>
                          <div className="text-[11px] text-slate-400">
                            {c.provider || (c.channel_number ? `${t('user.dashboard.channel')} ${c.channel_number}` : '')}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2">
              <LiveTVPlayer
                src={streamUrl}
                title={(filtered[selected] || filtered[0] || channels[0])?.title || t('user.menu.liveTv')}
                poster={(filtered[selected] || filtered[0] || channels[0])?.backdrop_url || (filtered[selected] || filtered[0] || channels[0])?.image_url}
                autoPlay
                drmKeys={drmKeys}
                drmKeysExo={drmKeysExo}
              />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">{t('user.dashboard.nowPlaying')}</p>
                  <p className="text-base font-medium text-white">
                    {(filtered[selected] || filtered[0] || channels[0])?.provider || t('user.dashboard.liveChannel')}
                  </p>
                </div>
                <div className="text-right">
                  {(filtered[selected] || filtered[0] || channels[0])?.channel_number ? (
                    <p className="text-xs text-slate-500">
                      {t('user.dashboard.channel')} {(filtered[selected] || filtered[0] || channels[0])?.channel_number}
                    </p>
                  ) : null}
                </div>
              </div>
              {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
              {loadingStream || isLoading ? <p className="mt-2 text-sm text-slate-400">{t('common.loading')}</p> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
          {t('user.dashboard.noEpg')}
        </div>
      )}
    </div>
  );
}

function UserContentPageInner() {
  const searchParams = useSearchParams();

  return (
    <UserRoute>
      <div className="min-h-screen bg-slate-950 text-white">
        <main className="relative overflow-x-hidden pb-24">
          {((searchParams.get('tab') || '').toLowerCase() === 'live') ? (
            <LiveTVContent />
          ) : (
            <ContentBrowsePage />
          )}
        </main>
      </div>
    </UserRoute >
  );
}

export default function UserContentPage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">{t('common.loading')}</div>}>
      <UserContentPageInner />
    </Suspense>
  );
}
