'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Loader2, RefreshCw } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'dots' | 'pulse' | 'bounce';
  className?: string;
}

interface LoadingOverlayProps {
  isLoading: boolean;
  children: React.ReactNode;
  message?: string;
  className?: string;
  spinnerSize?: LoadingSpinnerProps['size'];
  backdrop?: boolean;
}

interface LoadingStateProps {
  isLoading: boolean;
  error?: string | null;
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

// Loading Spinner Component
export function LoadingSpinner({ 
  size = 'md', 
  variant = 'default',
  className 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'};

  if (variant === 'dots') {
    return (
      <div className={cn('flex space-x-1', className)}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'rounded-full bg-current animate-pulse',
              size === 'sm' && 'h-1 w-1',
              size === 'md' && 'h-2 w-2',
              size === 'lg' && 'h-3 w-3',
              size === 'xl' && 'h-4 w-4'
            )}
            style={{
              animationDelay: `${i * 0.2}s`,
              animationDuration: '1.4s'}}
          />
        ))}
      </div>
    );
  }

  if (variant === 'pulse') {
    return (
      <div
        className={cn(
          'rounded-full bg-current animate-pulse',
          sizeClasses[size],
          className
        )}
      />
    );
  }

  if (variant === 'bounce') {
    return (
      <div className={cn('flex space-x-1', className)}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'rounded-full bg-current animate-bounce',
              size === 'sm' && 'h-2 w-2',
              size === 'md' && 'h-3 w-3',
              size === 'lg' && 'h-4 w-4',
              size === 'xl' && 'h-6 w-6'
            )}
            style={{
              animationDelay: `${i * 0.1}s`}}
          />
        ))}
      </div>
    );
  }

  // Default spinner
  return (
    <Loader2 
      className={cn(
        'animate-spin',
        sizeClasses[size],
        className
      )} 
    />
  );
}

// Loading Overlay Component
export function LoadingOverlay({
  isLoading,
  children,
  message,
  className,
  spinnerSize = 'md',
  backdrop = true}: LoadingOverlayProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center z-50',
            backdrop && 'bg-white/80 backdrop-blur-sm'
          )}
        >
          <LoadingSpinner size={spinnerSize} />
          <p className="mt-2 text-sm text-gray-600 font-medium">
            {message ?? t('common.loading')}
          </p>
        </div>
      )}
    </div>
  );
}

// Loading State Component
export function LoadingState({
  isLoading,
  error,
  children,
  loadingComponent,
  errorComponent,
  onRetry,
  className}: LoadingStateProps) {
  const { t } = useTranslation();
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    
    return (
        <div className={cn('flex flex-col items-center justify-center py-8', className)}>
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-gray-600">{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    if (errorComponent) {
      return <>{errorComponent}</>;
    }
    
    return (
      <div className={cn('flex flex-col items-center justify-center py-8', className)}>
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-red-500 mb-4">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {t('common.somethingWentWrong')}
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {error}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.tryAgain')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Skeleton Component
export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  lines = 1}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200 dark:bg-gray-700';
  
  if (variant === 'text') {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              baseClasses,
              'h-4 rounded',
              i === lines - 1 && lines > 1 && 'w-3/4' // Last line shorter
            )}
            style={{ width, height }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'circular') {
    return (
      <div
        className={cn(
          baseClasses,
          'rounded-full',
          !width && !height && 'h-12 w-12',
          className
        )}
        style={{ width, height }}
      />
    );
  }

  // Rectangular (default)
  return (
    <div
      className={cn(
        baseClasses,
        'rounded',
        !width && !height && 'h-4 w-full',
        className
      )}
      style={{ width, height }}
    />
  );
}

// Skeleton variants for common use cases
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('p-4 border rounded-lg space-y-3', className)}>
      <Skeleton variant="rectangular" height="12rem" />
      <Skeleton variant="text" lines={2} />
      <div className="flex items-center space-x-2">
        <Skeleton variant="circular" width="2rem" height="2rem" />
        <Skeleton variant="text" width="6rem" />
      </div>
    </div>
  );
}

export function SkeletonTable({ 
  rows = 5, 
  columns = 4,
  className 
}: { 
  rows?: number; 
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} height="1.5rem" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div 
          key={`row-${rowIndex}`}
          className="grid gap-4" 
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} height="1rem" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ 
  items = 5,
  className 
}: { 
  items?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3">
          <Skeleton variant="circular" width="2.5rem" height="2.5rem" />
          <div className="flex-1 space-y-2">
            <Skeleton height="1rem" width="60%" />
            <Skeleton height="0.75rem" width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}
