'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search, Film, Tv, Radio, X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { contentService } from '@/services';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { GridSkeleton, ContentCardSkeleton } from '@/components/ui/skeleton-loader';
import { getGridLayout } from '@/lib/grid-layouts';
import { getCategoryColors, getCategoryLabel, normalizeCategory } from '@/constants/categoryColors';
import { ResponsiveVirtualizedGrid, useVirtualization } from '@/components/ui/virtualized-grid';

interface SearchFilters {
  query: string;
  category: string;
  year: string;
  sortBy: 'relevance' | 'title' | 'year' | 'rating';
}

export default function SearchPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    category: 'all',
    year: 'all',
    sortBy: 'relevance'
  });
  const [showFilters, setShowFilters] = useState(false);

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce effect
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(filters.query);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters.query]);

  // Search query
  const { data: results = [], isLoading } = useQuery({
    queryKey: ['user-search', debouncedQuery, filters.category],
    enabled: debouncedQuery.trim().length > 0,
    queryFn: async () => {
      const res = await contentService.searchContent({
        q: debouncedQuery.trim(),
        category: filters.category !== 'all' ? filters.category : undefined,
        limit: 50
      });
      if (res.success && res.data) {
        return res.data.content || [];
      }
      return [];
    }
  });

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = [...results];

    // Filter by year
    if (filters.year !== 'all') {
      filtered = filtered.filter(item => item.year?.toString() === filters.year);
    }

    // Sort results
    switch (filters.sortBy) {
      case 'title':
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'year':
        filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case 'rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      default:
        // relevance - keep original order
        break;
    }

    return filtered;
  }, [results, filters.year, filters.sortBy]);

  // Get unique years from results
  const availableYears = useMemo(() => {
    const years = new Set(results.map(item => item.year).filter(Boolean));
    return Array.from(years).sort((a, b) => b! - a!);
  }, [results]);

  // Get category icon
  const getCategoryIcon = (category: string | null | undefined) => {
    const normalized = normalizeCategory(category);

    switch (normalized) {
      case 'series':
        return <Tv className="h-4 w-4" />;
      case 'live':
        return <Radio className="h-4 w-4" />;
      default:
        return <Film className="h-4 w-4" />;
    }
  };

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({
      query: filters.query,
      category: 'all',
      year: 'all',
      sortBy: 'relevance'
    });
  }, [filters.query]);

  const hasActiveFilters = filters.category !== 'all' || filters.year !== 'all' || filters.sortBy !== 'relevance';

  // Determine if we should use virtualization
  const shouldVirtualize = useVirtualization(filteredResults.length, 100);

  // Render item function for virtualized grid
  const renderContentItem = useCallback((item: any) => {
    const categoryKey = normalizeCategory(item?.category);
    const categoryColors = getCategoryColors(categoryKey);

    return (
      <Link
        key={item.id}
        href={`/user/content/${item.id}/watch`}
        className="group relative bg-slate-800/30 rounded-lg overflow-hidden hover:bg-slate-700/50 transition-all duration-200 hover:scale-105 h-full"
      >
        {/* Image */}
        <div className="aspect-[2/3] bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center relative">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            getCategoryIcon(categoryKey)
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200" />
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <h3 className="font-medium text-white truncate text-sm">
            {item.title}
          </h3>

          <div className="flex items-center justify-between">
            {item.category && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                  categoryColors.bg,
                  categoryColors.text
                )}
              >
                {getCategoryIcon(categoryKey)}
                {getCategoryLabel(item.category)}
              </span>
            )}

            {item.year && (
              <span className="text-xs text-slate-500">
                {item.year}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }, []);

  return (
    <UserRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <main className="flex-1 overflow-y-auto h-full">
          <div className="container mx-auto px-6 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <Search className="h-8 w-8 text-blue-500" />
                <h1 className="text-4xl font-bold text-white">
                  {t('search.title')}
                </h1>
              </div>
              <p className="text-slate-400">
                {t('search.description')}
              </p>
            </div>

            {/* Search Bar */}
            <div className="mb-6 space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder={t('search.placeholder')}
                    value={filters.query}
                    onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
                    className="pl-12 pr-12 h-12 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-400 text-lg"
                  />
                  {filters.query && (
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, query: '' }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>

                <Button
                  onClick={() => setShowFilters(!showFilters)}
                  variant="ghost"
                  className={cn(
                    'h-12 border border-slate-600/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700/80 hover:text-white',
                    hasActiveFilters && 'border-blue-500/60 bg-blue-600/20 text-blue-200'
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  {t('search.filters')}
                  {hasActiveFilters && (
                    <Badge className="ml-2 bg-blue-600 text-white">
                      {[filters.category !== 'all', filters.year !== 'all', filters.sortBy !== 'relevance'].filter(Boolean).length}
                    </Badge>
                  )}
                </Button>
              </div>

              {/* Advanced Filters */}
              {showFilters && (
                <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700/50 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {/* Category Filter */}
                    <div>
                      <label className="text-sm font-medium text-slate-300 mb-2 block">
                        {t('search.category')}
                      </label>
                      <Select value={filters.category} onValueChange={(v) => setFilters(prev => ({ ...prev, category: v }))}>
                        <SelectTrigger className="bg-slate-800/50 border-slate-700/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('search.allCategories')}</SelectItem>
                          <SelectItem value="movie">{t('search.movies')}</SelectItem>
                          <SelectItem value="series">{t('search.series')}</SelectItem>
                          <SelectItem value="live">{t('search.live')}</SelectItem>
                          <SelectItem value="kids">{t('search.kids')}</SelectItem>
                          <SelectItem value="anime">{t('search.anime')}</SelectItem>
                          <SelectItem value="events">{t('search.events')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Year Filter */}
                    <div>
                      <label className="text-sm font-medium text-slate-300 mb-2 block">
                        {t('search.year')}
                      </label>
                      <Select value={filters.year} onValueChange={(v) => setFilters(prev => ({ ...prev, year: v }))}>
                        <SelectTrigger className="bg-slate-800/50 border-slate-700/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('search.allYears')}</SelectItem>
                          {availableYears.map(year => (
                            <SelectItem key={year} value={year!.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Sort By */}
                    <div>
                      <label className="text-sm font-medium text-slate-300 mb-2 block">
                        {t('search.sortBy')}
                      </label>
                      <Select value={filters.sortBy} onValueChange={(v: any) => setFilters(prev => ({ ...prev, sortBy: v }))}>
                        <SelectTrigger className="bg-slate-800/50 border-slate-700/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relevance">{t('search.relevance')}</SelectItem>
                          <SelectItem value="title">{t('search.titleAZ')}</SelectItem>
                          <SelectItem value="year">{t('search.yearDesc')}</SelectItem>
                          <SelectItem value="rating">{t('search.ratingDesc')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <Button onClick={clearFilters} variant="ghost" size="sm" className="border border-slate-600/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700/80 hover:text-white">
                      <X className="h-4 w-4 mr-2" />
                      {t('search.clearFilters')}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Results */}
            {!filters.query.trim() ? (
              <div className="text-center py-20">
                <Search className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {t('search.startSearching')}
                </h3>
                <p className="text-slate-400">
                  {t('search.startSearchingDescription')}
                </p>
              </div>
            ) : isLoading ? (
              <GridSkeleton items={24} CardComponent={ContentCardSkeleton} />
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-20">
                <Search className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {t('search.noResults')}
                </h3>
                <p className="text-slate-400 mb-6">
                  {t('search.noResultsDescription')}
                </p>
                {hasActiveFilters && (
                  <Button onClick={clearFilters} variant="ghost" className="border border-slate-600/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700/80 hover:text-white">
                    {t('search.clearFilters')}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    {filteredResults.length} {t('search.resultsFound')}
                    {shouldVirtualize && (
                      <span className="ml-2 text-xs text-blue-400">
                        ({t('search.virtualizedMode')})
                      </span>
                    )}
                  </p>
                </div>

                {shouldVirtualize ? (
                  <div style={{ height: 'calc(100vh - 400px)', minHeight: '600px' }}>
                    <ResponsiveVirtualizedGrid
                      items={filteredResults}
                      renderItem={renderContentItem}
                      minColumnWidth={180}
                      rowHeight={320}
                      gap={16}
                    />
                  </div>
                ) : (
                  <div className={getGridLayout('content')}>
                    {filteredResults.map((item: any) => renderContentItem(item))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </UserRoute>
  );
}
