'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  User,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  LogIn,
  Eye,
  Monitor
} from 'lucide-react';
import { userService } from '@/services';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { apiErrorMessage } from '@/lib/utils';
import ActivityDashboard from './ActivityDashboard';
import LoginHistory from './LoginHistory';
import ViewingHistory from './ViewingHistory';
import { AdminSectionHeader } from './AdminSectionHeader';

interface ActivityLogFilters {
  action_type?: string;
  user_id?: number;
  target_user_id?: number;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

interface ActivityLog {
  id: number;
  created_at: string;
  action_type: string;
  user_username: string;
  target_username?: string;
  description: string;
  credits_amount?: number;
}

export default function ActivityLogs() {
  const [filters, setFilters] = useState<ActivityLogFilters>({
    page: 1,
    limit: 20
  });

  useLoadNamespace('admin/activityLogs');
  const { t, i18n } = useTranslation('admin/activityLogs');

  const { data: logsData, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-activity-logs', filters],
    queryFn: async () => {
      const result = await userService.getAdminActivityLogs(filters);
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('errors.failedLoad')));
    }
  });

  const handleFilterChange = (key: keyof ActivityLogFilters, value: string | number | undefined) => {
    setFilters(prev => ({
      ...prev,
      [key]: key === 'page' ? (typeof value === 'string' ? parseInt(value, 10) : (value as number | undefined)) : value,
      page: key !== 'page' ? 1 : (typeof value === 'string' ? parseInt(value, 10) : (value as number | undefined)) // Reset to page 1 when changing filters
    }));
  };

  const formatDate = (dateString: string) => {
    const locale = i18n.language || 'en';
    return new Date(dateString).toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionBadge = (actionType: string) => {
    const actionColors: Record<string, string> = {
      'USER_CREATED': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      'USER_DELETED': 'bg-red-500/15 text-red-700 dark:text-red-300',
      'RESELLER_CREATED': 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
      'RESELLER_DELETED': 'bg-red-500/15 text-red-700 dark:text-red-300',
      'CREDIT_USED': 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      'CREDIT_ASSIGNED': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      'SYSTEM_INIT': 'bg-muted text-foreground',
      'LOGIN': 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
      'LOGOUT': 'bg-muted text-foreground'
    };

    return (
      <Badge className={actionColors[actionType] || 'bg-muted text-foreground'}>
        {t(`actionTypes.${actionType}`)}
      </Badge>
    );
  };

  const actionTypes = [
    'USER_CREATED',
    'USER_DELETED',
    'RESELLER_CREATED',
    'RESELLER_DELETED',
    'CREDIT_USED',
    'CREDIT_ASSIGNED',
    'SYSTEM_INIT',
    'LOGIN',
    'LOGOUT'
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={Activity}
        title={t('title')}
        description={t('subtitle')}
      />

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                {t('tabs.dashboard')}
              </TabsTrigger>
              <TabsTrigger value="system" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {t('tabs.system')}
              </TabsTrigger>
              <TabsTrigger value="login" className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                {t('tabs.loginHistory')}
              </TabsTrigger>
              <TabsTrigger value="viewing" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {t('tabs.viewingHistory')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-6">
              <ActivityDashboard />
            </TabsContent>

            <TabsContent value="system" className="space-y-6 mt-6">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">{t('filters.actionType')}</label>
                  <Select
                    value={filters.action_type || 'all'}
                    onValueChange={(value) => handleFilterChange('action_type', value === 'all' ? undefined : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('filters.allActions')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('filters.allActions')}</SelectItem>
                      {actionTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {t(`actionTypes.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">{t('filters.startDate')}</label>
                  <Input
                    type="date"
                    value={filters.start_date || ''}
                    onChange={(e) => handleFilterChange('start_date', e.target.value || undefined)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">{t('filters.endDate')}</label>
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
                    {t('refreshNow')}
                  </Button>
                </div>
              </div>

              {/* Results */}
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-16 rounded bg-muted"></div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    {t('errors.failedLoad')}
                  </p>
                </div>
              ) : !logsData?.logs || logsData.logs.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">
                    {t('empty')}
                  </p>
                </div>
              ) : (
                <>
                  {/* Table */}
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('table.date')}</TableHead>
                          <TableHead>{t('table.action')}</TableHead>
                          <TableHead>{t('table.user')}</TableHead>
                          <TableHead>{t('table.target')}</TableHead>
                          <TableHead>{t('table.description')}</TableHead>
                          <TableHead>{t('table.credits')}</TableHead>
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
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{log.user_username}</span>
                              </div>
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
                      {t('pagination.showing', {
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
                        {t('pagination.previous')}
                      </Button>

                      <span className="text-sm">
                        {t('pagination.pageOf', { page: logsData.page, total_pages: logsData.total_pages })}
                      </span>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFilterChange('page', Math.min(logsData.total_pages, logsData.page + 1))}
                        disabled={logsData.page >= logsData.total_pages}
                      >
                        {t('pagination.next')}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="login" className="mt-6">
              <LoginHistory />
            </TabsContent>

            <TabsContent value="viewing" className="mt-6">
              <ViewingHistory />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
