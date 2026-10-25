'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, Monitor, Moon, Sun, Zap, Globe } from 'lucide-react';
import { DEFAULT_THEME, THEME, STORAGE_KEYS } from '@/constants/app';
import { changeLanguageWithPreload } from '@/lib/i18n';

const themeOptions = [
  { value: THEME.LIGHT, labelKey: 'theme.light', icon: Sun },
  { value: THEME.DARK, labelKey: 'theme.dark', icon: Moon },
  { value: THEME.MIDNIGHT, labelKey: 'theme.midnight', icon: Zap },
  { value: THEME.DARK_BLUE, labelKey: 'theme.darkBlue', icon: Palette },
  { value: THEME.SYSTEM, labelKey: 'theme.system', icon: Monitor },
];

const languageOptions = [
  { value: 'en', labelKey: 'language.english' },
  { value: 'es', labelKey: 'language.spanish' },
  { value: 'fr', labelKey: 'language.french' },
  { value: 'pt', labelKey: 'language.portuguese' },
  { value: 'ru', labelKey: 'language.russian' },
  { value: 'tr', labelKey: 'language.turkish' },
  { value: 'sk', labelKey: 'language.slovak' },
  { value: 'zh', labelKey: 'language.chinese' },
];

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

export default function ThemeSelector() {
  const { t, i18n } = useTranslation();
  const [currentTheme, setCurrentTheme] = useState<string>(DEFAULT_THEME);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');

  useEffect(() => {
    const storedTheme = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.THEME)) || DEFAULT_THEME;
    setCurrentTheme(storedTheme);

    const storedLanguage = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.LANGUAGE)) || 'en';
    setCurrentLanguage(storedLanguage);
    changeLanguageWithPreload(storedLanguage).catch(() => { });
  }, [i18n]);

  const handleThemeChange = (theme: string) => {
    setCurrentTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      applyTheme(theme);
    } catch (_) {
      // ignore
    }
  };

  const handleLanguageChange = (language: string) => {
    setCurrentLanguage(language);
    changeLanguageWithPreload(language).catch(() => { });
    try {
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, language);
    } catch (_) {
      // ignore
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Select value={currentTheme} onValueChange={handleThemeChange}>
        <SelectTrigger className="w-[160px] h-8 border-border bg-card">
          <SelectValue placeholder={t('theme.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {themeOptions.map((option) => {
            const OptionIcon = option.icon;
            return (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center space-x-2">
                  <OptionIcon className="h-4 w-4" />
                  <span>{t(option.labelKey)}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Select value={currentLanguage} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-[140px] h-8 border-border bg-card">
          <SelectValue placeholder={t('language.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {languageOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center space-x-2">
                <Globe className="h-4 w-4" />
                <span>{t(option.labelKey)}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
