'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Home, Search, User, MoreHorizontal, X, Heart, Radio } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ROUTES } from '@/constants/app';
import { CATEGORY_ICONS } from '@/constants/categoryIcons';
import { cn } from '@/lib/utils';
import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { contentService } from '@/services';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    basePath: string;
}

// Map category_type to nav item
function categoryToNavItem(
    categoryType: string,
    t: (key: string) => string
): NavItem | null {
    const typ = (categoryType || '').toLowerCase();
    if (typ === 'tv') {
        return { label: t('user.menu.liveTv'), href: ROUTES.USER.LIVE, icon: Radio, basePath: ROUTES.USER.LIVE };
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

const MobileBottomNav = memo(function MobileBottomNav() {
    const pathname = usePathname();
    const { t } = useTranslation();
    const { user } = useAuth();
    const [moreOpen, setMoreOpen] = useState(false);

    // Close the "More" panel on route change
    useEffect(() => {
        setMoreOpen(false);
    }, [pathname]);

    const toggleMore = useCallback(() => {
        setMoreOpen((prev) => !prev);
    }, []);

    // Fetch user's permitted categories
    const { data: userCategories = [] } = useQuery({
        queryKey: ['categories', 'user-filtered'],
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const res = await contentService.getUserCategories();
            if (res.success && res.data) return res.data;
            return [];
        },
    });

    // Build content items from user's subscribed categories
    const contentItems = useMemo(() => {
        const seen = new Set<string>();
        const items: NavItem[] = [];
        for (const cat of userCategories) {
            const item = categoryToNavItem(cat.category_type, t);
            if (item && !seen.has(item.basePath)) {
                seen.add(item.basePath);
                items.push(item);
            }
        }
        // Sort in logical order
        const order: Record<string, number> = {
            [ROUTES.USER.LIVE]: 10,
            [ROUTES.USER.MOVIES]: 20,
            [ROUTES.USER.SHOWS]: 30,
            [ROUTES.USER.KIDS]: 40,
            [ROUTES.USER.ANIME]: 50,
            [ROUTES.USER.EVENTS]: 60,
        };
        items.sort((a, b) => (order[a.basePath] ?? 99) - (order[b.basePath] ?? 99));
        return items;
    }, [t, userCategories]);

    // Primary tabs: Home + first 3 content items
    const primaryItems = useMemo(() => {
        const home: NavItem = {
            label: t('user.menu.home'),
            href: ROUTES.USER.DASHBOARD,
            icon: Home,
            basePath: ROUTES.USER.DASHBOARD
        };
        return [home, ...contentItems.slice(0, 3)];
    }, [t, contentItems]);

    // Secondary items: remaining content items + search, favorites, profile
    const secondaryItems = useMemo(() => {
        const extra = contentItems.slice(3);
        return [
            {
                label: t('user.menu.search'),
                href: ROUTES.USER.SEARCH,
                icon: Search,
                basePath: ROUTES.USER.SEARCH
            },
            ...extra,
            {
                label: t('user.menu.favorites'),
                href: ROUTES.USER.FAVORITES,
                icon: Heart,
                basePath: ROUTES.USER.FAVORITES
            },
            {
                label: t('user.dashboard.profile'),
                href: ROUTES.USER.PROFILE,
                icon: User,
                basePath: ROUTES.USER.PROFILE
            },
        ];
    }, [t, contentItems]);

    const isItemActive = (basePath: string) => {
        if (basePath === ROUTES.USER.DASHBOARD) {
            return pathname === basePath;
        }
        return pathname === basePath || pathname.startsWith(`${basePath}/`);
    };

    // Check if any secondary item is active (to highlight the "More" button)
    const isMoreActive = secondaryItems.some((item) => isItemActive(item.basePath));

    return (
        <>
            {/* Backdrop overlay when "More" panel is open */}
            {moreOpen && (
                <div
                    className="fixed inset-0 z-[99] bg-black/60 backdrop-blur-sm md:hidden"
                    onClick={() => setMoreOpen(false)}
                />
            )}

            {/* Slide-up "More" panel */}
            <div
                className={cn(
                    "fixed md:hidden left-0 right-0 z-[100] transition-all duration-300 ease-out",
                    moreOpen
                        ? "bottom-16 opacity-100 translate-y-0"
                        : "bottom-16 opacity-0 translate-y-full pointer-events-none"
                )}
            >
                <div className="mx-3 mb-2 bg-[#111]/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    {/* Panel Header */}
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                        <span className="text-sm font-semibold text-white">{t('user.common.more', 'More')}</span>
                        <button
                            onClick={() => setMoreOpen(false)}
                            className="p-1.5 rounded-full bg-white/10 text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Panel Items Grid */}
                    <div className="grid grid-cols-3 gap-1 p-3">
                        {secondaryItems.map((item) => {
                            const Icon = item.icon;
                            const active = isItemActive(item.basePath);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl transition-all duration-200",
                                        active
                                            ? "bg-blue-600/15 text-blue-400"
                                            : "text-slate-400 hover:bg-white/5 hover:text-white"
                                    )}
                                >
                                    <Icon className={cn("w-5 h-5", active && "scale-110")} />
                                    <span className={cn(
                                        "text-[10px] font-medium leading-tight text-center",
                                        active ? "text-blue-400" : "text-slate-500"
                                    )}>
                                        {item.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Bottom Navigation Bar */}
            <nav className="fixed md:hidden bottom-0 left-0 right-0 z-[100] bg-[#050505]/90 backdrop-blur-xl border-t border-white/10 pb-safe">
                <div className="flex items-center justify-around px-1 h-16">
                    {primaryItems.map((item) => {
                        const Icon = item.icon;
                        const active = isItemActive(item.basePath);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="relative flex flex-col items-center justify-center w-full h-full space-y-1"
                            >
                                {/* Active Indicator Line (Top) */}
                                {active && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-blue-500 shadow-[0_0_8px_#3b82f6] rounded-b-full" />
                                )}

                                <div className={cn(
                                    "p-1.5 rounded-xl transition-all duration-300",
                                    active
                                        ? "bg-blue-600/15 text-blue-400"
                                        : "text-slate-400 hover:text-white"
                                )}>
                                    <Icon className={cn("w-5 h-5", active ? "scale-110" : "")} />
                                </div>

                                <span className={cn(
                                    "text-[10px] font-medium transition-all duration-300",
                                    active ? "text-blue-400" : "text-slate-500"
                                )}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}

                    {/* "More" Button */}
                    <button
                        onClick={toggleMore}
                        className="relative flex flex-col items-center justify-center w-full h-full space-y-1"
                    >
                        {/* Active indicator if any secondary item is active */}
                        {(isMoreActive || moreOpen) && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-blue-500 shadow-[0_0_8px_#3b82f6] rounded-b-full" />
                        )}

                        <div className={cn(
                            "p-1.5 rounded-xl transition-all duration-300",
                            (isMoreActive || moreOpen)
                                ? "bg-blue-600/15 text-blue-400"
                                : "text-slate-400 hover:text-white"
                        )}>
                            {moreOpen
                                ? <X className="w-5 h-5" />
                                : <MoreHorizontal className="w-5 h-5" />
                            }
                        </div>

                        <span className={cn(
                            "text-[10px] font-medium transition-all duration-300",
                            (isMoreActive || moreOpen) ? "text-blue-400" : "text-slate-500"
                        )}>
                            {t('user.common.more', 'More')}
                        </span>
                    </button>
                </div>
            </nav>
        </>
    );
});

export default MobileBottomNav;
