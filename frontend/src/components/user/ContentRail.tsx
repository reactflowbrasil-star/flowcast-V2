'use client';

import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { DiscoveryMediaItem } from '@/types';
import { ContentCard } from './ContentCard';
import { Button } from '@/components/ui/button';

interface ContentRailProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  items: DiscoveryMediaItem[];
  isLoading?: boolean;
  emptyLabel?: string;
  viewAllHref?: string;
  aspectRatio?: 'poster' | 'video';
  onEndReached?: () => void;
}

export function ContentRail({
  title,
  subtitle,
  icon,
  items,
  isLoading = false,
  emptyLabel,
  viewAllHref,
  aspectRatio = 'poster'}: ContentRailProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollAmount = container.clientWidth * 0.8;
      
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Skeleton Loading State
  if (isLoading) {
    const skeletonCount = 6;
    const widthClass = aspectRatio === 'poster' ? 'w-[160px] sm:w-[180px] md:w-[200px]' : 'w-[260px] sm:w-[280px] md:w-[320px]';
    const aspectClass = aspectRatio === 'poster' ? 'aspect-[2/3]' : 'aspect-[16/9]';
    
    return (
      <section className="space-y-4 py-4 relative group/rail">
        <div className="flex items-center gap-3 px-6 sm:px-10">
           {/* Skeleton Title */}
           <div className="h-7 w-48 bg-slate-800/50 rounded-md animate-pulse" />
        </div>
        
        <div className="flex gap-4 overflow-hidden px-6 sm:px-10 pb-4">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div 
              key={`skel-${i}`} 
              className={cn(
                "shrink-0 bg-slate-800/40 rounded-lg animate-pulse",
                widthClass,
                aspectClass
              )} 
            />
          ))}
        </div>
      </section>
    );
  }

  if (!items || items.length === 0) {
    // Optional: Render nothing or an empty state
    if (!emptyLabel) return null;
    
    return (
      <section className="space-y-4 py-6 px-6 sm:px-10">
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <h3 className="text-xl font-bold text-white">{title}</h3>
        </div>
        <div className="p-8 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center">
          <p className="text-slate-400">{emptyLabel}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 py-2 group/rail relative">
      {/* Header */}
      <div className="flex items-end justify-between px-6 sm:px-10 mb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {/* Accent Line */}
            <div className="w-1 h-6 bg-blue-600 rounded-full mr-1" />
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-sm">
              {title}
            </h3>
            {icon && <span className="text-slate-400 ml-1 opacity-80">{icon}</span>}
          </div>
          {subtitle && (
            <p className="text-sm text-slate-400 font-medium pl-4">{subtitle}</p>
          )}
        </div>

        {viewAllHref && (
          <Link 
            href={viewAllHref} 
            className="group/link flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span>{t('user.common.viewAll')}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover/link:translate-x-1" />
          </Link>
        )}
      </div>

      {/* Rail Container */}
      <div className="relative">
        {/* Left Scroll Button - Only visible on hover and if scrolled */}
        <button
          onClick={() => scroll('left')}
          className={cn(
            "absolute left-0 top-0 bottom-4 z-20 w-12 sm:w-16 bg-gradient-to-r from-black/80 to-transparent flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-opacity duration-300 disabled:opacity-0",
            !showLeftArrow && "hidden"
          )}
          aria-label={t('common.previous')}
        >
          <ChevronLeft className="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
        </button>

        {/* Scrollable Area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto pb-8 pt-2 px-6 sm:px-10 scrollbar-none snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <div key={item.id} className="snap-start shrink-0">
              <ContentCard 
                item={item} 
                aspectRatio={aspectRatio} 
                showProgress={item.badges?.includes('continue') || item.progress !== undefined}
              />
            </div>
          ))}
          
          {/* Spacer for end padding */}
          <div className="w-2 shrink-0" />
        </div>

        {/* Right Scroll Button */}
        <button
          onClick={() => scroll('right')}
          className={cn(
            "absolute right-0 top-0 bottom-4 z-20 w-12 sm:w-16 bg-gradient-to-l from-black/80 to-transparent flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-opacity duration-300 disabled:opacity-0",
            !showRightArrow && "hidden"
          )}
          aria-label={t('common.next')}
        >
          <ChevronRight className="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
        </button>
      </div>
    </section>
  );
}
