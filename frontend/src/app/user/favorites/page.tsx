'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Heart, Film, Radio, Clapperboard } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import VODCard from '@/components/user/VODCard';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { favoritesService } from '@/services/favorites';
import { contentService } from '@/services/content';
import { cn } from '@/lib/utils';
import { GridSkeleton, ContentCardSkeleton } from '@/components/ui/skeleton-loader';
import type { Content } from '@/types';

interface ContentDetails {
  id: number;
  title: string;
  image_url?: string;
  poster_url?: string;
  backdrop_url?: string;
  description?: string;
  year?: number;
  tmdb_id?: number;
  rating?: number;
}

export default function FavoritesPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'series' | 'channels'>('all');

  const buildDetails = (content: Content): ContentDetails => ({
    id: content.id,
    title: content.title,
    image_url: content.image_url,
    poster_url: content.poster_url,
    backdrop_url: content.backdrop_url,
    description: content.description,
    year: content.year,
    tmdb_id: content.tmdb_id,
    rating: content.rating
  });

  const fetchDetails = async (ids: string[]): Promise<ContentDetails[]> => {
    if (!ids?.length) {
      return [];
    }

    const details = await Promise.all(
      ids.map(async (id) => {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
          return null;
        }

        try {
          const result = await contentService.getContentById(numericId);
          if (result.success && result.data) {
            return buildDetails(result.data);
          }

          console.error(`Failed to fetch content ${id}:`, result.error ?? 'Unknown error');
          return null;
        } catch (error) {
          console.error(`Failed to fetch content ${id}:`, error);
          return null;
        }
      })
    );

    return details.filter((item): item is ContentDetails => item !== null);
  };

  // Load all favorites with full details
  const { data: favorites, isLoading, refetch } = useQuery({
    queryKey: ['user-favorites-detailed'],
    queryFn: async () => {
      const favoriteIds = await favoritesService.getFavorites();

      const [moviesDetails, seriesDetails, channelsDetails] = await Promise.all([
        fetchDetails(favoriteIds.movies),
        fetchDetails(favoriteIds.series),
        fetchDetails(favoriteIds.channels),
      ]);

      return {
        movies: moviesDetails,
        series: seriesDetails,
        channels: channelsDetails,
        music_tracks: [],
        music_albums: [],
        music_artists: []
      };
    }
  });

  // Calculate stats with safe access
  const stats = {
    movies: favorites?.movies?.length || 0,
    series: favorites?.series?.length || 0,
    channels: favorites?.channels?.length || 0,
    total: (favorites?.movies?.length || 0) + (favorites?.series?.length || 0) + (favorites?.channels?.length || 0)
  };

  const renderContentCard = (item: ContentDetails, category: string) => (
    <VODCard
      key={item.id}
      id={item.id}
      title={item.title}
      description={item.description}
      year={item.year}
      poster_url={item.poster_url}
      image_url={item.image_url}
      backdrop_url={item.backdrop_url}
      rating={item.rating}
      category={category}
    />
  );

  return (
    <UserRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <main className="flex-1 overflow-y-auto h-full">
          <div className="container mx-auto px-6 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <Heart className="h-8 w-8 text-red-500 fill-red-500" />
                <h1 className="text-4xl font-bold text-white">
                  {t('user.favorites.title')}
                </h1>
              </div>
              <p className="text-slate-400">
                {t('user.favorites.description')}
              </p>
            </div>

            {/* Modern Filter Pills */}
            <div className="flex flex-wrap items-center gap-3 mb-8">
              <button
                onClick={() => setActiveTab('all')}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border',
                  activeTab === 'all'
                    ? 'bg-violet-500 text-white border-violet-400 shadow-lg shadow-violet-500/30'
                    : 'bg-slate-700/90 text-slate-200 border-slate-600 hover:bg-slate-600 hover:text-white hover:border-slate-500'
                )}
              >
                <Heart className="h-4 w-4" />
                {t('common.all')}
                <span className={cn(
                  'ml-1 px-2 py-0.5 rounded-full text-xs font-bold',
                  activeTab === 'all' ? 'bg-white/25 text-white' : 'bg-slate-600 text-slate-300'
                )}>
                  {stats.total}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('movies')}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border',
                  activeTab === 'movies'
                    ? 'bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-500/30'
                    : 'bg-slate-700/90 text-slate-200 border-slate-600 hover:bg-slate-600 hover:text-white hover:border-slate-500'
                )}
              >
                <Film className="h-4 w-4" />
                {t('user.menu.movies')}
                <span className={cn(
                  'ml-1 px-2 py-0.5 rounded-full text-xs font-bold',
                  activeTab === 'movies' ? 'bg-white/25 text-white' : 'bg-slate-600 text-slate-300'
                )}>
                  {stats.movies}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('series')}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border',
                  activeTab === 'series'
                    ? 'bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/30'
                    : 'bg-slate-700/90 text-slate-200 border-slate-600 hover:bg-slate-600 hover:text-white hover:border-slate-500'
                )}
              >
                <Clapperboard className="h-4 w-4" />
                {t('user.menu.series')}
                <span className={cn(
                  'ml-1 px-2 py-0.5 rounded-full text-xs font-bold',
                  activeTab === 'series' ? 'bg-white/25 text-white' : 'bg-slate-600 text-slate-300'
                )}>
                  {stats.series}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('channels')}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border',
                  activeTab === 'channels'
                    ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/30'
                    : 'bg-slate-700/90 text-slate-200 border-slate-600 hover:bg-slate-600 hover:text-white hover:border-slate-500'
                )}
              >
                <Radio className="h-4 w-4" />
                {t('user.menu.liveTv')}
                <span className={cn(
                  'ml-1 px-2 py-0.5 rounded-full text-xs font-bold',
                  activeTab === 'channels' ? 'bg-white/25 text-white' : 'bg-slate-600 text-slate-300'
                )}>
                  {stats.channels}
                </span>
              </button>
            </div>

            {/* Content Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">

              {/* All Favorites */}
              <TabsContent value="all" className="space-y-6">
                {isLoading ? (
                  <GridSkeleton items={12} />
                ) : stats.total === 0 ? (
                  <div className="text-center py-20">
                    <Heart className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {t('user.favorites.emptyTitle')}
                    </h3>
                    <p className="text-slate-400">
                      {t('user.favorites.emptyDescription')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {stats.movies > 0 && (
                      <div>
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                          <Film className="h-5 w-5 text-blue-400" />
                          {t('user.menu.movies')} ({stats.movies})
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
                          {favorites?.movies.map((movie) => renderContentCard(movie, t('user.menu.movies')))}
                        </div>
                      </div>
                    )}
                    {stats.series > 0 && (
                      <div>
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                          <Clapperboard className="h-5 w-5 text-purple-400" />
                          {t('user.menu.series')} ({stats.series})
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
                          {favorites?.series.map((series) => renderContentCard(series, t('user.menu.series')))}
                        </div>
                      </div>
                    )}
                    {stats.channels > 0 && (
                      <div>
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                          <Radio className="h-5 w-5 text-green-400" />
                          {t('user.menu.liveTv')} ({stats.channels})
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
                          {favorites?.channels.map((channel) => renderContentCard(channel, t('user.menu.liveTv')))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Movies */}
              <TabsContent value="movies" className="space-y-6">
                {isLoading ? (
                  <GridSkeleton items={12} />
                ) : stats.movies === 0 ? (
                  <div className="text-center py-20">
                    <Film className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {t('user.favorites.emptyMoviesTitle')}
                    </h3>
                    <p className="text-slate-400">
                      {t('user.favorites.emptyMoviesDescription')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
                    {favorites?.movies.map((movie) => renderContentCard(movie, t('user.menu.movies')))}
                  </div>
                )}
              </TabsContent>

              {/* Series */}
              <TabsContent value="series" className="space-y-6">
                {isLoading ? (
                  <GridSkeleton items={12} />
                ) : stats.series === 0 ? (
                  <div className="text-center py-20">
                    <Clapperboard className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {t('user.favorites.emptySeriesTitle')}
                    </h3>
                    <p className="text-slate-400">
                      {t('user.favorites.emptySeriesDescription')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
                    {favorites?.series.map((series) => renderContentCard(series, t('user.menu.series')))}
                  </div>
                )}
              </TabsContent>

              {/* Channels */}
              <TabsContent value="channels" className="space-y-6">
                {isLoading ? (
                  <GridSkeleton items={12} />
                ) : stats.channels === 0 ? (
                  <div className="text-center py-20">
                    <Radio className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {t('user.favorites.emptyChannelsTitle')}
                    </h3>
                    <p className="text-slate-400">
                      {t('user.favorites.emptyChannelsDescription')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
                    {favorites?.channels.map((channel) => renderContentCard(channel, t('user.menu.liveTv')))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </UserRoute>
  );
}
