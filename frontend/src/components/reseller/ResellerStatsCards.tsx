'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Users, 
  Activity, 
  Smartphone, 
  TrendingUp, 
  TrendingDown,
  Zap,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { User } from '@/types/auth';
import { cn } from '@/lib/utils';

interface ResellerStatsCardsProps {
  users: User[];
  creditBalance: number;
  activeDemos: number;
  isLoading: boolean;
}

export default function ResellerStatsCards({ users, creditBalance, activeDemos, isLoading }: ResellerStatsCardsProps) {
  const { t } = useTranslation('reseller');
  const totalUsers = users.length;
  // Consider users active if active is true OR if active is undefined (default to active)
  const activeUsers = users.filter(u => u.active !== false).length;
  
  // Calculate metrics - if no users, show 100% (healthy empty state)
  const activePercentage = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 100;
  const totalCapacity = users.reduce((acc, user) => acc + (user.active !== false ? (user.max_devices || 0) : 0), 0);
  
  // Calculate growth (last 30 days) - fix date mutation bug
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const newUsersLast30Days = users.filter(u => {
    if (!u.created_at) return false;
    return new Date(u.created_at) > thirtyDaysAgo;
  }).length;

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 sm:h-32 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
        ))}
      </div>
    );
  }

  // Determine health status message
  const getHealthStatus = () => {
    if (totalUsers === 0) return { text: t('stats.noSubscribersYet'), trend: 'neutral' as const };
    if (activePercentage >= 90) return { text: t('stats.excellent'), trend: 'up' as const };
    if (activePercentage >= 70) return { text: t('stats.good'), trend: 'up' as const };
    if (activePercentage >= 50) return { text: t('stats.fair'), trend: 'neutral' as const };
    return { text: t('stats.inactive', { count: totalUsers - activeUsers }), trend: 'down' as const };
  };
  
  const healthStatus = getHealthStatus();

  const stats = [
    {
      title: t('stats.totalSubscribers'),
      value: totalUsers.toString(),
      change: newUsersLast30Days > 0 ? t('stats.newThisMonth', { count: newUsersLast30Days }) : t('stats.noNewThisMonth'),
      trend: newUsersLast30Days > 0 ? 'up' : 'neutral',
      icon: Users,
      gradient: "from-blue-500 to-indigo-500",
      shadow: "shadow-blue-500/10",
      bgIcon: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
    },
    {
      title: t('stats.networkHealth'),
      value: totalUsers > 0 ? `${activePercentage}%` : "—",
      change: healthStatus.text,
      trend: healthStatus.trend,
      icon: Activity,
      gradient: "from-emerald-500 to-teal-500",
      shadow: "shadow-emerald-500/10",
      bgIcon: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
    },
    {
      title: t('stats.deviceSlots'),
      value: totalCapacity.toString(),
      change: t('stats.activeUsers', { count: activeUsers }),
      trend: totalCapacity > 0 ? 'up' : 'neutral',
      icon: Smartphone,
      gradient: "from-violet-500 to-purple-500",
      shadow: "shadow-violet-500/10",
      bgIcon: "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
    },
    {
      title: t('stats.activeDemos'),
      value: activeDemos.toString(),
      change: activeDemos > 0 ? t('stats.trialsInProgress') : t('stats.noActiveTrials'),
      trend: activeDemos > 0 ? 'up' : 'neutral',
      icon: Zap,
      gradient: "from-orange-500 to-amber-500",
      shadow: "shadow-orange-500/10",
      bgIcon: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
    }
  ];

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <Card key={index} className={cn(
          "border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm overflow-hidden hover:shadow-lg transition-all duration-300 relative",
          stat.shadow
        )}>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
                  {stat.title}
                </p>
                <h3 className="text-lg sm:text-xl lg:text-2xl font-bold mt-1 sm:mt-2 tracking-tight text-slate-900 dark:text-slate-50">
                  {stat.value}
                </h3>
              </div>
              <div className={cn("p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl flex-shrink-0", stat.bgIcon)}>
                <stat.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            
            <div className="mt-2 sm:mt-3 lg:mt-4 flex items-center gap-2">
              <div className={cn(
                "flex items-center gap-1 text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full truncate",
                stat.trend === 'up' 
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : stat.trend === 'down'
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
              )}>
                {stat.trend === 'up' && <ArrowUpRight className="h-3 w-3 flex-shrink-0" />}
                {stat.trend === 'down' && <ArrowDownRight className="h-3 w-3 flex-shrink-0" />}
                <span className="truncate">{stat.change}</span>
              </div>
            </div>

            {/* Decorative gradient bar at bottom */}
            <div className={cn("absolute bottom-0 left-0 right-0 h-1 opacity-50 bg-gradient-to-r", stat.gradient)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
