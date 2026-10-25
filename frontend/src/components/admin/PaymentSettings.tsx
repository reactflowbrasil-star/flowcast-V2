'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCard, Globe, Save, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { apiService } from '@/services/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface PaymentConfig {
    stripe_secret_key: string;
    stripe_webhook_secret: string;
    stripe_subscription_webhook_secret: string;
    stripe_currency: string;
    stripe_success_url: string;
    stripe_cancel_url: string;
    public_base_url: string;
    content_overview_multiplier: string;
    has_stripe_key: boolean;
    has_webhook_secret: boolean;
    has_subscription_webhook: boolean;
}

interface SecretFieldProps {
    label: string;
    configKey: string;
    placeholder: string;
    currentMasked: string;
    isConfigured: boolean;
    configuredText: string;
    onSave: (key: string, value: string) => Promise<void>;
    saving: string | null;
}

function SecretField({ label, configKey, placeholder, currentMasked, isConfigured, configuredText, onSave, saving }: SecretFieldProps) {
    const [value, setValue] = useState('');
    const [showValue, setShowValue] = useState(false);

    return (
        <div className="space-y-2">
            <Label className="text-sm font-medium">{label}</Label>
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Input
                        type={showValue ? 'text' : 'password'}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={isConfigured ? currentMasked : placeholder}
                        className="pr-10 font-mono text-sm"
                    />
                    <button
                        type="button"
                        onClick={() => setShowValue(!showValue)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={!value.trim() || saving === configKey}
                    onClick={() => onSave(configKey, value).then(() => setValue(''))}
                >
                    {saving === configKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                </Button>
            </div>
            {isConfigured && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {configuredText}
                </p>
            )}
        </div>
    );
}

export default function PaymentSettings() {
    useLoadNamespace('admin/systemConfiguration');
    const { t } = useTranslation('admin/systemConfiguration');
    const f = (key: string) => t(`systemConfiguration.forms.${key}`);

    const [config, setConfig] = useState<PaymentConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    // Editable non-secret fields
    const [currency, setCurrency] = useState('');
    const [successUrl, setSuccessUrl] = useState('');
    const [cancelUrl, setCancelUrl] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [multiplier, setMultiplier] = useState('');

    const loadConfig = useCallback(async () => {
        try {
            const res = await apiService.get<PaymentConfig>('/api/admin/payment-config');
            if (res.data) {
                setConfig(res.data);
                setCurrency(res.data.stripe_currency || '');
                setSuccessUrl(res.data.stripe_success_url || '');
                setCancelUrl(res.data.stripe_cancel_url || '');
                setBaseUrl(res.data.public_base_url || '');
                setMultiplier(res.data.content_overview_multiplier || '');
            }
        } catch {
            toast.error(t('systemConfiguration.failedToLoad', { message: '' }));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    const saveConfig = async (key: string, value: string) => {
        if (!value.trim()) return;
        setSaving(key);
        try {
            const res = await apiService.put('/api/admin/config', { key, value });
            if (res.data) {
                toast.success(f('updated').replace('{{key}}', key.replace(/_/g, ' ')));
                await loadConfig();
            } else {
                toast.error(String(res.error) || t('systemConfiguration.updateFailed'));
            }
        } catch {
            toast.error(t('systemConfiguration.updateFailed'));
        } finally {
            setSaving(null);
        }
    };

    const saveField = async (key: string, value: string) => {
        await saveConfig(key, value);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stripe API Keys */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <CreditCard className="h-5 w-5" />
                        {f('paymentsTitle')}
                    </CardTitle>
                    <CardDescription>
                        {f('paymentsDescription')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <SecretField
                        label={f('secretKeyLabel')}
                        configKey="stripe_secret_key"
                        placeholder={f('secretKeyPlaceholder')}
                        currentMasked={config?.stripe_secret_key || ''}
                        isConfigured={config?.has_stripe_key || false}
                        configuredText={f('configured')}
                        onSave={saveField}
                        saving={saving}
                    />
                    <SecretField
                        label={f('webhookSecretLabel')}
                        configKey="stripe_webhook_secret"
                        placeholder={f('webhookSecretPlaceholder')}
                        currentMasked={config?.stripe_webhook_secret || ''}
                        isConfigured={config?.has_webhook_secret || false}
                        configuredText={f('configured')}
                        onSave={saveField}
                        saving={saving}
                    />
                    <SecretField
                        label={f('subscriptionWebhookLabel')}
                        configKey="stripe_subscription_webhook_secret"
                        placeholder={f('subscriptionWebhookPlaceholder')}
                        currentMasked={config?.stripe_subscription_webhook_secret || ''}
                        isConfigured={config?.has_subscription_webhook || false}
                        configuredText={f('configured')}
                        onSave={saveField}
                        saving={saving}
                    />
                </CardContent>
            </Card>

            {/* Stripe Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <CreditCard className="h-5 w-5" />
                        {f('paymentSettingsTitle')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>{f('currencyLabel')}</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value.toLowerCase())}
                                    placeholder={f('currencyPlaceholder')}
                                    maxLength={3}
                                    className="font-mono uppercase"
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!currency.trim() || saving === 'stripe_currency'}
                                    onClick={() => saveConfig('stripe_currency', currency)}
                                >
                                    {saving === 'stripe_currency' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{f('successUrlLabel')}</Label>
                        <div className="flex gap-2">
                            <Input
                                value={successUrl}
                                onChange={(e) => setSuccessUrl(e.target.value)}
                                placeholder={f('successUrlPlaceholder')}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!successUrl.trim() || saving === 'stripe_success_url'}
                                onClick={() => saveConfig('stripe_success_url', successUrl)}
                            >
                                {saving === 'stripe_success_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{f('cancelUrlLabel')}</Label>
                        <div className="flex gap-2">
                            <Input
                                value={cancelUrl}
                                onChange={(e) => setCancelUrl(e.target.value)}
                                placeholder={f('cancelUrlPlaceholder')}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!cancelUrl.trim() || saving === 'stripe_cancel_url'}
                                onClick={() => saveConfig('stripe_cancel_url', cancelUrl)}
                            >
                                {saving === 'stripe_cancel_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Server Config */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Globe className="h-5 w-5" />
                        {f('serverConfigTitle')}
                    </CardTitle>
                    <CardDescription>
                        {f('serverConfigDescription')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>{f('publicBaseUrlLabel')}</Label>
                        <div className="flex gap-2">
                            <Input
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                placeholder={f('publicBaseUrlPlaceholder')}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!baseUrl.trim() || saving === 'public_base_url'}
                                onClick={() => saveConfig('public_base_url', baseUrl)}
                            >
                                {saving === 'public_base_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {f('publicBaseUrlHelp')}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>{f('contentMultiplierLabel')}</Label>
                        <div className="flex gap-2">
                            <Input
                                value={multiplier}
                                onChange={(e) => setMultiplier(e.target.value)}
                                placeholder={f('contentMultiplierPlaceholder')}
                                className="font-mono max-w-[120px]"
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!multiplier.trim() || saving === 'content_overview_multiplier'}
                                onClick={() => saveConfig('content_overview_multiplier', multiplier)}
                            >
                                {saving === 'content_overview_multiplier' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {!config?.has_stripe_key && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
                    <div className="text-sm text-yellow-200/80">
                        <p className="font-medium text-yellow-200">{f('noStripeKeyTitle')}</p>
                        <p>{f('noStripeKeyDescription')}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
