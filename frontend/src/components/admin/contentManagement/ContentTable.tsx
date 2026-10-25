'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { AlertCircle, Edit, Play, Trash2, Wand2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { TableSkeleton } from '@/components/ui/skeleton-loader';
import { Content, ContentListResponse, ContentType } from '@/types';
import type { CategoryConfig } from './config';

export type ContentTableProps = {
  isLoading: boolean;
  error: Error | null;
  isFetching: boolean;
  contentData?: ContentListResponse;
  currentCategory?: CategoryConfig;
  categoryActions?: ReactNode;
  yearFilter: string;
  filterActive: 'all' | 'active' | 'inactive';
  providerFilter: string;
  countryFilter: string;
  selectedCategory: ContentType;
  selectedIds: number[];
  setSelectedIds: (value: number[] | ((prev: number[]) => number[])) => void;
  onPreview: (content: Content) => void;
  onEnrich: (content: Content) => void;
  onEdit: (content: Content) => void;
  onDelete: (contentId: number) => void;
  isDeleting: boolean;
  typeColumnLabel: string;
  colDescription: boolean;
  colType: boolean;
  colStatus: boolean;
  colCreated: boolean;
  pageSize: number;
  setPageSize: (value: number) => void;
  setPage: (value: number | ((prev: number) => number)) => void;
  t: (key: string, options?: Record<string, any>) => string;
  i18nLanguage?: string;
};

export default function ContentTable({
  isLoading,
  error,
  isFetching,
  contentData,
  currentCategory,
  categoryActions,
  yearFilter,
  filterActive,
  providerFilter,
  countryFilter,
  selectedCategory,
  selectedIds,
  setSelectedIds,
  onPreview,
  onEnrich,
  onEdit,
  onDelete,
  isDeleting,
  typeColumnLabel,
  colDescription,
  colType,
  colStatus,
  colCreated,
  pageSize,
  setPageSize,
  setPage,
  t,
  i18nLanguage}: ContentTableProps) {
  if (isLoading) {
    return <TableSkeleton rows={10} columns={6} />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t('content.errors.load', { message: error.message })}
        </AlertDescription>
      </Alert>
    );
  }

  if (!contentData || contentData.total === 0) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {currentCategory ? (() => { const Icon = currentCategory.icon; return <Icon className="h-6 w-6 text-muted-foreground" />; })() : null}
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">{t('content.empty.title')}</h3>
        <p className="mb-4 text-muted-foreground">
          {t('content.empty.description', {
            category: currentCategory ? t(currentCategory.labelKey) : ''})}
        </p>
        {categoryActions ?? null}
      </div>
    );
  }

  // Apply client-side filters (year, active)
  let items = contentData.content;
  if (yearFilter.trim()) {
    const y = parseInt(yearFilter.trim(), 10);
    if (!Number.isNaN(y)) {
      items = items.filter((it) => (it.year ?? 0) === y);
    }
  }
  if (filterActive !== 'all') {
    const needActive = filterActive === 'active';
    items = items.filter((it) => it.active === needActive);
  }
  if (selectedCategory === ContentType.TV || selectedCategory === ContentType.EVENTS) {
    const p = providerFilter.trim().toLowerCase();
    const c = countryFilter.trim().toLowerCase();
    if (p) items = items.filter((it: any) => (it.provider || '').toLowerCase().includes(p));
    if (c) items = items.filter((it: any) => (it.country || '').toLowerCase().includes(c));
  }
  const totalItems = contentData.total;
  const currentPage = contentData.page;
  const currentLimit = contentData.limit;
  const safeLimit = currentLimit > 0 ? currentLimit : 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeLimit));
  const startIndex = (currentPage - 1) * currentLimit + 1;
  const endIndex = startIndex + items.length - 1;
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const getTypeValue = (item: Content) => {
    switch (selectedCategory) {
      case ContentType.TV:
        return item.format || t('content.table.values.unknown');
      case ContentType.EVENTS:
        return t('content.table.values.event');
      default:
        return item.year || t('content.table.values.unknown');
    }
  };

  const formatCreatedAt = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '-';
    }
    return parsed.toLocaleDateString(i18nLanguage || undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'});
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted text-muted-foreground">
            <TableRow>
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedIds.length === items.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(items.map((it) => it.id));
                    } else {
                      setSelectedIds([]);
                    }
                  }}
                  aria-label={t('selectAll', {})}
                />
              </TableHead>
              <TableHead className="min-w-[200px]">{t('content.table.columns.title')}</TableHead>
              {colDescription && (<TableHead className="min-w-[200px] max-w-[200px]">{t('content.table.columns.description')}</TableHead>)}
              {colType && (<TableHead className="min-w-[80px]">{typeColumnLabel}</TableHead>)}
              {colStatus && (<TableHead className="min-w-[100px]">{t('content.table.columns.status')}</TableHead>)}
              {colCreated && (<TableHead className="min-w-[100px]">{t('content.table.columns.created')}</TableHead>)}
              <TableHead className="min-w-[120px]">{t('content.table.columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => {
                      setSelectedIds((prev) =>
                        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                      );
                    }}
                    aria-label={`Select ${item.title}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {item.poster_url && (
                      <Image
                        src={item.poster_url}
                        alt={item.title}
                        width={40}
                        height={56}
                        className="w-10 h-14 object-cover rounded"
                      />
                    )}
                    <div>
                      <div className="font-medium flex items-center gap-1 flex-wrap">
                        <span className="truncate max-w-[250px]" title={item.title}>{item.title}</span>
                      </div>
                      {item.tmdb_id && (
                        <div className="text-sm text-muted-foreground">{t('content.table.values.tmdbId', { id: item.tmdb_id })}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                {colDescription && (
                  <TableCell>
                    <div className="max-w-[200px] truncate" title={item.description || ''}>
                      {item.description
                        ? item.description.length > 50
                          ? `${item.description.substring(0, 50)}...`
                          : item.description
                        : t('content.table.values.noDescription')}
                    </div>
                  </TableCell>
                )}
                {colType && (<TableCell>{getTypeValue(item)}</TableCell>)}
                {colStatus && (
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={item.active
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                        : 'border-border bg-muted text-muted-foreground'}
                    >
                      {item.active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                )}
                {colCreated && (
                  <TableCell>
                    {formatCreatedAt(item.created_at)}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {(selectedCategory === ContentType.VOD || selectedCategory === ContentType.KIDS || selectedCategory === ContentType.TV || selectedCategory === ContentType.EVENTS) && (
                      <Tooltip content={t('content.actions.preview', {})}>
                        <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => onPreview(item)}>
                          <Play className="h-4 w-4" />
                          <span className="hidden xl:inline ml-1">{t('content.actions.preview', {})}</span>
                        </Button>
                      </Tooltip>
                    )}
                    {/* TMDB button - hide for Live TV since TMDB doesn't have TV channels */}
                    {selectedCategory !== ContentType.TV && (
                      <Tooltip content={t('content.actions.enrichTmdb', {})}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                          onClick={() => onEnrich(item)}
                        >
                          <Wand2 className="h-4 w-4" />
                          <span className="hidden xl:inline ml-1">{t('contentList.tmdb')}</span>
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip content={t('common.edit')}>
                      <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => onEdit(item)}>
                        <Edit className="h-4 w-4" />
                        <span className="hidden xl:inline ml-1">{t('common.edit')}</span>
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('common.delete')}>
                      <Button variant="destructive" size="sm" className="h-8 px-3" onClick={() => onDelete(item.id)} disabled={isDeleting}>
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden xl:inline ml-1">{t('common.delete')}</span>
                      </Button>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {t('content.pagination.range', { start: startIndex, end: endIndex, total: totalItems})}
          {isFetching ? (
            <span className="ml-2 text-xs text-muted-foreground">{t('content.pagination.updating', {})}</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('content.pagination.rowsPerPage', {})}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const newSize = Number(value);
                if (!Number.isNaN(newSize)) {
                  setPageSize(newSize);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger size="sm" className="w-[90px]">
                <SelectValue placeholder={t('content.pagination.rows', {})} />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={!canGoPrev}
            >
              {t('common.previous')}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t('content.pagination.pageOf', { page: currentPage, total: totalPages})}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={!canGoNext}
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
