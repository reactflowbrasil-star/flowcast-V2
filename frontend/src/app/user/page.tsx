'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Sparkles,
  Activity,
  Search,
  Tv
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useBannedRedirect } from '@/hooks/useBannedRedirect';
import { apiErrorMessage } from '@/lib/utils';
import { contentService, userProfileService } from '@/services';
import HeroSlider from '@/components/user/HeroSlider';
import { ContentRail } from '@/components/user/ContentRail';
import { CATEGORY_ICONS } from '@/constants/categoryIcons';
import { ROUTES } from '@/constants/app';
import { changeLanguageWithPreload } from '@/lib/i18n';
import Link from 'next/link';
import { favoritesService, type FavoriteContent } from '@/services/favorites';
import ViewerProfilesControl from '@/components/user/ViewerProfilesControl';
import type { ViewerProfile } from '@/lib/viewerProfiles';

import type {
  Content,
  Series,
  DiscoveryMediaItem,
  DiscoveryRail
} from '@/types';

const defaultLanguageOptions = [
  { code: 'en', labelKey: 'user.languages.en', nativeKey: 'user.languages.en_native' },
  { code: 'es', labelKey: 'user.languages.es', nativeKey: 'user.languages.es_native' },
  { code: 'fr', labelKey: 'user.languages.fr', nativeKey: 'user.languages.fr_native' },
  { code: 'pt', labelKey: 'user.languages.pt', nativeKey: 'user.languages.pt_native' },
  { code: 'ru', labelKey: 'user.languages.ru', nativeKey: 'user.languages.ru_native' },
  { code: 'tr', labelKey: 'user.languages.tr', nativeKey: 'user.languages.tr_native' },
  { code: 'sk', labelKey: 'user.languages.sk', nativeKey: 'user.languages.sk_native' },
  { code: 'zh', labelKey: 'user.languages.zh', nativeKey: 'user.languages.zh_native' },
] as const;

// Helper to map Content[] to DiscoveryMediaItem[]
const mapListToItems = (list: any[], mediaType: string): DiscoveryMediaItem[] =>
  (list || []).map((c, index) => {
    const poster = c.poster_url || c.image_url || '';
    const backdrop = c.backdrop_url || c.image_url || poster || '';
    const title = c.title || '';
    const description = c.description || undefined;
    const year = c.year;
    const contentId = c.id;

    return {
      id: `${mediaType}-${c.id}-${index}`,
      title,
      description,
      image: poster || undefined,
      backdrop: backdrop || undefined,
      media_type: mediaType,
      content_id: contentId,
      year,
      genres: (Array.isArray(c.genres) ? c.genres : typeof c.genre === 'string' ? c.genre.split(',') : []).map((genre: any) => typeof genre === 'string' ? genre.trim() : genre?.name).filter(Boolean),
      badges: [],
      // For series progress or specific logic
      progress: c.progress_percent
    } as DiscoveryMediaItem;
  });

const toTimestamp = (value: unknown): number => {
  if (!value || typeof value !== 'string') return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
};

const sortByLatestAdded = <T extends Record<string, any>>(items: T[]): T[] => {
  return [...(items || [])].sort((a, b) => {
    const aTs = toTimestamp(a.created_at ?? a.createdAt ?? a.content?.created_at ?? a.content?.createdAt);
    const bTs = toTimestamp(b.created_at ?? b.createdAt ?? b.content?.created_at ?? b.content?.createdAt);
    return bTs - aTs;
  });
};

export default function UserDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [heroBg, setHeroBg] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(i18n.language || 'en');
  const [activeViewerProfile, setActiveViewerProfile] = useState<ViewerProfile | null>(null);

  useBannedRedirect();

  useEffect(() => {
    setSelectedLanguage(i18n.language || 'en');
  }, [i18n.language]);

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['user-dashboard', 'favorite-recommendations', user?.id] });
    window.addEventListener('flowcast:favorites-updated', refresh);
    return () => window.removeEventListener('flowcast:favorites-updated', refresh);
  }, [queryClient, user?.id]);

  const handleLanguageChange = async (languageCode: string) => {
    setSelectedLanguage(languageCode);
    try {
      await changeLanguageWithPreload(languageCode);
      localStorage.setItem('iptv_language', languageCode);
    } catch (error) {
      console.error('Failed to change language', error);
    }
  };

  // --- DATA FETCHING ---

  // 1. Continue Watching
  const { data: continueWatchingItems = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['user-dashboard', 'continue-watching'],
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const result = await contentService.getContinueWatching();
      if (!result.success || !result.data) return [];

      // Filter out Live TV and Events
      const excludedTypes = ['tv', 'live', 'livetv', 'live_tv', 'event', 'events'];
      const items = result.data.items
        .filter((item) => {
          const contentType = (item.content_type || '').toLowerCase();
          return !excludedTypes.includes(contentType);
        })
        .slice(0, 16);

      return items.map((item, index): DiscoveryMediaItem => ({
        id: `continue-${item.content_id}-${item.episode_id ?? 0}-${index}`,
        title: item.title || t('createContent.untitled'),
        image: item.poster_url || item.backdrop_url || undefined,
        backdrop: item.backdrop_url || item.poster_url || undefined,
        media_type: item.content_type,
        content_id: item.content_id,
        episode_id: item.episode_id ?? undefined,
        progress: item.progress_percent ? item.progress_percent / 100 : 0,
        badges: ['continue'],
        subtitle: item.series_title ? item.series_title : undefined
      }));
    }
  });

  // 2. Movies
  const { data: moviesContent = [], isLoading: isLoadingMovies } = useQuery({
    queryKey: ['user-dashboard', 'movies', 'public'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await contentService.getMovies({ page: 1, limit: 30 });
      if (!result.success || !result.data) return [];
      return result.data;
    }
  });
  const moviesItems = useMemo(() => mapListToItems(sortByLatestAdded(moviesContent), 'movie'), [moviesContent]);

  // 3. Series
  const { data: seriesPage = { series: [] as Series[] }, isLoading: isLoadingSeries } = useQuery({
    queryKey: ['user-dashboard', 'series', 'public'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getSeries(1, 24);
      if (!res.success || !res.data) return { series: [] };
      return res.data;
    }
  });
  // Series data has nested content structure - extract content properties
  const seriesItems = useMemo(() => {
    const flattenedSeries = sortByLatestAdded(seriesPage.series).map((s: any) => ({
      id: s.content?.id || s.id,
      title: s.content?.title || s.title,
      description: s.content?.description || s.description,
      poster_url: s.content?.image_url || s.content?.poster_url || s.poster_url,
      image_url: s.content?.image_url || s.image_url,
      backdrop_url: s.content?.backdrop_url || s.backdrop_url,
      year: s.content?.year || s.year,
      progress_percent: s.progress_percent,
      created_at: s.content?.created_at || s.created_at
    }));
    return mapListToItems(flattenedSeries, 'series');
  }, [seriesPage.series]);

  // 4. Kids (if enabled/subscribed - simplified logic for now)
  const { data: kidsContent = [], isLoading: isLoadingKids } = useQuery({
    queryKey: ['user-dashboard', 'kids'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getKidsContent({ page: 1, limit: 24 });
      if (!res.success || !res.data) return [];
      return res.data;
    }
  });
  const kidsItems = useMemo(() => mapListToItems(sortByLatestAdded(kidsContent), 'kids'), [kidsContent]);

  // 5. Anime
  const { data: animeContent = [], isLoading: isLoadingAnime } = useQuery({
    queryKey: ['user-dashboard', 'anime'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getAnimeContent({ page: 1, limit: 24 });
      if (!res.success || !res.data) return [];
      return res.data;
    }
  });
  const animeItems = useMemo(() => mapListToItems(animeContent, 'anime'), [animeContent]);

  const { data: favoriteRecommendations = [] } = useQuery({
    queryKey: ['user-dashboard', 'favorite-recommendations', user?.id, activeViewerProfile?.id, activeViewerProfile?.favorite_genres],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const favorites = await favoritesService.getFavorites();
      const likedIds = new Set([...favorites.movies, ...favorites.series].map(String));
      if (favorites.data?.movies?.length || favorites.data?.series?.length) {
        const likedContent: FavoriteContent[] = [...favorites.data.movies, ...favorites.data.series];
        const genreCounts = new Map<string, number>();
        const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        for (const seed of likedContent) {
          for (const genre of (seed.genre ?? '').split(',')) {
            const normalized = normalize(genre);
            if (normalized) genreCounts.set(normalized, (genreCounts.get(normalized) ?? 0) + 1);
          }
        }
        const preferences = new Set((activeViewerProfile?.favorite_genres ?? []).map(normalize));
        const candidates = [...moviesItems, ...seriesItems, ...kidsItems, ...animeItems]
          .filter((item) => item.content_id && !likedIds.has(String(item.content_id)))
          .map((item) => {
            const candidateGenres = item.genres ?? [];
            const score = candidateGenres.reduce((sum, genre) => {
              const candidateGenre = normalize(genre);
              const relatedLikedGenres = [...genreCounts].reduce((count, [likedGenre, weight]) => {
                const sameGenre = candidateGenre === likedGenre || candidateGenre.startsWith(likedGenre) || likedGenre.startsWith(candidateGenre);
                return count + (sameGenre ? weight * 2 : 0);
              }, 0);
              const profilePreference = [...preferences].some((preference) => candidateGenre.includes(preference) || preference.includes(candidateGenre)) ? 3 : 0;
              return sum + relatedLikedGenres + profilePreference;
            }, 0);
            return { item, score };
          })
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ item }) => item)
          .slice(0, 24);
        return candidates;
      }
      const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const profileGenres = new Set((activeViewerProfile?.favorite_genres ?? []).map(normalize));
      const candidates = [...moviesItems, ...seriesItems, ...kidsItems, ...animeItems]
        .filter((item) => item.content_id && !likedIds.has(String(item.content_id)))
        .map((item) => ({ item, score: (item.genres ?? []).reduce((sum, genre) => sum + (profileGenres.has(normalize(genre)) ? 3 : 0), 0) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item);
      return candidates.slice(0, 24);
    },
  });

  // 6. Live TV (Simplified Fetch for "On Air" rail)
  // In a real app, we'd fetch "trending" or "most watched" channels.
  // Here we just fetch categories -> channels to populate a rail.
  const { data: liveChannels = [] } = useQuery({
    queryKey: ['user-dashboard', 'live-channels'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Mock: Fetching a few channels from first category or similar
      // For now, let's skip or mock. Real implementation needs a proper endpoint.
      return [];
    }
  });

  // --- GENRE EXTRACTION ---
  // Build dynamic genre list from fetched movies/series content
  const genreColorMap: Record<string, string> = {
    'action': 'from-red-900/80 to-red-600/20',
    'adventure': 'from-amber-900/80 to-amber-600/20',
    'comedy': 'from-yellow-900/80 to-yellow-600/20',
    'drama': 'from-blue-900/80 to-blue-600/20',
    'sci-fi': 'from-purple-900/80 to-purple-600/20',
    'science fiction': 'from-purple-900/80 to-purple-600/20',
    'horror': 'from-slate-900/80 to-slate-600/20',
    'thriller': 'from-rose-900/80 to-rose-600/20',
    'romance': 'from-pink-900/80 to-pink-600/20',
    'documentary': 'from-emerald-900/80 to-emerald-600/20',
    'animation': 'from-cyan-900/80 to-cyan-600/20',
    'fantasy': 'from-violet-900/80 to-violet-600/20',
    'mystery': 'from-indigo-900/80 to-indigo-600/20',
    'crime': 'from-zinc-900/80 to-zinc-600/20',
    'family': 'from-teal-900/80 to-teal-600/20',
    'war': 'from-stone-900/80 to-stone-600/20',
    'music': 'from-fuchsia-900/80 to-fuchsia-600/20',
    'history': 'from-orange-900/80 to-orange-600/20',
    'western': 'from-amber-950/80 to-amber-700/20',
  };
  const defaultGenreColor = 'from-slate-900/80 to-slate-600/20';

  const dynamicGenres = useMemo(() => {
    const genreSet = new Map<string, number>();
    // Extract genres from movies
    for (const movie of moviesContent) {
      const genre = (movie as any).genre;
      if (genre && typeof genre === 'string') {
        for (const g of genre.split(',')) {
          const normalized = g.trim();
          if (normalized) {
            genreSet.set(normalized, (genreSet.get(normalized) || 0) + 1);
          }
        }
      }
    }
    // Extract from series
    for (const s of seriesPage.series) {
      const genre = (s as any).genre || (s as any).content?.genre;
      if (genre && typeof genre === 'string') {
        for (const g of genre.split(',')) {
          const normalized = g.trim();
          if (normalized) {
            genreSet.set(normalized, (genreSet.get(normalized) || 0) + 1);
          }
        }
      }
    }

    // Sort by frequency and take top 12
    return Array.from(genreSet.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label]) => ({
        label,
        color: genreColorMap[label.toLowerCase()] || defaultGenreColor,
      }));
  }, [moviesContent, seriesPage.series]);

  // Check if there's any content at all
  const hasContent = moviesItems.length > 0 || seriesItems.length > 0 || kidsItems.length > 0 || animeItems.length > 0 || continueWatchingItems.length > 0;

  // --- HERO SELECTION ---
  // Prefer Continue Watching items if available, otherwise mix Movies
  const heroItems = useMemo(() => {
    if (continueWatchingItems.length > 0) {
      return [...continueWatchingItems.slice(0, 3), ...moviesItems.slice(0, 5)];
    }
    return moviesItems.slice(0, 8);
  }, [continueWatchingItems, moviesItems]);

  return (
    <UserRoute>
      <div className="min-h-screen pb-20">

        {/* Status / Language Bar (Absolute Top Right) */}
        <div className="absolute right-6 sm:right-10 top-6 z-30 flex items-center gap-3">
          {/* Language Picker - Simple Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs font-medium text-white hover:bg-white/10 transition-colors">
              <span className="uppercase">{selectedLanguage}</span>
            </button>
            <div className="absolute right-0 mt-2 w-44 max-h-72 overflow-y-auto bg-black/90 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 flex flex-col p-1">
              {defaultLanguageOptions.map(opt => (
                <button
                  key={opt.code}
                  onClick={() => handleLanguageChange(opt.code)}
                  className={`text-left px-3 py-2 text-xs rounded-md hover:bg-white/10 flex items-center justify-between ${selectedLanguage === opt.code ? 'text-blue-400 font-bold' : 'text-slate-300'}`}
                >
                  <span>{t(opt.nativeKey)}</span>
                  <span className="uppercase text-[10px] text-slate-500">{opt.code}</span>
                </button>
              ))}
            </div>
          </div>

          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400 px-2 py-0.5 backdrop-blur-md">
            <Activity className="mr-1 h-3 w-3" />
            {t('common.active')}
          </Badge>
          <ViewerProfilesControl onActiveProfileChange={setActiveViewerProfile} />
        </div>

        {/* Hero Section */}
        {hasContent && <HeroSlider items={heroItems} onActiveVisualChange={setHeroBg} />}

        {/* Content Rails Section - Overlapping Hero slightly for blending */}
        <div className={`relative z-20 space-y-8 sm:space-y-12 pb-24 ${hasContent ? '-mt-24 bg-gradient-to-b from-transparent via-[#050505] to-[#050505]' : 'pt-24'}`}>

          {/* Empty state when no content is available */}
          {!hasContent && !isLoadingMovies && !isLoadingSeries && (
            <section className="px-6 sm:px-10 py-16 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <Tv className="h-16 w-16 text-slate-600 mx-auto" />
                <h2 className="text-2xl font-bold text-white">{t('user.dashboard.noContent')}</h2>
                <p className="text-slate-400">{t('user.dashboard.noContentDescription')}</p>
              </div>
            </section>
          )}

          {/* 1. Continue Watching (Priority) */}
          {favoriteRecommendations.length > 0 && (
            <ContentRail
              title="Semelhantes ao que você curtiu"
              subtitle={activeViewerProfile?.favorite_genres.length ? `Sugestões para ${activeViewerProfile.name}` : 'Atualizado quando você marca um título como gostei'}
              items={favoriteRecommendations}
              icon={<Sparkles className="h-5 w-5 text-cyan-300" />}
            />
          )}
          <ContentRail
            title={t('user.dashboard.continueWatching')}
            subtitle={t('user.dashboard.progressSync')}
            items={continueWatchingItems}
            isLoading={isLoadingHistory}
            aspectRatio="video" // Cinematic look for history
            icon={<Play className="h-5 w-5 text-blue-500" />}
          />

          {/* 2. Movies */}
          <ContentRail
            title={t('user.menu.movies')}
            subtitle={t('user.dashboard.popularMovies')}
            items={moviesItems}
            isLoading={isLoadingMovies}
            viewAllHref={ROUTES.USER.MOVIES}
            icon={<CATEGORY_ICONS.Movies className="h-5 w-5 text-purple-500" />}
          />

          {/* 3. Series */}
          <ContentRail
            title={t('user.menu.series')}
            subtitle={t('user.dashboard.bingeWorthy')}
            items={seriesItems}
            isLoading={isLoadingSeries}
            viewAllHref={ROUTES.USER.SHOWS}
            icon={<CATEGORY_ICONS.Series className="h-5 w-5 text-orange-500" />}
          />

          {/* 4. Kids (Conditional) */}
          {kidsItems.length > 0 && (
            <ContentRail
              title={t('user.menu.kids')}
              items={kidsItems}
              isLoading={isLoadingKids}
              viewAllHref={ROUTES.USER.KIDS}
              icon={<CATEGORY_ICONS.Kids className="h-5 w-5 text-yellow-400" />}
            />
          )}

          {/* 5. Anime (Conditional) */}
          {animeItems.length > 0 && (
            <ContentRail
              title={t('user.menu.anime')}
              items={animeItems}
              isLoading={isLoadingAnime}
              viewAllHref={ROUTES.USER.ANIME}
              icon={<CATEGORY_ICONS.Anime className="h-5 w-5 text-pink-500" />}
            />
          )}

          {/* Quick Browse Categories — only shown when genres exist in content */}
          {dynamicGenres.length > 0 && (
            <section className="px-6 sm:px-10 pt-8">
              <div className="flex items-center gap-2 mb-6">
                <Search className="h-5 w-5 text-slate-400" />
                <h3 className="text-xl font-bold text-white">{t('user.dashboard.browse')}</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {dynamicGenres.map((cat) => (
                  <Link
                    key={cat.label}
                    href={`${ROUTES.CONTENT.BROWSE}?category=${cat.label}`}
                    className="relative h-24 rounded-xl overflow-hidden group hover:scale-105 transition-transform duration-300"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${cat.color}`} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white font-bold tracking-wide">{cat.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </UserRoute>
  );
}
