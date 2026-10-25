'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';

export interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallback?: React.ReactNode;
  showLoader?: boolean;
  aspectRatio?: 'square' | 'video' | 'portrait' | 'landscape' | 'auto';
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
}

/**
 * Optimized Image Component
 * 
 * Features:
 * - Lazy loading by default
 * - Error handling with fallback
 * - Loading state
 * - Aspect ratio presets
 * - Object fit control
 */
export function OptimizedImage({
  src,
  alt,
  className,
  fallback,
  showLoader = true,
  aspectRatio = 'auto',
  objectFit = 'cover',
  onError,
  onLoad,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoading(false);
    onLoad?.(e);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoading(false);
    setHasError(true);
    onError?.(e);
  };

  const aspectRatioClass = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[2/3]',
    landscape: 'aspect-[3/2]',
    auto: ''}[aspectRatio];

  const objectFitClass = {
    cover: 'object-cover',
    contain: 'object-contain',
    fill: 'object-fill',
    none: 'object-none',
    'scale-down': 'object-scale-down'}[objectFit];

  if (hasError) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div
        className={cn(
          'flex items-center justify-center bg-slate-800/50 rounded-lg',
          aspectRatioClass,
          className
        )}
      >
        <ImageIcon className="h-8 w-8 text-slate-600" />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', aspectRatioClass, className)}>
      {isLoading && showLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800/50 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          'w-full h-full',
          objectFitClass,
          isLoading && 'opacity-0',
          !isLoading && 'opacity-100 transition-opacity duration-300'
        )}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </div>
  );
}

/**
 * Content Poster Image
 * Optimized for movie/series posters (2:3 aspect ratio)
 */
export function PosterImage({
  src,
  alt,
  className,
  ...props
}: Omit<OptimizedImageProps, 'aspectRatio'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      aspectRatio="portrait"
      className={className}
      {...props}
    />
  );
}

/**
 * Content Backdrop Image
 * Optimized for backdrop images (16:9 aspect ratio)
 */
export function BackdropImage({
  src,
  alt,
  className,
  ...props
}: Omit<OptimizedImageProps, 'aspectRatio'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      aspectRatio="video"
      className={className}
      {...props}
    />
  );
}

/**
 * Album Cover Image
 * Optimized for music album covers (1:1 aspect ratio)
 */
export function AlbumCoverImage({
  src,
  alt,
  className,
  ...props
}: Omit<OptimizedImageProps, 'aspectRatio'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      aspectRatio="square"
      className={className}
      {...props}
    />
  );
}

/**
 * Avatar Image
 * Optimized for user avatars (1:1 aspect ratio, circular)
 */
export function AvatarImage({
  src,
  alt,
  className,
  ...props
}: Omit<OptimizedImageProps, 'aspectRatio'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      aspectRatio="square"
      className={cn('rounded-full', className)}
      {...props}
    />
  );
}

/**
 * Thumbnail Image
 * Optimized for small thumbnails
 */
export function ThumbnailImage({
  src,
  alt,
  className,
  size = 'md',
  ...props
}: Omit<OptimizedImageProps, 'aspectRatio'> & {
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'}[size];

  return (
    <OptimizedImage
      src={src}
      alt={alt}
      aspectRatio="square"
      className={cn(sizeClass, className)}
      {...props}
    />
  );
}

/**
 * Logo Image
 * Optimized for logos (contain object fit)
 */
export function LogoImage({
  src,
  alt,
  className,
  ...props
}: Omit<OptimizedImageProps, 'objectFit'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      objectFit="contain"
      className={className}
      {...props}
    />
  );
}

