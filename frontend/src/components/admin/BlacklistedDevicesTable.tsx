
import React, { useState, useEffect } from 'react';
import { SecurityService } from '../../services/securityService';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface BlacklistedDevice {
  user_id: number;
  username: string;
  device_id: string;
  blacklisted_at: string;
}

const BlacklistedDevicesTable: React.FC = () => {
  useLoadNamespace('admin/blacklistedDevices');
  const { t, i18n } = useTranslation(['admin/blacklistedDevices', 'admin', 'translation']);
  const [devices, setDevices] = useState<BlacklistedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingDevice, setRemovingDevice] = useState<string | null>(null);

  useEffect(() => {
    loadBlacklistedDevices();
  }, []);

  const loadBlacklistedDevices = async () => {
    try {
      setLoading(true);
      const response = await SecurityService.getBlacklistedDevices();
      setDevices(response.devices);
      } catch (error) {
      console.error('Error loading blacklisted devices:', error);
      toast.error(t('notifications.blacklist.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromBlacklist = async (device: BlacklistedDevice) => {
    if (!confirm(t('notifications.blacklist.confirmRemove', { device: device.device_id, user: device.username }))) {
      return;
    }

    try {
      setRemovingDevice(device.device_id);
      await SecurityService.removeDeviceFromBlacklist(device.user_id, device.device_id);
      toast.success(t('notifications.blacklist.removed'));
      loadBlacklistedDevices(); // Refresh the list
    } catch (error) {
      console.error('Error removing device from blacklist:', error);
      toast.error(t('notifications.blacklist.removeFailed'));
    } finally {
      setRemovingDevice(null);
    }
  };

  const formatDate = (dateString: string) => {
    const locale = i18n?.language || 'en-US';
    return new Date(dateString).toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'});
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">
          {t('title', { count: devices.length })}
        </h3>
        <button
            onClick={loadBlacklistedDevices}
            className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('common.refresh')}
          </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md bg-card shadow sm:rounded-md">
        <div className="px-4 py-5 sm:p-6">
          {devices.length === 0 ? (
            <div className="text-center py-8">
              <svg className="mx-auto mb-4 h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="mb-2 text-lg font-medium text-foreground">
                {t('empty.title')}
              </h3>
              <p className="text-muted-foreground">
                {t('empty.description')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.username')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.deviceId')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.blacklistedAt')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {devices.map((device) => (
                    <tr key={`${device.user_id}-${device.device_id}`} className="hover:bg-muted/60">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                        {device.username}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-muted-foreground">
                        {device.device_id}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {formatDate(device.blacklisted_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                        <button
                          onClick={() => handleRemoveFromBlacklist(device)}
                          disabled={removingDevice === device.device_id}
                          className="text-primary hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {removingDevice === device.device_id ? (
                            <div className="flex items-center">
                              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-primary"></div>
                              {t('common.removing')}
                            </div>
                          ) : (
                            t('actions.remove')
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlacklistedDevicesTable;
