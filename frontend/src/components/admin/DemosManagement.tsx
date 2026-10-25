'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { apiService } from '@/services/api';
import { Users } from 'lucide-react';
import { AdminSectionHeader } from './AdminSectionHeader';

type DemoUser = {
  id: number;
  username: string;
  demo_expires_at?: string | null;
  created_at: string;
  last_login_ip?: string | null;
};

type DemoHistoryEntry = {
  id: number;
  user_id: number;
  username: string;
  login_timestamp: string;
  ip_address?: string | null;
  device_info?: string | null;
  user_agent?: string | null;
  success: boolean;
};

type DemoHistoryResponse = {
  logs: DemoHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

type HistoryFilters = {
  username: string;
  ip: string;
  success: 'all' | 'success' | 'failed';
};

const HISTORY_PAGE_SIZE = 25;

const createHistoryFilters = (): HistoryFilters => ({ username: '', ip: '', success: 'all' });

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};
export default function DemosManagement() {
  useLoadNamespace('admin/demos');
  const { t, i18n } = useTranslation(['admin/demos', 'admin', 'translation']);


  const [activeTab, setActiveTab] = useState<'users' | 'history'>('users');

  const [users, setUsers] = useState<DemoUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [threshold, setThreshold] = useState<string>('');
  const [banDays, setBanDays] = useState<string>('');
  const [durationHours, setDurationHours] = useState<string>('');
  const [configSaving, setConfigSaving] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [demoEnabledSaving, setDemoEnabledSaving] = useState(false);

  const [historyEntries, setHistoryEntries] = useState<DemoHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMeta, setHistoryMeta] = useState({ total: 0, totalPages: 0, limit: HISTORY_PAGE_SIZE });
  const [historyForm, setHistoryForm] = useState<HistoryFilters>(() => createHistoryFilters());
  const [historyQuery, setHistoryQuery] = useState<HistoryFilters>(() => createHistoryFilters());

  useEffect(() => {
    fetchUsers();
    fetchConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyPage, historyQuery]);

  const totalDemoUsers = useMemo(() => users.length, [users]);

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const result = await apiService.get<DemoUser[]>('/api/admin/demos');
      if (result.success) {
        setUsers(result.data || []);
      } else {
        const message = result.error?.details ?? result.error?.error ?? t('common.serverError');
        toast.error(message);
      }
    } catch (err: any) {
      toast.error(err?.message || t('common.serverError'));
    } finally {
      setUsersLoading(false);
    }
  }

  async function fetchConfig() {
    try {
      const result = await apiService.get<any>('/api/admin/demos/config');
      if (!result.success || !result.data) {
        if (result.error) {
        }
        return;
      }
      if (result.data.demo_creation_threshold) {
        setThreshold(String(result.data.demo_creation_threshold));
      }
      if (result.data.demo_ban_duration_days) {
        setBanDays(String(result.data.demo_ban_duration_days));
      }
      if (result.data.demo_duration_hours) {
        setDurationHours(String(result.data.demo_duration_hours));
      }
      // Parse public_demo_enabled (string "true"/"false" from backend)
      const enabledVal = result.data.public_demo_enabled;
      if (enabledVal !== undefined) {
        const isEnabled = enabledVal === true || enabledVal === 'true' || enabledVal === '1';
        setDemoEnabled(isEnabled);
      }
    } catch (err) {
    }
  }

  async function toggleDemoEnabled() {
    setDemoEnabledSaving(true);
    try {
      const newValue = !demoEnabled;
      const result = await apiService.put<any>('/api/admin/demos/config', {
        public_demo_enabled: newValue
      });
      if (result.success) {
        setDemoEnabled(newValue);
        toast.success(
          newValue
            ? t('demos.demoEnabled', {})
            : t('demos.demoDisabled', {})
        );
      } else {
        toast.error(result.error?.error || t('common.serverError'));
      }
    } catch (err: any) {
      toast.error(err?.message || t('common.serverError'));
    } finally {
      setDemoEnabledSaving(false);
    }
  }

  async function saveConfig() {
    setConfigSaving(true);
    try {
      const updates: Record<string, number> = {};

      if (threshold.trim() !== '') {
        const n = Number(threshold);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(t('demos.invalidThreshold', {}));
        }
        updates.demo_creation_threshold = Math.trunc(n);
      }

      if (banDays.trim() !== '') {
        const n2 = Number(banDays);
        if (!Number.isFinite(n2) || n2 < 0) {
          throw new Error(t('demos.invalidBanDays', {}));
        }
        updates.ban_duration_days = Math.trunc(n2);
      }

      if (durationHours.trim() !== '') {
        const n3 = Number(durationHours);
        if (!Number.isFinite(n3) || n3 < 1 || n3 > 168) {
          throw new Error(t('demos.invalidDuration', {}));
        }
        updates.demo_duration_hours = Math.trunc(n3);
      }

      if (Object.keys(updates).length === 0) {
        throw new Error(t('demos.noChanges', {}));
      }

      const result = await apiService.put<any>('/api/admin/demos/config', updates);
      if (!result.success) {
        throw new Error(result.error?.details || result.error?.error || t('common.serverError'));
      }
      toast.success(t('common.saved', {}));
      await fetchConfig();
    } catch (err: any) {
      toast.error(err?.message || t('common.serverError'));
    } finally {
      setConfigSaving(false);
    }
  }

  async function deleteUser(userId: number) {
    if (
      !confirm(
        t('demos.confirmDelete', {
        })
      )
    ) {
      return;
    }
    try {
      const res = await apiService.delete<any>(`/api/admin/users/${userId}`);
      if (res.success) {
        toast.success(t('demos.userDeleted', {}));
        fetchUsers();
      } else {
        throw new Error(res.error?.details ?? res.error?.error ?? t('common.serverError'));
      }
    } catch (err: any) {
      toast.error(err?.message || t('common.serverError'));
    }
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    setHistoryError(null);

    const params: Record<string, unknown> = {
      page: historyPage,
      limit: HISTORY_PAGE_SIZE
    };

    if (historyQuery.username.trim()) {
      params.username = historyQuery.username.trim();
    }
    if (historyQuery.ip.trim()) {
      params.ip = historyQuery.ip.trim();
    }
    if (historyQuery.success !== 'all') {
      params.success = historyQuery.success === 'success';
    }

    try {
      const result = await apiService.get<DemoHistoryResponse>('/api/admin/demos/history', {
        params
      });

      if (!result.success || !result.data) {
        throw new Error(result.error?.details || result.error?.error || t('common.serverError'));
      }

      const payload = result.data;
      setHistoryEntries(payload.logs ?? []);
      setHistoryMeta({
        total: payload.total ?? 0,
        totalPages: payload.total_pages ?? 0,
        limit: payload.limit ?? HISTORY_PAGE_SIZE
      });
    } catch (err: any) {
      const message = err?.message || t('common.serverError');
      setHistoryError(message);
      toast.error(message);
    } finally {
      setHistoryLoading(false);
    }
  }

  const hasHistoryResults = historyEntries.length > 0;

  const handleHistorySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHistoryPage(1);
    setHistoryQuery({ ...historyForm });
  };

  const handleHistoryReset = () => {
    const reset = createHistoryFilters();
    setHistoryForm(reset);
    setHistoryPage(1);
    setHistoryQuery(reset);
  };

  const canGoPrev = historyPage > 1;
  const canGoNext = historyPage < historyMeta.totalPages;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={Users}
        title={t('demos.title', {})}
        description={t('demos.subtitle', {})}
      />

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              {t('demos.settingsTitle', {})}
            </CardTitle>
            <CardDescription>
              {t('demos.settingsDescription', {
              })}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="whitespace-nowrap">
            {t('demos.totalUsers', {})}: {totalDemoUsers}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Demo Registration Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">
                {t('demos.allowRegistrationLabel', {})}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('demos.allowRegistrationDescription', {
                })}
              </p>
            </div>
            <Switch
              checked={demoEnabled}
              onCheckedChange={toggleDemoEnabled}
              disabled={demoEnabledSaving}
              aria-label={t('demos.allowRegistrationLabel', {})}
            />
          </div>

          {/* Rate Limiting Settings */}
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <Label>
                {t('demos.durationLabel', {})}
              </Label>
              <Input
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="12"
              />
              <p className="text-xs text-muted-foreground">
                {t('demos.durationHint', {})}
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                {t('demos.thresholdLabel', {})}
              </Label>
              <Input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="3"
              />
              <p className="text-xs text-muted-foreground">
                {t('demos.thresholdHint', {})}
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                {t('demos.banDurationLabel', {})}
              </Label>
              <Input
                value={banDays}
                onChange={(e) => setBanDays(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="15"
              />
              <p className="text-xs text-muted-foreground">
                {t('demos.banHint', {})}
              </p>
            </div>
            <div className="flex items-end pb-6">
              <Button onClick={saveConfig} disabled={configSaving} className="w-full md:w-auto">
                {configSaving
                  ? t('common.saving', {})
                  : t('common.save', {})}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'users' | 'history')}>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>
                {t('demos.managementTitle', {})}
              </CardTitle>
              <CardDescription>
                {t('demos.managementDescription', {
                })}
              </CardDescription>
            </div>
            <TabsList>
              <TabsTrigger value="users">
                {t('demos.usersTab', {})}
              </TabsTrigger>
              <TabsTrigger value="history">
                {t('demos.historyTab', {})}
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="space-y-6">
            <TabsContent value="users" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {usersLoading
                    ? t('common.loading', {})
                    : t('demos.usersSummary', {
                      count: totalDemoUsers
                    })}
                </div>
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={usersLoading}>
                  {usersLoading
                    ? t('demos.refreshing', {})
                    : t('common.refresh', {})}
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.billing.transactions.table.id')}</TableHead>
                      <TableHead>{t('common.username', {})}</TableHead>
                      <TableHead>{t('demos.ipLabel', {})}</TableHead>
                      <TableHead>{t('demos.expiresLabel', {})}</TableHead>
                      <TableHead>{t('demos.createdAtLabel', {})}</TableHead>
                      <TableHead className="text-right">
                        {t('common.actions', {})}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.id}</TableCell>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>
                          {user.last_login_ip ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {user.last_login_ip}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{formatDateTime(user.demo_expires_at)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDateTime(user.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => deleteUser(user.id)}>
                              {t('common.delete', {})}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {!usersLoading && users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                          {t('demos.noUsers', {})}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-6">
              <form onSubmit={handleHistorySubmit} className="grid gap-4 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
                <div className="space-y-1">
                  <Label>{t('common.username', {})}</Label>
                  <Input
                    value={historyForm.username}
                    onChange={(e) => setHistoryForm((prev) => ({ ...prev, username: e.target.value }))}
                    placeholder={t('demos.usernamePlaceholder', {})}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('demos.ipLabel', {})}</Label>
                  <Input
                    value={historyForm.ip}
                    onChange={(e) => setHistoryForm((prev) => ({ ...prev, ip: e.target.value }))}
                    placeholder="192.168.0.10"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('demos.resultLabel', {})}</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={historyForm.success}
                    onChange={(e) => setHistoryForm((prev) => ({ ...prev, success: e.target.value as HistoryFilters['success'] }))}
                  >
                    <option value="all">{t('common.all', {})}</option>
                    <option value="success">{t('demos.successful', {})}</option>
                    <option value="failed">{t('demos.failed', {})}</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <Button type="submit" className="flex-1" disabled={historyLoading}>
                    {t('common.apply', {})}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleHistoryReset} disabled={historyLoading}>
                    {t('common.reset', {})}
                  </Button>
                </div>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {historyLoading
                    ? t('common.loading', {})
                    : historyMeta.total
                      ? t('demos.historySummary', {
                        total: historyMeta.total
                      })
                      : t('demos.noHistoryResults', {
                      })}
                </span>
                {historyMeta.totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                      disabled={historyLoading || !canGoPrev}
                    >
                      {t('common.previous', {})}
                    </Button>
                    <span className="font-medium">
                      {historyPage} / {Math.max(historyMeta.totalPages, 1)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((page) => page + 1)}
                      disabled={historyLoading || !canGoNext}
                    >
                      {t('common.next', {})}
                    </Button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.username', {})}</TableHead>
                      <TableHead>{t('demos.ipLabel', {})}</TableHead>
                      <TableHead>{t('demos.deviceLabel', {})}</TableHead>
                      <TableHead>{t('demos.userAgentLabel', {})}</TableHead>
                      <TableHead>{t('common.status', {})}</TableHead>
                      <TableHead>{t('common.timestamp', {})}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.username}</TableCell>
                        <TableCell>
                          {entry.ip_address ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {entry.ip_address}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {entry.device_info || '—'}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                          {entry.user_agent || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.success ? 'outline' : 'destructive'}>
                            {entry.success
                              ? t('demos.successful', {})
                              : t('demos.failed', {})}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(entry.login_timestamp)}</TableCell>
                      </TableRow>
                    ))}

                    {!historyLoading && !hasHistoryResults && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                          {historyError ||
                            t('demos.noHistoryResults', {
                            })}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
