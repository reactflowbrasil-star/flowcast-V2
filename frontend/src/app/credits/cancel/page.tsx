'use client';

import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { XCircle, ArrowLeft, ShoppingCart, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export default function CreditsCancelPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-10 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-red-500 rounded-full blur-3xl mix-blend-screen animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-orange-500 rounded-full blur-3xl mix-blend-screen animate-pulse" style={{ animationDuration: '7s' }} />
      </div>

      <Card className="max-w-md w-full border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
        <CardHeader className="flex flex-col items-center text-center pb-2">
          <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4 ring-1 ring-red-500/20">
            <XCircle className="h-10 w-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('creditsCheckout.cancel.title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('creditsCheckout.cancel.description')}
          </p>
        </CardHeader>

        <CardContent className="space-y-4 pb-2">
          <div className="rounded-lg bg-muted/50 p-4 border border-border/50 text-sm">
            <p className="text-muted-foreground text-center">
              {t('creditsCheckout.cancel.retryHint')}
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-6">
          <Link
            href="/reseller?tab=credits"
            className={cn(buttonVariants({ variant: "default" }), "w-full h-11 gap-2 shadow-lg shadow-red-500/10 hover:bg-red-600 text-white")}
          >
            <ShoppingCart className="h-4 w-4" />
            {t('creditsCheckout.cancel.tryAgain')}
          </Link>
          <Link
            href="/reseller"
            className={cn(buttonVariants({ variant: "ghost" }), "w-full h-11 gap-2 hover:bg-muted/50")}
          >
            <ArrowLeft className="h-4 w-4" />
            {t('creditsCheckout.cancel.returnToDashboard')}
          </Link>

          <div className="pt-4 flex justify-center">
            <Link
              href="/reseller?tab=tickets"
              className={cn(buttonVariants({ variant: "link", size: "sm" }), "text-muted-foreground text-xs gap-1 h-auto p-0")}
            >
              <HelpCircle className="h-3 w-3" />
              {t('creditsCheckout.cancel.contactSupport')}
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
