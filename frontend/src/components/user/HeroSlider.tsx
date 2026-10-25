/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Play, Info, Plus, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DiscoveryMediaItem } from '@/types';
import { ROUTES } from '@/constants/app';

type HeroSliderProps = {
  items: DiscoveryMediaItem[];
  className?: string;
  intervalMs?: number;
  onActiveVisualChange?: (bg: string) => void;
};

function resolveItemHref(item: DiscoveryMediaItem): string {
  if (item.content_id) {
    return ROUTES.CONTENT.WATCH(item.content_id);
  }
  const media = (item.media_type || '').toLowerCase();
  if (media === 'tv') return `${ROUTES.CONTENT.BROWSE}?tab=shows&search=${encodeURIComponent(item.title)}`;
  if (media === 'movie') return `${ROUTES.CONTENT.BROWSE}?tab=movies&search=${encodeURIComponent(item.title)}`;
  return `${ROUTES.CONTENT.SEARCH}?q=${encodeURIComponent(item.title)}`;
}

function toBackgroundImage(src: string | undefined, fallback: string): string {
  if (!src || !src.trim()) return fallback;
  const trimmed = src.trim();
  if (trimmed.startsWith('http') || trimmed.startsWith('/')) {
    return `url(${trimmed})`;
  }
  return trimmed;
}

const FALLBACKS = [
  'linear-gradient(135deg, #0f172a 0%, #000000 100%)',
];

export default function HeroSlider({ items, className, intervalMs = 8000, onActiveVisualChange }: HeroSliderProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const safeItems = useMemo(
    () =>
      (items || [])
        .filter((it) => {
          // Only require a usable visual
          const hasVisual = !!(it.backdrop || it.image || (it as any).backdrop_url || (it as any).image_url);
          return hasVisual;
        })
        .slice(0, 8),
    [items],
  );

  const active = safeItems[index] || null;

  // Auto-rotate
  useEffect(() => {
    if (safeItems.length <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % safeItems.length);
    }, intervalMs);
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [safeItems.length, intervalMs]);

  const backgroundImage = toBackgroundImage(
    active?.backdrop || active?.image || (active as any)?.backdrop_url,
    FALLBACKS[0],
  );

  // Notify parent
  useEffect(() => {
    onActiveVisualChange?.(backgroundImage);
  }, [backgroundImage, onActiveVisualChange]);

  if (!active) return null;

  return (
    <div className={cn("relative h-[75vh] w-full overflow-hidden", className)}>
      {/* Background Layer */}
      <div 
        key={active.id} // Force re-render for animation
        className="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out animate-in fade-in zoom-in-105"
        style={{ backgroundImage }}
      />
      
      {/* Gradient Overlays for Readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[#0a0a0a]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />

      {/* Content Container */}
      <div className="absolute inset-0 flex flex-col justify-end pb-20 sm:pb-24 px-6 sm:px-10 md:px-16">
        <div className="max-w-3xl space-y-6 animate-in slide-in-from-bottom-10 duration-700 fade-in">
          
          {/* Badges / Metadata */}
          <div className="flex items-center gap-3 text-sm font-medium text-gray-300">
             <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white uppercase tracking-wider">
               {t('user.dashboard.badgeFeatured')}
             </span>
             {active.year && (
               <>
                 <span className="w-1 h-1 rounded-full bg-gray-400" />
                 <span>{active.year}</span>
               </>
             )}
             {active.media_type && (
               <>
                 <span className="w-1 h-1 rounded-full bg-gray-400" />
                 <span className="uppercase">{active.media_type}</span>
               </>
             )}
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold text-white tracking-tight drop-shadow-2xl leading-[1.1]">
            {active.title}
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg md:text-xl text-gray-200 line-clamp-3 max-w-2xl leading-relaxed drop-shadow-md text-shadow-sm">
            {active.description || t('user.dashboard.welcomeDescription')}
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link href={resolveItemHref(active)}>
              <Button 
                size="lg" 
                className="h-12 px-8 bg-white text-black hover:bg-gray-200 font-bold text-base rounded-md flex items-center gap-2 transition-transform hover:scale-105"
              >
                <Play className="h-5 w-5 fill-black" />
                {t('user.dashboard.watchNow')}
              </Button>
            </Link>

            <Button 
              size="lg" 
              variant="secondary"
              className="h-12 px-8 bg-white/20 text-white hover:bg-white/30 backdrop-blur-md font-semibold text-base rounded-md flex items-center gap-2 border border-white/10 transition-transform hover:scale-105"
            >
              <Info className="h-5 w-5" />
              {t('common.details')}
            </Button>
          </div>
        </div>
      </div>

      {/* Right Side Controls (Mute, etc) */}
      <div className="absolute bottom-24 right-6 sm:right-10 z-20 hidden md:flex items-center gap-4">
         <button 
           onClick={() => setIsMuted(!isMuted)}
           className="p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white border border-white/10 transition-colors"
         >
           {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
         </button>
         <div className="w-px h-8 bg-white/20" />
         <div className="text-xs font-bold text-white/50 uppercase tracking-widest">
           {active.media_type === 'movie' ? t('contentType.movie') : t('contentType.tvShow')}
         </div>
      </div>
    </div>
  );
}
