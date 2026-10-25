'use client';

import Link from 'next/link';
import { useMemo, memo } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import LogoutButton from '@/components/auth/LogoutButton';
import { useAuth } from '@/contexts/AuthContext';
import { ROUTES, APP_NAME } from '@/constants/app';
import { cn } from '@/lib/utils';
import { contentService } from '@/services';

import {
  Home,
  Search,
  MonitorSmartphone,
  User,
  CreditCard,
  LucideIcon
} from 'lucide-react';

import { CATEGORY_ICONS } from '@/constants/categoryIcons';

interface MenuItem {
  label: string;
  href: string;
  icon: LucideIcon;
  basePath: string;
}

// Map category_type to sidebar menu item
function categoryToMenuItem(
  categoryType: string,
  t: (key: string) => string
): MenuItem | null {
  const typ = (categoryType || '').toLowerCase();
  if (typ === 'tv') {
    return { label: t('user.menu.liveTv'), href: ROUTES.USER.LIVE, icon: CATEGORY_ICONS.LiveTV, basePath: ROUTES.USER.LIVE };
  }
  if (typ === 'vod' || typ === 'movies' || typ === 'movie') {
    return { label: t('user.menu.movies'), href: ROUTES.USER.MOVIES, icon: CATEGORY_ICONS.Movies, basePath: ROUTES.USER.MOVIES };
  }
  if (typ === 'series' || typ === 'shows' || typ === 'show') {
    return { label: t('user.menu.series'), href: ROUTES.USER.SHOWS, icon: CATEGORY_ICONS.Series, basePath: ROUTES.USER.SHOWS };
  }
  if (typ === 'kids') {
    return { label: t('user.menu.kids'), href: ROUTES.USER.KIDS, icon: CATEGORY_ICONS.Kids, basePath: ROUTES.USER.KIDS };
  }
  if (typ === 'anime') {
    return { label: t('user.menu.anime'), href: ROUTES.USER.ANIME, icon: CATEGORY_ICONS.Anime, basePath: ROUTES.USER.ANIME };
  }
  if (typ === 'events' || typ === 'event') {
    return { label: t('user.menu.events'), href: ROUTES.USER.EVENTS, icon: CATEGORY_ICONS.Events, basePath: ROUTES.USER.EVENTS };
  }
  return null;
}

const ModernUserSidebar = memo(function ModernUserSidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const pathname = usePathname();

  const usernameLabel = useMemo(
    () => user?.username || t('user.dashboard.guest'),
    [t, user?.username],
  );

  // Fetch ONLY the categories the user has access to (authenticated endpoint)
  const { data: userCategories = [] } = useQuery({
    queryKey: ['categories', 'user-filtered'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await contentService.getUserCategories();
      if (res.success && res.data) return res.data;
      return [];
    },
  });

  const menuItems = useMemo(() => {
    const homeItem: MenuItem = {
      label: t('user.menu.home'),
      href: ROUTES.USER.DASHBOARD,
      icon: Home,
      basePath: ROUTES.USER.DASHBOARD
    };
    const searchItem: MenuItem = {
      label: t('user.menu.search'),
      href: ROUTES.USER.SEARCH,
      icon: Search,
      basePath: ROUTES.USER.SEARCH
    };

    // Build content items from user's subscribed categories only
    const seen = new Set<string>();
    const contentItems: MenuItem[] = [];
    for (const cat of userCategories) {
      const item = categoryToMenuItem(cat.category_type, t);
      if (item && !seen.has(item.basePath)) {
        seen.add(item.basePath);
        contentItems.push(item);
      }
    }

    // Sort in a logical order
    const order: Record<string, number> = {
      [ROUTES.USER.LIVE]: 10,
      [ROUTES.USER.MOVIES]: 20,
      [ROUTES.USER.SHOWS]: 30,
      [ROUTES.USER.KIDS]: 40,
      [ROUTES.USER.ANIME]: 50,
      [ROUTES.USER.EVENTS]: 60,
    };
    contentItems.sort((a, b) => (order[a.basePath] ?? 99) - (order[b.basePath] ?? 99));

    // Favorites is always available
    const favoritesItem: MenuItem = {
      label: t('user.menu.favorites'),
      href: ROUTES.USER.FAVORITES,
      icon: CATEGORY_ICONS.Favorites,
      basePath: ROUTES.USER.FAVORITES
    };

    return [homeItem, searchItem, ...contentItems, favoritesItem];
  }, [t, userCategories]);

  const isItemActive = (basePath: string) => {
    if (basePath === ROUTES.USER.DASHBOARD) {
      return pathname === basePath;
    }
    return pathname === basePath || pathname.startsWith(`${basePath}/`);
  };

  return (
    <aside className="group/sidebar hidden md:flex h-screen shrink-0 flex-col w-[80px] hover:w-[260px] transition-all duration-300 ease-in-out fixed left-0 top-0 z-50 bg-[#050505]/95 backdrop-blur-2xl border-r border-white/5 shadow-2xl overflow-hidden">
      {/* Brand / Header */}
      <div className="pt-9 pb-8 flex items-center px-[22px] min-w-[260px]">
        <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/20">
          <span className="text-lg font-black text-white">{APP_NAME.charAt(0)}</span>
        </div>
        <h1 className="text-xl font-bold text-white tracking-wider ml-4 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          {APP_NAME}
        </h1>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-2 overflow-y-auto overflow-x-hidden scrollbar-none pb-6">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.basePath);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group/item relative flex items-center rounded-xl px-3.5 py-3.5 transition-all duration-200 outline-none',
                active
                  ? 'bg-blue-600/10 text-blue-400 font-semibold shadow-[0_0_15px_rgba(37,99,235,0.1)] border border-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              )}
              title={item.label}
            >
              <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                <Icon className={cn("h-5 w-5 transition-transform duration-200 group-hover/item:scale-110", active ? "text-blue-400" : "group-hover/item:text-white")} />
                {active && (
                  <div className="absolute -left-3.5 w-[3px] h-5 rounded-r-md bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                )}
              </div>

              <span className="ml-4 text-sm font-medium opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User / Footer Section */}
      <div className="mt-auto border-t border-white/5 bg-black/40 backdrop-blur-sm px-3 py-4 min-w-[260px] overflow-hidden">
        <div className="flex items-center gap-3.5 px-2 mb-4">
          <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-sm font-bold text-white shadow-lg ring-2 ring-white/5">
            {usernameLabel.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300">
            <p className="text-sm font-semibold text-white truncate leading-tight">{usernameLabel}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] text-emerald-400 font-medium tracking-wide uppercase">{t('layout.online')}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 h-0 group-hover/sidebar:h-auto overflow-hidden">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={ROUTES.USER.PROFILE}
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <User className="h-4 w-4" />
              <span className="text-xs font-medium">{t('user.dashboard.profile')}</span>
            </Link>
            <Link
              href={ROUTES.USER.DEVICES}
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <MonitorSmartphone className="h-4 w-4" />
              <span className="text-xs font-medium">{t('user.dashboard.manageDevices')}</span>
            </Link>
          </div>
          {user?.subscription_source === 'direct' && (
            <Link
              href="/plans"
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              <span className="text-xs font-medium">Subscription</span>
            </Link>
          )}
          <LogoutButton
            variant="ghost"
            className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors h-10 text-sm font-medium mt-1"
          />
        </div>
      </div>
    </aside>
  );
});

export default ModernUserSidebar;
