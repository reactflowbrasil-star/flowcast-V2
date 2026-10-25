'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Package as PackageIcon, Plus, Pencil, Trash2, Loader2,
    DollarSign, RefreshCcw, Clock, Smartphone, Eye, EyeOff
} from 'lucide-react';
import packagesService, { Package, CreatePackageRequest, UpdatePackageRequest } from '@/services/packages';
import { ContentService } from '@/services/content';
import { toast } from 'sonner';
import { AdminSectionHeader } from './AdminSectionHeader';
import { useTranslation } from 'react-i18next';
import { useLicense } from '@/hooks/useLicense';
import type { Category } from '@/types';

const contentService = new ContentService();

function formatPrice(cents: number, currency: string) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(cents / 100);
}

interface PackageFormData {
    name: string;
    description: string;
    price_cents: number;
    currency: string;
    billing_mode: string;
    billing_interval: string;
    duration_days: number;
    max_devices: number;
    category_ids: number[];
    stripe_price_id: string;
    badge_text: string;
    badge_color: string;
    sort_order: number;
    active: boolean;
}

const emptyForm: PackageFormData = {
    name: '', description: '', price_cents: 499, currency: 'usd', billing_mode: 'recurring',
    billing_interval: 'month', duration_days: 30, max_devices: 1, category_ids: [],
    stripe_price_id: '', badge_text: '', badge_color: '', sort_order: 0, active: true,
};

export default function PackageManagement() {
    const { t } = useTranslation();
    const [packages, setPackages] = useState<Package[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<PackageFormData>(emptyForm);
    const [saving, setSaving] = useState(false);
    const { isExtended } = useLicense();

    const loadPackages = useCallback(async () => {
        setLoading(true);
        try {
            const result = await packagesService.adminListPackages();
            if (result.data) setPackages(result.data);
        } catch { toast.error(t('common.serverError', { defaultValue: 'Failed to load packages' })); }
        finally { setLoading(false); }
    }, [t]);

    const loadCategories = useCallback(async () => {
        try {
            const result = await contentService.getCategories();
            if (result.success && result.data) setCategories(result.data);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { loadPackages(); loadCategories(); }, [loadPackages, loadCategories]);

    // Helper: get category name by id
    const getCategoryName = (id: number) => {
        const cat = categories.find(c => c.id === id);
        return cat ? cat.name : `#${id}`;
    };

    // Toggle category selection
    const toggleCategory = (catId: number) => {
        setForm(prev => ({
            ...prev,
            category_ids: prev.category_ids.includes(catId)
                ? prev.category_ids.filter(id => id !== catId)
                : [...prev.category_ids, catId]
        }));
    };

    const handleEdit = (pkg: Package) => {
        setEditingId(pkg.id);
        setForm({
            name: pkg.name, description: pkg.description || '', price_cents: pkg.price_cents,
            currency: pkg.currency, billing_mode: pkg.billing_mode, billing_interval: pkg.billing_interval || 'month',
            duration_days: pkg.duration_days || 30, max_devices: pkg.max_devices,
            category_ids: pkg.category_ids || [],
            stripe_price_id: pkg.stripe_price_id || '', badge_text: pkg.badge_text || '',
            badge_color: pkg.badge_color || '', sort_order: pkg.sort_order, active: pkg.active,
        });
        setShowForm(true);
    };

    const handleCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            toast.error(t('subscription.admin.packages.errors.nameRequired', { defaultValue: 'Name is required' }));
            return;
        }
        setSaving(true);
        try {
            // Force price_cents to 0 for Regular License
            const effectivePrice = isExtended ? form.price_cents : 0;

            if (editingId) {
                const payload: UpdatePackageRequest = {
                    name: form.name, description: form.description || undefined, price_cents: effectivePrice,
                    currency: form.currency, billing_mode: form.billing_mode,
                    billing_interval: form.billing_mode === 'recurring' ? form.billing_interval : undefined,
                    duration_days: form.billing_mode === 'one_time' ? form.duration_days : undefined,
                    max_devices: form.max_devices, category_ids: form.category_ids,
                    stripe_price_id: form.stripe_price_id || undefined, badge_text: form.badge_text || undefined,
                    badge_color: form.badge_color || undefined, sort_order: form.sort_order, active: form.active,
                };
                const result = await packagesService.adminUpdatePackage(editingId, payload);
                if (!result.success) {
                    toast.error(result.error?.details || result.error?.error || t('common.serverError', { defaultValue: 'Failed to update package' }));
                    return;
                }
                toast.success(t('subscription.admin.packages.updated'));
            } else {
                const payload: CreatePackageRequest = {
                    name: form.name, description: form.description || undefined, price_cents: effectivePrice,
                    currency: form.currency, billing_mode: form.billing_mode,
                    billing_interval: form.billing_mode === 'recurring' ? form.billing_interval : undefined,
                    duration_days: form.billing_mode === 'one_time' ? form.duration_days : undefined,
                    max_devices: form.max_devices, category_ids: form.category_ids,
                    stripe_price_id: form.stripe_price_id || undefined, badge_text: form.badge_text || undefined,
                    badge_color: form.badge_color || undefined, sort_order: form.sort_order,
                };
                const result = await packagesService.adminCreatePackage(payload);
                if (!result.success) {
                    toast.error(result.error?.details || result.error?.error || t('common.serverError', { defaultValue: 'Failed to create package' }));
                    return;
                }
                toast.success(t('subscription.admin.packages.created'));
            }
            setShowForm(false);
            loadPackages();
        } catch { toast.error(t('common.serverError', { defaultValue: 'Failed to save package' })); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm(t('subscription.admin.packages.deleteConfirm', { defaultValue: 'Are you sure you want to permanently delete this package? This action cannot be undone.' }))) return;
        try {
            const result = await packagesService.adminDeactivatePackage(id);
            if (!result.success) {
                toast.error(result.error?.details || result.error?.error || t('common.serverError', { defaultValue: 'Failed to delete package' }));
                return;
            }
            toast.success(t('subscription.admin.packages.deleted', { defaultValue: 'Package deleted successfully' }));
            loadPackages();
        } catch { toast.error(t('common.serverError', { defaultValue: 'Failed to delete package' })); }
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
                icon={PackageIcon}
                title={t('subscription.admin.packages.title')}
                description={t('subscription.admin.packages.subtitle', { count: packages.length })}
                actions={(
                    <Button onClick={handleCreate} className="gap-2 min-w-[150px]">
                        <Plus className="h-4 w-4" /> {t('subscription.admin.packages.create')}
                    </Button>
                )}
            />

            {/* Form Dialog */}
            {showForm && (
                <div className="border rounded-xl p-6 bg-card space-y-4">
                    <h3 className="text-lg font-semibold">
                        {editingId ? t('subscription.admin.packages.edit') : t('subscription.admin.packages.create')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.name')} *</label>
                            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('subscription.admin.packages.name')} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.description')}</label>
                            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('subscription.admin.packages.description')} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.priceCents')}</label>
                            <Input type="number" value={isExtended ? form.price_cents : 0} onChange={e => setForm({ ...form, price_cents: parseInt(e.target.value) || 0 })} disabled={!isExtended} />
                            {!isExtended && (
                                <p className="text-xs text-amber-500">Regular License: only free packages (price = 0). Upgrade to Extended for paid packages.</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.currency')}</label>
                            <Input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} placeholder="usd" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.billingMode')}</label>
                            <div className="flex gap-2">
                                <Button size="sm" variant={form.billing_mode === 'recurring' ? 'default' : 'outline'} onClick={() => setForm({ ...form, billing_mode: 'recurring' })} className="gap-1">
                                    <RefreshCcw className="h-3.5 w-3.5" /> {t('subscription.admin.packages.recurring')}
                                </Button>
                                <Button size="sm" variant={form.billing_mode === 'one_time' ? 'default' : 'outline'} onClick={() => setForm({ ...form, billing_mode: 'one_time' })} className="gap-1">
                                    <Clock className="h-3.5 w-3.5" /> {t('subscription.admin.packages.oneTime')}
                                </Button>
                            </div>
                        </div>
                        {form.billing_mode === 'recurring' && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('subscription.admin.packages.interval')}</label>
                                <div className="flex gap-2">
                                    {['month', 'year', 'week'].map(i => (
                                        <Button key={i} size="sm" variant={form.billing_interval === i ? 'default' : 'outline'} onClick={() => setForm({ ...form, billing_interval: i })} className="capitalize">
                                            {t(`subscription.admin.packages.${i}`)}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {form.billing_mode === 'one_time' && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('subscription.admin.packages.durationDays')}</label>
                                <Input type="number" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: parseInt(e.target.value) || 30 })} />
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.maxDevices')}</label>
                            <Input type="number" value={form.max_devices} onChange={e => setForm({ ...form, max_devices: parseInt(e.target.value) || 1 })} min={1} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.categories', { defaultValue: 'Categories' })}</label>
                            {categories.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border rounded-lg bg-muted/30">
                                    {categories.map(cat => (
                                        <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-muted/50 p-1.5 rounded transition-colors">
                                            <Checkbox
                                                checked={form.category_ids.includes(cat.id)}
                                                onCheckedChange={() => toggleCategory(cat.id)}
                                            />
                                            <span>{cat.name}</span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">{t('subscription.admin.packages.noCategoriesAvailable', { defaultValue: 'No categories available' })}</p>
                            )}
                            {form.category_ids.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {form.category_ids.map(id => (
                                        <Badge key={id} variant="secondary" className="text-xs gap-1">
                                            {getCategoryName(id)}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.stripePriceId')}</label>
                            <Input value={form.stripe_price_id} onChange={e => setForm({ ...form, stripe_price_id: e.target.value })} placeholder="price_xxx (optional)" disabled={!isExtended} />
                            {!isExtended && (
                                <p className="text-xs text-muted-foreground">Stripe integration requires Extended License.</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.badgeText')}</label>
                            <Input value={form.badge_text} onChange={e => setForm({ ...form, badge_text: e.target.value })} placeholder="POPULAR" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.badgeColor')}</label>
                            <Input value={form.badge_color} onChange={e => setForm({ ...form, badge_color: e.target.value })} placeholder="#FF6B00" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('subscription.admin.packages.sortOrder')}</label>
                            <Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button onClick={handleSave} disabled={saving} className="gap-2">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editingId ? t('common.save', { defaultValue: 'Update' }) : t('subscription.admin.packages.create')}
                        </Button>
                        <Button variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
                    </div>
                </div>
            )}

            {/* Packages Table */}
            <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.packages.name')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.packages.price')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.packages.billing')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.packages.devices')}</th>
                            <th className="text-left p-3 font-medium">{t('subscription.admin.packages.status')}</th>
                            <th className="text-right p-3 font-medium">{t('subscription.admin.packages.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {packages.map(pkg => (
                            <tr key={pkg.id} className="hover:bg-muted/30 transition-colors">
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{pkg.name}</span>
                                        {pkg.badge_text && (
                                            <Badge style={{ backgroundColor: pkg.badge_color || '#3b82f6' }} className="text-[10px] text-white">
                                                {pkg.badge_text}
                                            </Badge>
                                        )}
                                    </div>
                                    {pkg.description && <p className="text-xs text-muted-foreground mt-0.5">{pkg.description}</p>}
                                    {pkg.category_ids && pkg.category_ids.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {pkg.category_ids.map(id => (
                                                <Badge key={id} variant="outline" className="text-[10px] px-1.5 py-0">
                                                    {getCategoryName(id)}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="p-3">
                                    <div className="flex items-center gap-1">
                                        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-mono">{formatPrice(pkg.price_cents, pkg.currency)}</span>
                                    </div>
                                </td>
                                <td className="p-3">
                                    <Badge variant="outline" className="gap-1">
                                        {pkg.billing_mode === 'recurring' ? (
                                            <><RefreshCcw className="h-3 w-3" /> {t(`subscription.admin.packages.${pkg.billing_interval || 'month'}`)}</>
                                        ) : (
                                            <><Clock className="h-3 w-3" /> {pkg.duration_days}d</>
                                        )}
                                    </Badge>
                                </td>
                                <td className="p-3">
                                    <div className="flex items-center gap-1">
                                        <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                                        {pkg.max_devices}
                                    </div>
                                </td>
                                <td className="p-3">
                                    {pkg.active ? (
                                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
                                            <Eye className="h-3 w-3" /> {t('subscription.admin.packages.active')}
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="gap-1">
                                            <EyeOff className="h-3 w-3" /> {t('subscription.admin.packages.inactive')}
                                        </Badge>
                                    )}
                                </td>
                                <td className="p-3 text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button size="sm" variant="ghost" onClick={() => handleEdit(pkg)} className="h-8 w-8 p-0">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleDelete(pkg.id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-600">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {packages.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                    {t('subscription.admin.packages.noPackages')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
