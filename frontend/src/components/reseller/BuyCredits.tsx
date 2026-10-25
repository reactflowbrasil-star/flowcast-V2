'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { resellerService } from '@/services/reseller';
import { DollarSign, ArrowRight, AlertCircle } from 'lucide-react';

type Tier = {
  min_qty: number;
  percent: number; // e.g. 5.0 = 5%
};

type PricingConfig = {
  base_price_usd: number;
  tiers: Tier[];
};

type ResellerRatesResponse = {
  default_connections: number;
  base_cost: number;
  extra_connection_cost: number;
  pricing: PricingConfig;
};

function computeDiscountForQty(qty: number, tiers: Tier[]): number {
  if (qty <= 0) return 0;
  // Highest applicable tier where min_qty <= qty
  let best = 0;
  for (const t of tiers) {
    if (qty >= t.min_qty && t.percent > best) {
      best = t.percent;
    }
  }
  return best;
}

function computeUnitCents(baseUsd: number, discountPercent: number): number {
  const baseCents = Math.round(baseUsd * 100);
  const discounted = baseCents * (1 - discountPercent / 100);
  const cents = Math.round(discounted);
  return Math.max(cents, 1);
}

export default function BuyCredits({ className }: { className?: string }) {
  const { t } = useTranslation('reseller');
  const [quantity, setQuantity] = React.useState<number>(100);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const { data: rates, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['reseller-credit-purchase-rates'],
    queryFn: async () => {
      const res = await resellerService.getCreditPurchaseRates();
      if (res.success) return res.data as ResellerRatesResponse;
      throw new Error(res.error?.details || res.error?.error || t('buyCredits.errors.failedLoadPricing'));
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false});

  const checkoutMutation = useMutation({
    mutationFn: async (qty: number) => {
      const res = await resellerService.createCheckoutSession(qty);
      if (!res.success) throw new Error(res.error?.details || res.error?.error || t('buyCredits.errors.failedCreateCheckout'));
      return res.data!;
    },
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (e: unknown) => {
      const err = e as Error;
      setErrorMsg(err.message || t('buyCredits.errors.failedCreateCheckout'));
    }});

  const pricing = rates?.pricing;
  const tiers = React.useMemo(() => {
    if (!pricing?.tiers) return [];
    return [...pricing.tiers].sort((a, b) => a.min_qty - b.min_qty);
  }, [pricing]);

  const discount = React.useMemo(() => computeDiscountForQty(quantity, tiers), [quantity, tiers]);
  const unitCents = React.useMemo(() => computeUnitCents(pricing?.base_price_usd || 1.0, discount), [pricing?.base_price_usd, discount]);
  const totalCents = unitCents * (isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0);

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value || '0', 10);
    if (isNaN(v)) {
      setQuantity(0);
    } else {
      setQuantity(Math.max(0, Math.min(100000, v)));
    }
  };

  const handleBuy = () => {
    setErrorMsg(null);
    if (!quantity || quantity <= 0) {
      setErrorMsg(t('buyCredits.invalidQuantity'));
      return;
    }
    checkoutMutation.mutate(quantity);
  };

  if (isLoading || isFetching) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('buyCredits.title')}
          </CardTitle>
          <CardDescription>{t('buyCredits.loadingPricing')}</CardDescription>
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
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('buyCredits.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t('buyCredits.errors.failedLoadPricing')}: {(error as Error).message}</AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button variant="outline" onClick={() => refetch()}>{t('buyCredits.retry')}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          {t('buyCredits.title')}
        </CardTitle>
        <CardDescription>
          {t('buyCredits.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Pricing Summary */ }
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground">{t('buyCredits.basePrice')}</div>
            <div className="text-2xl font-semibold text-foreground">
              ${pricing?.base_price_usd.toFixed(2)}
              <span className="ml-2 text-xs text-muted-foreground">{t('buyCredits.perCredit')}</span>
            </div>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground">{t('buyCredits.yourDiscount')}</div>
            <div className="text-2xl font-semibold text-foreground">
              {discount.toFixed(0)}%
              <span className="ml-2">
                <Badge variant={discount > 0 ? 'secondary' : 'outline'}>
                  {discount > 0 ? t('buyCredits.applied') : t('buyCredits.none')}
                </Badge>
              </span>
            </div>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground">{t('buyCredits.effectiveUnitPrice')}</div>
            <div className="text-2xl font-semibold text-foreground">
              ${ (unitCents / 100).toFixed(2) }
            </div>
          </div>
        </div>

        {/* Quantity + Summary */ }
        <div className="grid gap-4 md:grid-cols-3 items-end">
          <div>
            <label htmlFor="credits-qty" className="block text-sm font-medium mb-2">{t('buyCredits.quantityLabel')}</label>
            <Input
              id="credits-qty"
              type="number"
              min={1}
              max={100000}
              value={quantity}
              onChange={handleQtyChange}
            />
            <p className="text-xs text-muted-foreground mt-1">{t('buyCredits.quantityHint')}</p>
          </div>

          <div className="md:col-span-2">
            <div className="p-3 border border-border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{t('buyCredits.totalAmount')}</div>
                <div className="text-xl font-semibold text-foreground">${ (totalCents / 100).toFixed(2) }</div>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                {discount > 0 ? (
                  <span>{t('buyCredits.includesDiscount', { discount: discount.toFixed(0) })}</span>
                ) : (
                  <span>{t('buyCredits.noDiscount')}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Buy button */ }
        {errorMsg && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-3">
          <Button
            onClick={handleBuy}
            disabled={checkoutMutation.isPending || !quantity || quantity <= 0}
          >
            {checkoutMutation.isPending ? t('buyCredits.redirecting') : (
              <span className="inline-flex items-center">
                {t('buyCredits.proceedToCheckout')} <ArrowRight className="h-4 w-4 ml-2" />
              </span>
            )}
          </Button>
        </div>

        {/* Tiers table */ }
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium">{t('buyCredits.volumeDiscountTiers')}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('buyCredits.minQuantity')}</TableHead>
                <TableHead>{t('buyCredits.discount')}</TableHead>
                <TableHead>{t('buyCredits.effectiveUnitPrice')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    {t('buyCredits.noTiers')}
                  </TableCell>
                </TableRow>
              ) : tiers.map((t, idx) => {
                const cents = computeUnitCents(pricing!.base_price_usd, t.percent);
                return (
                  <TableRow key={idx}>
                    <TableCell>{t.min_qty}</TableCell>
                    <TableCell>{t.percent.toFixed(0)}%</TableCell>
                    <TableCell>${(cents / 100).toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
