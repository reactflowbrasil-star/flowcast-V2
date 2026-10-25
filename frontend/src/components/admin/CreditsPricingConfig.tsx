'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, type SubmitHandler } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { configService } from '@/services/config';
import type { CreditsPricingConfig, PricingTier } from '@/services/config';

import { DollarSign, Save, Plus, Trash2, AlertCircle, CheckCircle, Shield, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import i18n from '@/lib/i18n';

const tierSchema = z.object({
  min_qty: z.coerce.number().int().positive().max(1_000_000, i18n.t('errors.invalidData')),
  percent: z.coerce.number().min(0, i18n.t('errors.invalidData')).max(100, i18n.t('errors.invalidData'))
});

const pricingSchema = z.object({
  base_price_usd: z.coerce.number().positive(i18n.t('errors.invalidData')),
  tiers: z.array(tierSchema).max(50, i18n.t('errors.invalidData'))
});
type PricingFormData = z.infer<typeof pricingSchema>;

function normalizeAndValidateTiers(tiers: PricingTier[]): { ok: boolean; tiers: PricingTier[]; error?: string } {
  if (!tiers || tiers.length === 0) return { ok: true, tiers: [] };

  // Sort ascending by min_qty
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);

  // Remove duplicate min_qty keeping highest percent for same threshold
  const dedup: PricingTier[] = [];
  for (const t of sorted) {
    const last = dedup[dedup.length - 1];
    if (last && last.min_qty === t.min_qty) {
      if (t.percent > last.percent) {
        dedup[dedup.length - 1] = t;
      }
    } else {
      dedup.push(t);
    }
  }

  // Ensure strictly ascending min_qty
  for (let i = 1; i < dedup.length; i++) {
    if (dedup[i].min_qty <= dedup[i - 1].min_qty) {
      return { ok: false, tiers: dedup, error: i18n.t('errors.invalidData') };
    }
  }

  // Clamp percent 0..100
  const clamped = dedup.map((t) => ({
    min_qty: Math.max(1, Math.floor(t.min_qty)),
    percent: Math.min(100, Math.max(0, t.percent))
  }));

  return { ok: true, tiers: clamped };
}

export default function CreditsPricingConfig({ className }: { className?: string }) {
  useLoadNamespace('admin/creditsPricing');
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation(['admin/creditsPricing', 'admin', 'translation']);

  const { data: pricing, isLoading, error, refetch } = useQuery({
    queryKey: ['credits-pricing-config'],
    queryFn: async () => {
      const res = await configService.getCreditsPricing();
      if (res.success) return res.data as CreditsPricingConfig;
      throw new Error(res.error?.details || res.error?.error || t('creditsPricing.error.fetchFailed'));
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const form = useForm<PricingFormData>({
    resolver: zodResolver(pricingSchema) as unknown as import('react-hook-form').Resolver<PricingFormData>,
    defaultValues: {
      base_price_usd: 1.0,
      tiers: []
    }
  });

  const { fields, append, remove, replace } = useFieldArray({
    name: 'tiers',
    control: form.control
  });

  React.useEffect(() => {
    if (pricing) {
      // Normalize incoming tiers just in case
      const norm = normalizeAndValidateTiers(pricing.tiers || []);
      form.reset({
        base_price_usd: pricing.base_price_usd ?? 1.0,
        tiers: norm.tiers
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing]);

  const mutation = useMutation({
    mutationFn: async (data: PricingFormData) => {
      const norm = normalizeAndValidateTiers(data.tiers || []);
      if (!norm.ok) {
        throw new Error(norm.error || t('creditsPricing.error.invalidTierConfig'));
      }
      const payload: CreditsPricingConfig = {
        base_price_usd: data.base_price_usd,
        tiers: norm.tiers
      };
      const res = await configService.updateCreditsPricing(payload);
      if (!res.success) throw new Error(res.error?.details || res.error?.error || t('creditsPricing.error.updateFailed'));
      return res.data!;
    },
    onSuccess: () => {
      toast.success(t('creditsPricing.updated'));
      queryClient.invalidateQueries({ queryKey: ['credits-pricing-config'] });
    },
    onError: (e: unknown) => {
      const err = e as Error;
      toast.error(err.message || t('common.serverError'));
    }
  });

  const onSubmit: SubmitHandler<PricingFormData> = (data) => {
    mutation.mutate(data);
  };

  const onAddTier = () => {
    // Suggest next tier min_qty
    const current = form.getValues('tiers');
    const nextMin =
      current.length === 0
        ? 100
        : Math.max(1, current.reduce((acc, t) => Math.max(acc, Math.floor(t.min_qty)), 0) + 1);
    append({ min_qty: nextMin, percent: 5 });
  };

  const onSortTiers = () => {
    const current = form.getValues('tiers');
    const norm = normalizeAndValidateTiers(current);
    replace(norm.tiers);
    if (!norm.ok && norm.error) {
      toast.error(norm.error);
    } else {
      toast.success(t('creditsPricing.tiersSorted'));
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('creditsPricing.title')}
          </CardTitle>
          <CardDescription>{t('creditsPricing.loading')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const errorMsg = (error as Error).message || '';
    const isLicenseError = /extended|license/i.test(errorMsg);

    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('creditsPricing.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLicenseError ? (
            <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-transparent p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Shield className="h-6 w-6 text-amber-500" />
                </div>
                <div className="space-y-2 flex-1">
                  <h4 className="font-semibold text-base">{t('creditsPricing.extendedRequired', { defaultValue: 'Extended License Required' })}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('creditsPricing.extendedRequiredDesc', { defaultValue: 'Credit pricing, Stripe payments, and billing features are available with the Extended License. Upgrade to unlock monetization capabilities.' })}
                  </p>
                  <div className="flex items-center gap-3 pt-2">
                    <a
                      href="https://codecanyon.net/item/streamcore/61225431"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-600 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('creditsPricing.upgradeLicense', { defaultValue: 'Upgrade License' })}
                    </a>
                    <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-muted-foreground">
                      {t('creditsPricing.retry')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{t('creditsPricing.error.loadFailed')} {errorMsg}</AlertDescription>
              </Alert>
              <div className="mt-4">
                <Button variant="outline" onClick={() => refetch()}>{t('creditsPricing.retry')}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          {t('creditsPricing.title')}
        </CardTitle>
        <CardDescription>
          {t('creditsPricing.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="base-price">{t('creditsPricing.basePrice.label')}</Label>
              <Input
                id="base-price"
                type="number"
                step="0.01"
                min="0.01"
                {...form.register('base_price_usd', { valueAsNumber: true })}
              />
              {form.formState.errors.base_price_usd && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.base_price_usd.message as string}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t('creditsPricing.basePrice.help')}
              </p>
            </div>

            <div className="p-3 border border-border rounded-lg bg-muted">
              <div className="text-sm font-medium text-muted-foreground">{t('creditsPricing.currentBasePrice')}</div>
              <div className="text-2xl font-semibold text-foreground">${form.watch('base_price_usd')?.toFixed?.(2) ?? Number(form.watch('base_price_usd') || 0).toFixed(2)}</div>
            </div>

            <div className="p-3 border border-border rounded-lg bg-muted">
              <div className="text-sm font-medium text-muted-foreground">{t('creditsPricing.activeTiers')}</div>
              <div className="text-2xl font-semibold text-foreground">{fields.length}</div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="text-sm">
              {t('creditsPricing.tiersDescription')}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onSortTiers}>{t('creditsPricing.actions.normalizeSort')}</Button>
              <Button type="button" variant="outline" onClick={onAddTier}>
                <Plus className="h-4 w-4 mr-1" /> {t('creditsPricing.actions.addTier')}
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('creditsPricing.table.minQuantity')}</TableHead>
                <TableHead>{t('creditsPricing.table.discountPercent')}</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    {t('creditsPricing.table.noTiers')}
                  </TableCell>
                </TableRow>
              ) : fields.map((field, index) => (
                <TableRow key={field.id}>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`tiers.${index}.min_qty` as const, { valueAsNumber: true })}
                    />
                    {form.formState.errors.tiers?.[index]?.min_qty && (
                      <p className="text-xs text-destructive mt-1">
                        {form.formState.errors.tiers?.[index]?.min_qty?.message as string}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        {...form.register(`tiers.${index}.percent` as const, { valueAsNumber: true })}
                      />
                      <Badge variant="secondary">%</Badge>
                    </div>
                    {form.formState.errors.tiers?.[index]?.percent && (
                      <p className="text-xs text-destructive mt-1">
                        {form.formState.errors.tiers?.[index]?.percent?.message as string}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{(mutation.error as Error)?.message}</AlertDescription>
            </Alert>
          )}

          {mutation.isSuccess && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{t('creditsPricing.updated')}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-start">
            <Button type="submit" disabled={mutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {mutation.isPending ? t('common.saving') : t('creditsPricing.savePricingConfig')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
