'use client';

import React, { useState, useMemo, useEffect, Suspense, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Search, Compass, Film, Tv, Sparkles, Baby, Grid3X3, List, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import VODCard from '@/components/user/VODCard';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { contentService } from '@/services';
import { GridSkeleton, ContentCardSkeleton } from '@/components/ui/skeleton-loader';
import { cn } from '@/lib/utils';

interface ContentItem {
  id: number;
  title: string;
  description?: string;
  year?: number;
  poster_url?: string;
  image_url?: string;
  backdrop_url?: string;
  rating?: number;
  genre?: string;
  category: 'movie' | 'series' | 'anime' | 'kids';
}

const GENRES = [
  { id: 'action', key: 'action', icon: '🎬', color: 'from-red-600 to-orange-600' },
  { id: 'comedy', key: 'comedy', icon: '😂', color: 'from-yellow-500 to-amber-500' },
  { id: 'drama', key: 'drama', icon: '🎭', color: 'from-blue-600 to-indigo-600' },
  { id: 'sci-fi', key: 'scifi', icon: '🚀', color: 'from-purple-600 to-violet-600' },
  { id: 'horror', key: 'horror', icon: '👻', color: 'from-slate-700 to-slate-900' },
  { id: 'romance', key: 'romance', icon: '💕', color: 'from-pink-500 to-rose-500' },
  { id: 'thriller', key: 'thriller', icon: '🔪', color: 'from-gray-700 to-zinc-800' },
  { id: 'animation', key: 'animation', icon: '✨', color: 'from-cyan-500 to-teal-500' },
  { id: 'documentary', key: 'documentary', icon: '📽️', color: 'from-emerald-600 to-green-600' },
  { id: 'fantasy', key: 'fantasy', icon: '🐉', color: 'from-fuchsia-600 to-purple-600' },
  { id: 'adventure', key: 'adventure', icon: '🗺️', color: 'from-amber-600 to-yellow-600' },
  { id: 'family', key: 'family', icon: '👨‍👩‍👧‍👦', color: 'from-sky-500 to-blue-500' },
];

const CATEGORY_FILTERS = [
  { id: 'all', key: 'all', icon: Compass },
  { id: 'movie', key: 'movies', icon: Film },
  { id: 'series', key: 'series', icon: Tv },
  { id: 'anime', key: 'anime', icon: Sparkles },
  { id: 'kids', key: 'kids', icon: Baby },
];

const ITEMS_PER_PAGE = 24;

function BrowsePageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const genreParam = searchParams.get('genre');

  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(genreParam);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (genreParam) {
      setSelectedGenre(genreParam.toLowerCase());
    }
  }, [genreParam]);

  // Infinite query for movies
  const {
    data: moviesData,
    fetchNextPage: fetchMoreMovies,
    hasNextPage: hasMoreMovies,
    isFetchingNextPage: fetchingMoreMovies,
    isLoading: loadingMovies } = useInfiniteQuery({
      queryKey: ['browse-movies-infinite'],
      staleTime: 5 * 60 * 1000,
      initialPageParam: 1,
      queryFn: async ({ pageParam = 1 }) => {
        const res = await contentService.getMovies({ page: pageParam, limit: ITEMS_PER_PAGE });
        return {
          items: res.success && res.data ? res.data : [],
          nextPage: pageParam + 1,
          hasMore: res.success && res.data && res.data.length >= ITEMS_PER_PAGE
        };
      },
      getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextPage : undefined
    });

  // Infinite query for series
  const {
    data: seriesData,
    fetchNextPage: fetchMoreSeries,
    hasNextPage: hasMoreSeries,
    isFetchingNextPage: fetchingMoreSeries,
    isLoading: loadingSeries } = useInfiniteQuery({
      queryKey: ['browse-series-infinite'],
      staleTime: 5 * 60 * 1000,
      initialPageParam: 1,
      queryFn: async ({ pageParam = 1 }) => {
        const res = await contentService.getSeries(pageParam, ITEMS_PER_PAGE);
        const items = res.success && res.data?.series ? res.data.series : [];
        return {
          items,
          nextPage: pageParam + 1,
          hasMore: items.length >= ITEMS_PER_PAGE
        };
      },
      getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextPage : undefined
    });

  // Infinite query for anime
  const {
    data: animeData,
    fetchNextPage: fetchMoreAnime,
    hasNextPage: hasMoreAnime,
    isFetchingNextPage: fetchingMoreAnime,
    isLoading: loadingAnime } = useInfiniteQuery({
      queryKey: ['browse-anime-infinite'],
      staleTime: 5 * 60 * 1000,
      initialPageParam: 1,
      queryFn: async ({ pageParam = 1 }) => {
        const res = await contentService.getAnimeContent({ page: pageParam, limit: ITEMS_PER_PAGE });
        return {
          items: res.success && res.data ? res.data : [],
          nextPage: pageParam + 1,
          hasMore: res.success && res.data && res.data.length >= ITEMS_PER_PAGE
        };
      },
      getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextPage : undefined
    });

  // Infinite query for kids
  const {
    data: kidsData,
    fetchNextPage: fetchMoreKids,
    hasNextPage: hasMoreKids,
    isFetchingNextPage: fetchingMoreKids,
    isLoading: loadingKids } = useInfiniteQuery({
      queryKey: ['browse-kids-infinite'],
      staleTime: 5 * 60 * 1000,
      initialPageParam: 1,
      queryFn: async ({ pageParam = 1 }) => {
        const res = await contentService.getKidsContent({ page: pageParam, limit: ITEMS_PER_PAGE });
        return {
          items: res.success && res.data ? res.data : [],
          nextPage: pageParam + 1,
          hasMore: res.success && res.data && res.data.length >= ITEMS_PER_PAGE
        };
      },
      getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextPage : undefined
    });

  const isLoading = loadingMovies || loadingSeries || loadingAnime || loadingKids;
  const isFetchingMore = fetchingMoreMovies || fetchingMoreSeries || fetchingMoreAnime || fetchingMoreKids;
  const hasMoreContent = hasMoreMovies || hasMoreSeries || hasMoreAnime || hasMoreKids;

  // Combine all content from all pages
  const allContent = useMemo(() => {
    const items: ContentItem[] = [];

    // Flatten movies from all pages
    moviesData?.pages.forEach((page) => {
      (page.items || []).forEach((item: any) => {
        items.push({ ...item, category: 'movie' as const });
      });
    });

    // Flatten series from all pages
    seriesData?.pages.forEach((page) => {
      (page.items || []).forEach((item: any) => {
        items.push({
          id: item.content?.id || item.id,
          title: item.content?.title || item.title,
          description: item.content?.description || item.description,
          year: item.content?.year || item.year,
          poster_url: item.content?.image_url || item.poster_url || item.image_url,
          image_url: item.content?.image_url || item.image_url,
          backdrop_url: item.backdrop_url,
          rating: item.rating,
          genre: item.content?.genre || item.genre,
          category: 'series' as const
        });
      });
    });

    // Flatten anime from all pages
    animeData?.pages.forEach((page) => {
      (page.items || []).forEach((item: any) => {
        items.push({ ...item, category: 'anime' as const });
      });
    });

    // Flatten kids from all pages
    kidsData?.pages.forEach((page) => {
      (page.items || []).forEach((item: any) => {
        items.push({ ...item, category: 'kids' as const });
      });
    });

    return items;
  }, [moviesData, seriesData, animeData, kidsData]);

  // Filter content
  const filteredContent = useMemo(() => {
    return allContent.filter((item) => {
      if (search && !item.title?.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (selectedGenre) {
        const itemGenre = (item.genre || '').toLowerCase();
        if (!itemGenre.includes(selectedGenre.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [allContent, search, selectedCategory, selectedGenre]);

  // Load more content based on selected category
  const loadMoreContent = useCallback(() => {
    if (isFetchingMore) return;

    if (selectedCategory === 'all') {
      // Load more from all categories that have more content
      if (hasMoreMovies && !fetchingMoreMovies) fetchMoreMovies();
      if (hasMoreSeries && !fetchingMoreSeries) fetchMoreSeries();
      if (hasMoreAnime && !fetchingMoreAnime) fetchMoreAnime();
      if (hasMoreKids && !fetchingMoreKids) fetchMoreKids();
    } else if (selectedCategory === 'movie' && hasMoreMovies) {
      fetchMoreMovies();
    } else if (selectedCategory === 'series' && hasMoreSeries) {
      fetchMoreSeries();
    } else if (selectedCategory === 'anime' && hasMoreAnime) {
      fetchMoreAnime();
    } else if (selectedCategory === 'kids' && hasMoreKids) {
      fetchMoreKids();
    }
  }, [
    selectedCategory, isFetchingMore,
    hasMoreMovies, hasMoreSeries, hasMoreAnime, hasMoreKids,
    fetchingMoreMovies, fetchingMoreSeries, fetchingMoreAnime, fetchingMoreKids,
    fetchMoreMovies, fetchMoreSeries, fetchMoreAnime, fetchMoreKids
  ]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMoreContent && !isFetchingMore) {
          loadMoreContent();
        }
      },
      { rootMargin: '200px', threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMoreContent, isFetchingMore, loadMoreContent]);

  const clearFilters = () => {
    setSearch('');
    setSelectedGenre(null);
    setSelectedCategory('all');
  };

  const hasActiveFilters = search || selectedGenre || selectedCategory !== 'all';

  // Check if there's more content for the current filter
  const hasMoreForCurrentFilter = useMemo(() => {
    if (selectedCategory === 'all') return hasMoreContent;
    if (selectedCategory === 'movie') return hasMoreMovies;
    if (selectedCategory === 'series') return hasMoreSeries;
    if (selectedCategory === 'anime') return hasMoreAnime;
    if (selectedCategory === 'kids') return hasMoreKids;
    return false;
  }, [selectedCategory, hasMoreContent, hasMoreMovies, hasMoreSeries, hasMoreAnime, hasMoreKids]);

  const getCategoryFilterLabel = useCallback((categoryId: string) => {
    switch (categoryId) {
      case 'all':
        return t('user.common.all');
      case 'movie':
        return t('user.menu.movies');
      case 'series':
        return t('user.menu.series');
      case 'anime':
        return t('user.menu.anime');
      case 'kids':
        return t('user.menu.kids');
      default:
        return categoryId;
    }
  }, [t]);

  const getGenreLabel = useCallback((genreId: string | null) => {
    if (!genreId) return t('user.filters.allGenres');
    const genre = GENRES.find((g) => g.id === genreId);
    if (!genre) return genreId;
    return t(`user.genres.${genre.key}`, {
      defaultValue: genre.key.replace('-', ' ')
    });
  }, [t]);

  const getContentCardCategoryLabel = useCallback((category: ContentItem['category']) => {
    switch (category) {
      case 'movie':
        return t('user.menu.movies');
      case 'series':
        return t('user.menu.series');
      case 'anime':
        return t('user.menu.anime');
      case 'kids':
        return t('user.menu.kids');
      default:
        return category;
    }
  }, [t]);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <main className="relative overflow-hidden">
        {/* Header */}
        <header className="bg-gradient-to-b from-slate-900/90 to-transparent backdrop-blur-sm border-b border-slate-700/30 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg shadow-blue-500/20">
                <Compass className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {t('user.content.browse.title')}
                </h1>
                <p className="text-slate-400 text-sm">
                  {t('user.content.browse.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
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
                {t('user.content.browse.itemCount', { count: filteredContent.length })}
              </Badge>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
            {/* Search - Flexible width */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder={t('user.content.search.placeholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-800/60 border-slate-600/50 text-white pl-9 h-10 text-sm rounded-lg w-full focus-visible:ring-blue-500/50"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Selectors */}
            <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
              {/* Category Select */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[150px] bg-slate-800/60 border-slate-600/50 text-white h-10">
                  <SelectValue placeholder={t('common.category')} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-white">
                  {CATEGORY_FILTERS.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <SelectItem key={cat.id} value={cat.id} className="focus:bg-slate-800 focus:text-white cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{getCategoryFilterLabel(cat.id)}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Genre Select */}
              <Select
                value={selectedGenre || "all_genres"}
                onValueChange={(val) => setSelectedGenre(val === "all_genres" ? null : val)}
              >
                <SelectTrigger className="w-[150px] bg-slate-800/60 border-slate-600/50 text-white h-10">
                  <SelectValue placeholder={t('user.filters.allGenres')}>
                    {selectedGenre ? (
                      <div className="flex items-center gap-2">
                        <span>{GENRES.find(g => g.id === selectedGenre)?.icon}</span>
                        <span>{getGenreLabel(selectedGenre)}</span>
                      </div>
                    ) : (
                      t('user.filters.allGenres')
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-white max-h-[300px]">
                  <SelectItem value="all_genres" className="focus:bg-slate-800 focus:text-white cursor-pointer">
                    {t('user.filters.allGenres')}
                  </SelectItem>
                  {GENRES.map((genre) => (
                    <SelectItem key={genre.id} value={genre.id} className="focus:bg-slate-800 focus:text-white cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span>{genre.icon}</span>
                        <span>{getGenreLabel(genre.id)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="flex items-center flex-wrap gap-2 mb-6 text-sm">
              <span className="text-slate-500">{t('common.filter')}:</span>
              {selectedCategory !== 'all' && (
                <Badge variant="secondary" className="bg-slate-700/50 hover:bg-slate-700/70">
                  {getCategoryFilterLabel(selectedCategory)}
                  <button onClick={() => setSelectedCategory('all')} className="ml-1 hover:text-white"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {selectedGenre && (
                <Badge variant="secondary" className="bg-slate-700/50 hover:bg-slate-700/70">
                  {getGenreLabel(selectedGenre)}
                  <button onClick={() => setSelectedGenre(null)} className="ml-1 hover:text-white"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {search && (
                <Badge variant="secondary" className="bg-slate-700/50 hover:bg-slate-700/70">
                  &quot;{search}&quot;
                  <button onClick={() => setSearch('')} className="ml-1 hover:text-white"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              <button
                onClick={clearFilters}
                className="text-blue-400 hover:text-blue-300 ml-2 text-xs font-medium"
              >
                {t('user.filters.clear')}
              </button>
            </div>
          )}
        </header>

        {/* Content Grid */}
        <div className="p-6">
          {isLoading ? (
            <GridSkeleton items={24} CardComponent={ContentCardSkeleton} />
          ) : filteredContent.length > 0 ? (
            <>
              <div className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-6 sm:gap-x-4'
                  : 'space-y-3'
              )}>
                {filteredContent.map((item) => (
                  <VODCard
                    key={`${item.category}-${item.id}`}
                    id={item.id}
                    title={item.title}
                    description={item.description}
                    year={item.year}
                    poster_url={item.poster_url}
                    image_url={item.image_url}
                    backdrop_url={item.backdrop_url}
                    rating={item.rating}
                    category={getContentCardCategoryLabel(item.category)}
                  />
                ))}
              </div>

              {/* Infinite scroll trigger */}
              <div ref={loadMoreRef} className="w-full py-8 flex justify-center">
                {isFetchingMore && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">{t('user.content.browse.loadingMore')}</span>
                  </div>
                )}
                {!isFetchingMore && hasMoreForCurrentFilter && (
                  <div className="h-10" />
                )}
                {!hasMoreForCurrentFilter && filteredContent.length > 0 && (
                  <p className="text-slate-500 text-sm">
                    {t('user.common.comeBackSoon')}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <Compass className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg mb-2">
                {t('user.content.search.noResults')}
              </p>
              <p className="text-slate-500 text-sm mb-4">
                {t('user.content.search.tryAgain')}
              </p>
              {hasActiveFilters && (
                <Button onClick={clearFilters} variant="outline" size="sm">
                  {t('user.filters.clear')}
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function LoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
      <div className="text-center">
        <Compass className="h-16 w-16 text-slate-500 mx-auto mb-4 animate-pulse" />
        <p className="text-slate-400">{t('user.content.browse.loadingDescription')}</p>
      </div>
    </div>
  );
}

export default function BrowsePage() {
  return (
    <UserRoute>
      <Suspense fallback={<LoadingFallback />}>
        <BrowsePageContent />
      </Suspense>
    </UserRoute>
  );
}
