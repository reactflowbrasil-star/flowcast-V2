'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { User } from '@/types/auth';
import { Activity, TrendingUp } from 'lucide-react';

interface ResellerAnalyticsProps {
  users: User[];
  creditUsageStats?: {
    current_credits: number;
    total_credits_used: number;
    initial_credits: number;
  };
}

const COLORS = {
  active: '#10b981', // Emerald 500
  inactive: '#ef4444', // Rose 500
  growthStart: '#6366f1', // Indigo 500
  growthEnd: '#818cf8',   // Indigo 400
};

export default function ResellerAnalytics({ users }: ResellerAnalyticsProps) {
  const { t } = useTranslation('reseller');
  
  const growthData = useMemo(() => {
    if (!users || users.length === 0) return [];
    
    const last6Months = new Map<string, number>();
    const today = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      last6Months.set(key, 0);
    }

    users.forEach(user => {
      const d = new Date(user.created_at);
      const key = d.toLocaleString('default', { month: 'short' });
      if (last6Months.has(key)) {
        last6Months.set(key, (last6Months.get(key) || 0) + 1);
      }
    });

    return Array.from(last6Months.entries()).map(([name, value]) => ({ name, users: value }));
  }, [users]);

  const statusData = useMemo(() => {
    const active = users.filter(u => u.active).length;
    const total = users.length;
    const inactive = total - active;

    return [
      { name: t('analytics.active'), value: active, color: COLORS.active },
      { name: t('analytics.inactive'), value: inactive, color: COLORS.inactive }
    ];
  }, [users, t]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-slate-50 border border-slate-800 rounded-lg shadow-xl p-3 text-xs">
          <p className="font-semibold mb-1.5 text-slate-400">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
              <span className="text-slate-300">{entry.name}:</span>
              <span className="font-medium text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-3 auto-rows-auto">
      
      {/* Growth Chart */}
      <Card className="md:col-span-2 border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                <div className="p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                   <TrendingUp className="h-4 w-4" />
                </div>
                {t('analytics.acquisitionTrend')}
              </CardTitle>
              <CardDescription>{t('analytics.acquisitionDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 pb-4">
          <div className="h-[250px] sm:h-[300px] w-full -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.growthStart} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={COLORS.growthEnd} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#94a3b8' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#94a3b8' }} 
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area 
                  type="monotone" 
                  dataKey="users" 
                  stroke={COLORS.growthStart} 
                  fillOpacity={1} 
                  fill="url(#colorUsers)" 
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Network Health */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
            <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
               <Activity className="h-4 w-4" />
            </div>
            {t('analytics.networkStatus')}
          </CardTitle>
          <CardDescription>{t('analytics.networkDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="relative flex flex-col items-center justify-center pt-2">
          <div className="h-[180px] sm:h-[220px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center Metric */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">
                {users.length}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide mt-1">{t('analytics.totalUsers')}</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex w-full justify-center gap-6 mt-2">
             <div className="flex items-center gap-2 text-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-600 dark:text-slate-400 font-medium">{t('analytics.active')}</span>
             </div>
             <div className="flex items-center gap-2 text-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-slate-600 dark:text-slate-400 font-medium">{t('analytics.inactive')}</span>
             </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
