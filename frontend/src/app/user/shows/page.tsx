'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Clapperboard, Star, Play, Grid3X3, List, Heart, MoreHorizontal, Tv } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import VODCard from '@/components/user/VODCard';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { contentService } from '@/services';
import Link from 'next/link';
import PaginationControls from '@/components/ui/pagination-controls';

export default function ShowsPage() {
  const { t } = useTranslation();

  const pageSize = 50;
  const [page, setPage] = useState<number>(1);

  // Load TV shows
  const { data: showsData, isLoading } = useQuery({
    queryKey: ['user-shows', page, pageSize],
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await contentService.getSeries(page, pageSize);
      if (res.success && res.data) {
        const items = res.data.series.map((series: any) => ({
          id: series.content.id,
          title: series.content.title,
          description: series.content.description,
          poster_url: series.content.image_url,
          image_url: series.content.image_url,
          year: series.content.year,
          tmdb_id: series.content.tmdb_id,
          total_seasons: series.total_seasons,
          seasons: series.seasons,
          status: series.status,
          genre: series.content.genre,
          rating: series.content.rating
        }));

        return {
          items,
          hasMore: res.data.has_more ?? items.length === pageSize
        };
      }
      return { items: [], hasMore: false };
    }
  });

  const shows = showsData?.items ?? [];
  const hasNextPage = showsData?.hasMore ?? false;

  // UI state
  const [search, setSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'rating'>('title');
  const [filterGenre, setFilterGenre] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    setPage(1);
  }, [search, filterGenre, filterStatus, sortBy]);

  // Get unique genres
  const genres = useMemo(() => {
    const genreSet = new Set<string>();
    shows.forEach((show: any) => {
      if (show.genre) {
        show.genre.split(',').forEach((g: string) => genreSet.add(g.trim()));
      }
    });
    return Array.from(genreSet).sort();
  }, [shows]);

  // Filter and sort shows
  const filteredShows = useMemo(() => {
    const filtered = shows.filter((show: any) => {
      const matchesSearch = !search || show.title?.toLowerCase().includes(search.toLowerCase());
      const matchesGenre = filterGenre === 'all' || show.genre?.toLowerCase().includes(filterGenre.toLowerCase());
      const matchesStatus = filterStatus === 'all' ||
        (filterStatus === 'ongoing' && show.status === 'ongoing') ||
        (filterStatus === 'completed' && show.status === 'completed');
      return matchesSearch && matchesGenre && matchesStatus;
    });

    // Sort shows
    filtered.sort((a: any, b: any) => {
      switch (sortBy) {
        case 'year':
          return (b.year || 0) - (a.year || 0);
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        default:
          return (a.title || '').localeCompare(b.title || '');
      }
    });

    return filtered;
  }, [shows, search, filterGenre, filterStatus, sortBy]);

  const handlePageChange = (nextPage: number) => {
    setPage(Math.max(1, nextPage));
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ongoing':
        return (
          <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
            {t('user.shows.status.ongoing')}
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
            {t('user.shows.status.completed')}
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
            {t('user.shows.status.cancelled')}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">
            {t('user.shows.status.unknown')}
          </Badge>
        );
    }
  };

  return (
    <UserRoute>
      <div className="min-h-screen bg-[#050505] text-white">
        <main className="relative overflow-hidden">
          {/* Header */}
          <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-purple-600/20 border border-purple-500/30">
                    <Clapperboard className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">
                      {t('user.menu.series')}
                    </h1>
                    <p className="text-slate-400 text-sm">
                      {t('user.categoryCopy.series')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                {/* View Mode Toggle */}
                <div className="flex items-center space-x-1 bg-slate-800/50 rounded-lg p-1">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="h-8 w-8 p-0"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="h-8 w-8 p-0"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>

                <Badge variant="secondary" className="bg-purple-600/20 text-purple-300 border-purple-500/30">
                  {t('user.common.seriesCount', { count: filteredShows.length })}
                </Badge>
              </div>
            </div>
          </header>

          <div className="p-6 space-y-6">
            {/* Filters and Search */}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder={t('user.filters.searchShows')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-slate-800/50 border-slate-600/50 text-white pl-10"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                {/* Genre Filter */}
                <select
                  value={filterGenre}
                  onChange={(e) => setFilterGenre(e.target.value)}
                  className="bg-slate-800/50 border border-slate-600/50 text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">{t('user.filters.allGenres')}</option>
                  {genres.map((genre) => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>

                {/* Status Filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-800/50 border border-slate-600/50 text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">{t('user.filters.allStatus')}</option>
                  <option value="ongoing">{t('user.shows.status.ongoing')}</option>
                  <option value="completed">{t('user.shows.status.completed')}</option>
                  <option value="cancelled">{t('user.shows.status.cancelled')}</option>
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-slate-800/50 border border-slate-600/50 text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value="title">{t('user.filters.sortTitle')}</option>
                  <option value="year">{t('user.filters.sortYear')}</option>
                  <option value="rating">{t('user.filters.sortRating')}</option>
                </select>
              </div>
            </div>

            {/* Shows Grid/List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto mb-4" />
                  <p className="text-slate-400">{t('user.shows.loading')}</p>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
                {filteredShows.map((show: any) => (
                  <VODCard
                    key={show.id}
                    id={show.id}
                    title={show.title}
                    description={show.description}
                    year={show.year}
                    poster_url={show.poster_url}
                    image_url={show.image_url}
                    backdrop_url={show.backdrop_url}
                    rating={show.rating}
                    progress={show.progress}
                    category={t('user.menu.series')}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredShows.map((show: any) => (
                  <Link
                    key={show.id}
                    href={`/user/content/${show.id}/watch`}
                    className="group flex items-center space-x-4 p-4 rounded-xl bg-slate-800/30 transition-all duration-200 hover:bg-slate-700/50"
                  >
                    <div className="w-16 h-24 bg-slate-700 rounded overflow-hidden flex-shrink-0">
                      {(show.poster_url || show.image_url || show.backdrop_url) ? (
                        <img
                          src={show.poster_url || show.image_url || show.backdrop_url}
                          alt={show.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Tv className="h-6 w-6 text-slate-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">{show.title}</h3>
                      <p className="text-sm text-slate-400 truncate">{show.description}</p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                        <span>{show.year}</span>
                        {show.seasons && (
                          <span>{show.seasons} {show.seasons === 1 ? t('user.shows.season') : t('user.shows.seasons')}</span>
                        )}
                        {show.rating && (
                          <div className="flex items-center space-x-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span>{show.rating}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2">
                        {show.status && getStatusBadge(show.status)}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Heart className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {t('user.common.watch')}
                      </Button>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {!isLoading && (shows.length > 0 || page > 1) && (
              <PaginationControls
                page={page}
                pageSize={pageSize}
                hasNextPage={hasNextPage}
                onPageChange={handlePageChange}
                label={t('user.pagination.seriesLabel')}
              />
            )}

            {filteredShows.length === 0 && !isLoading && (
              <div className="text-center py-20">
                <Tv className="h-16 w-16 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400 text-lg">{t('user.shows.emptyTitle')}</p>
                <p className="text-slate-500">{t('user.shows.emptyDescription')}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </UserRoute>
  );
}
