'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

export interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  className?: string;
  showHome?: boolean;
  homeHref?: string;
  separator?: React.ReactNode;
}

/**
 * Breadcrumbs Component
 * 
 * Features:
 * - Auto-generated from pathname or custom items
 * - Home link optional
 * - Custom separator
 * - Responsive design
 * - i18n support
 */
export function Breadcrumbs({
  items,
  className,
  showHome = true,
  homeHref = '/admin',
  separator = <ChevronRight className="h-4 w-4 text-slate-500" />}: BreadcrumbsProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  // Generate breadcrumb items from pathname if not provided
  const breadcrumbItems = React.useMemo(() => {
    if (items) return items;

    const paths = pathname.split('/').filter(Boolean);
    const generatedItems: BreadcrumbItem[] = [];

    let currentPath = '';
    paths.forEach((path, index) => {
      currentPath += `/${path}`;
      
      // Skip if it's a dynamic route parameter (starts with [)
      if (path.startsWith('[')) return;

      // Capitalize and format the label
      const label = path
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      generatedItems.push({
        label: t(`breadcrumbs.${path}`, label),
        href: index === paths.length - 1 ? undefined : currentPath});
    });

    return generatedItems;
  }, [pathname, items, t]);

  if (breadcrumbItems.length === 0 && !showHome) {
    return null;
  }

  return (
    <nav
      aria-label={t('common.details')}
      className={cn('flex items-center space-x-2 text-sm', className)}
    >
      {showHome && (
        <>
          <Link
            href={homeHref}
            className="flex items-center text-slate-400 hover:text-white transition-colors duration-200 focus-ring"
            aria-label={t('common.dashboard')}
          >
            <Home className="h-4 w-4" />
          </Link>
          {breadcrumbItems.length > 0 && (
            <span className="flex items-center" aria-hidden="true">
              {separator}
            </span>
          )}
        </>
      )}

      {breadcrumbItems.map((item, index) => {
        const isLast = index === breadcrumbItems.length - 1;

        return (
          <React.Fragment key={index}>
            {item.href ? (
              <Link
                href={item.href}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors duration-200 focus-ring truncate max-w-[200px]"
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span
                className="flex items-center gap-1 text-white font-medium truncate max-w-[200px]"
                aria-current={isLast ? 'page' : undefined}
              >
                {item.icon}
                <span>{item.label}</span>
              </span>
            )}

            {!isLast && (
              <span className="flex items-center" aria-hidden="true">
                {separator}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/**
 * Compact Breadcrumbs
 * Shows only last 2 items with ellipsis
 */
export function CompactBreadcrumbs({
  items,
  className,
  showHome = true,
  homeHref = '/admin'}: Omit<BreadcrumbsProps, 'separator'>) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const breadcrumbItems = React.useMemo(() => {
    if (items) return items;

    const paths = pathname.split('/').filter(Boolean);
    const generatedItems: BreadcrumbItem[] = [];

    let currentPath = '';
    paths.forEach((path, index) => {
      currentPath += `/${path}`;
      
      if (path.startsWith('[')) return;

      const label = path
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      generatedItems.push({
        label: t(`breadcrumbs.${path}`, label),
        href: index === paths.length - 1 ? undefined : currentPath});
    });

    return generatedItems;
  }, [pathname, items, t]);

  // Show only last 2 items
  const displayItems = breadcrumbItems.length > 2
    ? breadcrumbItems.slice(-2)
    : breadcrumbItems;

  const hasHiddenItems = breadcrumbItems.length > 2;

  return (
    <nav
      aria-label={t('common.details')}
      className={cn('flex items-center space-x-2 text-sm', className)}
    >
      {showHome && (
        <>
          <Link
            href={homeHref}
            className="flex items-center text-slate-400 hover:text-white transition-colors duration-200 focus-ring"
            aria-label={t('common.dashboard')}
          >
            <Home className="h-4 w-4" />
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </>
      )}

      {hasHiddenItems && (
        <>
          <span className="text-slate-500">...</span>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </>
      )}

      {displayItems.map((item, index) => {
        const isLast = index === displayItems.length - 1;

        return (
          <React.Fragment key={index}>
            {item.href ? (
              <Link
                href={item.href}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors duration-200 focus-ring truncate max-w-[150px]"
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span
                className="flex items-center gap-1 text-white font-medium truncate max-w-[150px]"
                aria-current={isLast ? 'page' : undefined}
              >
                {item.icon}
                <span>{item.label}</span>
              </span>
            )}

            {!isLast && <ChevronRight className="h-4 w-4 text-slate-500" />}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/**
 * Breadcrumbs with Dropdown
 * Shows dropdown for middle items when there are many
 */
export function DropdownBreadcrumbs({
  items,
  className,
  showHome = true,
  homeHref = '/admin'}: Omit<BreadcrumbsProps, 'separator'>) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  const breadcrumbItems = React.useMemo(() => {
    if (items) return items;

    const paths = pathname.split('/').filter(Boolean);
    const generatedItems: BreadcrumbItem[] = [];

    let currentPath = '';
    paths.forEach((path, index) => {
      currentPath += `/${path}`;
      
      if (path.startsWith('[')) return;

      const label = path
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      generatedItems.push({
        label: t(`breadcrumbs.${path}`, label),
        href: index === paths.length - 1 ? undefined : currentPath});
    });

    return generatedItems;
  }, [pathname, items, t]);

  if (breadcrumbItems.length <= 3) {
    return <Breadcrumbs items={breadcrumbItems} className={className} showHome={showHome} homeHref={homeHref} />;
  }

  const firstItem = breadcrumbItems[0];
  const middleItems = breadcrumbItems.slice(1, -1);
  const lastItem = breadcrumbItems[breadcrumbItems.length - 1];

  return (
    <nav
      aria-label={t('common.details')}
      className={cn('flex items-center space-x-2 text-sm', className)}
    >
      {showHome && (
        <>
          <Link
            href={homeHref}
            className="flex items-center text-slate-400 hover:text-white transition-colors duration-200 focus-ring"
            aria-label={t('common.dashboard')}
          >
            <Home className="h-4 w-4" />
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </>
      )}

      {firstItem.href && (
        <>
          <Link
            href={firstItem.href}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors duration-200 focus-ring"
          >
            {firstItem.icon}
            <span>{firstItem.label}</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </>
      )}

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-slate-400 hover:text-white transition-colors duration-200 focus-ring px-2 py-1 rounded"
          aria-label={t('common.next')}
        >
          ...
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-lg shadow-xl z-50 min-w-[200px]">
            {middleItems.map((item, index) => (
              <Link
                key={index}
                href={item.href || '#'}
                className="block px-4 py-2 text-slate-300 hover:bg-slate-800/50 hover:text-white transition-colors duration-200 first:rounded-t-lg last:rounded-b-lg"
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-slate-500" />

      <span
        className="flex items-center gap-1 text-white font-medium truncate max-w-[200px]"
        aria-current="page"
      >
        {lastItem.icon}
        <span>{lastItem.label}</span>
      </span>
    </nav>
  );
}
