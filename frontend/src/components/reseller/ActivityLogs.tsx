'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Activity,
  User,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { userService } from '@/services';

interface ActivityLogFilters {
  action_type?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

interface ActivityLog {
  id: number;
  action_type: string;
  created_at: string;
  details?: string;
  description?: string;
  target_username?: string;
  credits_amount?: number | string;
  ip_address?: string;
  user_agent?: string;
}

interface ResellerActivityLogsProps {
  className?: string;
}

export default function ResellerActivityLogs({ className }: ResellerActivityLogsProps) {
  const { t, i18n } = useTranslation('reseller');
  const [filters, setFilters] = useState<ActivityLogFilters>({
    page: 1,
    limit: 20
  });

  const { data: logsData, isLoading, error, refetch } = useQuery({
    queryKey: ['reseller-activity-logs', filters],
    queryFn: async () => {
      const result = await userService.getResellerActivityLogs(filters);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    }});

  const handleFilterChange = (key: keyof ActivityLogFilters, value: string | number | undefined) => {
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

  const getActionBadge = (actionType: string) => {
    const actionColors: Record<string, string> = {
      'USER_CREATED': 'bg-green-100 text-green-800',
      'USER_DELETED': 'bg-red-100 text-red-800',
      'CREDIT_USED': 'bg-yellow-100 text-yellow-800',
      'DEMO_CREATED': 'bg-blue-100 text-blue-800',
      'LOGIN': 'bg-blue-100 text-blue-800',
      'LOGOUT': 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge className={actionColors[actionType] || 'bg-gray-100 text-gray-800'}>
        {t(`activityLogs.actionTypes.${actionType}`, { defaultValue: actionType.replace('_', ' ') })}
      </Badge>
    );
  };

  const actionTypes = [
    'USER_CREATED',
    'USER_DELETED',
    'CREDIT_USED',
    'DEMO_CREATED',
    'LOGIN',
    'LOGOUT'
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          {t('activityLogs.title')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('activityLogs.description')}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">{t('activityLogs.filters.actionType')}</label>
            <Select
              value={filters.action_type || 'all'}
              onValueChange={(value) => handleFilterChange('action_type', value === 'all' ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('activityLogs.filters.allActions')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('activityLogs.filters.allActions')}</SelectItem>
                {actionTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {t(`activityLogs.actionTypes.${type}`, { defaultValue: type.replace('_', ' ') })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">{t('activityLogs.filters.startDate')}</label>
            <Input
              type="date"
              value={filters.start_date || ''}
              onChange={(e) => handleFilterChange('start_date', e.target.value || undefined)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">{t('activityLogs.filters.endDate')}</label>
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
              {t('activityLogs.refresh')}
            </Button>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              {t('activityLogs.errorLoading', { message: error.message })}
            </p>
          </div>
        ) : !logsData?.logs || logsData.logs.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              {t('activityLogs.noLogs')}
            </p>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('activityLogs.table.date')}</TableHead>
                    <TableHead>{t('activityLogs.table.action')}</TableHead>
                    <TableHead>{t('activityLogs.table.targetUser')}</TableHead>
                    <TableHead>{t('activityLogs.table.description')}</TableHead>
                    <TableHead>{t('activityLogs.table.credits')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData.logs.map((log: ActivityLog) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        {getActionBadge(log.action_type)}
                      </TableCell>
                      <TableCell>
                        {log.target_username ? (
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{log.target_username}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {log.description}
                      </TableCell>
                      <TableCell>
                        {log.credits_amount ? (
                          <div className="flex items-center gap-1">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{log.credits_amount}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {t('activityLogs.pagination.showing', {
                  from: ((logsData.page - 1) * logsData.limit) + 1,
                  to: Math.min(logsData.page * logsData.limit, logsData.total),
                  total: logsData.total
                })}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange('page', Math.max(1, logsData.page - 1))}
                  disabled={logsData.page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('activityLogs.pagination.previous')}
                </Button>
                
                <span className="text-sm">
                  {t('activityLogs.pagination.pageOf', { page: logsData.page, totalPages: logsData.total_pages })}
                </span>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange('page', Math.min(logsData.total_pages, logsData.page + 1))}
                  disabled={logsData.page >= logsData.total_pages}
                >
                  {t('activityLogs.pagination.next')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
