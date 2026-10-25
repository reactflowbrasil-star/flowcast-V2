'use client';

import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import {
  Users,
  Calendar,
  Smartphone,
  CreditCard,
  User,
  Clock,
  Shield
} from 'lucide-react';
import { userService } from '@/services';
import { User as UserType } from '@/types';
import { extractErrorMessage } from '@/lib/error-message';

interface ViewResellerUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reseller: UserType | null;
}

export default function ViewResellerUsersDialog({
  open,
  onOpenChange,
  reseller
}: ViewResellerUsersDialogProps) {
  useLoadNamespace('admin/viewResellerUsers');
  const { t, i18n } = useTranslation('admin/viewResellerUsers');

  // Fetch end users created by this reseller
  const { data: endUsers, isLoading, error } = useQuery({
    queryKey: ['reseller-end-users', reseller?.id],
    queryFn: async () => {
      if (!reseller?.id) return [];
      const result = await userService.getResellerEndUsers(reseller.id);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    enabled: !!reseller?.id && open});

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language || undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (isActive: boolean) => {
    return (
      <Badge variant={isActive ? 'default' : 'destructive'}>
        {isActive ? t('statusActive') : t('statusInactive')}
      </Badge>
    );
  };

  const calculateCreditCost = (maxDevices: number) => {
    let cost = 1.0; // Base cost
    if (maxDevices > 3) {
      const extraDevices = maxDevices - 3;
      cost = 1.0 + (extraDevices * 0.25);
    }
    return cost;
  };

  const totalCreditCost = endUsers?.reduce((total, user) => {
    return total + calculateCreditCost(user.max_devices);
  }, 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('title', { username: reseller?.username })}
          </DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('totalUsers')}</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{endUsers?.length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {t('endUsersCreated')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('totalDevices')}</CardTitle>
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {endUsers?.reduce((total, user) => total + user.max_devices, 0) || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('devicesAllocated')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('creditCost')}</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalCreditCost.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  {t('totalCreditsUsed')}
                </p>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Users List */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{t('userDetails')}</h4>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-20 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  {t('errorLoading', { message: error.message })}
                </p>
              </div>
            ) : !endUsers || endUsers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  {t('noUsersYet')}
                </p>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto pr-4">
                <div className="space-y-3">
                  {endUsers.map((user) => (
                    <Card key={user.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h5 className="font-medium">{user.username}</h5>
                            {getStatusBadge(user.active)}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Smartphone className="h-3 w-3" />
                              <span>{t('devices', { count: user.max_devices })}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              <span>{t('credits', { count: Number(calculateCreditCost(user.max_devices).toFixed(2)) })}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{t('expires', { date: user.expires_at ? formatDate(user.expires_at) : t('never') })}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{t('created', { date: formatDate(user.created_at) })}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <Badge variant="outline" className="text-xs">
                            {t('userId', { id: user.id })}
                          </Badge>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Transfer Warning */}
          {endUsers && endUsers.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h5 className="font-medium text-amber-800">{t('transferNotice')}</h5>
                  <p className="text-sm text-amber-700 mt-1">
                    {endUsers.length === 1
                      ? t('transferWarningSingular')
                      : t('transferWarning', { count: endUsers.length })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
