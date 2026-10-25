'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, AlertTriangle, CheckCircle, XCircle, Users } from 'lucide-react';
import { resellerService } from '@/services/reseller';
import { useAuth } from '@/contexts/AuthContext';
import { User } from '@/types';

interface ExpirationMonitoringProps {
  className?: string;
  compact?: boolean;
}

interface UserWithExpiration extends User {
  daysRemaining: number;
  expirationStatus: 'expired' | 'critical' | 'warning' | 'good' | 'never';
}

export default function ExpirationMonitoring({ className, compact = false }: ExpirationMonitoringProps) {
  const { t, i18n } = useTranslation('reseller');
  const { user: currentUser } = useAuth();

  // Fetch reseller's users
  const { data: endUsers, isLoading, error } = useQuery({
    queryKey: ['reseller-users-expiration', currentUser?.id],
    queryFn: async () => {
      const result = await resellerService.getEndUsers();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!currentUser?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  // Process users to calculate expiration status
  const processedUsers: UserWithExpiration[] = React.useMemo(() => {
    if (!endUsers) return [];

    return endUsers.map(user => {
      if (!user.expires_at) {
        return {
          ...user,
          daysRemaining: Infinity,
          expirationStatus: 'never' as const
        };
      }

      const now = new Date();
      const expirationDate = new Date(user.expires_at);
      const timeDiff = expirationDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

      let expirationStatus: 'expired' | 'critical' | 'warning' | 'good' | 'never';
      
      if (daysRemaining < 0) {
        expirationStatus = 'expired';
      } else if (daysRemaining <= 2) {
        expirationStatus = 'critical';
      } else if (daysRemaining <= 5) {
        expirationStatus = 'warning';
      } else {
        expirationStatus = 'good';
      }

      return {
        ...user,
        daysRemaining,
        expirationStatus
      };
    }).sort((a, b) => {
      // Sort by expiration status priority, then by days remaining
      const statusPriority = { expired: 0, critical: 1, warning: 2, good: 3, never: 4 };
      if (statusPriority[a.expirationStatus] !== statusPriority[b.expirationStatus]) {
        return statusPriority[a.expirationStatus] - statusPriority[b.expirationStatus];
      }
      if (a.daysRemaining === Infinity && b.daysRemaining === Infinity) return 0;
      if (a.daysRemaining === Infinity) return 1;
      if (b.daysRemaining === Infinity) return -1;
      return a.daysRemaining - b.daysRemaining;
    });
  }, [endUsers]);

  // Calculate summary statistics
  const summary = React.useMemo(() => {
    const expired = processedUsers.filter(u => u.expirationStatus === 'expired').length;
    const critical = processedUsers.filter(u => u.expirationStatus === 'critical').length;
    const warning = processedUsers.filter(u => u.expirationStatus === 'warning').length;
    const good = processedUsers.filter(u => u.expirationStatus === 'good').length;
    const never = processedUsers.filter(u => u.expirationStatus === 'never').length;
    
    return { expired, critical, warning, good, never };
  }, [processedUsers]);

  const getStatusBadge = (user: UserWithExpiration) => {
    switch (user.expirationStatus) {
      case 'expired':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            {t('expirationMonitoring.status.expired')}
          </Badge>
        );
      case 'critical':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {user.daysRemaining === 1
              ? t('expirationMonitoring.status.day', { count: user.daysRemaining })
              : t('expirationMonitoring.status.days', { count: user.daysRemaining })}
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="secondary" className="flex items-center gap-1 bg-orange-100 text-orange-800 border-orange-200">
            <Clock className="h-3 w-3" />
            {t('expirationMonitoring.status.days', { count: user.daysRemaining })}
          </Badge>
        );
      case 'good':
        return (
          <Badge variant="outline" className="flex items-center gap-1 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3" />
            {t('expirationMonitoring.status.days', { count: user.daysRemaining })}
          </Badge>
        );
      case 'never':
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {t('expirationMonitoring.status.noExpiration')}
          </Badge>
        );
    }
  };

  const formatExpirationDate = (dateString: string | null) => {
    if (!dateString) return t('expirationMonitoring.neverExpires');
    return new Date(dateString).toLocaleDateString(i18n.language || undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('expirationMonitoring.title')}</CardTitle>
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
          <CardTitle>{t('expirationMonitoring.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('expirationMonitoring.errorLoading')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Filter users for compact view (only show critical and warning)
  const criticalUsers = compact
    ? processedUsers.filter(u => u.expirationStatus === 'expired' || u.expirationStatus === 'critical' || u.expirationStatus === 'warning').slice(0, 5)
    : processedUsers;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {!compact && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('expirationMonitoring.summary.expired')}</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.expired}</div>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('expirationMonitoring.summary.critical')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.critical}</div>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('expirationMonitoring.summary.warning')}</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{summary.warning}</div>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('expirationMonitoring.summary.good')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary.good}</div>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('expirationMonitoring.summary.noExpiration')}</CardTitle>
            <Calendar className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{summary.never}</div>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Detailed Table */}
      <Card className={className}>
        <CardHeader>
          <CardTitle>{compact ? t('expirationMonitoring.details.criticalTitle') : t('expirationMonitoring.details.fullTitle')}</CardTitle>
          <CardDescription>
            {compact
              ? t('expirationMonitoring.details.criticalDescription')
              : t('expirationMonitoring.details.fullDescription')
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {criticalUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('expirationMonitoring.table.username')}</TableHead>
                  <TableHead>{t('expirationMonitoring.table.email')}</TableHead>
                  <TableHead>{t('expirationMonitoring.table.expirationDate')}</TableHead>
                  <TableHead>{t('expirationMonitoring.table.status')}</TableHead>
                  <TableHead>{t('expirationMonitoring.table.active')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criticalUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>{user.email || t('expirationMonitoring.noEmail')}</TableCell>
                    <TableCell>{formatExpirationDate(user.expires_at || null)}</TableCell>
                    <TableCell>{getStatusBadge(user)}</TableCell>
                    <TableCell>
                      <Badge variant={user.active ? 'default' : 'secondary'}>
                        {user.active ? t('expirationMonitoring.status.active') : t('expirationMonitoring.status.inactive')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {compact ? t('expirationMonitoring.empty.noCritical') : t('expirationMonitoring.empty.noUsers')}
              </h3>
              <p className="text-gray-500">
                {compact
                  ? t('expirationMonitoring.empty.noCriticalDescription')
                  : t('expirationMonitoring.empty.noUsersDescription')
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
