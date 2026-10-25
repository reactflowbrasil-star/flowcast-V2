'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  LogIn, 
  User, 
  Monitor,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Calendar,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { apiErrorMessage } from '@/lib/utils';
import { userActivityService } from '@/services/userActivity';

interface LoginHistoryFilters {
  user_id?: number;
  username?: string;
  start_date?: string;
  end_date?: string;
  ip_address?: string;
  page?: number;
  limit?: number;
}

export default function LoginHistory() {
  const [filters, setFilters] = useState<LoginHistoryFilters>({
    page: 1,
    limit: 20
  });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  useLoadNamespace('admin/loginHistory');
  const { t, i18n } = useTranslation(['admin/loginHistory', 'admin', 'translation']);

      const { data: historyData, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-login-history', filters],
    queryFn: async () => {
      const result = await userActivityService.getLoginHistory(filters);
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('loginHistory.errors.failedLoad')));
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Update last refresh when data changes
  React.useEffect(() => {
    if (historyData) {
      setLastRefresh(new Date());
    }
  }, [historyData]);

  const handleFilterChange = (key: keyof LoginHistoryFilters, value: any) => {
    setFilters(prev => {
      const next = {
        ...prev,
        [key]: value};
      const pageValue = key !== 'page'
        ? 1
        : (typeof value === 'string' ? Number(value) : (value ?? prev.page));
      return {
        ...next,
        page: pageValue};
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(i18n.language || undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSuccessBadge = (success: boolean) => {
    return (
      <Badge className={success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
        {success ? t('common.success') : t('common.failed')}
      </Badge>
    );
  };

  const getDeviceIcon = (deviceInfo: string) => {
    if (deviceInfo?.toLowerCase().includes('mobile')) {
      return '📱';
    } else if (deviceInfo?.toLowerCase().includes('tablet')) {
      return '📱';
    } else if (deviceInfo?.toLowerCase().includes('tv')) {
      return '📺';
    } else {
      return '💻';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with last refresh info */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('loginHistory.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('loginHistory.lastUpdated', { time: lastRefresh.toLocaleTimeString() })} • {t('loginHistory.autoRefreshOn')}
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('loginHistory.refreshNow')}
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label className="text-sm font-medium mb-2 block">{t('loginHistory.filters.username')}</label>
          <Input
            placeholder={t('loginHistory.filters.placeholderUsername')}
            value={filters.username || ''}
            onChange={(e) => handleFilterChange('username', e.target.value || undefined)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">{t('loginHistory.filters.ipAddress')}</label>
          <Input
            placeholder={t('loginHistory.filters.placeholderIp')}
            value={filters.ip_address || ''}
            onChange={(e) => handleFilterChange('ip_address', e.target.value || undefined)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">{t('loginHistory.filters.startDate')}</label>
          <Input
            type="date"
            value={filters.start_date || ''}
            onChange={(e) => handleFilterChange('start_date', e.target.value || undefined)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">{t('loginHistory.filters.endDate')}</label>
          <Input
            type="date"
            value={filters.end_date || ''}
            onChange={(e) => handleFilterChange('end_date', e.target.value || undefined)}
          />
        </div>

        <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.refresh')}
            </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground mt-2">{t('common.loading')}</p>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            {t('loginHistory.errors.failedLoad', { message: error?.message })}
          </p>
        </div>
      ) : !historyData?.logs || historyData.logs.length === 0 ? (
        <div className="text-center py-8">
          <LogIn className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            {t('loginHistory.empty')}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                  <TableRow>
                    <TableHead>{t('loginHistory.table.date')}</TableHead>
                    <TableHead>{t('loginHistory.table.username')}</TableHead>
                    <TableHead>{t('loginHistory.table.result')}</TableHead>
                    <TableHead>{t('loginHistory.table.ip')}</TableHead>
                    <TableHead>{t('loginHistory.table.device')}</TableHead>
                    <TableHead>{t('loginHistory.table.method')}</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {historyData.logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatDate(log.login_timestamp)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{log.username}</span>
                        <span className="text-xs text-muted-foreground">({log.user_id})</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getSuccessBadge(log.success)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-mono">{log.ip_address || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getDeviceIcon(log.device_info)}</span>
                        <span className="text-sm">{log.device_info || t('common.none')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                        <span className="text-xs text-muted-foreground" title={log.user_agent}>
                        {log.user_agent ? log.user_agent.substring(0, 50) + '...' : '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {t('loginHistory.pagination.showing', {
                from: ((historyData.page - 1) * historyData.limit) + 1,
                to: Math.min(historyData.page * historyData.limit, historyData.total),
                total: historyData.total
              })}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFilterChange('page', Math.max(1, historyData.page - 1))}
                disabled={historyData.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                {t('loginHistory.pagination.previous')}
              </Button>

              <span className="text-sm">
                {t('loginHistory.pagination.pageOf', { page: historyData.page, total_pages: historyData.total_pages })}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFilterChange('page', Math.min(historyData.total_pages, historyData.page + 1))}
                disabled={historyData.page >= historyData.total_pages}
              >
                {t('loginHistory.pagination.next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
