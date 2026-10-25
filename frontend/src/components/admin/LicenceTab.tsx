'use client';

import { useState } from 'react';
import { useLicense } from '@/hooks/useLicense';
import {
    Shield, CheckCircle2, AlertTriangle, Loader2, Key,
    ExternalLink, ArrowUpRight, Lock, Unlock, Zap
} from 'lucide-react';

/**
 * License management tab inside admin Settings.
 * Shows current license status, activation form, upgrade path,
 * and a feature matrix comparing Regular vs Extended.
 */
export default function LicenceTab() {
    const {
        status, isLoading, isLicensed, isExtended, isRegular,
        activate, refreshType
    } = useLicense();
    const [code, setCode] = useState('');
    const [result, setResult] = useState<{
        success: boolean;
        message: string;
        licenseType?: string;
        buyer?: string;
    } | null>(null);
    const [activating, setActivating] = useState(false);

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) return;

        setActivating(true);
        setResult(null);
        const res = await activate(trimmed);

        if (res.success) {
            setResult({
                success: true,
                message: 'License activated successfully!',
                licenseType: res.status?.license_type ?? undefined,
                buyer: res.status?.buyer ?? undefined,
            });
            refreshType();
        } else {
            setResult({
                success: false,
                message: res.error || 'Activation failed',
            });
        }
        setActivating(false);
    };

    // Feature matrix
    const features = [
        { name: 'Content Management (Movies, Series, Channels)', regular: true, extended: true, trial: true },
        { name: 'EPG Management', regular: true, extended: true, trial: true },
        { name: 'Device Management', regular: true, extended: true, trial: true },
        { name: 'Media Scanner', regular: true, extended: true, trial: true },
        { name: 'Security Panel & Master Keys', regular: true, extended: true, trial: true },
        { name: 'Activity Logs', regular: true, extended: true, trial: true },
        { name: 'Ticket System', regular: true, extended: true, trial: true },
        { name: 'Email Settings (SMTP)', regular: true, extended: true, trial: true },
        { name: 'End User Management', regular: true, extended: true, trial: false, trialNote: 'Max 10 users' },
        { name: 'Packages & Subscriptions', regular: true, extended: true, trial: false },
        { name: 'Direct Subscriptions (Stripe)', regular: true, extended: true, trial: false },
        { name: 'Reseller Panel', regular: false, extended: true, trial: false, trialNote: 'Max 3 resellers' },
        { name: 'Billing Dashboard', regular: false, extended: true, trial: false },
        { name: 'Gift Codes', regular: false, extended: true, trial: false },
        { name: 'Credits System', regular: false, extended: true, trial: false },
    ];

    const currentTier = isExtended ? 'extended' : isRegular ? 'regular' : 'trial';

    return (
        <div className="space-y-6">
            {/* Current License Status */}
            <div className={`rounded-xl border p-6 ${isExtended
                ? 'border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-blue-500/5'
                : isRegular
                    ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-teal-500/5'
                    : 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5'
                }`}>
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isExtended
                            ? 'bg-purple-500/10 text-purple-500'
                            : isRegular
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-amber-500/10 text-amber-500'
                            }`}>
                            <Shield className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">
                                {isExtended ? 'Extended License' : isRegular ? 'Regular License' : 'Trial Mode'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {isExtended
                                    ? 'All features unlocked including monetization.'
                                    : isRegular
                                        ? 'Licensed for personal/internal use. Packages & subscriptions included. Resellers & billing require Extended.'
                                        : 'Running without a license. Some features are limited.'
                                }
                            </p>
                        </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${isExtended
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        : isRegular
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                        {isLicensed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        {isExtended ? 'Extended' : isRegular ? 'Regular' : 'Trial'}
                    </span>
                </div>

                {/* License details */}
                {status && isLicensed && (
                    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {status.buyer && (
                            <div className="rounded-lg bg-background/50 p-3">
                                <p className="text-xs text-muted-foreground">Buyer</p>
                                <p className="text-sm font-medium">{status.buyer}</p>
                            </div>
                        )}
                        {status.item_name && (
                            <div className="rounded-lg bg-background/50 p-3">
                                <p className="text-xs text-muted-foreground">Product</p>
                                <p className="text-sm font-medium truncate" title={status.item_name}>{status.item_name}</p>
                            </div>
                        )}
                        {status.activated_at && (
                            <div className="rounded-lg bg-background/50 p-3">
                                <p className="text-xs text-muted-foreground">Activated</p>
                                <p className="text-sm font-medium">
                                    {new Date(status.activated_at).toLocaleDateString()}
                                </p>
                            </div>
                        )}
                        {status.supported_until && (
                            <div className="rounded-lg bg-background/50 p-3">
                                <p className="text-xs text-muted-foreground">Support Until</p>
                                <p className="text-sm font-medium">
                                    {new Date(status.supported_until).toLocaleDateString()}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Activate / Upgrade */}
            <div className="rounded-xl border bg-card p-6">
                <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    {isLicensed ? 'Update License' : 'Activate License'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                    {isLicensed
                        ? 'Enter a new purchase code to upgrade from Regular to Extended, or to replace the current license.'
                        : 'Enter your Envato purchase code to activate StreamCore and unlock all features.'
                    }
                </p>

                <form onSubmit={handleActivate} className="flex gap-3">
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="flex-1 rounded-lg border bg-background px-4 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        disabled={activating}
                    />
                    <button
                        type="submit"
                        disabled={activating || !code.trim()}
                        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                    >
                        {activating ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
                        ) : (
                            <>{isLicensed ? 'Update' : 'Activate'}</>
                        )}
                    </button>
                </form>

                {result && (
                    <div className={`mt-3 p-3 rounded-lg border text-sm ${result.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                        }`}>
                        <div className="flex items-center gap-2">
                            {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                            <span className="font-medium">{result.message}</span>
                        </div>
                        {result.licenseType && (
                            <p className="mt-1 text-xs opacity-80">Type: <strong>{result.licenseType}</strong></p>
                        )}
                        {result.buyer && (
                            <p className="text-xs opacity-80">Buyer: <strong>{result.buyer}</strong></p>
                        )}
                    </div>
                )}

                <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-xs text-muted-foreground">
                        💡 Find your purchase code in your{' '}
                        <a
                            href="https://codecanyon.net/downloads"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                            Envato Downloads
                            <ExternalLink className="h-3 w-3" />
                        </a>{' '}
                        page under "License certificate &amp; purchase code".
                    </p>
                    {isRegular && (
                        <p className="text-xs text-muted-foreground mt-2">
                            <Zap className="inline h-3 w-3 text-purple-500 mr-0.5" />
                            <strong>Upgrade to Extended:</strong> Purchase an Extended License from CodeCanyon and enter the new code above to unlock monetization features.
                        </p>
                    )}
                </div>
            </div>

            {/* Feature Matrix */}
            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="p-6 pb-3">
                    <h3 className="text-base font-semibold flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Feature Availability
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        What&apos;s included with each license tier.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-t bg-muted/50">
                                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Feature</th>
                                <th className="text-center px-4 py-3 font-medium text-amber-500">Trial</th>
                                <th className="text-center px-4 py-3 font-medium text-emerald-500">Regular</th>
                                <th className="text-center px-4 py-3 font-medium text-purple-500">Extended</th>
                            </tr>
                        </thead>
                        <tbody>
                            {features.map((f, i) => (
                                <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-3">{f.name}</td>
                                    <td className="text-center px-4 py-3">
                                        {f.trial ? (
                                            <Unlock className="h-4 w-4 text-emerald-500 inline" />
                                        ) : f.trialNote ? (
                                            <span className="text-xs text-amber-500">{f.trialNote}</span>
                                        ) : (
                                            <Lock className="h-4 w-4 text-red-400/50 inline" />
                                        )}
                                    </td>
                                    <td className="text-center px-4 py-3">
                                        {f.regular ? (
                                            <Unlock className="h-4 w-4 text-emerald-500 inline" />
                                        ) : (
                                            <Lock className="h-4 w-4 text-red-400/50 inline" />
                                        )}
                                    </td>
                                    <td className="text-center px-4 py-3">
                                        {f.extended ? (
                                            <Unlock className="h-4 w-4 text-emerald-500 inline" />
                                        ) : (
                                            <Lock className="h-4 w-4 text-red-400/50 inline" />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Current tier indicator */}
                <div className="border-t p-4 bg-muted/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        Your current tier: <strong className={
                            currentTier === 'extended' ? 'text-purple-500' :
                                currentTier === 'regular' ? 'text-emerald-500' : 'text-amber-500'
                        }>
                            {currentTier === 'extended' ? 'Extended License' :
                                currentTier === 'regular' ? 'Regular License' : 'Trial Mode'}
                        </strong>
                    </div>
                </div>
            </div>
        </div>
    );
}
