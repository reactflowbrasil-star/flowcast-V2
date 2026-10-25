'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { billingService, type BillingOverview } from '@/services/billing';
import { configService, type CreditsPricingConfig, type PricingTier } from '@/services/config';
import { userService } from '@/services/user';
import { User, UserRole } from '@/types';
import { DollarSign, RefreshCw, AlertCircle, CheckCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminSectionHeader } from './AdminSectionHeader';

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function BillingDashboard({ className }: { className?: string }) {
  useLoadNamespace('admin/billing');
  const { t } = useTranslation('admin/billing');
  const queryClient = useQueryClient();

  const { data: overview, isLoading: overviewLoading, error: overviewError, refetch: refetchOverview } = useQuery({
    queryKey: ['billing-overview'],
    queryFn: async () => {
      const res = await billingService.getOverview();
      if (res.success) return res.data as BillingOverview;
      throw new Error(res.error?.details || res.error?.error || t('billing.errors.fetchOverview'));
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  // Fetch current Credits pricing (USD per credit + volume tiers) from backend-configured DB value
  const { data: pricing, isLoading: pricingLoading, error: pricingError, refetch: refetchPricing } = useQuery({
    queryKey: ['credits-pricing-config'],
    queryFn: async () => {
      const res = await configService.getCreditsPricing();
      if (res.success) return res.data as CreditsPricingConfig;
      throw new Error(res.error?.details || res.error?.error || t('billing.errors.fetchPricing'));
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  // Strongly-typed filter unions for API params
  type SourceType = 'stripe' | 'offline' | 'adjustment';
  type StatusType = 'completed' | 'pending' | 'refunded' | 'failed';

  const [page, setPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(25);
  const [sourceFilter, setSourceFilter] = React.useState<SourceType | ''>('');
  const [statusFilter, setStatusFilter] = React.useState<StatusType | ''>('');
  const [resellerIdFilter, setResellerIdFilter] = React.useState<string>('');
  const [referenceFilter, setReferenceFilter] = React.useState<string>('');

  React.useEffect(() => {
    setPage(1);
  }, [sourceFilter, statusFilter, resellerIdFilter, referenceFilter, perPage]);

  const { data: txPage, isLoading: txLoading, error: txError, refetch: refetchTx } = useQuery({
    queryKey: ['billing-transactions', page, perPage, sourceFilter, statusFilter, resellerIdFilter, referenceFilter],
    queryFn: async () => {
      const reseller_id = resellerIdFilter ? parseInt(resellerIdFilter, 10) : undefined;
      const res = await billingService.getTransactions({
        page,
        per_page: perPage,
        source: sourceFilter ? sourceFilter : undefined,
        status: statusFilter ? statusFilter : undefined,
        reseller_id,
        reference: referenceFilter || undefined
      });
      if (res.success) return res.data!;
      throw new Error(res.error?.details || res.error?.error || t('billing.errors.fetchTransactions'));
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev
  });

  // Offline payment form state
  const [resellerId, setResellerId] = React.useState<number>(0);
  const [resellerQuery, setResellerQuery] = React.useState<string>('');
  const [resellerListOpen, setResellerListOpen] = React.useState<boolean>(false);
  const [amountUsd, setAmountUsd] = React.useState<string>('0.00');
  const [creditsQty, setCreditsQty] = React.useState<number>(0);
  const [method, setMethod] = React.useState<string>('cash');
  const [reference, setReference] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const currency = overview?.currency || 'usd';

  // Fetch all resellers (admin)
  const { data: resellers } = useQuery({
    queryKey: ['admin-resellers'],
    queryFn: async () => {
      const res = await userService.getUsers({ role: UserRole.RESELLER });
      return res.success ? (res.data as User[]) : ([] as User[]);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const filteredResellers = React.useMemo(() => {
    const q = resellerQuery.trim().toLowerCase();
    if (q.length < 2) return [] as User[];
    return (resellers || []).filter(r =>
      r.username.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [resellers, resellerQuery]);

  const createOfflineMutation = useMutation({
    mutationFn: async () => {
      setSubmitError(null);
      const usd = parseFloat(amountUsd || '0');
      if (!Number.isFinite(usd) || usd <= 0) throw new Error(t('billing.offline.errors.amountPositive'));
      if (!Number.isInteger(creditsQty) || creditsQty <= 0) throw new Error(t('billing.offline.errors.creditsPositive'));
      if (!Number.isInteger(resellerId) || resellerId <= 0) throw new Error(t('billing.offline.errors.resellerPositive'));

      const amount_cents = Math.max(1, Math.round(usd * 100));
      if (!resellerId || resellerId <= 0) {
        throw new Error(t('billing.offline.errors.selectReseller'));
      }
      const res = await billingService.createOfflinePayment({
        reseller_id: resellerId,
        amount_cents,
        currency,
        credits_qty: creditsQty,
        method,
        reference: reference || undefined,
        notes: notes || undefined
      });
      if (!res.success) throw new Error(res.error?.details || res.error?.error || t('billing.errors.createOfflinePayment'));
      return res.data!;
    },
    onSuccess: () => {
      // Refetch overview & transactions
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      queryClient.invalidateQueries({ queryKey: ['billing-transactions'] });
      // Reset form fields
      setResellerId(0);
      setAmountUsd('0.00');
      setCreditsQty(0);
      setMethod('cash');
      setReference('');
      setNotes('');
    },
    onError: (e: unknown) => {
      const err = e as Error;
      setSubmitError(err.message || t('billing.errors.createOfflinePayment'));
    }
  });

  return (
    <div className={cn('space-y-6 max-w-[1400px] mx-auto w-full', className)}>
      <AdminSectionHeader
        icon={DollarSign}
        title={t('billing.title', { defaultValue: 'Billing Management' })}
        description={t('billing.subtitle', { defaultValue: 'Manage transactions, offline payments, and pricing.' })}
        actions={(
          <Button variant="outline" size="sm" onClick={() => { refetchOverview(); refetchTx(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('common.refresh')}
          </Button>
        )}
      />

      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle>{t('billing.overview.title')}</CardTitle>
          <CardDescription>{t('billing.overview.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {overviewLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
            </div>
          ) : overviewError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {(overviewError as Error).message}
              </AlertDescription>
            </Alert>
          ) : overview ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Metric title={t('billing.overview.metrics.onlineRevenue')} value={formatMoney(overview.online_amount_cents, overview.currency)} />
              <Metric title={t('billing.overview.metrics.offlineRevenue')} value={formatMoney(overview.offline_amount_cents, overview.currency)} />
              <Metric title={t('billing.overview.metrics.adjustments')} value={formatMoney(overview.adjustments_amount_cents, overview.currency)} />
              <Metric title={t('billing.overview.metrics.totalRevenue')} value={formatMoney(overview.total_amount_cents, overview.currency)} />

              <Metric title={t('billing.overview.metrics.creditsOnline')} value={overview.credits_from_online.toString()} />
              <Metric title={t('billing.overview.metrics.creditsOffline')} value={overview.credits_from_offline.toString()} />
              <Metric title={t('billing.overview.metrics.creditsAdjustments')} value={overview.credits_from_adjustments.toString()} />
              <Metric title={t('billing.overview.metrics.totalCredits')} value={overview.total_credits.toString()} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Credit Pricing (Admin-configured) */}
      <Card>
        <CardHeader className="flex items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {t('billing.pricing.title')}
            </CardTitle>
            <CardDescription>
              {t('billing.pricing.description')}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchPricing()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('common.refresh')}
          </Button>
        </CardHeader>
        <CardContent>
          {pricingLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
            </div>
          ) : pricingError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {(pricingError as Error).message}
              </AlertDescription>
            </Alert>
          ) : pricing ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 bg-card border rounded-lg">
                  <div className="text-sm text-muted-foreground">{t('billing.pricing.basePrice')}</div>
                  <div className="text-2xl font-semibold">${pricing.base_price_usd.toFixed(2)}</div>
                </div>
                <div className="p-4 bg-card border rounded-lg">
                  <div className="text-sm text-muted-foreground">{t('billing.pricing.activeTiers')}</div>
                  <div className="text-2xl font-semibold">{pricing.tiers?.length ?? 0}</div>
                </div>
                <div className="p-4 bg-card border rounded-lg">
                  <div className="text-sm text-muted-foreground">{t('billing.pricing.effectiveCurrency')}</div>
                  <div className="text-2xl font-semibold">{(overview?.currency || 'usd').toUpperCase()}</div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-sm">{t('billing.pricing.tiersNote')}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('billing.pricing.table.minQuantity')}</TableHead>
                      <TableHead>{t('billing.pricing.table.discountPercent')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pricing.tiers?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-sm text-muted-foreground">
                          {t('billing.pricing.table.noTiers')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      pricing.tiers
                        .slice()
                        .sort((a: PricingTier, b: PricingTier) => a.min_qty - b.min_qty)
                        .map((tier: PricingTier, idx: number) => (
                          <TableRow key={`${tier.min_qty}-${idx}`}>
                            <TableCell>{tier.min_qty}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span>{tier.percent.toFixed(2)}%</span>
                                <Badge variant="secondary">{t('billing.pricing.table.discountSuffix')}</Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Offline Payment Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {t('billing.offline.title')}
          </CardTitle>
          <CardDescription>{t('billing.offline.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Label htmlFor="reseller-search">{t('billing.offline.labels.reseller')}</Label>
              <Input
                id="reseller-search"
                value={resellerQuery}
                onChange={(e) => { setResellerQuery(e.target.value); setResellerListOpen(true); }}
                onFocus={() => setResellerListOpen(true)}
                placeholder={t('billing.offline.placeholders.resellerSearch')}
                autoComplete="off"
              />
              {resellerListOpen && filteredResellers.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-card shadow">
                  {filteredResellers.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        setResellerId(r.id);
                        setResellerQuery(`${r.username} #${r.id}`);
                        setResellerListOpen(false);
                      }}
                    >
                      <span className="font-medium">{r.username}</span>
                      <span className="text-xs text-muted-foreground">#{r.id}{r.email ? ` • ${r.email}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="amount-usd">{t('billing.offline.labels.amount')}</Label>
              <Input id="amount-usd" type="number" step="0.01" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} placeholder={t('billing.offline.placeholders.amount')} />
              <p className="text-xs text-muted-foreground mt-1">
                {t('billing.offline.chargedCurrency')} <Badge variant="secondary">{currency.toUpperCase()}</Badge>
              </p>
            </div>
            <div>
              <Label htmlFor="credits-qty">{t('billing.offline.labels.credits')}</Label>
              <Input id="credits-qty" type="number" min={1} value={creditsQty || ''} onChange={(e) => setCreditsQty(parseInt(e.target.value || '0', 10))} placeholder={t('billing.offline.placeholders.credits')} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3 mt-4">
            <div>
              <Label htmlFor="method">{t('billing.offline.labels.method')}</Label>
              <Input id="method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder={t('billing.offline.placeholders.method')} />
            </div>
            <div>
              <Label htmlFor="reference">{t('billing.offline.labels.reference')}</Label>
              <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('billing.offline.placeholders.reference')} />
            </div>
            <div>
              <Label htmlFor="notes">{t('billing.offline.labels.notes')}</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('billing.offline.placeholders.notes')} />
            </div>
          </div>

          {submitError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {createOfflineMutation.isSuccess && (
            <Alert className="mt-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{t('billing.offline.success')}</AlertDescription>
            </Alert>
          )}

          <div className="mt-4">
            <Button disabled={createOfflineMutation.isPending} onClick={() => createOfflineMutation.mutate()}>
              {createOfflineMutation.isPending ? t('billing.offline.actions.saving') : t('billing.offline.actions.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('billing.transactions.title')}</CardTitle>
          <CardDescription>{t('billing.transactions.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
            </div>
          ) : txError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {(txError as Error).message}
              </AlertDescription>
            </Alert>
          ) : txPage && (txPage.items?.length ?? 0) > 0 ? (
            <>
              {/* Filters */}
              <div className="grid gap-3 md:grid-cols-5 mb-4">
                <div>
                  <Label htmlFor="filter-source">{t('billing.transactions.filters.source')}</Label>
                  <select
                    id="filter-source"
                    className="w-full h-9 border rounded-md px-2"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value as SourceType | '')}
                  >
                    <option value="">{t('common.all')}</option>
                    <option value="stripe">{t('billing.transactions.sources.stripe')}</option>
                    <option value="offline">{t('billing.transactions.sources.offline')}</option>
                    <option value="adjustment">{t('billing.transactions.sources.adjustment')}</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="filter-status">{t('billing.transactions.filters.status')}</Label>
                  <select
                    id="filter-status"
                    className="w-full h-9 border rounded-md px-2"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusType | '')}
                  >
                    <option value="">{t('common.all')}</option>
                    <option value="completed">{t('billing.transactions.statuses.completed')}</option>
                    <option value="pending">{t('billing.transactions.statuses.pending')}</option>
                    <option value="refunded">{t('billing.transactions.statuses.refunded')}</option>
                    <option value="failed">{t('billing.transactions.statuses.failed')}</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="filter-reseller-id">{t('billing.transactions.filters.resellerId')}</Label>
                  <Input
                    id="filter-reseller-id"
                    type="number"
                    value={resellerIdFilter}
                    onChange={(e) => setResellerIdFilter(e.target.value)}
                    placeholder={t('billing.transactions.placeholders.resellerId')}
                  />
                </div>
                <div>
                  <Label htmlFor="filter-reference">{t('billing.transactions.filters.reference')}</Label>
                  <Input
                    id="filter-reference"
                    value={referenceFilter}
                    onChange={(e) => setReferenceFilter(e.target.value)}
                    placeholder={t('billing.transactions.placeholders.reference')}
                  />
                </div>
                <div>
                  <Label htmlFor="filter-per-page">{t('billing.transactions.filters.perPage')}</Label>
                  <select
                    id="filter-per-page"
                    className="w-full h-9 border rounded-md px-2"
                    value={perPage}
                    onChange={(e) => setPerPage(parseInt(e.target.value, 10))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('transactions.table.id')}</TableHead>
                      <TableHead>{t('billing.transactions.table.reseller')}</TableHead>
                      <TableHead>{t('billing.transactions.table.source')}</TableHead>
                      <TableHead>{t('billing.transactions.table.amount')}</TableHead>
                      <TableHead>{t('billing.transactions.table.credits')}</TableHead>
                      <TableHead>{t('billing.transactions.table.status')}</TableHead>
                      <TableHead>{t('billing.transactions.table.reference')}</TableHead>
                      <TableHead>{t('billing.transactions.table.createdAt')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txPage.items.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{transaction.id}</TableCell>
                        <TableCell>
                          {transaction.reseller_username} <span className="text-xs text-muted-foreground">#{transaction.reseller_id}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={transaction.source === 'stripe' ? 'default' : transaction.source === 'offline' ? 'secondary' : 'outline'}>
                            {t(`billing.transactions.sources.${transaction.source}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatMoney(transaction.amount_cents, transaction.currency)}</TableCell>
                        <TableCell>{transaction.credits_qty}</TableCell>
                        <TableCell>
                          <Badge variant={transaction.status === 'completed' ? 'default' : 'outline'}>{t(`billing.transactions.statuses.${transaction.status}`)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate">{transaction.reference || t('common.none')}</TableCell>
                        <TableCell className="text-xs">{new Date(transaction.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">{t('billing.transactions.total', { count: txPage.total })}</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || txLoading}>
                    {t('common.previous')}
                  </Button>
                  <span className="text-sm">{t('billing.transactions.pagination.page', { page })}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!txPage.has_more || txLoading}>
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">{t('billing.transactions.empty')}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="p-4 bg-card border rounded-lg">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
