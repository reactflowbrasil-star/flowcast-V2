/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Epg, Layout, useEpg } from 'planby';
import { format, addHours, startOfHour, isWithinInterval } from 'date-fns';
import { Clock, Calendar, ChevronLeft, ChevronRight, Loader2, Play, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiService } from '@/services';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
// import '@/styles/epg.css'; // Temporarily disabled due to PostCSS compatibility

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
  start: string; // ISO-8601 UTC
  end: string;   // ISO-8601 UTC
  category?: string;
}

interface EPGApiResponse {
  programs?: Program[];
}

interface EPGGuideProps {
  channels: Channel[];
  onChannelSelect?: (channel: Channel) => void;
}

// Category color mapping for better visual distinction
const getCategoryColor = (category?: string) => {
  const colors: Record<string, { bg: string; border: string; gradient: string }> = {
    'Sports': {
      bg: '#1e3a5f',
      border: '#2563eb',
      gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)'
    },
    'News': {
      bg: '#7c2d12',
      border: '#ea580c',
      gradient: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)'
    },
    'Movies': {
      bg: '#4c1d95',
      border: '#a855f7',
      gradient: 'linear-gradient(135deg, #4c1d95 0%, #a855f7 100%)'
    },
    'Series': {
      bg: '#134e4a',
      border: '#14b8a6',
      gradient: 'linear-gradient(135deg, #134e4a 0%, #14b8a6 100%)'
    },
    'Kids': {
      bg: '#831843',
      border: '#ec4899',
      gradient: 'linear-gradient(135deg, #831843 0%, #ec4899 100%)'
    },
    'Entertainment': {
      bg: '#713f12',
      border: '#f59e0b',
      gradient: 'linear-gradient(135deg, #713f12 0%, #f59e0b 100%)'
    }};

  return colors[category || 'Live'] || {
    bg: '#1e293b',
    border: '#475569',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
  };
};

export default function EPGGuide({ channels, onChannelSelect }: EPGGuideProps) {
  const { t } = useTranslation();
  const [epgData, setEpgData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedProgram, setSelectedProgram] = useState<any>(null);
  const [timeRange, setTimeRange] = useState({
    start: startOfHour(new Date()),
    end: addHours(startOfHour(new Date()), 24) // Show 24 hours for better overview
  });

  // Transform channels to Planby format
  const epgChannels = useMemo(() => {
    return channels.map(channel => ({
      uuid: String(channel.id),
      logo: channel.logo_url || channel.image_url || '',
      title: channel.title}));
  }, [channels]);

  // Fetch EPG data
  useEffect(() => {
    if (channels.length === 0) return;
    
    const fetchEPG = async () => {
      setIsLoading(true);
      try {
        const channelIds = channels.map(c => c.id).join(',');
        const startTime = timeRange.start.toISOString();
        const endTime = timeRange.end.toISOString();
        
        const response = await apiService.get<EPGApiResponse>(
          `/api/tv/epg?channel_ids=${channelIds}&start=${startTime}&end=${endTime}`
        );

        if (response.success && (response.data as EPGApiResponse)?.programs) {
          // Transform programs to Planby format
          const epgData = response.data as EPGApiResponse;
          const transformedPrograms = epgData.programs!.map((program: Program, index: number) => ({
            id: `${program.channel_id}-${index}`,
            channelUuid: program.channel_id,
            title: program.title,
            description: program.description || '',
            since: program.start,
            till: program.end,
            image: '', // Could add program images if available
            category: program.category || t('common.category')}));
          
          setEpgData(transformedPrograms);
        } else {
          // If no EPG data, create placeholder programs
          const placeholderPrograms = channels.flatMap(channel => {
            const programs = [];
            let currentStart = new Date(timeRange.start);
            
            while (currentStart < timeRange.end) {
              const currentEnd = addHours(currentStart, 1);
              programs.push({
                id: `${channel.id}-${currentStart.getTime()}`,
                channelUuid: String(channel.id),
                title: t('user.live.epg.liveProgramming'),
                description: t('user.live.epg.noProgramInfo'),
                since: currentStart.toISOString(),
                till: currentEnd.toISOString(),
                image: '',
                category: t('user.live.epg.live')});
              currentStart = currentEnd;
            }
            
            return programs;
          });
          
          setEpgData(placeholderPrograms);
        }
      } catch (error) {
        console.error('Error fetching EPG:', error);
        toast.error(t('user.live.epg.errors.loadFailed'));
        
        // Create placeholder programs on error
        const placeholderPrograms = channels.flatMap(channel => {
          const programs = [];
          let currentStart = new Date(timeRange.start);
          
          while (currentStart < timeRange.end) {
            const currentEnd = addHours(currentStart, 1);
            programs.push({
              id: `${channel.id}-${currentStart.getTime()}`,
              channelUuid: String(channel.id),
              title: t('user.live.epg.liveProgramming'),
              description: t('user.live.epg.noProgramInfo'),
              since: currentStart.toISOString(),
              till: currentEnd.toISOString(),
              image: '',
              category: t('user.live.epg.live')});
            currentStart = currentEnd;
          }
          
          return programs;
        });
        
        setEpgData(placeholderPrograms);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEPG();
  }, [channels, timeRange, t]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const { getEpgProps, getLayoutProps, onScrollToNow, onScrollLeft, onScrollRight } = useEpg({
    channels: epgChannels,
    epg: epgData,
    dayWidth: 14400, // Much wider for 24 hours (600px per hour)
    sidebarWidth: 200, // Sidebar for channel logos
    itemHeight: 80, // Moderate height for better density
    isSidebar: true,
    isTimeline: true,
    isLine: true,
    startDate: timeRange.start.toISOString(),
    endDate: timeRange.end.toISOString(),
    isBaseTimeFormat: true,
    theme: {
      primary: {
        600: '#0f172a', // Darker background
        900: '#020617'},
      grey: {
        300: '#e2e8f0'},
      white: '#ffffff',
      green: {
        300: '#10b981', // Brighter green for live indicator
      },
      scrollbar: {
        border: '#334155',
        thumb: {
          bg: '#475569'}},
      loader: {
        teal: '#14b8a6',
        purple: '#a855f7',
        pink: '#ec4899',
        bg: '#0f172a'},
      gradient: {
        blue: {
          300: '#60a5fa',
          600: '#3b82f6',
          900: '#1e40af'}},
      text: {
        grey: {
          300: '#cbd5e1',
          500: '#94a3b8'}},
      timeline: {
        divider: {
          bg: '#334155'}}}});

  const handlePreviousDay = () => {
    setTimeRange(prev => ({
      start: addHours(prev.start, -24),
      end: addHours(prev.end, -24)}));
  };

  const handleNextDay = () => {
    setTimeRange(prev => ({
      start: addHours(prev.start, 24),
      end: addHours(prev.end, 24)}));
  };

  const handleGoToNow = () => {
    const now = startOfHour(new Date());
    setTimeRange({
      start: now,
      end: addHours(now, 24)});
    setTimeout(() => onScrollToNow(), 100);
  };

  if (isLoading && epgData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-300">{t('user.live.epg.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Enhanced EPG Controls */}
      <div className="bg-gradient-to-r from-slate-900/90 to-slate-800/90 backdrop-blur-sm border-b border-slate-700/50 shadow-lg">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreviousDay}
                className="text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">{t('user.live.epg.previous24h')}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleGoToNow}
                className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 border border-blue-500/30 mx-1 transition-all"
              >
                <Clock className="h-4 w-4 mr-1" />
                <span className="font-medium">{t('user.live.epg.liveNow')}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextDay}
                className="text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all"
              >
                <span className="hidden sm:inline">{t('user.live.epg.next24h')}</span>
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            <div className="hidden md:flex items-center space-x-2 text-slate-400 bg-slate-800/30 px-3 py-1.5 rounded-lg border border-slate-700/30">
              <Calendar className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-slate-300">
                {format(timeRange.start, 'EEE, MMM d')} • {format(timeRange.start, 'HH:mm')} - {format(timeRange.end, 'HH:mm')}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
              <div className="hidden lg:flex items-center space-x-4 text-xs text-slate-400 bg-slate-800/30 px-3 py-1.5 rounded-lg border border-slate-700/30">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 rounded-sm bg-gradient-to-br from-blue-600 to-blue-400"></div>
                  <span>{t('user.live.epg.live')}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 rounded-sm bg-gradient-to-br from-slate-700 to-slate-600"></div>
                  <span>{t('user.live.epg.upcoming')}</span>
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Enhanced EPG Grid */}
      <div className="flex-1 overflow-hidden relative">
        <Epg {...getEpgProps()}>
          <Layout
            {...getLayoutProps()}
            renderProgram={({ program, ...rest }: { program: any; style?: React.CSSProperties; [key: string]: any }) => {
              const isLive = isWithinInterval(new Date(), {
                start: new Date(program.data.since),
                end: new Date(program.data.till)
              });
              const categoryColors = getCategoryColor(program.data.category);

              return (
                <div
                  {...rest}
                  className="epg-program group cursor-pointer"
                  style={{
                    ...(rest.style || {}),
                    background: isLive
                      ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)'
                      : categoryColors.gradient,
                    border: `1px solid ${isLive ? '#3b82f6' : categoryColors.border}`,
                    borderRadius: '6px',
                    padding: '6px 8px',
                    overflow: 'hidden',
                    minWidth: 0, // Allow flex items to shrink below content size
                    boxShadow: isLive
                      ? '0 4px 12px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                      : '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    transition: 'all 0.3s ease'}}
                  onClick={() => setSelectedProgram(program.data)}
                >
                  {isLive && (
                    <div className="absolute top-2 right-2 flex items-center space-x-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                      <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      <span>{t('user.live.epg.liveBadge')}</span>
                    </div>
                  )}

                  <div className="flex flex-col h-full justify-between overflow-hidden">
                    <div className="overflow-hidden">
                      <div className="text-white text-xs font-semibold truncate mb-0.5 group-hover:text-blue-200 transition-colors">
                        {program.data.title}
                      </div>
                      {program.data.description && (
                        <div className="text-slate-300 text-[10px] line-clamp-2 opacity-80">
                          {program.data.description}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between flex-shrink-0">
                      <div className="text-slate-300 text-[10px] font-medium truncate">
                        {format(new Date(program.data.since), 'HH:mm')} - {format(new Date(program.data.till), 'HH:mm')}
                      </div>
                      {program.data.category && (
                        <div className="text-[10px] text-slate-400 bg-black/20 px-2 py-0.5 rounded-full">
                          {program.data.category}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all rounded-lg pointer-events-none"></div>
                </div>
              );
            }}
            renderChannel={({ channel }) => (
              <div
                className="epg-channel group cursor-pointer relative overflow-hidden"
                style={{
                  height: '100px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  background: 'linear-gradient(to right, #0f172a, #1e293b)',
                  borderBottom: '1px solid #334155',
                  transition: 'all 0.3s ease'}}
                onClick={() => {
                  const originalChannel = channels.find(c => String(c.id) === channel.uuid);
                  if (originalChannel && onChannelSelect) {
                    onChannelSelect(originalChannel);
                  }
                }}
              >
                {/* Hover gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/0 to-blue-600/0 group-hover:from-blue-600/10 group-hover:to-transparent transition-all"></div>

                <div className="relative flex items-center space-x-3 w-full">
                  {channel.logo ? (
                    <div className="flex-shrink-0 w-16 h-12 bg-slate-800/50 rounded-lg p-2 border border-slate-700/50 group-hover:border-blue-500/50 transition-all">
                      <img
                        src={channel.logo}
                        alt={channel.title}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-16 h-12 bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg flex items-center justify-center border border-slate-600/50">
                      <Play className="h-6 w-6 text-slate-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-semibold truncate group-hover:text-blue-300 transition-colors">
                      {channel.title}
                    </div>
                    <div className="text-slate-400 text-xs truncate mt-0.5">
                      {t('user.live.epg.clickToWatch')}
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-blue-400 transition-all transform group-hover:translate-x-1" />
                </div>
              </div>
            )}
          />
        </Epg>
      </div>

      {/* Program Details Modal */}
      {selectedProgram && (
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedProgram(null)}
        >
          <div
            className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-2xl w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2">{selectedProgram.title}</h3>
                <div className="flex items-center space-x-4 text-sm text-slate-400">
                  <span className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {format(new Date(selectedProgram.since), 'HH:mm')} - {format(new Date(selectedProgram.till), 'HH:mm')}
                  </span>
                  {selectedProgram.category && (
                    <span className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full border border-blue-500/30">
                      {selectedProgram.category}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProgram(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </Button>
            </div>

            {selectedProgram.description && (
              <div className="mb-6">
                <p className="text-slate-300 leading-relaxed">{selectedProgram.description}</p>
              </div>
            )}

            <div className="flex items-center space-x-3">
              <Button
                onClick={() => {
                  const channel = channels.find(c => String(c.id) === selectedProgram.channel_id);
                  if (channel && onChannelSelect) {
                    onChannelSelect(channel);
                    setSelectedProgram(null);
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Play className="h-4 w-4 mr-2" />
                {t('user.live.epg.watchChannel')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedProgram(null)}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                {t('common.close')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
