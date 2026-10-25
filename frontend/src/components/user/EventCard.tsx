'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/user/FavoriteButton';
import { useTranslation } from 'react-i18next';

interface EventCardProps {
  id: number;
  title: string;
  description?: string;
  year?: number | string;
  image_url?: string;
  backdrop_url?: string;
  event_type?: string;
  schedules?: any[];
  className?: string;
}

/**
 * EventCard - Horizontal card component for Events
 * 
 * Features:
 * - Horizontal layout with smaller height
 * - Event type badge
 * - Schedule information
 * - No "Ver" button - entire card is clickable
 */
export default function EventCard({
  id,
  title,
  description,
  year,
  image_url,
  backdrop_url,
  event_type,
  schedules = [],
  className}: EventCardProps) {
  const { i18n } = useTranslation();
  const displayImage = backdrop_url || image_url;
  
  // Get next schedule if available
  const nextSchedule = schedules && schedules.length > 0 ? schedules[0] : null;

  return (
    <Link
      href={`/user/content/${id}/watch`}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/60 hover:shadow-xl hover:shadow-blue-500/20',
        className
      )}
    >
      <div className="flex h-32">
        {/* Image Section - Fixed width */}
        <div
          className="relative w-48 flex-shrink-0 bg-cover bg-center"
          style={{
            backgroundImage: displayImage
              ? `url(${displayImage})`
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }}
        >
          {!displayImage && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
              <Calendar className="h-12 w-12 text-slate-400" />
            </div>
          )}
          
          {/* Event Type Badge */}
          {event_type && (
            <div className="absolute top-2 left-2">
              <span className="rounded-full bg-red-600/90 px-2 py-1 text-xs font-medium uppercase tracking-wide text-white">
                {event_type}
              </span>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="flex flex-1 flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-white line-clamp-1 group-hover:text-blue-200">
                {title}
              </h3>
              {description && (
                <p className="text-sm text-slate-400 line-clamp-2 mt-1">
                  {description}
                </p>
              )}
            </div>
            
            {/* Favorite Button */}
            <div onClick={(e) => e.preventDefault()}>
              <FavoriteButton
                contentType="movie"
                contentId={String(id)}
                className="h-8 w-8"
                iconClassName="h-4 w-4"
              />
            </div>
          </div>

          {/* Footer Info */}
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {year && <span>{year}</span>}
            {nextSchedule && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  {new Date(nextSchedule.scheduled_at).toLocaleDateString(i18n.language || undefined)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
