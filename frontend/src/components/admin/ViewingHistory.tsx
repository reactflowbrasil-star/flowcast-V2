'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Eye, 
  User, 
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Calendar,
  Shield,
  AlertTriangle,
  Film,
  Tv,
  Play,
  Radio
} from 'lucide-react';
import { userActivityService } from '@/services/userActivity';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface ViewingHistoryLog {
  id: number;
  start_timestamp: string;
  username: string;
  user_id?: number;
  content_title?: string;
  series_title?: string;
  content_type?: string;
  ip_address?: string;
  device_info?: string;
}

interface ViewingHistoryFilters {
  user_id?: number;
  username?: string;
  content_type?: string;
  start_date?: string;
  end_date?: string;
  ip_address?: string;
  page?: number;
  limit?: number;
}

export default function ViewingHistory() {
  const [filters, setFilters] = useState<ViewingHistoryFilters>({
    page: 1,
    limit: 20
  });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  useLoadNamespace('admin/viewingHistory');
  const { t, i18n } = useTranslation(['admin/viewingHistory', 'admin', 'translation']);

  const { data: historyData, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-viewing-history', filters],
    queryFn: async () => {
      const result = await userActivityService.getViewingHistory(filters);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.details || t('common.serverError'));
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Update last refresh when data changes
  React.useEffect(() => {
    if (historyData) {
      setLastRefresh(new Date());
    }
  }, [historyData]);

  const handleFilterChange = (key: keyof ViewingHistoryFilters, value: string | number | undefined) => {
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

  const getContentTypeBadge = (contentType?: string) => {
    const typeColors: Record<string, { color: string; icon: React.ReactNode }> = {
      'movie': { color: 'bg-blue-100 text-blue-800', icon: <Film className="h-3 w-3" /> },
      'series_episode': { color: 'bg-purple-100 text-purple-800', icon: <Tv className="h-3 w-3" /> },
      'live_tv': { color: 'bg-red-100 text-red-800', icon: <Radio className="h-3 w-3" /> },
      'anime_episode': { color: 'bg-orange-100 text-orange-800', icon: <Play className="h-3 w-3" /> },
      'event': { color: 'bg-green-100 text-green-800', icon: <Calendar className="h-3 w-3" /> }};

    const key = contentType || t('common.unknown');
    const config = typeColors[key] || { color: 'bg-gray-100 text-gray-800', icon: <Eye className="h-3 w-3" /> };

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {(contentType || t('common.unknown')).replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getDeviceIcon = (deviceInfo?: string) => {
    if (!deviceInfo) return '💻';
    if (deviceInfo.toLowerCase().includes('mobile')) {
      return '📱';
    } else if (deviceInfo.toLowerCase().includes('tablet')) {
      return '📱';
    } else if (deviceInfo.toLowerCase().includes('tv')) {
      return '📺';
    } else {
      return '💻';
    }
  };

  const contentTypes = [
    'movie',
    'series_episode',
    'live_tv',
    'anime_episode',
    'event'
  ];

  return (
    <div className="space-y-6">
      {/* Header with last refresh info */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('viewingHistory.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('viewingHistory.lastUpdated', { time: lastRefresh.toLocaleTimeString() })} • {t('viewingHistory.autoRefreshOn')}
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('viewingHistory.refreshNow')}
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div>
          <label className="text-sm font-medium mb-2 block">{t('viewingHistory.filters.username')}</label>
          <Input
            placeholder={t('viewingHistory.filters.placeholderUsername')}
            value={filters.username || ''}
            onChange={(e) => handleFilterChange('username', e.target.value || undefined)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">{t('viewingHistory.filters.contentType')}</label>
          <Select
            value={filters.content_type || 'all'}
            onValueChange={(value) => handleFilterChange('content_type', value === 'all' ? undefined : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('viewingHistory.filters.allTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('viewingHistory.filters.allTypes')}</SelectItem>
              {contentTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {type.replace('_', ' ').toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">{t('viewingHistory.filters.ipAddress')}</label>
          <Input
            placeholder={t('viewingHistory.filters.placeholderIp')}
            value={filters.ip_address || ''}
            onChange={(e) => handleFilterChange('ip_address', e.target.value || undefined)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">{t('viewingHistory.filters.startDate')}</label>
          <Input
            type="date"
            value={filters.start_date || ''}
            onChange={(e) => handleFilterChange('start_date', e.target.value || undefined)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">{t('viewingHistory.filters.endDate')}</label>
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
            {t('errors.failedLoad', { message: error?.message })}
          </p>
        </div>
      ) : !historyData?.logs || historyData.logs.length === 0 ? (
        <div className="text-center py-8">
          <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
                    <TableHead>{t('table.username')}</TableHead>
                    <TableHead>{t('table.type')}</TableHead>
                    <TableHead>{t('table.content')}</TableHead>
                    <TableHead>{t('table.content')}</TableHead>
                    <TableHead>{t('table.ip')}</TableHead>
                    <TableHead>{t('table.device')}</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {historyData.logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatDate(log.start_timestamp)}
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
                      {getContentTypeBadge(log.content_type)}
                    </TableCell>
                    <TableCell className="text-sm font-medium max-w-xs truncate">
                      {log.content_title}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.series_title ? (
                        <div className="text-blue-600 font-medium">
                          📺 {log.series_title}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
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
                        <span className="text-sm">{log.device_info || '-'}</span>
                      </div>
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
                  {t('pagination.previous')}
                </Button>
                
                <span className="text-sm">
                  {t('pagination.pageOf', { page: historyData.page, total_pages: historyData.total_pages })}
                </span>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange('page', Math.min(historyData.total_pages, historyData.page + 1))}
                  disabled={historyData.page >= historyData.total_pages}
                >
                  {t('pagination.next')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
          </div>
        </>
      )}
    </div>
  );
}
