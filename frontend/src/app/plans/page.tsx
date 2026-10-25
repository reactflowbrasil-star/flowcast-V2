'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Check, Crown, Zap, Smartphone, Tv, Loader2, ArrowRight, Star, ShieldCheck } from 'lucide-react';
import packagesService, { PublicPackage, SubscriptionStatus } from '@/services/packages';

function formatPrice(cents: number, currency: string) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 2,
    }).format(cents / 100);
}

function getBillingLabel(pkg: PublicPackage) {
    if (pkg.billing_mode === 'one_time') {
        return `${pkg.duration_days} days access`;
    }
    switch (pkg.billing_interval) {
        case 'year': return '/year';
        case 'week': return '/week';
        default: return '/month';
    }
}

function hasStoredToken(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('iptv_auth_token');
}

export default function PlansPage() {
    const router = useRouter();
    const [packages, setPackages] = useState<PublicPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [subscribingId, setSubscribingId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [currentSub, setCurrentSub] = useState<SubscriptionStatus | null>(null);
    const [hasToken, setHasToken] = useState(false);

    // Check for token on mount
    useEffect(() => {
        setHasToken(hasStoredToken());
    }, []);

    // Load packages (public endpoint, no auth needed)
    useEffect(() => {
        const load = async () => {
            try {
                const result = await packagesService.listPublicPackages();
                if (result.data) {
                    setPackages(result.data);
                }
            } catch {
                setError('Failed to load plans');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Load current subscription if user has a token
    useEffect(() => {
        if (!hasToken) return;
        const loadSub = async () => {
            try {
                const result = await packagesService.getSubscription();
                if (result.data) {
                    setCurrentSub(result.data);
                }
            } catch {
                // ignore — user may not have a subscription yet
            }
        };
        loadSub();
    }, [hasToken]);

    const handleSubscribe = async (packageId: number) => {
        if (!hasStoredToken()) {
            router.push('/register');
            return;
        }

        setSubscribingId(packageId);
        setError('');
        try {
            const result = await packagesService.subscribe(packageId);
            if (result.data?.url) {
                // Free packages are already activated — redirect to user dashboard
                if (result.data.session_id?.startsWith('free_')) {
                    router.push('/user');
                } else {
                    // Paid: redirect to Stripe checkout
                    window.location.href = result.data.url;
                }
            } else if (result.error) {
                setError(result.error.error || 'Failed to start checkout');
            }
        } catch {
            setError('Failed to start checkout');
        } finally {
            setSubscribingId(null);
        }
    };

    const isCurrentPlan = (pkgId: number) => {
        return currentSub?.subscription?.package_id === pkgId &&
            currentSub?.subscription?.status === 'active';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0b0e14]">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0b0e14] text-white relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />

            <div className="relative z-10 max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-6">
                        <Zap className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-medium text-blue-400">
                            {currentSub?.subscription ? 'Manage Your Plan' : 'Choose Your Plan'}
                        </span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                        {currentSub?.subscription ? 'Your Subscription' : 'Find The Perfect Plan'}
                    </h1>
                    <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                        {currentSub?.subscription
                            ? 'You are currently subscribed. You can change your plan at any time.'
                            : 'Choose a subscription that fits your needs. All plans include instant access to premium content.'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="max-w-md mx-auto mb-8 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center text-red-200">
                        {error}
                    </div>
                )}

                {/* Plans Grid */}
                {packages.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-gray-400 text-lg">No plans available at the moment.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {packages.map((pkg) => {
                            const hasBadge = !!pkg.badge_text;
                            const isPopular = pkg.badge_text?.toLowerCase().includes('popular');
                            const isCurrent = isCurrentPlan(pkg.id);

                            return (
                                <div
                                    key={pkg.id}
                                    className={`relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl ${isCurrent
                                        ? 'bg-gradient-to-b from-emerald-600/20 to-teal-600/10 border-2 border-emerald-500/40 shadow-xl shadow-emerald-900/20'
                                        : isPopular
                                            ? 'bg-gradient-to-b from-blue-600/20 to-purple-600/10 border-2 border-blue-500/40 shadow-xl shadow-blue-900/20'
                                            : 'bg-white/5 border border-white/10 hover:border-white/20'
                                        }`}
                                >
                                    {/* Current Plan Badge */}
                                    {isCurrent && (
                                        <div className="absolute top-0 right-0 px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-bl-xl bg-emerald-500 text-white">
                                            <div className="flex items-center gap-1">
                                                <ShieldCheck className="h-3 w-3" />
                                                Current Plan
                                            </div>
                                        </div>
                                    )}

                                    {/* Badge */}
                                    {hasBadge && !isCurrent && (
                                        <div
                                            className="absolute top-0 right-0 px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-bl-xl"
                                            style={{
                                                backgroundColor: pkg.badge_color || '#3b82f6',
                                                color: '#fff',
                                            }}
                                        >
                                            <div className="flex items-center gap-1">
                                                {isPopular && <Star className="h-3 w-3" />}
                                                {pkg.badge_text}
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-8">
                                        {/* Plan Name */}
                                        <h3 className="text-xl font-bold text-white mb-2">{pkg.name}</h3>
                                        {pkg.description && (
                                            <p className="text-sm text-gray-400 mb-6">{pkg.description}</p>
                                        )}

                                        {/* Price */}
                                        <div className="flex items-baseline gap-1 mb-8">
                                            <span className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                                                {pkg.price_cents === 0 ? 'Free' : formatPrice(pkg.price_cents, pkg.currency)}
                                            </span>
                                            {pkg.price_cents > 0 && (
                                                <span className="text-gray-500 text-sm">{getBillingLabel(pkg)}</span>
                                            )}
                                        </div>

                                        {/* Features */}
                                        <div className="space-y-3 mb-8">
                                            <div className="flex items-center gap-3 text-sm">
                                                <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center">
                                                    <Check className="h-3 w-3 text-green-500" />
                                                </div>
                                                <span className="text-gray-300">
                                                    <Smartphone className="h-3.5 w-3.5 inline mr-1.5 text-gray-500" />
                                                    Up to {pkg.max_devices} {pkg.max_devices === 1 ? 'device' : 'devices'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center">
                                                    <Check className="h-3 w-3 text-green-500" />
                                                </div>
                                                <span className="text-gray-300">
                                                    <Tv className="h-3.5 w-3.5 inline mr-1.5 text-gray-500" />
                                                    {pkg.category_ids.length} content {pkg.category_ids.length === 1 ? 'category' : 'categories'}
                                                </span>
                                            </div>
                                            {pkg.billing_mode === 'recurring' && (
                                                <div className="flex items-center gap-3 text-sm">
                                                    <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center">
                                                        <Check className="h-3 w-3 text-green-500" />
                                                    </div>
                                                    <span className="text-gray-300">Cancel anytime</span>
                                                </div>
                                            )}
                                            {pkg.features && Object.entries(pkg.features).map(([key, enabled]) => (
                                                enabled && (
                                                    <div key={key} className="flex items-center gap-3 text-sm">
                                                        <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center">
                                                            <Check className="h-3 w-3 text-green-500" />
                                                        </div>
                                                        <span className="text-gray-300 capitalize">{key.replace(/_/g, ' ')}</span>
                                                    </div>
                                                )
                                            ))}
                                        </div>

                                        {/* Subscribe Button */}
                                        {isCurrent ? (
                                            <div className="w-full h-12 rounded-xl font-semibold bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center gap-2 text-emerald-400">
                                                <ShieldCheck className="h-4 w-4" />
                                                <span>Active Plan</span>
                                            </div>
                                        ) : (
                                            <Button
                                                className={`w-full h-12 rounded-xl font-semibold transition-all ${isPopular
                                                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-900/20'
                                                    : 'bg-white/10 hover:bg-white/20 border border-white/10'
                                                    }`}
                                                disabled={subscribingId !== null}
                                                onClick={() => handleSubscribe(pkg.id)}
                                            >
                                                {subscribingId === pkg.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        <span>Processing...</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 group">
                                                        <Crown className="h-4 w-4" />
                                                        <span>{pkg.price_cents === 0 ? 'Get Started Free' : 'Subscribe Now'}</span>
                                                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                                    </div>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Footer */}
                <div className="text-center mt-16 space-y-4">
                    {currentSub?.subscription && (
                        <button
                            onClick={() => router.push('/user')}
                            className="text-sm text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-4"
                        >
                            ← Back to Dashboard
                        </button>
                    )}
                    {!hasToken && (
                        <p className="text-sm text-gray-500">
                            Already have an account?{' '}
                            <a href="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">Sign in</a>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
