'use client';

import React from 'react';
import Link from 'next/link';
import { Play, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/user/FavoriteButton';
import { MOVIES_BACKDROPS } from '@/constants/backdrops';
import { useTranslation } from 'react-i18next';

interface VODCardProps {
  id: number;
  title: string;
  description?: string;
  year?: number | string;
  poster_url?: string;
  image_url?: string;
  backdrop_url?: string;
  rating?: number;
  progress?: number;
  category?: string;
  className?: string;
}

/**
 * VODCard - Modern card component for VOD content (Movies, Series, Kids, Anime, Novelas)
 *
 * Features:
 * - Modern design matching /user/content style
 * - Category badge at top
 * - Title and description overlay
 * - Bottom bar with year and Watch button
 * - Hover effects with elevation and border glow
 */
export default function VODCard({
  id,
  title,
  description: _description,
  year,
  poster_url,
  image_url,
  backdrop_url,
  rating,
  progress: _progress = 0,
  category,
  className}: VODCardProps) {
  const { i18n } = useTranslation();
  // Use poster_url first, then image_url, then backdrop_url as fallback
  const displayImage = poster_url || image_url || backdrop_url;

  // Random placeholder images for cards without posters
  const placeholderImages = MOVIES_BACKDROPS;

  // Get a consistent random placeholder based on the ID
  const placeholderIndex = id % placeholderImages.length;
  const fallbackImage = placeholderImages[placeholderIndex];

  return (
    <Link
      href={`/user/content/${id}/watch`}
      className={cn(
        'group relative overflow-hidden rounded-xl bg-black/40 transition-all duration-500 hover:z-10 hover:scale-105 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)]',
        className
      )}
    >
      {/* Poster Image with Gradient Overlay - Fixed aspect ratio */}
      <div
        className="relative aspect-[2/3] bg-cover bg-center"
        style={{
          backgroundImage: displayImage
            ? `url(${displayImage})`
            : `url(${fallbackImage})`
        }}
      >
        {/* Blur overlay for placeholder images */}
        {!displayImage && (
          <div className="absolute inset-0 backdrop-blur-xl bg-slate-900/60 flex items-center justify-center">
            <Film className="h-16 w-16 text-slate-400" />
          </div>
        )}

        {/* Hover Overlay - Darkens and adds play button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center backdrop-blur-[2px]">
          <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.2)] transform scale-0 group-hover:scale-100 transition-transform duration-300 delay-100">
            <Play className="h-6 w-6 text-white fill-white ml-1" />
          </div>
        </div>

        <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black via-black/20 to-transparent p-4 opacity-100 group-hover:opacity-0 transition-opacity duration-300">
          {/* Category Badge and Favorite Button */}
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
            {category && (
              <span className="rounded-md bg-black/60 backdrop-blur-md px-2 py-0.5 uppercase tracking-wider text-[10px] font-bold border border-white/10 shadow-sm">
                {category}
              </span>
            )}
            {/* Favorite button kept visible but subtle */}
            {/* <div onClick={(e) => e.preventDefault()}>
              <FavoriteButton
                contentType="movie"
                contentId={String(id)}
                className="h-8 w-8"
                iconClassName="h-4 w-4"
              />
            </div> */}
          </div>
        </div>
      </div>

      {/* Bottom Info - Only visible on hover in some designs, but here we keep it clean */}
      <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black to-transparent pt-10 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-white line-clamp-1 text-shadow-sm">
            {title}
          </h3>
          <div onClick={(e) => e.preventDefault()} className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <FavoriteButton
              contentType="movie"
              contentId={String(id)}
              className="h-6 w-6 hover:bg-white/10 rounded-full p-1"
              iconClassName="h-3 w-3"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-gray-300 font-medium">
          {year && <span className="bg-white/10 px-1.5 rounded text-white">{year}</span>}
          {typeof rating === 'number' && (
            <span className="text-green-400">
              {new Intl.NumberFormat(i18n.language || undefined, { maximumFractionDigits: 1 }).format(rating)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
