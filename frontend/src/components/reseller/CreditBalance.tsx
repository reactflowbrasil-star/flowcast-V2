'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign, AlertCircle, Wallet, Users, Calculator } from 'lucide-react';
import { resellerService } from '@/services/reseller';
import { useAuth } from '@/contexts/AuthContext';

interface CreditBalanceProps {
  className?: string;
}

interface UserCreditBreakdown {
  id: number;
  username: string;
  max_devices: number;
  credits_used: number;
  active: boolean;
  credit_cost?: number;
}

export default function CreditBalance({ className }: CreditBalanceProps) {
  const { t } = useTranslation('reseller');
  const { user: currentUser } = useAuth();

  // Fetch current user's credit information
  const { data: creditBalance, isLoading, error } = useQuery({
    queryKey: ['reseller-credits', currentUser?.id],
    queryFn: async () => {
      const result = await resellerService.getCreditBalance();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!currentUser?.id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Note: Removed getUserStats call as resellers don't need admin user statistics

  // Fetch credit usage statistics
  const { data: creditUsageStats } = useQuery({
    queryKey: ['credit-usage-stats', currentUser?.id],
    queryFn: async () => {
      const result = await resellerService.getCreditUsageStats();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!currentUser?.id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('creditBalance.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('creditBalance.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('buyCredits.errors.failedLoadPricing')}: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const credits = creditBalance?.credits || 0;
  const totalUsers = creditUsageStats?.total_users || 0;
  const totalCreditsUsed = creditUsageStats?.total_credits_used || 0;
  const initialCredits = creditUsageStats?.initial_credits || 0;
  const isLowCredits = credits < 5; // Warning threshold

  return (
    <div className="space-y-6">
      {/* Credit Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Main Credit Balance Card */}
      <Card className={`col-span-2 ${className}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('creditBalance.availableCredits')}</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <div className="text-2xl font-bold">{credits.toFixed(2)}</div>
            <Badge variant={isLowCredits ? 'destructive' : 'default'}>
              {isLowCredits ? (
                <>
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {t('creditBalance.lowBalance')}
                </>
              ) : (
                <>
                  <DollarSign className="h-3 w-3 mr-1" />
                  {t('creditBalance.available')}
                </>
              )}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('creditBalance.creditsAvailableDescription')}
          </p>
          
          {isLowCredits && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('creditBalance.lowBalanceWarning')}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Total Users Card */}
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('creditBalance.totalUsers')}</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalUsers}</div>
          <p className="text-xs text-muted-foreground">
            {t('creditBalance.endUsersCreated')}
          </p>
        </CardContent>
      </Card>

      {/* Credit Usage */}
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('creditBalance.creditsUsed')}</CardTitle>
          <Calculator className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalCreditsUsed.toFixed(1)}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('creditBalance.totalCreditsConsumed')}
          </p>
        </CardContent>
      </Card>
      </div>

      {/* Credit Summary */}
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('creditBalance.creditSummary.title')}</CardTitle>
          <CardDescription>
            {t('creditBalance.creditSummary.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('creditBalance.creditSummary.initialCredits')}</span>
              <Badge variant="outline">{initialCredits.toFixed(2)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('creditBalance.creditSummary.creditsUsed')}</span>
              <Badge variant="outline">{totalCreditsUsed.toFixed(2)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('creditBalance.creditSummary.availableCredits')}</span>
              <Badge variant={isLowCredits ? 'destructive' : 'default'}>
                {credits.toFixed(2)}
              </Badge>
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between font-medium">
                <span className="text-sm">{t('creditBalance.creditSummary.usageRate')}</span>
                <Badge variant="secondary">
                  {initialCredits > 0 ? ((totalCreditsUsed / initialCredits) * 100).toFixed(1) : '0.0'}%
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Breakdown */}
      {creditUsageStats?.users_breakdown && creditUsageStats.users_breakdown.length > 0 && (
        <Card className={className}>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('creditBalance.userBreakdown.title')}</CardTitle>
            <CardDescription>
              {t('creditBalance.userBreakdown.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {creditUsageStats.users_breakdown.map((user: UserCreditBreakdown) => (
                <div key={user.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{user.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {user.max_devices} {user.max_devices !== 1
                        ? t('creditBalance.userBreakdown.devices')
                        : t('creditBalance.userBreakdown.device')}
                    </span>
                  </div>
                  <Badge variant="outline">
                    {user.credit_cost !== undefined
                      ? `${user.credit_cost.toFixed(2)} ${t('creditBalance.userBreakdown.credits')}`
                      : '—'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Calculation Guide */}
      <Card className={`col-span-full ${className}`}>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('creditBalance.calculationGuide.title')}</CardTitle>
          <CardDescription>
            {t('creditBalance.calculationGuide.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('creditBalance.calculationGuide.standardDevices')}</span>
                <Badge variant="outline">{t('creditBalance.calculationGuide.standardCredits')}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('creditBalance.calculationGuide.standardDescription')}
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('creditBalance.calculationGuide.premiumDevices')}</span>
                <Badge variant="outline">{t('creditBalance.calculationGuide.premiumCredits')}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('creditBalance.calculationGuide.premiumDescription')}
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('creditBalance.calculationGuide.extraDevices')}</span>
                <Badge variant="outline">{t('creditBalance.calculationGuide.extraCredits')}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('creditBalance.calculationGuide.extraDescription')}
              </p>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <h4 className="text-sm font-medium mb-2">{t('creditBalance.calculationGuide.examples')}</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>{t('creditBalance.calculationGuide.example1Device')}</span>
                <span>{t('creditBalance.calculationGuide.example1DeviceCost')}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('creditBalance.calculationGuide.example4Devices')}</span>
                <span>{t('creditBalance.calculationGuide.example4DevicesCost')}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('creditBalance.calculationGuide.example6Devices')}</span>
                <span>{t('creditBalance.calculationGuide.example6DevicesCost')}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
