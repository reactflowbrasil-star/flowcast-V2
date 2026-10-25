'use client';

import React, { useState } from 'react';
import useLoadNamespace from '@/hooks/useLoadNamespace';
/**
 * Some files in the codebase were missing the import of useLoadNamespace when updated.
 * To avoid repeated diffs, we add a tiny runtime shim that defines a noop importer function
 * ensuring the symbol exists during transpile/SSR. The real hook is imported above and used
 * below; the shim is only referenced to satisfy earlier transforms that expected a top-level
 * function named importUseLoadNamespaceShim.
 */
function importUseLoadNamespaceShim() { /* shim - no-op, real hook is imported */ }
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { creditConfigSchema, tmdbConfigSchema, type CreditConfigData, type TMDBConfigData } from './systemConfiguration/schemas';
import { formatImportDuration, formatImportStage, formatImportTime, importStatusVariant, parseBoolConfig } from './systemConfiguration/utils';
import ContentDisplayCard from './systemConfiguration/ContentDisplayCard';
import DatabaseToolsCard from './systemConfiguration/DatabaseToolsCard';
import LoginBackdropsCard from './systemConfiguration/LoginBackdropsCard';
import PublicEndpointsCard from './systemConfiguration/PublicEndpointsCard';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Settings, DollarSign, Smartphone, Key, CheckCircle, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { configService, type ImportTask, type SqliteImportSummary } from '@/services';
import { MOVIES_BACKDROPS, SERIES_BACKDROPS } from '@/constants/backdrops';
import { extractErrorMessage } from '@/lib/error-message';

type SectionId = 'credit-system' | 'tmdb-config' | 'content-display' | 'login-backdrops' | 'public-endpoints' | 'database-tools' | 'config-summary';

interface SystemConfigurationProps {
  className?: string;
  visibleSections?: SectionId[];
}

export default function SystemConfiguration({ className, visibleSections }: SystemConfigurationProps) {
  const showSection = (id: SectionId) => !visibleSections || visibleSections.includes(id);
  const [tmdbTestResult, setTmdbTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sqliteFile, setSqliteFile] = useState<File | null>(null);
  const [postgresFile, setPostgresFile] = useState<File | null>(null);
  const [postgresMode, setPostgresMode] = useState<'append' | 'replace'>('append');
  const [sqliteSummary, setSqliteSummary] = useState<SqliteImportSummary | null>(null);
  const [activeImportTaskId, setActiveImportTaskId] = useState<string | null>(null);
  const defaultSeriesBackdrops = SERIES_BACKDROPS.join(',\n');
  const defaultMoviesBackdrops = MOVIES_BACKDROPS.join(',\n');
  const [loginSeriesBackdrops, setLoginSeriesBackdrops] = useState<string>(defaultSeriesBackdrops);
  const [loginMoviesBackdrops, setLoginMoviesBackdrops] = useState<string>(defaultMoviesBackdrops);
  const [isSavingBackdrops, setIsSavingBackdrops] = useState(false);
  // ensure namespace loader is imported (some files missed importing the hook)
  importUseLoadNamespaceShim();
  useLoadNamespace('admin/systemConfiguration');
  const { t } = useTranslation(['admin/systemConfiguration', 'admin', 'translation']);
  const queryClient = useQueryClient();

  const importTasksQuery = useQuery({
    queryKey: ['import-tasks'],
    queryFn: async () => {
      const result = await configService.getImportTasks();
      if (result.success && Array.isArray(result.data)) {
        return result.data;
      }
      return [];
    },
    refetchInterval: (query) => {
      const tasks = query.state.data;
      return Array.isArray(tasks) && tasks.some((task) => task.status === 'running') ? 3000 : false;
    }
  });

  const importTasks = importTasksQuery.data ?? [];
  const activeImportTask = React.useMemo<ImportTask | null>(() => {
    if (activeImportTaskId) {
      return importTasks.find((task) => task.id === activeImportTaskId) ?? null;
    }
    return importTasks.find((task) => task.status === 'running') ?? null;
  }, [activeImportTaskId, importTasks]);
  const isImportRunning = importTasks.some((task) => task.status === 'running');
  const importStatusRef = React.useRef<{ id: string | null; status: string | null }>({
    id: null,
    status: null
  });
  const displayImportTask = React.useMemo(
    () => activeImportTask ?? importTasks[0] ?? null,
    [activeImportTask, importTasks]
  );
  const importProgressValue = React.useMemo(() => {
    if (!displayImportTask || displayImportTask.total_tables <= 0) {
      return 0;
    }
    const raw = (displayImportTask.current_table_index / displayImportTask.total_tables) * 100;
    return Math.min(100, Math.max(0, Math.round(raw)));
  }, [displayImportTask]);

  // Fetch system configuration
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['system-config'],
    queryFn: async () => {
      const result = await configService.getSystemConfig();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.details ?? t('common.serverError'));
    }
  });

  // Credit configuration form
  const creditForm = useForm<CreditConfigData>({
    resolver: zodResolver(creditConfigSchema),
    defaultValues: {
      default_devices: 3,
      credit_per_user_3_devices: 1.0,
      credit_per_user_5_devices: 1.5,
      credit_per_extra_device: 0.25
    }
  });

  // TMDB configuration form
  const tmdbForm = useForm<TMDBConfigData>({
    resolver: zodResolver(tmdbConfigSchema),
    defaultValues: {
      tmdb_api_key: '',
      tmdb_enabled: true,
      tmdb_language: 'es-ES',
      tmdb_languages: 'es-ES',
      tmdb_mode: 'online',
      tmdb_metadata_path: 'metadata',
      tmdb_preferred_format: 'original'
    }
  });

  const tmdbMode = tmdbForm.watch('tmdb_mode');
  const tmdbEnabled = tmdbForm.watch('tmdb_enabled');
  const tmdbApiKey = tmdbForm.watch('tmdb_api_key');

  // Update credit configuration mutation
  const updateCreditConfigMutation = useMutation({
    mutationFn: async (data: CreditConfigData) => {
      const result = await configService.updateCreditConfig(data);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.details ?? t('common.serverError'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config'] });
    }
  });

  // Update TMDB configuration mutation
  const updateTMDBConfigMutation = useMutation({
    mutationFn: async (data: TMDBConfigData) => {
      const result = await configService.updateTMDBConfig(data);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.details ?? t('common.serverError'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config'] });
    }
  });

  // Test TMDB API key mutation
  const testTMDBMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const result = await configService.testTMDBKey(apiKey);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.details ?? t('common.serverError'));
    },
    onSuccess: () => {
      setTmdbTestResult({ success: true, message: t('systemConfiguration.tmdbKeyValid') });
    },
    onError: (error) => {
      setTmdbTestResult({ success: false, message: t('systemConfiguration.tmdbKeyInvalid', { message: (error as Error).message }) });
    }
  });

  // Update arbitrary config key mutation
  const updateConfigMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const result = await configService.updateConfig(key, value);
      if (result.success) return result;
      throw new Error(result.error?.details ?? t('common.serverError'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config'] });
      toast.success(t('systemConfiguration.updateSuccess', { key: '' }));
    },
    onError: (err: Error) => {
      toast.error(t('systemConfiguration.updateFailed', { message: err.message }));
    }
  });

  const sqliteImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const result = await configService.startLegacySqliteImport(file);
      if (result.success) return result.data;
      throw new Error(result.error?.details ?? t('common.serverError'));
    },
    onSuccess: (data) => {
      setSqliteSummary(null);
      setSqliteFile(null);
      setActiveImportTaskId(data.task_id);
      queryClient.invalidateQueries({ queryKey: ['import-tasks'] });
      toast.success(
        t('systemConfiguration.dbToolsImportQueued', {
        })
      );
    },
    onError: (err: Error) => {
      toast.error(
        t('systemConfiguration.dbToolsImportFailed', {
          message: err.message
        })
      );
    }
  });

  const postgresExportMutation = useMutation({
    mutationFn: async () => {
      const result = await configService.exportPostgresBackup();
      if (result.success) return result.data;
      throw new Error(result.error?.details ?? t('common.serverError'));
    },
    onSuccess: (data) => {
      const link = document.createElement('a');
      link.href = data.download_url;
      link.download = data.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(t('systemConfiguration.dbToolsExportSuccess', {}));
    },
    onError: (err: Error) => {
      toast.error(t('systemConfiguration.dbToolsExportFailed', { message: err.message }));
    }
  });

  const postgresImportMutation = useMutation({
    mutationFn: async ({ file, mode }: { file: File; mode: 'append' | 'replace' }) => {
      const result = await configService.startPostgresImport(file, mode);
      if (result.success) return result.data;
      throw new Error(result.error?.details ?? t('common.serverError'));
    },
    onSuccess: (data) => {
      setPostgresFile(null);
      setActiveImportTaskId(data.task_id);
      queryClient.invalidateQueries({ queryKey: ['import-tasks'] });
      toast.success(
        t('systemConfiguration.dbToolsImportNewQueued', {})
      );
    },
    onError: (err: Error) => {
      toast.error(
        t('systemConfiguration.dbToolsImportNewFailed', {
          message: err.message
        })
      );
    }
  });

  const toggleConfig = (key: string, current: boolean) => {
    updateConfigMutation.mutate({ key, value: current ? 'false' : 'true' });
  };

  // Load config data into forms when available
  React.useEffect(() => {
    if (config) {
      creditForm.setValue('default_devices', config.default_devices ?? 3);
      creditForm.setValue('credit_per_user_3_devices', config.credit_per_user_3_devices ?? 1.0);
      creditForm.setValue('credit_per_user_5_devices', config.credit_per_user_5_devices ?? 1.5);
      creditForm.setValue('credit_per_extra_device', config.credit_per_extra_device || 0.25);

      tmdbForm.setValue('tmdb_api_key', config.tmdb_api_key || '');
      tmdbForm.setValue('tmdb_enabled', config.tmdb_enabled ?? true);
      tmdbForm.setValue('tmdb_language', config.tmdb_language || 'es-ES');
      tmdbForm.setValue('tmdb_languages', (config as any).tmdb_languages || config.tmdb_language || 'es-ES');
      tmdbForm.setValue('tmdb_mode', config.tmdb_mode ?? 'online');
      tmdbForm.setValue('tmdb_metadata_path', config.tmdb_metadata_path || 'metadata');
      tmdbForm.setValue('tmdb_preferred_format', config.tmdb_preferred_format || 'original');

      setLoginSeriesBackdrops((config as any).ui_login_series_backdrops ?? defaultSeriesBackdrops);
      setLoginMoviesBackdrops((config as any).ui_login_movies_backdrops ?? defaultMoviesBackdrops);
    }
  }, [config, creditForm, tmdbForm, defaultSeriesBackdrops, defaultMoviesBackdrops]);

  React.useEffect(() => {
    if (!activeImportTaskId) {
      const runningTask = importTasks.find((task) => task.status === 'running');
      if (runningTask) {
        setActiveImportTaskId(runningTask.id);
      }
    }
  }, [activeImportTaskId, importTasks]);

  React.useEffect(() => {
    if (!activeImportTask) {
      return;
    }

    if (activeImportTask.kind === 'sqlite' && activeImportTask.summary) {
      setSqliteSummary(activeImportTask.summary);
    }

    const previous = importStatusRef.current;
    if (previous.id !== activeImportTask.id) {
      importStatusRef.current = {
        id: activeImportTask.id,
        status: activeImportTask.status
      };
      return;
    }

    if (previous.status !== activeImportTask.status && activeImportTask.status !== 'running') {
      if (activeImportTask.status === 'completed') {
        toast.success(
          t('systemConfiguration.dbToolsImportCompleted', {
            rowsSeen: activeImportTask.rows_seen,
            rowsInserted: activeImportTask.rows_inserted,
          })
        );
      } else if (activeImportTask.status === 'failed') {
        toast.error(
          t('systemConfiguration.dbToolsImportFailed', {
            message: activeImportTask.error_message ?? ''
          })
        );
      }
    }

    importStatusRef.current.status = activeImportTask.status;
  }, [activeImportTask, t]);

  React.useEffect(() => {
    if (displayImportTask?.kind === 'sqlite' && displayImportTask.summary) {
      setSqliteSummary(displayImportTask.summary);
    }
  }, [displayImportTask]);

  const handleSaveLoginBackdrops = async () => {
    setIsSavingBackdrops(true);
    try {
      const seriesRes = await configService.updateConfig('ui_login_series_backdrops', loginSeriesBackdrops.trim());
      if (!seriesRes.success) throw new Error(extractErrorMessage(seriesRes.error, t('common.serverError')));

      const moviesRes = await configService.updateConfig('ui_login_movies_backdrops', loginMoviesBackdrops.trim());
      if (!moviesRes.success) throw new Error(extractErrorMessage(moviesRes.error, t('common.serverError')));

      queryClient.invalidateQueries({ queryKey: ['system-config'] });
      toast.success(t('systemConfiguration.forms.loginBackdropsSaved', {}));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.serverError');
      toast.error(t('systemConfiguration.updateFailed', { message }));
    } finally {
      setIsSavingBackdrops(false);
    }
  };

  const handleCreditConfigSubmit = (data: CreditConfigData) => {
    updateCreditConfigMutation.mutate(data);
  };

  const handleTMDBConfigSubmit = (data: TMDBConfigData) => {
    const trimmedPath = data.tmdb_metadata_path?.trim();
    const payload: TMDBConfigData = {
      ...data,
      tmdb_api_key: data.tmdb_api_key?.trim(),
      tmdb_metadata_path:
        data.tmdb_mode === 'offline' ? trimmedPath || 'metadata' : trimmedPath || undefined
    };

    updateTMDBConfigMutation.mutate(payload);
  };

  const handleTestTMDB = () => {
    const apiKey = tmdbForm.getValues('tmdb_api_key');
    if (apiKey) {
      testTMDBMutation.mutate(apiKey);
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('systemConfiguration.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('systemConfiguration.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('systemConfiguration.failedToLoad', { message: error.message })}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className ?? ''}`}>
      {/* Credit System Configuration */}
      {showSection('credit-system') && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('systemConfiguration.creditTitle')}
          </CardTitle>
          <CardDescription>
            {t('systemConfiguration.creditDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={creditForm.handleSubmit(handleCreditConfigSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default-devices">{t('systemConfiguration.forms.defaultDevicesLabel')}</Label>
                <Input
                  id="default-devices"
                  type="number"
                  min="1"
                  max="10"
                  {...creditForm.register('default_devices', { valueAsNumber: true })}
                />
                {creditForm.formState.errors.default_devices && (
                  <p className="text-sm text-destructive mt-1">
                    {creditForm.formState.errors.default_devices.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {t('systemConfiguration.forms.defaultDevicesHelp')}
                </p>
              </div>
              <div>
                <Label htmlFor="credit-extra-device">{t('systemConfiguration.forms.creditPerExtraDeviceLabel')}</Label>
                <Input
                  id="credit-extra-device"
                  type="number"
                  min="0"
                  step="0.01"
                  {...creditForm.register('credit_per_extra_device', { valueAsNumber: true })}
                />
                {creditForm.formState.errors.credit_per_extra_device && (
                  <p className="text-sm text-destructive mt-1">
                    {creditForm.formState.errors.credit_per_extra_device.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {t('systemConfiguration.forms.creditPerExtraDeviceHelp')}
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="credit-3-devices">{t('systemConfiguration.forms.credit3DevicesLabel')}</Label>
                <Input
                  id="credit-3-devices"
                  type="number"
                  min="0"
                  step="0.01"
                  {...creditForm.register('credit_per_user_3_devices', { valueAsNumber: true })}
                />
                {creditForm.formState.errors.credit_per_user_3_devices && (
                  <p className="text-sm text-destructive mt-1">
                    {creditForm.formState.errors.credit_per_user_3_devices.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {t('systemConfiguration.forms.credit3DevicesHelp')}
                </p>
              </div>
              <div>
                <Label htmlFor="credit-5-devices">{t('systemConfiguration.forms.credit5DevicesLabel')}</Label>
                <Input
                  id="credit-5-devices"
                  type="number"
                  min="0"
                  step="0.01"
                  {...creditForm.register('credit_per_user_5_devices', { valueAsNumber: true })}
                />
                {creditForm.formState.errors.credit_per_user_5_devices && (
                  <p className="text-sm text-destructive mt-1">
                    {creditForm.formState.errors.credit_per_user_5_devices.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {t('systemConfiguration.forms.credit5DevicesHelp')}
                </p>
              </div>
            </div>

            {updateCreditConfigMutation.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {updateCreditConfigMutation.error.message}
                </AlertDescription>
              </Alert>
            )}

            {updateCreditConfigMutation.isSuccess && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('systemConfiguration.creditConfigUpdated')}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={updateCreditConfigMutation.isPending}
              className="w-full md:w-auto"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateCreditConfigMutation.isPending ? t('common.saving') : t('systemConfiguration.saveCreditConfig')}
            </Button>
          </form>
        </CardContent>
      </Card>}

      {/* TMDB Configuration */}
      {showSection('tmdb-config') && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('systemConfiguration.forms.tmdbTitle')}
          </CardTitle>
          <CardDescription>
            {t('systemConfiguration.forms.tmdbDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={tmdbForm.handleSubmit(handleTMDBConfigSubmit)} className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/40 p-4">
              <div>
                <Label className="text-sm font-medium">{t('systemConfiguration.forms.tmdbEnabledLabel')}</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('systemConfiguration.forms.tmdbEnabledDescription')}
                </p>
              </div>
              <Switch
                checked={tmdbEnabled}
                onCheckedChange={(checked) => tmdbForm.setValue('tmdb_enabled', checked, { shouldDirty: true })}
                aria-label={t('systemConfiguration.forms.tmdbEnabledLabel')}
              />
            </div>

            <div>
              <Label htmlFor="tmdb-api-key">{t('systemConfiguration.forms.tmdbApiKeyLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  id="tmdb-api-key"
                  type="password"
                  disabled={!tmdbEnabled}
                  {...tmdbForm.register('tmdb_api_key')}
                  placeholder={t('systemConfiguration.forms.tmdbApiKeyPlaceholder')}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestTMDB}
                  disabled={
                    !tmdbEnabled ||
                    tmdbMode === 'offline' ||
                    testTMDBMutation.isPending ||
                    !tmdbApiKey
                  }
                >
                  {testTMDBMutation.isPending ? t('systemConfiguration.testing') : t('systemConfiguration.test')}
                </Button>
              </div>
              {tmdbForm.formState.errors.tmdb_api_key && (
                <p className="text-sm text-destructive mt-1">
                  {tmdbForm.formState.errors.tmdb_api_key.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t('systemConfiguration.forms.tmdbApiKeyHelp')}
              </p>
            </div>

            <div>
              <Label htmlFor="tmdb-mode">{t('systemConfiguration.forms.tmdbModeLabel')}</Label>
              <Select
                value={tmdbMode}
                onValueChange={(value) => tmdbForm.setValue('tmdb_mode', value as 'online' | 'offline', { shouldDirty: true })}
                disabled={!tmdbEnabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('systemConfiguration.forms.tmdbModePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">{t('systemConfiguration.forms.tmdbModeOnline')}</SelectItem>
                  <SelectItem value="offline">{t('systemConfiguration.forms.tmdbModeOffline')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {t('systemConfiguration.forms.tmdbModeDescription')}
              </p>
            </div>

            {tmdbMode === 'offline' && (
              <>
                <div>
                  <Label htmlFor="tmdb-metadata-path">{t('systemConfiguration.forms.tmdbMetadataPathLabel')}</Label>
                  <Input
                    id="tmdb-metadata-path"
                    disabled={!tmdbEnabled}
                    placeholder={t('systemConfiguration.forms.tmdbMetadataPathLabel')}
                    {...tmdbForm.register('tmdb_metadata_path')}
                  />
                  {tmdbForm.formState.errors.tmdb_metadata_path && (
                    <p className="text-sm text-destructive mt-1">
                      {tmdbForm.formState.errors.tmdb_metadata_path.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('systemConfiguration.forms.tmdbMetadataPathHelp')}
                  </p>
                </div>

                <div>
                  <Label htmlFor="tmdb-preferred-format">{t('systemConfiguration.forms.tmdbPreferredFormatLabel')}</Label>
                  <Select
                    value={tmdbForm.watch('tmdb_preferred_format') || 'original'}
                    onValueChange={(value) => tmdbForm.setValue('tmdb_preferred_format', value as 'original' | 'webp' | 'png' | 'jpg')}
                    disabled={!tmdbEnabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('systemConfiguration.forms.tmdbPreferredFormatPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original">{t('systemConfiguration.forms.tmdbFormats.original')}</SelectItem>
                      <SelectItem value="webp">{t('systemConfiguration.forms.tmdbFormats.webp')}</SelectItem>
                      <SelectItem value="png">{t('systemConfiguration.forms.tmdbFormats.png')}</SelectItem>
                      <SelectItem value="jpg">{t('systemConfiguration.forms.tmdbFormats.jpg')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('systemConfiguration.forms.tmdbPreferredFormatHelp')}
                  </p>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="tmdb-language">{t('systemConfiguration.forms.tmdbLanguageLabel')}</Label>
              <div className="mt-1.5 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(tmdbForm.watch('tmdb_languages') || '').split(',').filter(Boolean).map((lang, idx) => (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary border border-primary/20"
                    >
                      {idx === 0 && <span title="Primary language" className="text-[10px]">⭐</span>}
                      {lang}
                      <button
                        type="button"
                        className="hover:text-destructive transition-colors"
                        onClick={() => {
                          const current = (tmdbForm.getValues('tmdb_languages') || '').split(',').filter(Boolean);
                          const updated = current.filter(l => l !== lang);
                          tmdbForm.setValue('tmdb_languages', updated.join(','));
                          if (updated.length > 0) {
                            tmdbForm.setValue('tmdb_language', updated[0]);
                          }
                        }}
                        disabled={!tmdbEnabled}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <Select
                  value=""
                  onValueChange={(value) => {
                    const current = (tmdbForm.getValues('tmdb_languages') || '').split(',').filter(Boolean);
                    if (!current.includes(value)) {
                      const updated = [...current, value];
                      tmdbForm.setValue('tmdb_languages', updated.join(','));
                      if (updated.length === 1) {
                        tmdbForm.setValue('tmdb_language', value);
                      }
                    }
                  }}
                  disabled={!tmdbEnabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('systemConfiguration.forms.tmdbLanguagePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      { value: 'es-ES', label: t('systemConfiguration.forms.tmdbLanguages.esES') },
                      { value: 'es-MX', label: t('systemConfiguration.forms.tmdbLanguages.esMX') },
                      { value: 'es-AR', label: t('systemConfiguration.forms.tmdbLanguages.esAR') },
                      { value: 'en-US', label: t('systemConfiguration.forms.tmdbLanguages.enUS') },
                      { value: 'en-GB', label: t('systemConfiguration.forms.tmdbLanguages.enGB') },
                      { value: 'pt-BR', label: t('systemConfiguration.forms.tmdbLanguages.ptBR') },
                      { value: 'pt-PT', label: t('systemConfiguration.forms.tmdbLanguages.ptPT') },
                      { value: 'fr-FR', label: t('systemConfiguration.forms.tmdbLanguages.frFR') },
                      { value: 'de-DE', label: t('systemConfiguration.forms.tmdbLanguages.deDE') },
                      { value: 'it-IT', label: t('systemConfiguration.forms.tmdbLanguages.itIT') },
                      { value: 'ja-JP', label: t('systemConfiguration.forms.tmdbLanguages.jaJP') },
                      { value: 'ko-KR', label: t('systemConfiguration.forms.tmdbLanguages.koKR') },
                      { value: 'zh-CN', label: t('systemConfiguration.forms.tmdbLanguages.zhCN') },
                      { value: 'zh-TW', label: t('systemConfiguration.forms.tmdbLanguages.zhTW') },
                      { value: 'ru-RU', label: t('systemConfiguration.forms.tmdbLanguages.ruRU') },
                    ].filter(opt => !(tmdbForm.getValues('tmdb_languages') || '').split(',').includes(opt.value)).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('systemConfiguration.forms.tmdbLanguageHelp')}
                {' — '}
                ⭐ = Primary language (used for base metadata)
              </p>
            </div>

            {tmdbMode === 'offline' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('systemConfiguration.forms.tmdbOfflineHint')}
                </AlertDescription>
              </Alert>
            )}

            {tmdbTestResult && (
              <Alert variant={tmdbTestResult.success ? 'default' : 'destructive'}>
                {tmdbTestResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  {tmdbTestResult.message}
                </AlertDescription>
              </Alert>
            )}

            {updateTMDBConfigMutation.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {updateTMDBConfigMutation.error.message}
                </AlertDescription>
              </Alert>
            )}

            {updateTMDBConfigMutation.isSuccess && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('systemConfiguration.tmdbConfigUpdated')}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={updateTMDBConfigMutation.isPending}
              className="w-full md:w-auto"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateTMDBConfigMutation.isPending ? t('common.saving') : t('systemConfiguration.saveTMDBConfig')}
            </Button>
          </form>
        </CardContent>
      </Card>}

      {showSection('content-display') && <ContentDisplayCard
        t={t}
        config={config}
        parseBoolConfig={parseBoolConfig}
        isUpdating={updateConfigMutation.isPending}
        onToggleHideEmpty={() => {
          const current = (config as any).hide_empty_episodes === 'true';
          updateConfigMutation.mutate({ key: 'hide_empty_episodes', value: current ? 'false' : 'true' });
        }}
      />}

      {showSection('login-backdrops') && <LoginBackdropsCard
        t={t}
        loginSeriesBackdrops={loginSeriesBackdrops}
        setLoginSeriesBackdrops={setLoginSeriesBackdrops}
        loginMoviesBackdrops={loginMoviesBackdrops}
        setLoginMoviesBackdrops={setLoginMoviesBackdrops}
        onSave={handleSaveLoginBackdrops}
        isSaving={isSavingBackdrops}
      />}

      {/* Public endpoints (Demo & Redeem) */}
      {showSection('public-endpoints') && <PublicEndpointsCard
        t={t}
        config={config}
        parseBoolConfig={parseBoolConfig}
        toggleConfig={toggleConfig}
        isUpdating={updateConfigMutation.isPending}
      />}

      {showSection('database-tools') && <DatabaseToolsCard
        t={t}
        sqliteFile={sqliteFile}
        setSqliteFile={setSqliteFile}
        sqliteImportMutation={sqliteImportMutation}
        sqliteSummary={sqliteSummary}
        isImportRunning={isImportRunning}
        postgresFile={postgresFile}
        setPostgresFile={setPostgresFile}
        postgresMode={postgresMode}
        setPostgresMode={setPostgresMode}
        postgresExportMutation={postgresExportMutation}
        postgresImportMutation={postgresImportMutation}
        displayImportTask={displayImportTask}
        importProgressValue={importProgressValue}
        importStatusVariant={importStatusVariant}
        formatImportStage={formatImportStage}
        formatImportTime={formatImportTime}
        formatImportDuration={formatImportDuration}
      />}

      {/* Current Configuration Summary */}
      {showSection('config-summary') && config && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t('systemConfiguration.currentConfigTitle')}
            </CardTitle>
            <CardDescription>
              {t('systemConfiguration.currentConfigDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <Smartphone className="h-8 w-8 text-primary mx-auto mb-2" />
                <div className="text-2xl font-bold">{config.default_devices ?? 3}</div>
                <div className="text-sm text-muted-foreground">{t('systemConfiguration.defaultDevicesLabel')}</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <DollarSign className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{config.credit_per_user_3_devices ?? 1.0}</div>
                <div className="text-sm text-muted-foreground">{t('systemConfiguration.credits3DevicesLabel')}</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <DollarSign className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{config.credit_per_user_5_devices ?? 1.5}</div>
                <div className="text-sm text-muted-foreground">{t('systemConfiguration.credits5DevicesLabel')}</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <Key className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold space-y-1">
                  <Badge variant={config.tmdb_api_key ? 'default' : 'secondary'}>
                    {config.tmdb_api_key ? t('systemConfiguration.configured') : t('systemConfiguration.notSet')}
                  </Badge>
                  <div className="text-xs font-normal text-muted-foreground">
                    {config.tmdb_mode === 'offline'
                      ? `${t('systemConfiguration.forms.tmdbModeOffline')} • ${config.tmdb_metadata_path || t('systemConfiguration.forms.tmdbMetadataPathDefault')}`
                      : t('systemConfiguration.forms.tmdbModeOnline')}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{t('systemConfiguration.tmdbApiLabel')}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
