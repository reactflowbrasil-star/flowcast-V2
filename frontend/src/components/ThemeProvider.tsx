'use client';

import { useEffect } from 'react';
import { DEFAULT_THEME, STORAGE_KEYS, THEME } from '@/constants/app';

function applyTheme(theme: string) {
  const root = document.documentElement;
  // Remove previous theme classes
  root.classList.remove('dark', 'theme-midnight', 'theme-darkblue');

  switch (theme) {
    case THEME.DARK:
      root.classList.add('dark');
      break;
    case THEME.MIDNIGHT:
      root.classList.add('dark');
      root.classList.add('theme-midnight');
      break;
    case THEME.DARK_BLUE:
      root.classList.add('dark');
      root.classList.add('theme-darkblue');
      break;
    case THEME.SYSTEM: {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.classList.add('dark');
      break;
    }
    case THEME.LIGHT:
    default:
      // Light: no extra class (variables from :root)
      break;
  }
}

export default function ThemeProvider() {
  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.THEME)) || DEFAULT_THEME;
    applyTheme(stored);
    // Respond to system changes when in SYSTEM mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      const current = localStorage.getItem(STORAGE_KEYS.THEME) || DEFAULT_THEME;
      if (current === THEME.SYSTEM) applyTheme(current);
    };
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, []);
  return null;
}

// Optional helper for runtime theme switching from anywhere:
// window.setAppTheme('midnight' | 'dark_blue' | 'dark' | 'light' | 'system')
declare global {
  interface Window { setAppTheme?: (theme: string) => void }
}

if (typeof window !== 'undefined') {
  window.setAppTheme = (theme: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      applyTheme(theme);
    } catch (_) { /* ignore */ }
  };
}
