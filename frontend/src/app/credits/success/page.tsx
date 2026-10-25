'use client';

import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { CheckCircle2, ArrowLeft, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export default function CreditsSuccessPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500 rounded-full blur-3xl mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl mix-blend-screen animate-pulse" style={{ animationDuration: '5s' }} />
      </div>

      <Card className="max-w-md w-full border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
        <CardHeader className="flex flex-col items-center text-center pb-2">
          <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4 ring-1 ring-green-500/20">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('creditsCheckout.success.title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('creditsCheckout.success.description')}
          </p>
        </CardHeader>

        <CardContent className="space-y-4 pb-2">
          <div className="rounded-lg bg-muted/50 p-4 border border-border/50 text-sm">
            <div className="flex items-start gap-3">
              <div className="p-1 bg-primary/10 rounded-full mt-0.5">
                <div className="w-1.5 h-1.5 bg-primary rounded-full" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">{t('creditsCheckout.success.processingTimeTitle')}</p>
                <p className="text-muted-foreground text-xs">
                  {t('creditsCheckout.success.processingTimeDescription')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-6">
          <Link
            href="/reseller"
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full h-11 gap-2 shadow-lg shadow-primary/20")}
          >
            <ShoppingCart className="h-4 w-4" />
            {t('creditsCheckout.success.backToDashboard')}
          </Link>
          <Link
            href="/reseller?tab=credits"
            className={cn(buttonVariants({ variant: "outline" }), "w-full h-11 gap-2 border-border/50 hover:bg-muted/50")}
          >
            <ArrowLeft className="h-4 w-4" />
            {t('creditsCheckout.success.viewTransactionHistory')}
          </Link>

          <p className="text-[10px] text-center text-muted-foreground/60 mt-4">
            {t('creditsCheckout.success.transactionIdPlaceholder')}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
