import React, { useState, useEffect, useCallback } from 'react';
import { SecurityService } from '../../services/securityService';
import type { SecurityBan, SecurityFilters } from '../../types/security';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface SecurityBansTableProps {
  onRefresh?: () => void;
}

const SecurityBansTable: React.FC<SecurityBansTableProps> = ({ onRefresh }) => {
  useLoadNamespace('admin/securityBans');
  const { t } = useTranslation(['admin/securityBans', 'admin', 'translation']);
  const [bans, setBans] = useState<SecurityBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SecurityFilters>({
    page: 1,
    limit: 20
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const loadBans = useCallback(async () => {
    try {
      setLoading(true);
      const response = await SecurityService.getSecurityBans(filters);
      setBans(response.bans);
      setTotal(response.total);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error('Error loading bans:', error);
      toast.error(t('notifications.security.errorLoadingBans'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadBans();
  }, [loadBans]);

  const handleUnban = async (username: string) => {
    if (!confirm(t('unban.confirm', { user: username }))) {
      return;
    }

    try {
      const reason = prompt(t('unban.promptReason'));
      if (!reason) return;

      await SecurityService.unbanUser(username, reason);
      toast.success(t('notifications.ban.userUnbanned', { user: username }));
      loadBans(); // Refresh the list
      onRefresh?.(); // Refresh parent stats
    } catch (error) {
      console.error('Error unbanning user:', error);
      toast.error(t('notifications.security.errorUnbanningUser'));
    }
  };

  const handleFilterChange = (key: keyof SecurityFilters, value: string | number | undefined) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-lg bg-muted p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              {t('common.username')}
            </label>
            <input
              type="text"
              value={filters.username || ''}
              onChange={(e) => handleFilterChange('username', e.target.value || undefined)}
              placeholder={t('admin.securityBans.searchByUsernamePlaceholder', { defaultValue: 'Search by username...' })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              {t('itemsPerPage')}
            </label>
            <select
              value={filters.limit || 20}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-primary"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden bg-card shadow sm:rounded-md">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-foreground">
              {t('title', { total })}
            </h3>
          </div>

          {bans.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t('noneFound')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('common.username')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.securityBans.level')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.securityBans.type')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.securityBans.reason')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('admin.securityBans.timeRemaining')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {bans.map((ban) => (
                    <tr key={ban.id} className="hover:bg-muted/60">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                        {ban.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${SecurityService.getBanSeverityColor(ban.ban_level)
                          }`}>
                          {SecurityService.getBanLevelLabel(ban.ban_level)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {ban.ban_type}
                      </td>
                      <td className="max-w-xs truncate px-6 py-4 text-sm text-muted-foreground">
                        {ban.ban_reason}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {SecurityService.calculateTimeRemaining(ban.expires_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                        {ban.is_active && (
                          <button
                            onClick={() => handleUnban(ban.username)}
                            className="text-destructive hover:text-destructive/80"
                          >
                            {t('unban.action')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                {t('common.paginationShowing', { page: filters.page, totalPages })}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageChange((filters.page || 1) - 1)}
                  disabled={filters.page === 1}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('common.previous')}
                </button>
                <button
                  onClick={() => handlePageChange((filters.page || 1) + 1)}
                  disabled={filters.page === totalPages}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecurityBansTable;
