'use client';

import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { favoritesService, type ContentType } from '@/services/favorites';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  contentType: ContentType;
  contentId: string;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
  variant?: 'default' | 'icon-only';
  onToggle?: (isFavorite: boolean) => void;
}

export function FavoriteButton({
  contentType,
  contentId,
  className,
  iconClassName,
  showLabel = false,
  variant = 'icon-only',
  onToggle}: FavoriteButtonProps) {
  const { t } = useTranslation();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Check if content is favorited on mount and when props change
  useEffect(() => {
    let mounted = true;
    
    const checkFavorite = async () => {
      try {
        setIsChecking(true);
        const result = await favoritesService.isFavorite(contentType, contentId);
        if (mounted) {
          setIsFavorite(result);
        }
      } catch (error) {
        console.error('Error checking favorite status:', error);
        if (mounted) {
          setIsFavorite(false);
        }
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    };

    checkFavorite();

    return () => {
      mounted = false;
    };
  }, [contentType, contentId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLoading) return;

    // Optimistically update UI
    const newState = !isFavorite;
    setIsFavorite(newState);
    setIsLoading(true);

    try {
      // Perform the actual operation
      if (newState) {
        await favoritesService.addFavorite(contentType, contentId);
        toast.success(t('favorites.added'));
      } else {
        await favoritesService.removeFavorite(contentType, contentId);
        toast.success(t('favorites.removed'));
      }

      // Notify parent component
      window.dispatchEvent(new CustomEvent('flowcast:favorites-updated'));
      onToggle?.(newState);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Revert on error
      setIsFavorite(!newState);
      toast.error(t('favorites.error'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-full transition-all duration-200',
          variant === 'icon-only' ? 'h-10 w-10' : 'px-4 py-2',
          'bg-slate-800/50 text-slate-400',
          className
        )}
        disabled
      >
        <Heart className={cn('h-5 w-5 animate-pulse', iconClassName)} />
        {showLabel && variant !== 'icon-only' && (
          <span className="ml-2 text-sm">{t('common.loading')}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-all duration-200',
        variant === 'icon-only' ? 'h-10 w-10' : 'px-4 py-2',
        isFavorite
          ? 'bg-red-600/20 text-red-500 hover:bg-red-600/30'
          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white',
        isLoading && 'opacity-50 cursor-not-allowed',
        className
      )}
      title={isFavorite ? t('favorites.remove') : t('favorites.add')}
    >
      <Heart
        className={cn(
          'h-5 w-5 transition-all duration-200',
          isFavorite && 'fill-current',
          isLoading && 'animate-pulse',
          iconClassName
        )}
      />
      {showLabel && variant !== 'icon-only' && (
        <span className="ml-2 text-sm">
          {isFavorite ? t('favorites.inFavorites') : t('favorites.add')}
        </span>
      )}
    </button>
  );
}
