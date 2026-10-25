/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, addHours, startOfHour, isWithinInterval, differenceInMinutes, addMinutes } from 'date-fns';
import { Clock, Calendar, ChevronLeft, ChevronRight, Loader2, Play, Info, Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiService } from '@/services';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Channel {
  id: number;
  title: string;
  logo_url?: string;
  image_url?: string;
  provider?: string;
}

interface Program {
  channel_id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  category?: string;
}

interface EPGApiResponse {
  programs?: Program[];
}

interface ModernEPGGuideProps {
  channels: Channel[];
  selectedChannelId?: number | null;
  onChannelSelect?: (channel: Channel) => void;
  showHeader?: boolean;
  className?: string;
}

const HOUR_WIDTH = 280; // pixels per hour
const CHANNEL_HEIGHT = 80; // pixels per channel
const TIMELINE_HEIGHT = 50;
const CHANNEL_SIDEBAR_WIDTH = 220;

// Category colors with refined modern gradients
const getCategoryStyle = (category?: string) => {
  const styles: Record<string, string> = {
    'Sports': 'bg-gradient-to-r from-blue-900/40 to-blue-800/40 border-blue-500/30 hover:border-blue-400/60 text-blue-100',
    'News': 'bg-gradient-to-r from-orange-900/40 to-orange-800/40 border-orange-500/30 hover:border-orange-400/60 text-orange-100',
    'Movies': 'bg-gradient-to-r from-purple-900/40 to-purple-800/40 border-purple-500/30 hover:border-purple-400/60 text-purple-100',
    'Series': 'bg-gradient-to-r from-teal-900/40 to-teal-800/40 border-teal-500/30 hover:border-teal-400/60 text-teal-100',
    'Kids': 'bg-gradient-to-r from-pink-900/40 to-pink-800/40 border-pink-500/30 hover:border-pink-400/60 text-pink-100',
    'Entertainment': 'bg-gradient-to-r from-amber-900/40 to-amber-800/40 border-amber-500/30 hover:border-amber-400/60 text-amber-100'
  };
  return styles[category || 'Live'] || 'bg-gradient-to-r from-slate-900/40 to-slate-800/40 border-slate-700/50 hover:border-slate-500/60 text-slate-200';
};

export default function ModernEPGGuide({
  channels,
  selectedChannelId,
  onChannelSelect,
  showHeader = true,
  className }: ModernEPGGuideProps) {
  const { t } = useTranslation();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState({
    start: startOfHour(new Date()),
    end: addHours(startOfHour(new Date()), 6) // Show 6 hours initially
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (channels.length === 0) return;

    const fetchEPG = async () => {
      setIsLoading(true);
      try {
        const channelIds = channels.map(c => c.id).join(',');
        const startTime = timeRange.start.toISOString();
        const endTime = timeRange.end.toISOString();

        const result = await apiService.get<EPGApiResponse>(
          `/api/tv/epg?channel_ids=${channelIds}&start=${startTime}&end=${endTime}`
        );

        const data = result.data as EPGApiResponse | undefined;
        if (result.success && data?.programs) {
          setPrograms(data.programs);
        } else {
          setPrograms([]);
        }
      } catch (error) {
        console.error('Error fetching EPG:', error);
        toast.error(t('common.error'));
        setPrograms([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEPG();
  }, [channels, timeRange]);

  useEffect(() => {
    if (scrollContainerRef.current && !isLoading) {
      const minutesFromStart = differenceInMinutes(currentTime, timeRange.start);
      // Center current time a bit better
      const scrollPosition = (minutesFromStart / 60) * HOUR_WIDTH - (window.innerWidth / 3);
      scrollContainerRef.current.scrollLeft = Math.max(0, scrollPosition);
    }
  }, [isLoading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      timelineRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const navigateTime = (hours: number) => {
    setTimeRange(prev => ({
      start: addHours(prev.start, hours),
      end: addHours(prev.end, hours)
    }));
  };

  const getChannelPrograms = (channelId: number) => {
    return programs.filter(p => p.channel_id === String(channelId));
  };

  const getProgramStyle = (program: Program) => {
    const start = new Date(program.start);
    const end = new Date(program.end);
    const minutesFromStart = differenceInMinutes(start, timeRange.start);
    const duration = differenceInMinutes(end, start);

    const left = (minutesFromStart / 60) * HOUR_WIDTH;
    const width = (duration / 60) * HOUR_WIDTH;

    return {
      left: `${left}px`,
      width: `${Math.max(width, 60)}px`
    };
  };

  const isCurrentlyAiring = (program: Program) => {
    return isWithinInterval(currentTime, {
      start: new Date(program.start),
      end: new Date(program.end)
    });
  };

  const filteredChannels = useMemo(() => {
    if (!searchQuery && !selectedCategory) return channels;

    return channels.filter(channel => {
      const channelPrograms = getChannelPrograms(channel.id);

      if (searchQuery) {
        const matchesSearch = channel.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          channelPrograms.some(p =>
            p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchQuery.toLowerCase())
          );
        if (!matchesSearch) return false;
      }

      if (selectedCategory) {
        const hasCategory = channelPrograms.some(p => p.category === selectedCategory);
        if (!hasCategory) return false;
      }

      return true;
    });
  }, [channels, searchQuery, selectedCategory, programs]);

  const categories = useMemo(() => {
    const cats = new Set(programs.map(p => p.category).filter(Boolean));
    return Array.from(cats);
  }, [programs]);

  const timelineHours = useMemo(() => {
    const hours = [];
    let current = timeRange.start;
    while (current < timeRange.end) {
      hours.push(current);
      current = addHours(current, 1);
    }
    return hours;
  }, [timeRange]);

  const currentTimePosition = useMemo(() => {
    const minutesFromStart = differenceInMinutes(currentTime, timeRange.start);
    return (minutesFromStart / 60) * HOUR_WIDTH;
  }, [currentTime, timeRange]);

  return (
    <div className={cn('flex flex-col h-full bg-[#080808]', className)}>
      {/* Header */}
      {showHeader && (
        <div className="flex-shrink-0 bg-[#080808] border-b border-white/5 p-4 z-20">
          <div className="flex items-center justify-between gap-4 max-w-[2000px] mx-auto">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl shadow-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {t('user.live.toggleGuide')}
                </h2>
                <p className="text-sm text-slate-400">
                  {format(currentTime, 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-1 max-w-2xl">
              <div className="relative flex-1 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <Input
                  type="text"
                  placeholder={t('user.filters.searchChannels')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:bg-white/10 rounded-xl"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="bg-white/5 border border-white/10 text-slate-300 rounded-xl px-3 py-2 text-sm focus:border-blue-500/50 focus:outline-none"
                >
                  <option value="">{`${t('common.all')} ${t('common.category')}`}</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigateTime(-3)}
                variant="outline"
                size="sm"
                className="bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                -3h
              </Button>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white">
                  {format(currentTime, 'HH:mm')}
                </span>
              </div>
              <Button
                onClick={() => navigateTime(3)}
                variant="outline"
                size="sm"
                className="bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
              >
                +3h
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EPG Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center bg-[#080808]">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-slate-400">{t('common.loading')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Combined Scroll Container for Sidebar + Grid to ensure Y-sync */}
            <div className="absolute inset-0 flex flex-col">
              {/* Fixed Timeline Header */}
              <div className="flex flex-shrink-0 border-b border-white/5 bg-[#080808] z-20">
                <div style={{ width: `${CHANNEL_SIDEBAR_WIDTH}px` }} className="flex-shrink-0 bg-[#0A0A0A] border-r border-white/5 flex items-center px-6">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('user.live.toggleChannels')}</span>
                </div>
                <div
                  ref={timelineRef}
                  className="flex-1 overflow-hidden"
                >
                  <div className="relative h-full flex" style={{ width: `${timelineHours.length * HOUR_WIDTH}px`, height: `${TIMELINE_HEIGHT}px` }}>
                    {timelineHours.map((hour, index) => (
                      <div
                        key={index}
                        className="border-l border-white/5 px-4 flex items-center"
                        style={{ width: `${HOUR_WIDTH}px` }}
                      >
                        <div>
                          <div className="text-sm font-medium text-slate-300">
                            {format(hour, 'HH:mm')}
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Indicator Top */}
                    {currentTimePosition >= 0 && currentTimePosition <= timelineHours.length * HOUR_WIDTH && (
                      <div
                        className="absolute bottom-0 w-0 z-30 flex flex-col items-center"
                        style={{ left: `${currentTimePosition}px` }}
                      >
                        <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-red-500 transform translate-y-1/2" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Main Scroll Area */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-black"
              >
                <div className="flex relative" style={{ minWidth: `${CHANNEL_SIDEBAR_WIDTH + timelineHours.length * HOUR_WIDTH}px` }}>

                  {/* Sticky Sidebar Column – z-20 so it stays above live EPG items (z-10) */}
                  <div className="sticky left-0 z-20 bg-[#0A0A0A] border-r border-white/5 w-[220px] flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
                    {filteredChannels.map(channel => {
                      const isPlaying = selectedChannelId === channel.id;
                      return (
                        <div
                          key={channel.id}
                          className={cn(
                            "flex items-center gap-3 p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group h-[80px]",
                            isPlaying && "bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-l-4 border-l-blue-500 hover:bg-blue-600/30"
                          )}
                          onClick={() => onChannelSelect?.(channel)}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center p-1 group-hover:bg-white/10 transition-colors",
                            isPlaying && "bg-blue-500/20 ring-2 ring-blue-500/50"
                          )}>
                            {channel.logo_url || channel.image_url ? (
                              <img
                                src={channel.image_url || channel.logo_url}
                                alt={channel.title}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  // Hide broken image and let parent show initial
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).onerror = null;
                                }}
                              />
                            ) : (
                              <span className="text-xs font-bold text-slate-500">
                                {channel.title.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className={cn(
                                "font-medium text-sm truncate transition-colors",
                                isPlaying ? "text-blue-400" : "text-slate-200 group-hover:text-blue-400"
                              )}>
                                {channel.title}
                              </h3>
                              {isPlaying && (
                                <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded uppercase animate-pulse">
                                  {t('user.live.liveBadge')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full transition-colors",
                                isPlaying ? "bg-green-500 animate-pulse" : "bg-slate-700 group-hover:bg-green-500"
                              )} />
                              <p className="text-[10px] text-slate-500 truncate uppercase tracking-wider">{channel.provider || t('user.live.epg.live')}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Programs Grid */}
                  <div className="relative bg-[#080808]">
                    {/* Vertical Time Lines Background */}
                    <div className="absolute inset-0 pointer-events-none flex">
                      {timelineHours.map((_, index) => (
                        <div
                          key={index}
                          className="h-full border-l border-white/5"
                          style={{ width: `${HOUR_WIDTH}px` }}
                        />
                      ))}
                    </div>

                    {/* Current Time Line */}
                    {currentTimePosition >= 0 && currentTimePosition <= timelineHours.length * HOUR_WIDTH && (
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-red-500/50 z-10 pointer-events-none shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                        style={{ left: `${currentTimePosition}px` }}
                      />
                    )}

                    {filteredChannels.map((channel) => {
                      const channelPrograms = getChannelPrograms(channel.id);
                      return (
                        <div
                          key={channel.id}
                          className="relative border-b border-white/5 h-[80px] overflow-hidden"
                          style={{ width: `${timelineHours.length * HOUR_WIDTH}px` }}
                        >
                          {channelPrograms.map((program, pIdx) => {
                            const style = getProgramStyle(program);
                            const isLive = isCurrentlyAiring(program);
                            return (
                              <div
                                key={pIdx}
                                onClick={() => setSelectedProgram(program)}
                                className={cn(
                                  "absolute top-2 bottom-2 rounded-lg border px-3 py-2 cursor-pointer transition-all hover:brightness-110",
                                  getCategoryStyle(program.category),
                                  isLive ? "ring-1 ring-red-500/50 shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)] z-10" : "grayscale-[0.3] hover:grayscale-0"
                                )}
                                style={style}
                              >
                                <div className="flex flex-col h-full justify-center">
                                  <p className="text-xs font-semibold truncate leading-tight mb-0.5">
                                    {program.title}
                                  </p>
                                  <div className="flex justify-between items-center opacity-60">
                                    <p className="text-[10px] truncate">
                                      {format(new Date(program.start), 'HH:mm')} - {format(new Date(program.end), 'HH:mm')}
                                    </p>
                                    {isLive && <span className="text-[10px] font-bold text-red-300 animate-pulse">{t('user.live.liveBadge')}</span>}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Program Details Modal */}
      {selectedProgram && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedProgram(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="program-title"
          aria-describedby="program-desc"
        >
          <div
            className="bg-[#0f0f0f] rounded-3xl border border-white/10 max-w-2xl w-full p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3 mb-2">
                  {isCurrentlyAiring(selectedProgram) && (
                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold rounded text-uppercase tracking-wider">
                      LIVE
                    </span>
                  )}
                  {selectedProgram.category && (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/20 text-xs font-bold rounded text-uppercase tracking-wider">
                      {selectedProgram.category}
                    </span>
                  )}
                </div>
                <h3 id="program-title" className="text-3xl font-bold text-white leading-tight">{selectedProgram.title}</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedProgram(null)}
                className="hover:bg-white/10 rounded-full"
              >
                <X className="w-5 h-5 text-slate-400" />
              </Button>
            </div>

            <div className="flex items-center gap-6 text-sm text-slate-400 mb-8 border-y border-white/5 py-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>
                  {format(new Date(selectedProgram.start), 'HH:mm')} - {format(new Date(selectedProgram.end), 'HH:mm')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span>{format(new Date(selectedProgram.start), 'MMMM d, yyyy')}</span>
              </div>
            </div>

            <div id="program-desc">
              {selectedProgram.description ? (
                <div className="prose prose-invert max-w-none">
                  <p className="text-slate-300 leading-relaxed text-lg">
                    {selectedProgram.description}
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 italic">{t('createContent.noDescription')}</p>
              )}
            </div>

            <div className="mt-8 flex justify-end gap-3 filter blur-0 opacity-100">
              {/* Future actions like "Remind Me" or "Record" could go here */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
