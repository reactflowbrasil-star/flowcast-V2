'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export interface ResponsiveTableColumn<T = any> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  mobileLabel?: string; // Custom label for mobile view
  hideOnMobile?: boolean; // Hide this column on mobile
}

export interface ResponsiveTableProps<T = any> {
  columns: ResponsiveTableColumn<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  className?: string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

/**
 * Responsive Table Component
 * 
 * Features:
 * - Desktop: Traditional table layout
 * - Mobile: Card-based layout
 * - Customizable columns
 * - Click handlers
 * - Empty state
 */
export function ResponsiveTable<T = any>({
  columns,
  data,
  keyExtractor,
  className,
  emptyMessage,
  onRowClick}: ResponsiveTableProps<T>) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage || t('common.noData')}
      </div>
    );
  }

  const visibleColumns = columns.filter(col => !col.hideOnMobile);

  return (
    <>
      {/* Desktop Table View */}
      <div className={cn('hidden md:block overflow-x-auto', className)}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border dark:border-slate-700/50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'text-left py-3 px-4 text-sm font-medium text-muted-foreground dark:text-slate-300',
                    column.className
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={keyExtractor(item, index)}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  'border-b border-border transition-colors dark:border-slate-800/50',
                  onRowClick && 'cursor-pointer hover:bg-muted/50 dark:hover:bg-slate-800/30'
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'py-3 px-4 text-sm text-foreground dark:text-slate-300',
                      column.className
                    )}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {data.map((item, index) => (
          <Card
            key={keyExtractor(item, index)}
            onClick={() => onRowClick?.(item)}
            className={cn(
              onRowClick && 'cursor-pointer hover:bg-muted/50 dark:hover:bg-slate-800/30 transition-colors'
            )}
          >
            <CardContent className="p-4 space-y-3">
              {visibleColumns.map((column) => (
                <div key={column.key} className="flex justify-between items-start gap-3">
                  <span className="text-sm font-medium text-muted-foreground min-w-[100px]">
                    {column.mobileLabel || column.label}:
                  </span>
                  <div className="text-sm text-foreground dark:text-slate-300 flex-1 text-right">
                    {column.render(item)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

/**
 * Simple Responsive Table
 * For basic use cases with string/number data
 */
export interface SimpleColumn {
  key: string;
  label: string;
  mobileLabel?: string;
  hideOnMobile?: boolean;
  className?: string;
}

export interface SimpleResponsiveTableProps {
  columns: SimpleColumn[];
  data: Record<string, any>[];
  keyField?: string;
  className?: string;
  emptyMessage?: string;
  onRowClick?: (item: Record<string, any>) => void;
}

export function SimpleResponsiveTable({
  columns,
  data,
  keyField = 'id',
  className,
  emptyMessage,
  onRowClick}: SimpleResponsiveTableProps) {
  const { t } = useTranslation();
  const tableColumns: ResponsiveTableColumn[] = columns.map(col => ({
    key: col.key,
    label: col.label,
    mobileLabel: col.mobileLabel,
    hideOnMobile: col.hideOnMobile,
    className: col.className,
    render: (item: Record<string, any>) => {
      const value = item[col.key];
      if (value === null || value === undefined) return '-';
      if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
      return String(value);
    }}));

  return (
    <ResponsiveTable
      columns={tableColumns}
      data={data}
      keyExtractor={(item) => item[keyField]}
      className={className}
      emptyMessage={emptyMessage || t('common.noData')}
      onRowClick={onRowClick}
    />
  );
}

/**
 * Responsive Data Grid
 * Grid-based layout for both desktop and mobile
 */
export interface DataGridColumn<T = any> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  span?: number; // Grid column span (1-12)
}

export interface ResponsiveDataGridProps<T = any> {
  columns: DataGridColumn<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  className?: string;
  emptyMessage?: string;
  onItemClick?: (item: T) => void;
}

export function ResponsiveDataGrid<T = any>({
  columns,
  data,
  keyExtractor,
  className,
  emptyMessage,
  onItemClick}: ResponsiveDataGridProps<T>) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage || t('common.noData')}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {data.map((item, index) => (
        <Card
          key={keyExtractor(item, index)}
          onClick={() => onItemClick?.(item)}
          className={cn(
            onItemClick && 'cursor-pointer hover:bg-muted/50 dark:hover:bg-slate-800/30 transition-colors'
          )}
        >
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={cn(
                    'flex flex-col',
                    column.span ? `md:col-span-${column.span}` : 'md:col-span-1'
                  )}
                >
                  <span className="text-xs font-medium text-muted-foreground mb-1">
                    {column.label}
                  </span>
                  <div className="text-sm text-foreground dark:text-slate-300">
                    {column.render(item)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Hook for responsive table state
 */
export function useResponsiveTable<T = any>(initialData: T[]) {
  const [data, setData] = React.useState<T[]>(initialData);
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a: any, b: any) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === bVal) return 0;
      
      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  return {
    data: sortedData,
    setData,
    sortKey,
    sortDirection,
    handleSort};
}
