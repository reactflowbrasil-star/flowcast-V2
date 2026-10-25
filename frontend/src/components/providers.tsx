'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ErrorProvider } from '@/providers/ErrorProvider';
import { AuthErrorBoundary } from '@/components/common/AuthErrorBoundary';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from '@/lib/i18n';
import { changeLanguageWithPreload, preloadDynamicNamespacesForLanguage } from '@/lib/i18n';

const i18nWithReact = i18n as typeof i18n & { __reactI18nextReady?: boolean };
if (!i18nWithReact.__reactI18nextReady) {
  i18nWithReact.use(initReactI18next);
  i18nWithReact.__reactI18nextReady = true;
}

/**
 * Syncs i18n language with localStorage after hydration to avoid SSR mismatch.
 */
function useI18nSync() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fallbackLanguage = 'en';
    const supportedLangs = ((i18n.options.supportedLngs as string[] | undefined) || [])
      .filter((lang) => lang && lang !== 'cimode');

    const normalizeLanguage = (input: string | null | undefined): string => {
      if (!input) return fallbackLanguage;
      const normalized = input.replace('_', '-').toLowerCase();
      const directMatch = supportedLangs.find((lang) => lang.toLowerCase() === normalized);
      if (directMatch) return directMatch;
      const base = normalized.split('-')[0];
      const baseMatch = supportedLangs.find((lang) => lang.toLowerCase() === base);
      return baseMatch || fallbackLanguage;
    };

    const savedLang = localStorage.getItem('iptv_language');
    const browserLang = typeof navigator !== 'undefined' ? navigator.language : null;
    const targetLanguage = normalizeLanguage(savedLang || i18n.language || browserLang);

    if (savedLang !== targetLanguage) {
      localStorage.setItem('iptv_language', targetLanguage);
    }

    const syncLanguage = async () => {
      try {
        if (i18n.language !== targetLanguage) {
          await changeLanguageWithPreload(targetLanguage);
        } else {
          await preloadDynamicNamespacesForLanguage(targetLanguage);
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };

    syncLanguage();

    return () => {
      cancelled = true;
    };
  }, []);

  return isReady;
}

interface HttpError {
  response?: {
    status: number;
  };
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: (failureCount, error: unknown) => {
              // Don't retry on 4xx errors except 408, 429
              const httpError = error as HttpError;
              const status = httpError?.response?.status ?? 0;
              if (status >= 400 && status < 500) {
                // Never retry 401 errors (authentication issues)
                if (status === 401) {
                  return false;
                }
                if (status === 408 || status === 429) {
                  return failureCount < 2;
                }
                return false;
              }
              // Retry on 5xx errors and network errors
              return failureCount < 3;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)},
          mutations: {
            retry: (failureCount, error: unknown) => {
              // Don't retry mutations on 4xx errors
              const status = (error as any)?.response?.status ?? 0;
              if (status >= 400 && status < 500) {
                return false;
              }
              // Retry on 5xx errors and network errors
              return failureCount < 2;
            }}}})
  );

  // Sync language from localStorage after hydration
  const i18nReady = useI18nSync();

  if (!i18nReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-slate-500">{i18n.t('common.loading')}</div>
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ErrorProvider>
          <AuthErrorBoundary>
            <AuthProvider>
              {children}
            </AuthProvider>
          </AuthErrorBoundary>
        </ErrorProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
