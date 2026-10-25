'use client';

import { useMemo } from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { contentService } from '@/services';
import { TvProviderRecord } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import i18n from '@/lib/i18n';

const providerSchema = z.object({
  name: z.string().min(1, i18n.t('errors.invalidData')),
  url: z.string().url(i18n.t('errors.invalidData')),
  ttlMinutes: z.coerce.number().min(1, i18n.t('errors.invalidData')),
  enabled: z.boolean().default(true)});

type ProviderFormValues = z.infer<typeof providerSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function TvProviderManagerDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  useLoadNamespace('admin/tvProviders');
  const { t } = useTranslation(['admin/tvProviders', 'translation']);
  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema) as Resolver<ProviderFormValues>,
    defaultValues: {
      name: '',
      url: '',
      ttlMinutes: 60,
      enabled: true}});

  const providersQuery = useQuery({
    queryKey: ['tv-providers'],
    enabled: open,
    queryFn: async () => {
      const response = await contentService.listTvProviders();
      if (!response.success || !response.data) {
        throw new Error(response.error?.details || t('errors.loadFailed'));
      }
      return response.data;
    },
    staleTime: 30 * 1000});

  const createMutation = useMutation({
    mutationFn: async (values: ProviderFormValues) => {
      const response = await contentService.createTvProvider({
        name: values.name,
        url: values.url,
        ttl_minutes: values.ttlMinutes,
        enabled: values.enabled});
      if (!response.success || !response.data) {
        throw new Error(response.error?.details || t('errors.createFailed'));
      }
      return response.data;
    },
    onSuccess: (provider) => {
      toast.success(t('notifications.provider.added', { name: provider.name, ns: 'translation' }));
      form.reset({ name: '', url: '', ttlMinutes: 60, enabled: true });
      queryClient.invalidateQueries({ queryKey: ['tv-providers'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('errors.createUnexpected');
      toast.error(t('notifications.provider.error', { message, ns: 'translation' }));
    }});

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await contentService.deleteTvProvider(id);
      if (!response.success) {
        throw new Error(response.error?.details || t('errors.deleteFailed'));
      }
    },
    onSuccess: () => {
      toast.success(t('notifications.provider.removed', { ns: 'translation' }));
      queryClient.invalidateQueries({ queryKey: ['tv-providers'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('errors.deleteUnexpected');
      toast.error(t('notifications.provider.error', { message, ns: 'translation' }));
    }});

  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await contentService.syncTvProvider(id);
      if (!response.success || !response.data) {
        throw new Error(response.error?.details || t('errors.syncFailed'));
      }
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(t('notifications.provider.syncCompleted', { created: data.created, updated: data.updated, ns: 'translation' }));
      queryClient.invalidateQueries({ queryKey: ['tv-providers'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('errors.syncUnexpected');
      toast.error(t('notifications.provider.error', { message, ns: 'translation' }));
    }});

  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data]);

  const onSubmit = (values: ProviderFormValues) => {
    createMutation.mutate(values);
  };

  const handleDelete = (provider: TvProviderRecord) => {
    if (!confirm(t('admin.provider.deleteConfirm', { name: provider.name, ns: 'translation' }))) {
      return;
    }
    deleteMutation.mutate(provider.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <div>
              <AlertTitle>{t('alert.title')}</AlertTitle>
              <AlertDescription>
                {t('alert.description')}
              </AlertDescription>
            </div>
          </Alert>

          <form className="grid gap-4 rounded-lg border bg-muted/40 p-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="provider-name">{t('form.providerName')}</Label>
                <Input id="provider-name" placeholder={t('placeholders.providerName')} {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="mt-1 text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="provider-url">{t('form.playlistUrl')}</Label>
                <Input
                  id="provider-url"
                  placeholder={t('placeholders.playlistUrl')}
                  {...form.register('url')}
                />
                {form.formState.errors.url && (
                  <p className="mt-1 text-sm text-destructive">{form.formState.errors.url.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="provider-ttl">{t('form.refreshInterval')}</Label>
                <Input
                  id="provider-ttl"
                  type="number"
                  min={1}
                  {...form.register('ttlMinutes')}
                />
                {form.formState.errors.ttlMinutes && (
                  <p className="mt-1 text-sm text-destructive">{form.formState.errors.ttlMinutes.message}</p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                <div>
                  <Label className="text-sm">{t('form.enableAutoRefresh')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('form.enableAutoRefreshHint')}
                  </p>
                </div>
                <Controller
                  name="enabled"
                  control={form.control}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('form.adding')}
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('form.addProvider')}
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.name')}</TableHead>
                  <TableHead>{t('table.ttl')}</TableHead>
                  <TableHead>{t('table.status')}</TableHead>
                  <TableHead>{t('table.lastFetch')}</TableHead>
                  <TableHead>{t('table.nextRefresh')}</TableHead>
                  <TableHead className="text-right">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      {providersQuery.isLoading ? t('common.loading', { ns: 'translation' }) : t('common.none', { ns: 'translation' })}
                    </TableCell>
                  </TableRow>
                ) : (
                  providers.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <div className="font-medium">{provider.name}</div>
                        <div className="text-xs text-muted-foreground break-all">{provider.url}</div>
                      </TableCell>
                      <TableCell>{provider.ttl_minutes} {t('units.minutes')}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={provider.enabled ? 'default' : 'secondary'}>
                            {provider.enabled ? t('status.enabled') : t('status.disabled')}
                          </Badge>
                          {provider.last_status && (
                            <span className="text-xs text-muted-foreground">{provider.last_status}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(provider.last_fetched_at)}</TableCell>
                      <TableCell>{formatDate(provider.next_refresh_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={syncMutation.isPending}
                            onClick={() => syncMutation.mutate(provider.id)}
                          >
                            {syncMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            <span className="ml-1">{t('buttons.sync')}</span>
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteMutation.isPending}
                            onClick={() => handleDelete(provider)}
                          >
                            <Trash2 className="h-3 w-3" />
                            <span className="ml-1">{t('buttons.delete')}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('buttons.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
