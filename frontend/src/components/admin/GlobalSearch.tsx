'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Users, Film, Package, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { apiService } from '@/services/api';

interface SearchResult {
  type: 'user' | 'reseller' | 'content' | 'music';
  id: number | string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  href: string;
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const latestRequestIdRef = useRef(0);
  const router = useRouter();
  useLoadNamespace('admin/search');
  const { t } = useTranslation('admin/search');
  const getResultTypeLabel = (type: SearchResult['type']) =>
    t(`search.types.${type}`);

  // Search function
  const performSearch = useCallback(async (searchQuery: string, requestId: number) => {
    if (!searchQuery.trim()) {
      if (requestId === latestRequestIdRef.current) {
        setResults([]);
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);

    try {
      // Search in parallel
      const [usersRes, resellersRes, contentRes] = await Promise.allSettled([
        apiService.get(`/api/admin/users?search=${encodeURIComponent(searchQuery)}&limit=5`),
        apiService.get(`/api/admin/resellers?search=${encodeURIComponent(searchQuery)}&limit=5`),
        apiService.get(`/api/admin/content?search=${encodeURIComponent(searchQuery)}&limit=5`),
      ]);

      const searchResults: SearchResult[] = [];

      // Process users
      if (usersRes.status === 'fulfilled' && usersRes.value.success) {
        const data = usersRes.value.data as { users?: any[] };
        const users = data.users || [];
        users.forEach((user: any) => {
          searchResults.push({
            type: 'user',
            id: user.id,
            title: user.username,
            subtitle: user.email,
            icon: <Users className="h-4 w-4 text-blue-500" />,
            href: `/admin?tab=users&userId=${user.id}`
          });
        });
      }

      // Process resellers
      if (resellersRes.status === 'fulfilled' && resellersRes.value.success) {
        const data = resellersRes.value.data as { resellers?: any[] };
        const resellers = data.resellers || [];
        resellers.forEach((reseller: any) => {
          searchResults.push({
            type: 'reseller',
            id: reseller.id,
            title: reseller.username,
            subtitle: reseller.email,
            icon: <Package className="h-4 w-4 text-purple-500" />,
            href: `/admin?tab=resellers&resellerId=${reseller.id}`
          });
        });
      }

      // Process content
      if (contentRes.status === 'fulfilled' && contentRes.value.success) {
        const data = contentRes.value.data as { content?: any[] };
        const content = data.content || [];
        content.forEach((item: any) => {
          searchResults.push({
            type: 'content',
            id: item.id,
            title: item.title,
            subtitle: item.category,
            icon: <Film className="h-4 w-4 text-green-500" />,
            href: `/admin?tab=content&contentId=${item.id}`
          });
        });
      }

      if (requestId === latestRequestIdRef.current) {
        setResults(searchResults);
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error('Search error:', error);
      if (requestId === latestRequestIdRef.current) {
        setResults([]);
      }
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
  };

  useEffect(() => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    const timeoutId = setTimeout(() => {
      performSearch(query, requestId);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [performSearch, query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      setResults([]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleResultClick(results[selectedIndex]);
    }
  };

  // Handle result click
  const handleResultClick = (result: SearchResult) => {
    router.push(result.href);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-global-search]')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard shortcut (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative" data-global-search>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('search.placeholder', { defaultValue: 'Search...' })}
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-80 pl-10 pr-10 bg-background/70 text-foreground placeholder:text-muted-foreground"
          aria-label={t('common.search')}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (query || results.length > 0) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-[400px] overflow-y-auto rounded-lg border border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md">
          {results.length === 0 && !isLoading && query && (
            <div className="p-4 text-center text-muted-foreground">
              {t('search.noResults')}
            </div>
          )}

          {results.length > 0 && (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/70 hover:text-accent-foreground',
                    index === selectedIndex && 'bg-accent/70 text-accent-foreground'
                  )}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex-shrink-0">{result.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{result.title}</div>
                    {result.subtitle && (
                      <div className="truncate text-sm text-muted-foreground">{result.subtitle}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs uppercase text-muted-foreground">
                    {getResultTypeLabel(result.type)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Keyboard hints */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">↑↓</kbd> {t('search.shortcuts.navigate')}
              </span>
              <span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">{t('search.shortcuts.enterKey')}</kbd> {t('search.shortcuts.enterKey')}
              </span>
              <span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">{t('search.shortcuts.escapeKey')}</kbd> {t('search.shortcuts.escapeKey')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
