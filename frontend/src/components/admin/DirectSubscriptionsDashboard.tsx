'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, TrendingUp, AlertTriangle, DollarSign, Calendar } from 'lucide-react';
import packagesService, { DirectSubscription, SubscriptionStats } from '@/services/packages';
import { AdminSectionHeader } from './AdminSectionHeader';
import { useTranslation } from 'react-i18next';

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function DirectSubscriptionsDashboard() {
    const { t } = useTranslation();
    const [subs, setSubs] = useState<DirectSubscription[]>([]);
    const [stats, setStats] = useState<SubscriptionStats | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [subsRes, statsRes] = await Promise.all([
                packagesService.adminListSubscriptions(),
                packagesService.adminGetSubscriptionStats(),
            ]);
            if (subsRes.data) setSubs(subsRes.data);
            if (statsRes.data) setStats(statsRes.data);
        } catch { /* handled */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const statusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{t('subscription.admin.subscriptions.statusBadge.active')}</Badge>;
            case 'past_due':
                return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">{t('subscription.admin.subscriptions.statusBadge.past_due')}</Badge>;
            case 'canceled':
                return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">{t('subscription.admin.subscriptions.statusBadge.canceled')}</Badge>;
            case 'expired':
                return <Badge variant="secondary">{t('subscription.admin.subscriptions.statusBadge.expired')}</Badge>;
            case 'pending':
                return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">{t('subscription.admin.subscriptions.statusBadge.pending')}</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-[1400px] mx-auto w-full">
            <AdminSectionHeader
                icon={Users}
                title={t('subscription.admin.subscriptions.title')}
                description={t('subscription.admin.subscriptions.subtitle')}
            />

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                            <Users className="h-3.5 w-3.5" /> {t('subscription.admin.subscriptions.stats.active')}
                        </div>
                        <p className="text-2xl font-bold text-green-600">{stats.total_active}</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" /> {t('subscription.admin.subscriptions.stats.canceled')}
                        </div>
                        <p className="text-2xl font-bold text-red-500">{stats.total_canceled}</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                            <Calendar className="h-3.5 w-3.5" /> {t('subscription.admin.subscriptions.stats.expired')}
                        </div>
                        <p className="text-2xl font-bold text-muted-foreground">{stats.total_expired}</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                            <DollarSign className="h-3.5 w-3.5" /> {t('subscription.admin.subscriptions.stats.mrr')}
                        </div>
                        <p className="text-2xl font-bold text-blue-600">
                            ${(stats.total_revenue_cents / 100).toFixed(2)}
                        </p>
                    </div>
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                            <TrendingUp className="h-3.5 w-3.5" /> {t('subscription.admin.subscriptions.stats.newThisMonth')}
                        </div>
                        <p className="text-2xl font-bold text-purple-600">{stats.new_this_month}</p>
                    </div>
                </div>
            )}

            {/* Subscriptions Table */}
            <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.subscriptions.userId')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.subscriptions.packageId')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.subscriptions.status')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.subscriptions.period')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.subscriptions.cancelStatus')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.subscriptions.created')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {subs.map(sub => (
                            <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                                <td className="p-3 font-mono text-xs">{sub.user_id}</td>
                                <td className="p-3 font-mono text-xs">{sub.package_id}</td>
                                <td className="p-3">{statusBadge(sub.status)}</td>
                                <td className="p-3 text-xs text-muted-foreground">
                                    {sub.current_period_start && sub.current_period_end ? (
                                        <>{formatDate(sub.current_period_start)} — {formatDate(sub.current_period_end)}</>
                                    ) : '—'}
                                </td>
                                <td className="p-3">
                                    {sub.cancel_at_period_end ? (
                                        <Badge variant="outline" className="text-amber-600 border-amber-500/30">
                                            {t('subscription.admin.subscriptions.canceling')}
                                        </Badge>
                                    ) : '—'}
                                </td>
                                <td className="p-3 text-xs text-muted-foreground">{formatDate(sub.created_at)}</td>
                            </tr>
                        ))}
                        {subs.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                    {t('subscription.admin.subscriptions.noSubscriptions')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
