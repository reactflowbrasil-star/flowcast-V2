import React, { useState, useEffect, useCallback } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { SecurityService } from '../../services/securityService';
import type { SecurityIncident, SecurityFilters } from '../../types/security';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

const SecurityIncidentsTable: React.FC = () => {
  useLoadNamespace('admin/securityIncidents');
  const { t } = useTranslation(['admin/securityIncidents', 'admin', 'translation']);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SecurityFilters>({
    page: 1,
    limit: 20
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const loadIncidents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await SecurityService.getSecurityIncidents(filters);
      setIncidents(response.incidents);
      setTotal(response.total);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error('Error loading incidents:', error);
      toast.error(t('notifications.security.errorLoadingIncidents'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

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

  const handleDeleteIncident = async (incidentId: number) => {
    if (!confirm(t('admin.securityIncidents.confirmDelete'))) {
      return;
    }

    try {
      await SecurityService.deleteSecurityIncident(incidentId);
      toast.success(t('notifications.securityIncident.deleted'));
      loadIncidents(); // Reload the list
    } catch (error) {
      console.error('Error deleting incident:', error);
      toast.error(t('notifications.securityIncident.deleteFailed'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-muted p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t('admin.securityIncidents.filterType')}
            </label>
            <select
              value={filters.incident_type || ''}
              onChange={(e) => handleFilterChange('incident_type', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
            >
              <option value="">{t('admin.securityIncidents.allTypes')}</option>
              <option value="BRUTE_FORCE">{t('admin.securityIncidents.bruteForce')}</option>
              <option value="SUSPICIOUS_ACTIVITY">{t('admin.securityIncidents.suspiciousActivity')}</option>
              <option value="MULTIPLE_DEVICES">{t('admin.securityIncidents.multipleDevices')}</option>
              <option value="TOKEN_MANIPULATION">{t('admin.securityIncidents.tokenManipulation')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t('common.username')}
            </label>
            <input
              type="text"
              value={filters.username || ''}
              onChange={(e) => handleFilterChange('username', e.target.value || undefined)}
              placeholder={t('admin.securityIncidents.searchByUsernamePlaceholder', { defaultValue: 'Search by username...' })}
              className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t('itemsPerPage')}
            </label>
            <select
              value={filters.limit || 20}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
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
      <div className="bg-card shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-foreground">
              {t('title', { total })}
            </h3>
          </div>

          {incidents.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t('noneFound')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.type')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.username')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('admin.securityIncidents.deviceId')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('admin.securityIncidents.ipAddress')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.date')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {incidents.map((incident) => (
                    <tr key={incident.id} className="hover:bg-muted">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${SecurityService.getIncidentSeverityColor(incident.incident_type)
                          }`}>
                          {SecurityService.getIncidentTypeLabel(incident.incident_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                        {incident.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {incident.device_id || t('common.none')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {incident.ip_address || t('common.none')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {SecurityService.formatDate(incident.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        <button
                          onClick={() => handleDeleteIncident(incident.id)}
                          className="inline-flex items-center p-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-destructive"
                          title={t('admin.securityIncidents.deleteTitle')}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
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
                {t('admin.securityIncidents.showingPage', { page: filters.page, totalPages })}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageChange((filters.page || 1) - 1)}
                  disabled={filters.page === 1}
                  className="px-3 py-2 border border-border rounded-md text-sm font-medium text-muted-foreground bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.previous')}
                </button>
                <button
                  onClick={() => handlePageChange((filters.page || 1) + 1)}
                  disabled={filters.page === totalPages}
                  className="px-3 py-2 border border-border rounded-md text-sm font-medium text-muted-foreground bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
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

export default SecurityIncidentsTable;
