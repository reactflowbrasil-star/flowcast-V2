'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search, Clock, Calendar, Play, Grid3X3, List, Filter, Heart, MoreHorizontal, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import EventCard from '@/components/user/EventCard';
import { UserRoute } from '@/components/auth/ProtectedRoute';
import { contentService } from '@/services';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function EventsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterGenre, setFilterGenre] = useState('all');
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'rating'>('title');

  // Get Events content from backend
  const { data: eventsContent = [], isLoading, error } = useQuery({
    queryKey: ['content', 'events'],
    queryFn: async () => {
      const result = await contentService.getEvents({ page: 1, limit: 100 });
      if (result.success && result.data) {
        // Events come as EventWithSchedules, extract content
        return result.data.map((event: any) => ({
          ...event.content,
          event_id: event.id,
          event_type: event.event_type,
          schedules: event.schedules
        }));
      }
      return [];
    },
    staleTime: 5 * 60 * 1000});

  // Extract unique genres for filtering
  const genres = useMemo(() => {
    const genreSet = new Set<string>();
    eventsContent.forEach((item: any) => {
      if (item.genre) {
        item.genre.split(',').forEach((g: string) => {
          genreSet.add(g.trim().toLowerCase());
        });
      }
    });
    return Array.from(genreSet).sort();
  }, [eventsContent]);

  // Filter and sort content
  const filteredContent = useMemo(() => {
    const filtered = eventsContent.filter((item: any) => {
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
  }, [eventsContent, search, filterGenre, sortBy]);

  if (error) {
    return (
      <UserRoute>
        <main className="flex items-center justify-center p-8 h-full">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">{t('user.events.errorTitle')}</h2>
            <p className="text-slate-400">{t('user.common.reload')}</p>
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
                    <div className="p-2 rounded-lg bg-green-600/20 border border-green-500/30">
                      <Clock className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-white">
                        {t('user.menu.events')}
                      </h1>
                      <p className="text-slate-400 text-sm">
                        {t('user.categoryCopy.events')}
                      </p>
                    </div>
                  </div>
                </div>
                
                <Badge variant="secondary" className="bg-green-600/20 text-green-300 border-green-500/30">
                  {t('user.common.eventCount', { count: filteredContent.length })}
                </Badge>
              </div>
            </header>

            {/* Controls */}
            <div className="p-6 border-b border-slate-700/50 bg-slate-800/30">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                    <Input
                      placeholder={t('user.events.searchPlaceholder')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Genre Filter */}
                  <select
                    value={filterGenre}
                    onChange={(e) => setFilterGenre(e.target.value)}
                    className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    <option value="all">{t('user.filters.allTypes')}</option>
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
                    className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    <option value="title">{t('user.filters.sortTitle')}</option>
                    <option value="year">{t('user.filters.sortYear')}</option>
                    <option value="rating">{t('user.filters.sortRating')}</option>
                  </select>

                  {/* View Mode */}
                  <div className="flex rounded-lg border border-slate-600 overflow-hidden">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className={cn(
                        'rounded-none border-0',
                        viewMode === 'grid' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-slate-700/50 text-slate-300 hover:text-white'
                      )}
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className={cn(
                        'rounded-none border-0',
                        viewMode === 'list' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-slate-700/50 text-slate-300 hover:text-white'
                      )}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <p className="text-slate-400">{t('user.common.loading')}</p>
                  </div>
                </div>
              ) : filteredContent.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {search
                      ? t('user.events.emptySearchTitle')
                      : t('user.events.emptyTitle')}
                  </h3>
                  <p className="text-slate-400">
                    {search
                      ? t('user.events.emptySearchDescription')
                      : t('user.common.adjustSearch')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredContent.map((item: any) => (
                    <EventCard
                      key={item.id}
                      id={item.id}
                      title={item.title}
                      description={item.description}
                      year={item.year}
                      image_url={item.image_url}
                      backdrop_url={item.backdrop_url}
                      event_type={item.event_type}
                      schedules={item.schedules}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
      </div>
    </UserRoute>
  );
}
