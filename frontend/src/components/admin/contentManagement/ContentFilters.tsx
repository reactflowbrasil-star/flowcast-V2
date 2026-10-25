'use client';

import { ContentType } from '@/types';

export type ContentFiltersProps = {
  t: (key: string, options?: Record<string, any>) => string;
  selectedCategory: ContentType;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  yearFilter: string;
  setYearFilter: (value: string) => void;
  filterActive: 'all' | 'active' | 'inactive';
  setFilterActive: (value: 'all' | 'active' | 'inactive') => void;
  providerFilter: string;
  setProviderFilter: (value: string) => void;
  countryFilter: string;
  setCountryFilter: (value: string) => void;
  setPage: (value: number) => void;
  showColumns: boolean;
  setShowColumns: (value: boolean) => void;
  colDescription: boolean;
  setColDescription: (value: boolean) => void;
  colType: boolean;
  setColType: (value: boolean) => void;
  colStatus: boolean;
  setColStatus: (value: boolean) => void;
  colCreated: boolean;
  setColCreated: (value: boolean) => void;
  typeColumnLabel: string;
};

export default function ContentFilters({
  t,
  selectedCategory,
  searchTerm,
  setSearchTerm,
  yearFilter,
  setYearFilter,
  filterActive,
  setFilterActive,
  providerFilter,
  setProviderFilter,
  countryFilter,
  setCountryFilter,
  setPage,
  showColumns,
  setShowColumns,
  colDescription,
  setColDescription,
  colType,
  setColType,
  colStatus,
  setColStatus,
  colCreated,
  setColCreated,
  typeColumnLabel}: ContentFiltersProps) {
  return (
    <>
      {/* Filters */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card/80 px-3 py-2 text-foreground shadow-sm">
        <input
          type="text"
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          placeholder={t('common.search') as string}
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
        />
        <input
          type="number"
          className="w-24 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          placeholder={t('common.year', {}) as string}
          value={yearFilter}
          onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}
        />
        <select
          className="bg-transparent text-sm text-foreground outline-none"
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value as 'all' | 'active' | 'inactive'); setPage(1); }}
        >
          <option value="all">{t('common.all')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
        </select>
        {(selectedCategory === ContentType.TV || selectedCategory === ContentType.EVENTS) && (
          <>
            <input
              type="text"
              className="w-28 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              placeholder={t('common.provider', {}) as string}
              value={providerFilter}
              onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }}
            />
            <input
              type="text"
              className="w-28 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              placeholder={t('common.country', {}) as string}
              value={countryFilter}
              onChange={(e) => { setCountryFilter(e.target.value); setPage(1); }}
            />
          </>
        )}
        <button
          className="ml-2 text-xs text-muted-foreground underline hover:text-foreground"
          onClick={() => setShowColumns(!showColumns)}
        >
          {t('common.columns', {})}
        </button>
      </div>
      {showColumns && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card/80 px-3 py-2 text-foreground shadow-sm">
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={colDescription} onChange={(e) => setColDescription(e.target.checked)} /> {t('content.table.columns.description')}
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={colType} onChange={(e) => setColType(e.target.checked)} /> {typeColumnLabel}
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={colStatus} onChange={(e) => setColStatus(e.target.checked)} /> {t('content.table.columns.status')}
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={colCreated} onChange={(e) => setColCreated(e.target.checked)} /> {t('content.table.columns.created')}
          </label>
        </div>
      )}
    </>
  );
}
