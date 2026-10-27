'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search, Share2, Dot, Clock, Info, Loader2, Tv, Film, Signal } from 'lucide-react';
import { format, addHours, differenceInMinutes } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LiveTVPlayer from '@/components/ui/LiveTVPlayer';
import ModernEPGGuide from '@/components/user/ModernEPGGuide';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { contentService, apiService } from '@/services';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { APP_NAME } from '@/constants/app';
import type { Content } from '@/types';

type EPGProgram = {
  channel_id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  category?: string;
};

export default function LiveTVPage() {
  const { t } = useTranslation();

  const { data: channels = [], isLoading } = useQuery<Content[]>({
    queryKey: ['user-content', 'live-tv', 'channels'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getTVChannels({ page: 1, limit: 200 });
      if (res.success && res.data) return res.data;
      return [];
    }});

  const { data: tvCategories = [], isLoading: isLoadingCategories } = useQuery<string[]>({
    queryKey: ['tv-categories'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const result = await contentService.getTVChannelCategories();
      if (result.success && result.data) {
        return result.data;
      }
      return [];
    }});

  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [drmKeys, setDrmKeys] = useState<string | null>(null);
  const [drmKeysExo, setDrmKeysExo] = useState<string | null>(null);
  const [licenseServerUrl, setLicenseServerUrl] = useState<string | null>(null);
  const [drmType, setDrmType] = useState<'clearkey' | 'widevine' | 'playready' | null>(null);
  const [loadingStream, setLoadingStream] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [headerOrigin, setHeaderOrigin] = useState<string | null>(null);
  const [headerUserAgent, setHeaderUserAgent] = useState<string | null>(null);
  const [headerReferer, setHeaderReferer] = useState<string | null>(null);
  const [headerCustomHeaders, setHeaderCustomHeaders] = useState<string | null>(null);
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const priorityCategories = useMemo(() => ['all', 'Sports', 'Entertainment', 'News', 'Movies'] as const, []);

  const getCategoryLabel = useCallback((category: string) => {
    if (category === 'all') return t('common.all');
    switch (category.toLowerCase()) {
      case 'sports':
        return t('user.live.categories.sports');
      case 'entertainment':
        return t('user.live.categories.entertainment');
      case 'news':
        return t('user.live.categories.news');
      case 'movies':
        return t('user.live.categories.movies');
      default:
        // Backend-defined category, keep as-is
        return category;
    }
  }, [t]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    tvCategories.forEach((cat: string) => {
      if (cat) {
        unique.add(cat);
      }
    });
    return ['all', ...Array.from(unique)];
  }, [tvCategories]);

  const filteredChannels = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return channels.filter((channel) => {
      const matchesCategory = selectedCategory === 'all' || channel.channel_category === selectedCategory;
      const matchesSearch = !normalizedSearch || channel.title?.toLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [channels, selectedCategory, searchTerm]);

  const selectedChannel = useMemo(() => {
    if (!selectedChannelId) return null;
    return channels.find((channel) => channel.id === selectedChannelId) ?? null;
  }, [channels, selectedChannelId]);

  const displayChannel = selectedChannel ?? filteredChannels[0] ?? channels[0] ?? null;

  const handleChannelSelect = useCallback(async (channel: Pick<Content, 'id'>) => {
    if (!channel) return;

    setSelectedChannelId(channel.id);
    setStreamUrl(null);
    setDrmKeys(null);
    setDrmKeysExo(null);
    setLicenseServerUrl(null);
    setDrmType(null);
    setError(null);
    setLoadingStream(true);

    // Smooth scroll to top on mobile
    if (window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    try {
      const streamRes = await contentService.getStreamUrl(channel.id);
      if (streamRes.success && streamRes.data?.stream_url) {
        setStreamUrl(streamRes.data.stream_url);
        setDrmKeys(streamRes.data.drm_keys || null);
        setDrmKeysExo(streamRes.data.drm_keys_exo || null);
        setLicenseServerUrl(streamRes.data.license_server_url || null);
        setDrmType(streamRes.data.drm_type || null);
        setHeaderOrigin(streamRes.data.origin || null);
        setHeaderUserAgent(streamRes.data.user_agent || null);
        setHeaderReferer(streamRes.data.referer || null);
        setHeaderCustomHeaders(streamRes.data.custom_headers || null);
      } else {
        setError(streamRes.error?.error || streamRes.error?.message || t('user.live.streamFailed'));
      }
    } catch (err) {
      console.error('Error loading stream:', err);
      setError(t('user.live.streamError'));
    } finally {
      setLoadingStream(false);
    }
  }, [t]);

  useEffect(() => {
    if (!filteredChannels.length) return;

    if (!selectedChannelId || !filteredChannels.some((channel) => channel.id === selectedChannelId)) {
      void handleChannelSelect(filteredChannels[0]);
    }
  }, [filteredChannels, selectedChannelId, handleChannelSelect]);

  const { data: programInfo, isLoading: isLoadingProgram } = useQuery({
    queryKey: ['user-content', 'live-tv', 'program-info', selectedChannelId],
    enabled: !!selectedChannelId,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      if (!selectedChannelId) return { current: null, next: null };

      try {
        const now = new Date();
        const end = addHours(now, 3);
        const result = await apiService.get(
          `/api/tv/epg?channel_ids=${selectedChannelId}&start=${now.toISOString()}&end=${end.toISOString()}`
        );

        const anyData = result.data as { programs?: EPGProgram[] } | undefined;
        if (result.success && anyData?.programs) {
          const programs = (anyData.programs as EPGProgram[]).filter(
            (program) => program.channel_id === String(selectedChannelId)
          );

          if (!programs.length) return { current: null, next: null };

          const nowTime = now.getTime();
          const current =
            programs.find((program) => {
              const startTime = new Date(program.start).getTime();
              const endTime = new Date(program.end).getTime();
              return nowTime >= startTime && nowTime < endTime;
            }) ?? null;

          const next =
            programs
              .filter((program) => new Date(program.start).getTime() > nowTime)
              .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0] ?? null;

          return { current, next };
        }

        return { current: null, next: null };
      } catch (err) {
        console.error('Error fetching EPG data:', err);
        return { current: null, next: null };
      }
    }});

  const currentProgram = programInfo?.current ?? null;
  const nextProgram = programInfo?.next ?? null;

  const currentProgramMeta = useMemo(() => {
    if (!currentProgram) return null;

    const now = new Date();
    const startDate = new Date(currentProgram.start);
    const endDate = new Date(currentProgram.end);
    const totalMinutes = Math.max(differenceInMinutes(endDate, startDate), 1);
    const elapsedMinutes = Math.max(differenceInMinutes(now, startDate), 0);
    const progress = Math.min(Math.max((elapsedMinutes / totalMinutes) * 100, 0), 100);
    const minutesLeft = Math.max(differenceInMinutes(endDate, now), 0);

    return { startDate, endDate, progress, minutesLeft };
  }, [currentProgram]);

  const visibleChannels = filteredChannels.length;

  return (
    <UserRoute>
      <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-500/30 selection:text-blue-100">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full bg-blue-900/10 blur-[120px] mix-blend-screen animate-pulse duration-[8000ms]" />
          <div className="absolute top-[40%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-purple-900/10 blur-[120px] mix-blend-screen animate-pulse duration-[12000ms]" />
        </div>

        <main className="relative flex flex-col h-full z-10">
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="mx-auto flex max-w-[1920px] flex-col gap-8 px-4 py-6 lg:px-8 lg:py-8">

              {/* Top Controls Bar */}
              <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl py-4 -mx-4 px-4 lg:-mx-8 lg:px-8 border-b border-white/5 shadow-2xl shadow-black/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl shadow-lg shadow-blue-900/20">
                    <Signal className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                      {t('user.menu.liveTv')}
                    </h1>
                    <p className="text-xs text-slate-400 font-medium tracking-wide">
                      {t('user.live.channelsLive', { count: visibleChannels })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <div className="relative group w-full sm:w-[320px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                    <Input
                      placeholder={t('user.filters.searchChannels')}
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="w-full h-10 rounded-xl border-white/10 bg-white/5 pl-10 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-white/10 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
                    {priorityCategories.map((cat) => (
                      // Show priority categories first, others in dropdown ideally but simple list for now
                      categories.includes(cat) || cat === 'all' ? (
                        <Button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          size="sm"
                          variant="ghost"
                          className={cn(
                            'rounded-lg border px-4 h-10 text-xs font-semibold whitespace-nowrap transition-all duration-300',
                            selectedCategory === cat
                              ? 'border-blue-500/50 bg-blue-600/20 text-blue-100 shadow-[0_0_20px_-5px_rgba(37,99,235,0.3)]'
                              : 'border-white/5 bg-white/5 text-slate-400 hover:border-white/10 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          {getCategoryLabel(cat)}
                        </Button>
                      ) : null
                    ))}
                  </div>
                </div>
              </section>

              {/* Main Content Grid */}
              <div className="grid gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
                {/* Left Column: Player */}
                <div className="flex flex-col gap-6">
                  <div key={`${selectedChannelId ?? 'none'}-${streamAttempt}`} className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#0A0A0A] shadow-[0_0_50px_-20px_rgba(0,0,0,0.5)] group">
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none z-10" />
                    {streamUrl ? (
                      <LiveTVPlayer
                        key={`${selectedChannelId ?? 'none'}-${streamAttempt}-${streamUrl}`}
                        src={streamUrl}
                        drmKeys={drmKeys}
                        drmKeysExo={drmKeysExo}
                        licenseServerUrl={licenseServerUrl}
                        drmType={drmType}
                        title={displayChannel?.title || t('user.menu.liveTv')}
                        poster={displayChannel?.backdrop_url || displayChannel?.image_url || undefined}
                        autoPlay
                        aspectClassName="aspect-video lg:aspect-[21/9]"
                        className="bg-black shadow-inner shadow-black/50"
                        origin={headerOrigin}
                        userAgent={headerUserAgent}
                        referer={headerReferer}
                        customHeaders={headerCustomHeaders}
                      />
                    ) : (
                      <div className="aspect-video lg:aspect-[21/9] w-full flex flex-col items-center justify-center gap-6 bg-[#0A0A0A]">
                        {loadingStream ? (
                          <div className="flex flex-col items-center gap-4">
                            <div className="relative">
                              <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl animate-pulse" />
                              <Loader2 className="h-12 w-12 animate-spin text-blue-500 relative z-10" />
                            </div>
                            <p className="text-sm font-medium text-slate-400 animate-pulse">
                              {t('user.live.loadingStream')}
                            </p>
                          </div>
                        ) : error ? (
                          <div className="flex flex-col items-center gap-4 text-center max-w-md p-6">
                            <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 mb-2">
                              <Signal className="h-8 w-8 text-red-500" />
                            </div>
                            <h3 className="text-lg font-semibold text-white">{t('user.live.streamUnavailableTitle')}</h3>
                            <p className="text-sm text-slate-400">{error}</p>
                            <Button
                              onClick={() => { setStreamAttempt((attempt) => attempt + 1); displayChannel && void handleChannelSelect(displayChannel); }}
                              variant="outline"
                              className="mt-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            >
                              {t('common.retry')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-4">
                            <Tv className="h-16 w-16 text-slate-700" />
                            <p className="text-slate-500 font-medium">
                              {t('user.live.selectPrompt')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Channel Quick Stats / Description area could go here if needed below player */}
                </div>

                {/* Right Column: Info & Up Next */}
                <div className="space-y-6">
                  {/* Current Program Card */}
                  <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-6 shadow-xl relative overflow-hidden group h-full max-h-[500px] flex flex-col">
                    {/* Dynamic background based on category if possible, currently generic gradient */}
                    <div className="absolute top-0 right-0 p-32 bg-blue-600/20 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none group-hover:bg-blue-600/30 transition-colors duration-700" />

                    <div className="relative z-10 space-y-6 flex-1 flex flex-col">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 animate-pulse">
                              {t('user.live.liveBadge')}
                            </Badge>
                            {displayChannel?.channel_category ? (
                              <Badge variant="outline" className="border-white/10 text-slate-300">
                                {displayChannel.channel_category}
                              </Badge>
                            ) : null}
                          </div>
                          <h2 className="text-2xl font-bold text-white leading-tight">
                            {displayChannel?.title || t('user.live.unknownChannel')}
                          </h2>
                          <p className="text-sm text-slate-400 font-medium">
                            {displayChannel?.provider || t('user.live.providerFallback', { appName: APP_NAME })}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            toast.success(t('user.live.toastCurrentlyViewing', { title: displayChannel?.title || t('user.live.unknownChannel') }));
                          }}
                          className="rounded-full h-10 w-10 border-white/10 bg-white/5 hover:bg-white/10 text-white"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Program Progress */}
                      {isLoadingProgram ? (
                        <div className="space-y-3 py-2">
                          <div className="h-4 w-1/3 bg-white/10 rounded animate-pulse" />
                          <div className="h-2 w-full bg-white/5 rounded animate-pulse" />
                        </div>
                      ) : currentProgram && currentProgramMeta ? (
                        <div className="space-y-3">
                          <div className="flex justify-between items-end text-sm">
                            <div className="font-semibold text-blue-200">
                              {currentProgram.title}
                            </div>
                            <div className="text-xs font-mono text-slate-400">
                              {format(currentProgramMeta.startDate, 'HH:mm')} - {format(currentProgramMeta.endDate, 'HH:mm')}
                            </div>
                          </div>
                          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                              style={{ width: `${currentProgramMeta.progress}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 font-medium">
                            <span>{t('user.live.nowPlaying')}</span>
                            <span>{t('user.live.minutesLeft', { count: currentProgramMeta.minutesLeft })}</span>
                          </div>
                          {currentProgram.description && (
                            <p className="text-sm text-slate-400 leading-relaxed line-clamp-4 overflow-y-auto pr-2 custom-scrollbar">
                              {currentProgram.description}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-white/5 p-4 text-center">
                          <p className="text-sm text-slate-400">{t('user.live.noProgramInfo')}</p>
                        </div>
                      )}

                      {/* Up Next Preview */}
                      {nextProgram && (
                        <div className="pt-4 border-t border-white/5 mt-auto">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('user.live.upNext')}</span>
                          </div>
                          <div className="flex items-center group/next cursor-default transition-all">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-300 group-hover/next:text-white transition-colors">
                                {nextProgram.title}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {format(new Date(nextProgram.start), 'HH:mm')} - {format(new Date(nextProgram.end), 'HH:mm')}
                              </p>
                            </div>
                            <Info className="h-4 w-4 text-slate-600 group-hover/next:text-blue-400 transition-colors" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* EPG Guide Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <Film className="w-5 h-5 text-purple-400" />
                  <h3 className="text-lg font-bold text-white">{t('user.live.channelGuide')}</h3>
                </div>
                <div className="rounded-3xl border border-white/10 bg-[#080808] overflow-hidden shadow-2xl">
                  {visibleChannels > 0 ? (
                    <ModernEPGGuide
                      channels={filteredChannels}
                      selectedChannelId={selectedChannel?.id ?? null}
                      onChannelSelect={(channel) => void handleChannelSelect(channel)}
                      showHeader={false}
                      className="h-[600px]"
                    />
                  ) : (
                    <div className="flex h-[400px] flex-col items-center justify-center gap-3">
                      <Tv className="h-10 w-10 text-slate-700" />
                      <span className="text-slate-500">{t('user.live.noChannelsFound')}</span>
                    </div>
                  )}
                </div>
              </section>

            </div>
          </div>
        </main>
      </div>
    </UserRoute>
  );
}
