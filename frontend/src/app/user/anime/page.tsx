'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Wand2, Play, Grid3X3, List, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import VODCard from '@/components/user/VODCard';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { contentService } from '@/services';
import Link from 'next/link';
import PaginationControls from '@/components/ui/pagination-controls';

export default function AnimePage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterGenre, setFilterGenre] = useState('all');
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'rating'>('title');
  const pageSize = 50;
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    setPage(1);
  }, [search, filterGenre, sortBy]);

  // Get Anime content from backend
  const { data: animeData, isLoading, error } = useQuery({
    queryKey: ['content', 'anime', page, pageSize],
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const result = await contentService.getAnimeContent({ page, limit: pageSize });
      if (result.success && result.data) {
        const items = Array.isArray(result.data) ? result.data : [];
        return {
          items,
          hasMore: items.length === pageSize
        };
      }
      return { items: [], hasMore: false };
    }
  });

  const animeContent = animeData?.items ?? [];
  const hasNextPage = animeData?.hasMore ?? false;

  // Extract unique genres for filtering
  const genres = useMemo(() => {
    const genreSet = new Set<string>();
    animeContent.forEach((item: any) => {
      if (item.genre) {
        item.genre.split(',').forEach((g: string) => {
          genreSet.add(g.trim().toLowerCase());
        });
      }
    });
    return Array.from(genreSet).sort();
  }, [animeContent]);

  // Filter and sort content
  const filteredContent = useMemo(() => {
    const filtered = animeContent.filter((item: any) => {
      const matchesSearch = !search || item.title?.toLowerCase().includes(search.toLowerCase());
      const matchesGenre = filterGenre === 'all' || item.genre?.toLowerCase().includes(filterGenre.toLowerCase());
      return matchesSearch && matchesGenre;
    });

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
  }, [animeContent, search, filterGenre, sortBy]);

  const handlePageChange = (nextPage: number) => {
    setPage(Math.max(1, nextPage));
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (error) {
    return (
      <UserRoute>
        <main className="flex items-center justify-center p-8 h-full">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">{t('user.anime.errorTitle')}</h2>
            <p className="text-slate-400">{t('user.common.reload')}</p>
            {!isLoading && (animeContent.length > 0 || page > 1) && (
              <PaginationControls
                page={page}
                pageSize={pageSize}
                hasNextPage={hasNextPage}
                onPageChange={handlePageChange}
                label={t('user.pagination.animeLabel')}
              />
            )}

          </div>
        </main>
      </UserRoute>
    );
  }

  return (
    <UserRoute>
      <div className="min-h-screen bg-[#050505]">
        <main className="flex-1 overflow-hidden">
          {/* Header */}
          <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-purple-600/20 border border-purple-500/30">
                    <Wand2 className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">
                      {t('user.menu.anime')}
                    </h1>
                    <p className="text-slate-400 text-sm">
                      {t('user.categoryCopy.anime')}
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
                  {t('user.common.animeCount', { count: filteredContent.length })}
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
                  placeholder={t('user.anime.searchPlaceholder')}
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
                    <option key={genre} value={genre}>
                      {genre.charAt(0).toUpperCase() + genre.slice(1)}
                    </option>
                  ))}
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'title' | 'year' | 'rating')}
                  className="bg-slate-800/50 border border-slate-600/50 text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value="title">{t('user.filters.sortTitle')}</option>
                  <option value="year">{t('user.filters.sortYear')}</option>
                  <option value="rating">{t('user.filters.sortRating')}</option>
                </select>
              </div>
            </div>

            {/* Content Grid/List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
                  <p className="text-slate-400">{t('user.common.loading')}</p>
                </div>
              </div>
            ) : filteredContent.length === 0 ? (
              <div className="text-center py-12">
                <Wand2 className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {search
                    ? t('user.anime.emptySearchTitle')
                    : t('user.anime.emptyTitle')}
                </h3>
                <p className="text-slate-400">
                  {search
                    ? t('user.anime.emptySearchDescription')
                    : t('user.common.adjustSearch')}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4">
                {filteredContent.map((item: any) => (
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
                    progress={item.progress}
                    category="Anime"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredContent.map((item: any) => (
                  <div key={item.id} className="flex items-center space-x-4 p-4 bg-slate-800/30 rounded-xl hover:bg-slate-700/50 transition-colors group relative">
                    <div className="w-16 h-24 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                      {(item.poster_url || item.image_url || item.backdrop_url) ? (
                        <img
                          src={item.poster_url || item.image_url || item.backdrop_url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Wand2 className="h-6 w-6 text-slate-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                      <div className="flex items-center space-x-4 text-sm text-slate-400">
                        {item.year && <span>{item.year}</span>}
                        {item.genre && <span>{item.genre}</span>}
                        {item.rating && (
                          <div className="flex items-center space-x-1">
                            <Star className="h-3 w-3 text-yellow-400 fill-current" />
                            <span>{item.rating}</span>
                          </div>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-slate-500 mt-2 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <Link href={`/user/content/${item.id}/watch`}>
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-500 text-white">
                          <Play className="h-4 w-4 mr-2" />
                          {t('user.common.watch')}
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && (animeContent.length > 0 || page > 1) && (
              <PaginationControls
                page={page}
                pageSize={pageSize}
                hasNextPage={hasNextPage}
                onPageChange={handlePageChange}
                label={t('user.pagination.animeLabel')}
              />
            )}
          </div>
        </main>
      </div>
    </UserRoute>
  );
}
