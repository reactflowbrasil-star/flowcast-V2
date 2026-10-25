'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import LogoutButton from '@/components/auth/LogoutButton';
import { useAuth } from '@/contexts/AuthContext';
import { ROUTES } from '@/constants/app';
import { cn } from '@/lib/utils';
import { contentService, userProfileService } from '@/services';

import {
  Home,
  Tv,
  Film,
  Clapperboard,
  Search,
  MonitorSmartphone,
  User,
  Settings,
  Radio,
  Sparkles,
  Stars,
  Flame,
  Wand2,
  Clock
} from 'lucide-react';

/**
 * Modern, intuitive sidebar for all /user pages.
 * - Clean design with user avatar and welcome message
 * - Direct navigation to independent pages (no tabs)
 * - Modern icons and hover effects
 * - Profile and logout section at bottom
 */
export default function UserSidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const usernameLabel = useMemo(
    () => user?.username || t('user.dashboard.guest'),
    [t, user?.username],
  );

  // All categories for mapping ids -> objects (to build menu)
  // Use the AUTHENTICATED categories endpoint so only user-permitted categories are returned
  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories', 'user-filtered'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getUserCategories();
      if (res.success && res.data) return res.data;
      return [];
    }
  });

  // Basic user profile (may contain subscribed_categories ids depending on backend)
  const { data: profile } = useQuery({
    queryKey: ['user', 'profile-basic'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await userProfileService.getProfile();
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.error || t('products.errors.loadProfileFailed'));
    }
  });

  // Normalize subscriptions into objects for menu building
  const userCategoryObjs = useMemo(() => {
    const acc: Array<{ id: number; name: string; category_type: string }> = [];
    const push = (obj?: any) => {
      if (!obj) return;
      const id = Number(obj.id ?? 0);
      const name = String(obj.name ?? obj.category_type ?? '').trim();
      const type = String(obj.category_type ?? obj.name ?? '').trim();
      if (!name && !type) return;
      const key = (type || name).toLowerCase();
      if (acc.find((x) => (x.category_type || x.name).toLowerCase() === key)) return;
      acc.push({ id: Number.isFinite(id) && id > 0 ? id : 0, name: name || type, category_type: type || name });
    };

    // Try from runtime user object (from login response - these are IDs)
    const userCategoryIds = (user as any)?.subscribed_categories as number[] | undefined;
    if (Array.isArray(userCategoryIds) && userCategoryIds.length && allCategories.length) {
      userCategoryIds.forEach((id) => {
        const category = allCategories.find((c: any) => c.id === id);
        if (category) {
          push(category);
        }
      });
    }

    // Fallback from profile ids (from profile endpoint)
    if (!acc.length) {
      const profileCategoryIds = (profile as any)?.subscribed_categories as number[] | undefined;
      if (Array.isArray(profileCategoryIds) && profileCategoryIds.length && allCategories.length) {
        profileCategoryIds.forEach((id) => {
          const category = allCategories.find((c: any) => c.id === id);
          if (category) {
            push(category);
          }
        });
      }
    }

    return acc;
  }, [user?.subscribed_categories, (profile as any)?.subscribed_categories, allCategories]);

  // Sidebar menu items (standardized icons)
  const menuItems = useMemo(() => {
    type MenuItemKey = 'home' | 'liveTv' | 'movies' | 'series' | 'kids' | 'anime' | 'events' | 'search';
    type MenuItem = { key: MenuItemKey; href: string; icon: any; basePath: string };
    const add = new Map<string, MenuItem>();

    const byType = (typ: string): MenuItem | null => {
      const t = (typ || '').toLowerCase();
      if (t === 'tv') {
        return { key: 'liveTv', href: `${ROUTES.CONTENT.BROWSE}?tab=live`, icon: Tv, basePath: ROUTES.CONTENT.BROWSE };
      }
      if (t === 'vod' || t === 'movies' || t === 'movie') {
        return { key: 'movies', href: `${ROUTES.CONTENT.BROWSE}?tab=movies`, icon: Film, basePath: ROUTES.CONTENT.BROWSE };
      }
      if (t === 'series' || t === 'shows' || t === 'show') {
        return { key: 'series', href: `${ROUTES.CONTENT.BROWSE}?tab=shows`, icon: Clapperboard, basePath: ROUTES.CONTENT.BROWSE };
      }
      if (t === 'kids') {
        return { key: 'kids', href: `${ROUTES.CONTENT.BROWSE}?category=Kids`, icon: Stars, basePath: ROUTES.CONTENT.BROWSE };
      }
      if (t === 'anime') {
        return { key: 'anime', href: `${ROUTES.CONTENT.BROWSE}?category=Anime`, icon: Wand2, basePath: ROUTES.CONTENT.BROWSE };
      }
      if (t === 'events' || t === 'event') {
        return { key: 'events', href: `${ROUTES.CONTENT.BROWSE}?tab=events`, icon: Clock, basePath: ROUTES.CONTENT.BROWSE };
      }
      return null;
    };

    for (const c of userCategoryObjs) {
      const mi = byType(c.category_type || '');
      if (mi) add.set(mi.key, mi);
    }
    const weight: Record<MenuItemKey, number> = {
      movies: 10,
      liveTv: 20,
      series: 30,
      kids: 40,
      anime: 50,
      events: 55,
      home: 0,
      search: 999,
    };
    const subs = Array.from(add.values()).sort((a, b) => (weight[a.key] ?? 999) - (weight[b.key] ?? 999));

    const homeItem: MenuItem = { key: 'home', href: ROUTES.USER.BASE, icon: Home, basePath: ROUTES.USER.BASE };
    const searchItem: MenuItem = { key: 'search', href: ROUTES.CONTENT.SEARCH, icon: Search, basePath: ROUTES.CONTENT.SEARCH };

    // No defaults fallback — only show categories the user has access to
    if (!subs.length) {
      return [homeItem, searchItem];
    }

    return [homeItem, ...subs, searchItem];
  }, [userCategoryObjs, ROUTES.CONTENT.BROWSE, ROUTES.CONTENT.SEARCH, ROUTES.USER.BASE]);

  // Determine active state for items; align with /user dashboard/content logic
  const isItemActive = (itemHref: string, basePath: string) => {
    let isActive = false;
    const baseActive = pathname === basePath || pathname.startsWith(`${basePath}/`);

    if (basePath === ROUTES.CONTENT.BROWSE) {
      const currentTab = (searchParams.get('tab') || '').toLowerCase();
      const currentCategory = (searchParams.get('category') || '').toLowerCase();

      let itemTab = '';
      let itemCategory = '';
      try {
        const u = new URL(itemHref, 'https://local');
        itemTab = (u.searchParams.get('tab') || '').toLowerCase();
        itemCategory = (u.searchParams.get('category') || '').toLowerCase();
      } catch {
        // ignore
      }

      if (itemTab) {
        isActive = pathname === ROUTES.CONTENT.BROWSE && currentTab === itemTab;
      } else if (itemCategory) {
        isActive = pathname === ROUTES.CONTENT.BROWSE && currentCategory === itemCategory;
      } else {
        isActive = false;
      }
    } else {
      isActive = baseActive;
    }
    return isActive;
  };

  return (
    <aside className="hidden md:flex sticky top-0 h-screen shrink-0 flex-col justify-between border-r border-slate-700/50 bg-slate-900/80 backdrop-blur-sm px-8 py-10">
      <div className="space-y-6 flex-1 overflow-y-auto pr-2 scrollbar-thin">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-blue-400/80 font-medium">
            {t('user.dashboard.welcome')} · {usernameLabel}
          </p>
        </div>

        <nav className="flex flex-col gap-2 text-sm">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item.href, item.basePath);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                  active
                    ? 'bg-gradient-to-r from-blue-600/40 via-blue-500/20 to-transparent text-white border-l-2 border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60 hover:shadow-md',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{t(`user.menu.${item.key}`)}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4 text-xs text-slate-500">
        <Link
          href={ROUTES.USER.PROFILE}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-200 hover:text-white hover:bg-slate-800/60 transition-all duration-200"
        >
          <MonitorSmartphone className="h-4 w-4" />
          <span className="text-sm font-medium text-slate-100">
            {t('user.dashboard.profile')}
          </span>
        </Link>

        <p className="text-slate-400">{t('user.dashboard.secureSession')}</p>

        <LogoutButton
          variant="default"
          showConfirmDialog={false}
          className="w-full rounded-xl border-0 bg-rose-600/85 text-white hover:bg-rose-500 focus:ring-2 focus:ring-rose-400 focus:outline-none transition-all duration-200 shadow-lg"
        >
          {t('common.logout')}
        </LogoutButton>
      </div>
    </aside>
  );
}
