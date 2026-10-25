/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { getCategoryGradient } from '@/constants/categoryColors';

export type CardVariant = 'default' | 'glassmorphism' | 'gradient' | 'category';
export type CardSize = 'sm' | 'md' | 'lg' | 'xl';

interface UnifiedCardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  size?: CardSize;
  hover?: boolean;
  className?: string;
  category?: string; // For category variant
  onClick?: () => void;
}

const sizeClasses: Record<CardSize, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8'};

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-slate-800/30 border border-slate-700/50',
  glassmorphism: 'bg-slate-900/80 backdrop-blur-md border border-slate-700/50',
  gradient: 'bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/30',
  category: '', // Will be set dynamically based on category prop
};

const hoverClasses = 'transition-all duration-200 hover:bg-slate-700/50 hover:scale-[1.02] cursor-pointer';

export function UnifiedCard({
  children,
  variant = 'default',
  size = 'md',
  hover = false,
  className,
  category,
  onClick}: UnifiedCardProps) {
  const baseClasses = 'rounded-lg';
  const sizeClass = sizeClasses[size];
  
  let variantClass = variantClasses[variant];
  
  // If variant is category and category is provided, use category gradient
  if (variant === 'category' && category) {
    variantClass = `${getCategoryGradient(category)} border border-slate-700/30`;
  }
  
  const hoverClass = hover ? hoverClasses : '';

  return (
    <div
      className={cn(
        baseClasses,
        sizeClass,
        variantClass,
        hoverClass,
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// Specialized card components built on UnifiedCard

interface ContentCardProps {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  category?: string;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function ContentCard({
  title,
  subtitle,
  imageUrl,
  category,
  onClick,
  className,
  children}: ContentCardProps) {
  return (
    <UnifiedCard
      variant="glassmorphism"
      size="sm"
      hover
      onClick={onClick}
      className={className}
    >
      {imageUrl && (
        <div className="aspect-[2/3] w-full mb-3 rounded-lg overflow-hidden bg-slate-800/50">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-medium text-sm text-white truncate" title={title}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-400 truncate" title={subtitle}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </UnifiedCard>
  );
}

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  className}: StatsCardProps) {
  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    neutral: 'text-slate-400'};

  return (
    <UnifiedCard variant="glassmorphism" size="lg" className={className}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-400">{title}</h3>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="space-y-2">
        <p className="text-3xl font-bold text-white">{value}</p>
        {(subtitle || trendValue) && (
          <div className="flex items-center gap-2 text-xs">
            {trendValue && trend && (
              <span className={trendColors[trend]}>{trendValue}</span>
            )}
            {subtitle && <span className="text-slate-400">{subtitle}</span>}
          </div>
        )}
      </div>
    </UnifiedCard>
  );
}

interface ActionCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: CardVariant;
}

export function ActionCard({
  title,
  description,
  icon,
  onClick,
  className,
  variant = 'default'}: ActionCardProps) {
  return (
    <UnifiedCard
      variant={variant}
      size="md"
      hover
      onClick={onClick}
      className={className}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex-shrink-0 p-2 bg-slate-700/50 rounded-lg">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white mb-1">{title}</h3>
          {description && (
            <p className="text-sm text-slate-400 line-clamp-2">{description}</p>
          )}
        </div>
      </div>
    </UnifiedCard>
  );
}

interface ListCardProps {
  items: Array<{
    id: string | number;
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
  }>;
  className?: string;
}

export function ListCard({ items, className }: ListCardProps) {
  return (
    <UnifiedCard variant="glassmorphism" size="sm" className={className}>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition-colors',
              index !== items.length - 1 && 'border-b border-slate-700/30'
            )}
          >
            {item.icon && (
              <div className="flex-shrink-0 text-slate-400">{item.icon}</div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {item.title}
              </p>
              {item.subtitle && (
                <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
              )}
            </div>
            {item.action && <div className="flex-shrink-0">{item.action}</div>}
          </div>
        ))}
      </div>
    </UnifiedCard>
  );
}

interface EmptyCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyCard({
  title,
  description,
  icon,
  action,
  className}: EmptyCardProps) {
  return (
    <UnifiedCard variant="default" size="lg" className={cn('text-center', className)}>
      {icon && (
        <div className="mx-auto mb-4 w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      {description && (
        <p className="text-slate-400 mb-4 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </UnifiedCard>
  );
}

