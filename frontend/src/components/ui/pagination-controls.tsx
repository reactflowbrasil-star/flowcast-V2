'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaginationControlsProps {
  page: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
  isLoading?: boolean;
  pageSize?: number;
  label?: string;
  className?: string;
}

export function PaginationControls({
  page,
  onPageChange,
  hasNextPage,
  isLoading = false,
  pageSize,
  label,
  className}: PaginationControlsProps) {
  const { t } = useTranslation(['user', 'translation']);
  const canGoBack = page > 1;
  const currentPageLabel = `${t('user.pagination.pageLabel')} ${page}`;
  const pageFrom = pageSize ? ((page - 1) * pageSize) + 1 : 0;
  const pageTo = pageSize ? (page * pageSize) : 0;
  const pageTotal = pageSize ? (hasNextPage ? `${pageTo}+` : `${pageTo}`) : '';

  return (
    <div
      className={cn(
        'mt-6 flex flex-col gap-3 border-t border-slate-800/60 pt-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div>
        {label && (
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {label}
          </p>
        )}
        <p className="text-sm text-slate-400">
          {pageSize
            ? t('pagination.showing', {
                from: pageFrom,
                to: pageTo,
                total: pageTotal})
            : currentPageLabel}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full border border-slate-600/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700/80 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canGoBack || isLoading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t('pagination.previous')}
        </Button>
        <span className="px-3 py-1.5 rounded-full bg-slate-700/50 text-sm font-semibold text-white border border-slate-600/30">
          {currentPageLabel}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full border border-slate-600/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700/80 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!hasNextPage || isLoading}
          onClick={() => onPageChange(page + 1)}
        >
          {t('pagination.next')}
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default PaginationControls;
