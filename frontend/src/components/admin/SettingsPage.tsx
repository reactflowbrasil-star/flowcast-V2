'use client';

import React, { Suspense, lazy } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Settings, DollarSign, Film, Database, CreditCard, Loader2, Shield, Info, Lock, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { AdminSectionHeader } from './AdminSectionHeader';
import { useLicense } from '@/hooks/useLicense';

// Lazy load each sub-section for performance
const SystemConfiguration = lazy(() => import('@/components/admin/SystemConfiguration'));
const CreditsPricingConfig = lazy(() => import('@/components/admin/CreditsPricingConfig'));
const PaymentSettings = lazy(() => import('@/components/admin/PaymentSettings'));
const LicenceTab = lazy(() => import('@/components/admin/LicenceTab'));
const VersionTab = lazy(() => import('@/components/admin/VersionTab'));

function TabLoading() {
    return (
        <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );
}

interface SettingsPageProps {
    className?: string;
}

export default function SettingsPage({ className }: SettingsPageProps) {
    useLoadNamespace('admin/systemConfiguration');
    const { t } = useTranslation(['admin/systemConfiguration', 'translation']);
    const { isExtended } = useLicense();

    return (
        <div className={`space-y-6 max-w-[1400px] mx-auto w-full ${className || ''}`}>
            <AdminSectionHeader
                icon={Settings}
                title={t('sidebar.settings', { ns: 'translation', defaultValue: 'Settings' })}
                description={t('systemConfiguration.title')}
            />
            <Tabs defaultValue="general" className="w-full">
                <div className="mb-6 overflow-x-auto pb-1">
                    <TabsList className="inline-flex min-w-full justify-start">
                        <TabsTrigger value="general" className="shrink-0 gap-1.5">
                            <Settings className="h-4 w-4" />
                            {t('systemConfiguration.settings.tabs.general')}
                        </TabsTrigger>
                        <TabsTrigger value="credits" className={`shrink-0 gap-1.5 ${!isExtended ? 'opacity-60' : ''}`}>
                            <DollarSign className="h-4 w-4" />
                            {t('systemConfiguration.settings.tabs.credits')}
                            {!isExtended && <Lock className="h-3 w-3 ml-1 text-amber-500" />}
                        </TabsTrigger>
                        <TabsTrigger value="payments" className={`shrink-0 gap-1.5 ${!isExtended ? 'opacity-60' : ''}`}>
                            <CreditCard className="h-4 w-4" />
                            {t('systemConfiguration.settings.tabs.payments')}
                            {!isExtended && <Lock className="h-3 w-3 ml-1 text-amber-500" />}
                        </TabsTrigger>
                        <TabsTrigger value="tmdb" className="shrink-0 gap-1.5">
                            <Film className="h-4 w-4" />
                            {t('systemConfiguration.settings.tabs.tmdb')}
                        </TabsTrigger>
                        <TabsTrigger value="database" className="shrink-0 gap-1.5">
                            <Database className="h-4 w-4" />
                            {t('systemConfiguration.settings.tabs.database')}
                        </TabsTrigger>
                        <TabsTrigger value="licence" className="shrink-0 gap-1.5">
                            <Shield className="h-4 w-4" />
                            {t('systemConfiguration.settings.tabs.licence', { defaultValue: 'Licence' })}
                        </TabsTrigger>
                        <TabsTrigger value="version" className="shrink-0 gap-1.5">
                            <Info className="h-4 w-4" />
                            {t('systemConfiguration.settings.tabs.version', { defaultValue: 'Version' })}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="general">
                    <Suspense fallback={<TabLoading />}>
                        <SystemConfiguration visibleSections={['content-display', 'login-backdrops', 'public-endpoints', 'config-summary']} />
                    </Suspense>
                </TabsContent>

                <TabsContent value="credits">
                    {!isExtended ? (
                        <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-transparent p-8">
                            <div className="flex flex-col items-center text-center max-w-lg mx-auto space-y-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
                                    <Shield className="h-8 w-8 text-amber-500" />
                                </div>
                                <h3 className="text-xl font-semibold">Extended License Required</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Credits configuration and pricing require an Extended License.
                                    Upgrade to unlock all monetization features including credit purchases, subscriptions, and reseller payments.
                                </p>
                                <div className="flex items-center gap-3 pt-2">
                                    <a
                                        href="https://codecanyon.net/item/streamcore/61225431"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-amber-600 transition-colors"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Upgrade License
                                    </a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <Suspense fallback={<TabLoading />}>
                            <SystemConfiguration visibleSections={['credit-system']} />
                            <div className="mt-6">
                                <CreditsPricingConfig />
                            </div>
                        </Suspense>
                    )}
                </TabsContent>

                <TabsContent value="payments">
                    {!isExtended ? (
                        <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-transparent p-8">
                            <div className="flex flex-col items-center text-center max-w-lg mx-auto space-y-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
                                    <Shield className="h-8 w-8 text-amber-500" />
                                </div>
                                <h3 className="text-xl font-semibold">Extended License Required</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Payment settings, Stripe integration, and billing configuration require an Extended License.
                                    Upgrade to unlock all monetization features including credit purchases, subscriptions, and reseller payments.
                                </p>
                                <div className="flex items-center gap-3 pt-2">
                                    <a
                                        href="https://codecanyon.net/item/streamcore/61225431"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-amber-600 transition-colors"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Upgrade License
                                    </a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <Suspense fallback={<TabLoading />}>
                            <PaymentSettings />
                        </Suspense>
                    )}
                </TabsContent>

                <TabsContent value="tmdb">
                    <Suspense fallback={<TabLoading />}>
                        <SystemConfiguration visibleSections={['tmdb-config']} />
                    </Suspense>
                </TabsContent>

                <TabsContent value="database">
                    <Suspense fallback={<TabLoading />}>
                        <SystemConfiguration visibleSections={['database-tools']} />
                    </Suspense>
                </TabsContent>

                <TabsContent value="licence">
                    <Suspense fallback={<TabLoading />}>
                        <LicenceTab />
                    </Suspense>
                </TabsContent>

                <TabsContent value="version">
                    <Suspense fallback={<TabLoading />}>
                        <VersionTab />
                    </Suspense>
                </TabsContent>
            </Tabs>
        </div>
    );
}
