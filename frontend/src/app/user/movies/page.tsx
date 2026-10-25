'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Search, Film, Star, Play, Grid3X3, List, Heart, MoreHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import VODCard from '@/components/user/VODCard';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { contentService } from '@/services';
import Link from 'next/link';
import { GridSkeleton, ContentCardSkeleton } from '@/components/ui/skeleton-loader';
import PaginationControls from '@/components/ui/pagination-controls';

function MoviesLoading() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center">
      <div className="text-center">
        <Film className="h-16 w-16 text-slate-500 mx-auto mb-4 animate-pulse" />
        <p className="text-slate-400">{t('user.movies.loading')}</p>
      </div>
    </div>
  );
}

function MoviesPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');

  const pageSize = 50;
  const [page, setPage] = useState<number>(1);

  // Load movies
  const { data: moviesData, isLoading } = useQuery({
    queryKey: ['user-movies', page, pageSize],
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await contentService.getMovies({ page, limit: pageSize });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : [];
        return {
          items,
          hasMore: items.length === pageSize
        };
      }
      return { items: [], hasMore: false };
    }
  });

  const movies = moviesData?.items ?? [];
  const hasNextPage = moviesData?.hasMore ?? false;

  // UI state
  const [search, setSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'rating'>('title');
  const [filterGenre, setFilterGenre] = useState<string>('all');

  // Initialize filter from URL parameter
  useEffect(() => {
    if (categoryParam) {
      setFilterGenre(categoryParam);
    }
  }, [categoryParam]);

  useEffect(() => {
    setPage(1);
  }, [search, filterGenre, sortBy]);

  // Get unique genres
  const genres = useMemo(() => {
    const genreSet = new Set<string>();
    movies.forEach((movie: any) => {
      if (movie.genre) {
        movie.genre.split(',').forEach((g: string) => genreSet.add(g.trim()));
      }
    });
    return Array.from(genreSet).sort();
  }, [movies]);

  // Filter and sort movies
  const filteredMovies = useMemo(() => {
    const filtered = movies.filter((movie: any) => {
      const matchesSearch = !search || movie.title?.toLowerCase().includes(search.toLowerCase());
      const matchesGenre = filterGenre === 'all' || movie.genre?.toLowerCase().includes(filterGenre.toLowerCase());
      return matchesSearch && matchesGenre;
    });

    // Sort movies
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
  }, [movies, search, filterGenre, sortBy]);

  const handlePageChange = (nextPage: number) => {
    setPage(Math.max(1, nextPage));
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <main className="relative overflow-hidden">
        {/* Header */}
        <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-blue-600/20 border border-blue-500/30">
                  <Film className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {t('user.menu.movies')}
                  </h1>
                  <p className="text-slate-400 text-sm">
                    {t('user.categoryCopy.vod')}
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

              <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 border-blue-500/30">
                {t('user.common.titleCount', { count: filteredMovies.length })}
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
                placeholder={t('user.filters.searchMovies')}
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

          {/* Movies Grid/List */}
          {isLoading ? (
            <GridSkeleton items={24} CardComponent={ContentCardSkeleton} />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
              {filteredMovies.map((movie: any) => (
                <VODCard
                  key={movie.id}
                  id={movie.id}
                  title={movie.title}
                  description={movie.description}
                  year={movie.year}
                  poster_url={movie.poster_url}
                  image_url={movie.image_url}
                  backdrop_url={movie.backdrop_url}
                  rating={movie.rating}
                  progress={movie.progress}
                  category={t('user.menu.movies')}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMovies.map((movie: any) => (
                <Link
                  key={movie.id}
                  href={`/user/content/${movie.id}/watch`}
                  className="group flex items-center space-x-4 p-4 rounded-xl bg-slate-800/30 transition-all duration-200 hover:bg-slate-700/50"
                >
                  <div className="w-16 h-24 bg-slate-700 rounded overflow-hidden flex-shrink-0">
                    {(movie.poster_url || movie.image_url || movie.backdrop_url) ? (
                      <img
                        src={movie.poster_url || movie.image_url || movie.backdrop_url}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="h-6 w-6 text-slate-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{movie.title}</h3>
                    <p className="text-sm text-slate-400 truncate">{movie.description}</p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                      <span>{movie.year}</span>
                      {movie.duration && (
                        <span>{formatDuration(movie.duration)}</span>
                      )}
                      {movie.rating && (
                        <div className="flex items-center space-x-1">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <span>{movie.rating}</span>
                        </div>
                      )}
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

          {!isLoading && (movies.length > 0 || page > 1) && (
            <PaginationControls
              page={page}
              pageSize={pageSize}
              hasNextPage={hasNextPage}
              onPageChange={handlePageChange}
              label={t('user.pagination.moviesLabel')}
            />
          )}

          {filteredMovies.length === 0 && !isLoading && (
            <div className="text-center py-20">
              <Film className="h-16 w-16 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">{t('user.movies.emptyTitle')}</p>
              <p className="text-slate-500">{t('user.movies.emptyDescription')}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function MoviesPage() {
  return (
    <UserRoute>
      <Suspense fallback={<MoviesLoading />}>
        <MoviesPageContent />
      </Suspense>
    </UserRoute>
  );
}
