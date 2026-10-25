'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Play, Plus, Info, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/constants/app';
import type { DiscoveryMediaItem } from '@/types';

interface ContentCardProps {
  item: DiscoveryMediaItem;
  aspectRatio?: 'poster' | 'video'; // 'poster' = 2:3, 'video' = 16:9
  showProgress?: boolean;
  priority?: boolean;
  className?: string;
}

const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #1f2937 0%, #0f172a 100%)',
  'linear-gradient(135deg, #111827 0%, #3730a3 100%)',
  'linear-gradient(135deg, #111827 0%, #312e81 80%)',
  'linear-gradient(135deg, #111827 0%, #7c3aed 100%)',
];

function resolveItemHref(item: DiscoveryMediaItem): string {
  if (item.content_id) {
    const baseUrl = ROUTES.CONTENT.WATCH(item.content_id);
    if (item.episode_id) {
      return `${baseUrl}?episode=${item.episode_id}`;
    }
    return baseUrl;
  }
  if (item.media_type === 'tv') {
    return `${ROUTES.CONTENT.BROWSE}?tab=shows&search=${encodeURIComponent(item.title)}`;
  }
  if (item.media_type === 'movie') {
    return `${ROUTES.CONTENT.BROWSE}?tab=movies&search=${encodeURIComponent(item.title)}`;
  }
  return `${ROUTES.CONTENT.SEARCH}?q=${encodeURIComponent(item.title)}`;
}

function toBackgroundImage(src: string | undefined, fallbackIndex: number): string {
  if (!src || !src.trim()) {
    return FALLBACK_GRADIENTS[fallbackIndex % FALLBACK_GRADIENTS.length];
  }
  const trimmed = src.trim();
  if (trimmed.startsWith('linear-gradient') || trimmed.startsWith('radial-gradient') || trimmed.startsWith('url(')) {
    return trimmed;
  }
  return `url(${trimmed})`;
}

export function ContentCard({ 
  item, 
  aspectRatio = 'poster', 
  showProgress = false, 
  priority = false,
  className 
}: ContentCardProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  // Resolve images
  const visual = aspectRatio === 'video' 
    ? (item.backdrop || item.image) 
    : (item.image || item.backdrop);
    
  // Fallback index based on id hash or random
  const fallbackIndex = (item.id?.length || 0) + (item.title?.length || 0);
  const backgroundImage = toBackgroundImage(visual, fallbackIndex);
  const href = resolveItemHref(item);
  
  const rating = typeof item.rating === 'number' && item.rating > 0 ? item.rating : null;
  const progressPct = Math.min(100, Math.max(0, Math.round(((item.progress ?? 0) as number) * 100)));

  return (
    <Link 
      href={href}
      className={cn(
        "group relative block transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg",
        aspectRatio === 'poster' ? 'w-[160px] sm:w-[180px] md:w-[200px]' : 'w-[260px] sm:w-[280px] md:w-[320px]',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Card Container */}
      <div 
        className={cn(
          "relative overflow-hidden rounded-lg bg-slate-900 shadow-lg transition-all duration-300 ease-out",
          aspectRatio === 'poster' ? 'aspect-[2/3]' : 'aspect-[16/9]',
          isHovered ? 'scale-105 z-10 shadow-xl shadow-black/50 ring-2 ring-white/10' : 'scale-100 z-0'
        )}
      >
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out"
          style={{ 
            backgroundImage,
            transform: isHovered ? 'scale(1.1)' : 'scale(1.0)'
          }} 
        />

        {/* Gradient Overlay (Always visible but stronger on hover) */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent transition-opacity duration-300",
          isHovered ? 'opacity-100' : 'opacity-60'
        )} />

        {/* Content - Normally hidden or minimal, revealed on hover */}
        <div className="absolute inset-0 p-4 flex flex-col justify-end">
          {/* Badges - Top Left */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1">
            {(item.badges ?? []).slice(0, 2).map((badge) => (
              <Badge
                key={badge}
                variant="secondary"
                className="bg-blue-600/90 text-white border-none text-[10px] uppercase tracking-wider px-1.5 py-0.5 backdrop-blur-sm"
              >
                {t(`user.badges.${badge}`, badge)}
              </Badge>
            ))}
          </div>

          {/* Info Area */}
          <div className={cn(
            "transition-all duration-300 transform",
            isHovered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-90'
          )}>
            <h3 className="text-white font-bold text-sm sm:text-base leading-tight line-clamp-2 drop-shadow-md">
              {item.title}
            </h3>
            
            {/* Metadata Row (Year, Rating, Duration) */}
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-300 font-medium">
              {item.year && <span>{item.year}</span>}
              {rating && (
                <div className="flex items-center gap-0.5 text-yellow-400">
                  <Star className="h-3 w-3 fill-current" />
                  <span>{rating.toFixed(1)}</span>
                </div>
              )}
              {item.subtitle && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-slate-400" />
                  <span className="truncate max-w-[100px]">{item.subtitle}</span>
                </>
              )}
            </div>

            {/* Action Buttons (Only on Hover) */}
            <div className={cn(
              "flex items-center gap-2 mt-3 transition-all duration-300 delay-75",
              isHovered ? 'h-auto opacity-100' : 'h-0 opacity-0 overflow-hidden'
            )}>
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-black hover:bg-blue-400 hover:text-white transition-colors">
                <Play className="h-4 w-4 fill-current ml-0.5" />
              </div>
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors backdrop-blur-sm">
                <Plus className="h-4 w-4" />
              </div>
              {/* <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors backdrop-blur-sm ml-auto">
                <Info className="h-4 w-4" />
              </div> */}
            </div>
          </div>
          
          {/* Progress Bar */}
          {showProgress && progressPct > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div 
                className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                style={{ width: `${progressPct}%` }} 
              />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
