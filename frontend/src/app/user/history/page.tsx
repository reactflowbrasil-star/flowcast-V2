'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { History, Film, Tv, Play, ChevronLeft, ChevronRight, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { UserRoute } from '@/components/auth/ProtectedRoute';
import { userHistoryService } from '@/services/userHistory';
import Link from 'next/link';
import { toast } from 'sonner';
import { GridSkeleton, ContentCardSkeleton } from '@/components/ui/skeleton-loader';
import { getGridLayout } from '@/lib/grid-layouts';
import { formatRelativeTime } from '@/lib/date-format';
import { WatchHistoryItem } from '@/types/userHistory';

export default function HistoryPage() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const itemsPerPage = 24;

  // Load watch history
  const { data: historyData, isLoading, refetch } = useQuery({
    queryKey: ['user-watch-history', currentPage],
    queryFn: async () => {
      const result = await userHistoryService.getWatchHistory({
        page: currentPage,
        limit: itemsPerPage
      });
      if (result.success) {
        return result.data;
      }
      return { history: [], total: 0, page: 1, limit: itemsPerPage, total_pages: 0 };
    }
  });

  // Filter by category
  const filteredHistory = useMemo(() => {
    if (!historyData?.history) return [];
    if (categoryFilter === 'all') return historyData.history;
    return historyData.history.filter(item => item.content_type === categoryFilter);
  }, [historyData, categoryFilter]);

  // Get unique categories
  const categories = useMemo(() => {
    if (!historyData?.history) return [];
    const types = new Set(historyData.history.map(item => item.content_type));
    return Array.from(types);
  }, [historyData]);

  // Clear history
  const handleClearHistory = async () => {
    if (!confirm(t('history.confirmClear'))) {
      return;
    }

    try {
      const result = await userHistoryService.clearWatchHistory();
      if (result.success) {
        toast.success(t('history.cleared'));
        refetch();
      } else {
        toast.error(t('history.clearFailed'));
      }
    } catch (error) {
      console.error('Error clearing history:', error);
      toast.error(t('history.error'));
    }
  };

  // Get icon for content type
  const getContentIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'movie':
        return <Film className="h-4 w-4" />;
      case 'series':
      case 'episode':
        return <Tv className="h-4 w-4" />;
      case 'live':
        return <Play className="h-4 w-4" />;
      default:
        return <Film className="h-4 w-4" />;
    }
  };

  // Get category label
  const getCategoryLabel = (type: string) => {
    switch (type.toLowerCase()) {
      case 'movie':
        return t('history.categories.movie');
      case 'series':
      case 'episode':
        return t('history.categories.series');
      case 'live':
        return t('history.categories.live');
      default:
        return type;
    }
  };

  return (
    <UserRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <History className="h-8 w-8 text-blue-500" />
                <h1 className="text-4xl font-bold text-white">
                  {t('history.title')}
                </h1>
              </div>
              <p className="text-slate-400">
                {t('history.description')}
              </p>
            </div>

            {/* Filters and Actions */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                {/* Category Filter */}
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-[200px] bg-slate-800/50 border-slate-700/50">
                    <SelectValue placeholder={t('history.filterByCategory')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('history.allCategories')}</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {getCategoryLabel(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Stats */}
                <div className="text-sm text-slate-400">
                  {filteredHistory.length} {t('history.items')}
                </div>
              </div>

              {/* Clear History Button */}
              <Button
                onClick={handleClearHistory}
                variant="outline"
                className="border-red-600/50 text-red-400 hover:bg-red-600/20 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('history.clearHistory')}
              </Button>
            </div>

            {/* History Grid */}
            {isLoading ? (
              <GridSkeleton items={24} CardComponent={ContentCardSkeleton} />
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-20">
                <History className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {t('history.noHistory')}
                </h3>
                <p className="text-slate-400 mb-6">
                  {t('history.noHistoryDescription')}
                </p>
                <Link href="/user">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    <Play className="h-4 w-4 mr-2" />
                    {t('history.browseContent')}
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className={getGridLayout('content')}>
                  {filteredHistory.map((item: WatchHistoryItem) => (
                    <Link
                      key={item.id}
                      href={item.content_id ? `/user/content/${item.content_id}/watch` : '#'}
                      className="group relative bg-slate-800/30 rounded-lg overflow-hidden hover:bg-slate-700/50 transition-all duration-200 hover:scale-105"
                    >
                      {/* Placeholder Image */}
                      <div className="aspect-[2/3] bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center relative">
                        {getContentIcon(item.content_type)}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                          <Play className="h-12 w-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>

                      {/* Content Info */}
                      <div className="p-3 space-y-2">
                        <h3 className="font-medium text-white truncate text-sm">
                          {item.content_title}
                        </h3>

                        {item.episode_title && (
                          <p className="text-xs text-slate-400 truncate">
                            {item.series_title && `${item.series_title} - `}
                            {item.season_number && `T${item.season_number}`}
                            {item.episode_number && `E${item.episode_number}`}
                            {item.episode_title && `: ${item.episode_title}`}
                          </p>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 text-xs">
                            {getContentIcon(item.content_type)}
                            {getCategoryLabel(item.content_type)}
                          </span>

                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Calendar className="h-3 w-3" />
                            {formatRelativeTime(item.start_timestamp)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Pagination */}
                {historyData && historyData.total_pages > 1 && (
                  <div className="flex items-center justify-between mt-8">
                    <div className="text-sm text-slate-400">
                      {t('history.page')} {currentPage} {t('history.of')} {historyData.total_pages}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        variant="outline"
                        size="sm"
                        className="border-slate-700/50"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        {t('common.previous')}
                      </Button>

                      <Button
                        onClick={() => setCurrentPage(p => Math.min(historyData.total_pages, p + 1))}
                        disabled={currentPage === historyData.total_pages}
                        variant="outline"
                        size="sm"
                        className="border-slate-700/50"
                      >
                        {t('common.next')}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
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

