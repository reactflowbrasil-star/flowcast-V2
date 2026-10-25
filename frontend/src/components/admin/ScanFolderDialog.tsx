'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { contentService } from '@/services';
import { Category, ScanFolderIngestResult } from '@/types';
import { toast } from 'sonner';
import { Loader2, FolderSearch, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

const createScanSchema = (rootPathRequiredMessage: string) => z.object({
  rootPath: z.string().min(1, rootPathRequiredMessage),
  media: z.enum(['mixed', 'movies', 'series', 'anime', 'kids']).default('mixed'),
  duplicatePolicy: z.enum(['omit', 'replace', 'allow']).default('omit'),
  addSubs: z.boolean().default(true),
  movieCategory: z.string().optional(),
  seriesCategory: z.string().optional()});

type ScanFolderFormValues = z.infer<ReturnType<typeof createScanSchema>>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const MEDIA_VALUES: Array<ScanFolderFormValues['media']> = ['mixed', 'movies', 'series', 'anime', 'kids'];
const DUPLICATE_POLICY_VALUES: Array<ScanFolderFormValues['duplicatePolicy']> = ['omit', 'replace', 'allow'];

export default function ScanFolderDialog({ open, onOpenChange, onSuccess }: Props) {
  useLoadNamespace('admin/scanFolder');
  const { t } = useTranslation(['admin/scanFolder', 'admin', 'translation']);
  const scanSchema = useMemo(
    () => createScanSchema(t('scanFolder.errors.rootPathRequired')),
    [t]
  );
  const [result, setResult] = useState<ScanFolderIngestResult | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }} = useForm<ScanFolderFormValues>({
    resolver: zodResolver(scanSchema) as Resolver<ScanFolderFormValues, any>,
    defaultValues: {
      rootPath: '',
      media: 'mixed',
      duplicatePolicy: 'omit',
      addSubs: true,
      // Use sentinel "__default" to avoid an empty-string Select.Item (UI library requirement)
      movieCategory: '__default',
      seriesCategory: '__default'}});

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'scan-folder'],
    enabled: open,
    queryFn: async () => {
      const response = await contentService.getCategories();
      if (!response.success || !response.data) {
        throw new Error(response.error?.details || t('scanFolder.errors.unableToLoadCategories'));
      }
      return response.data;
    },
    staleTime: 5 * 60 * 1000});

  const categoryTypeOptions = useMemo(() => {
    if (!categoriesQuery.data) return [] as Array<{ value: string; label: string }>;

    const filtered = categoriesQuery.data.filter((category: Category) => {
      const type = String(category.category_type).toLowerCase();
      return type !== 'tv' && type !== 'eventos' && type !== 'events';
    });

    const options: Array<{ value: string; label: string }> = filtered.map((category: Category) => ({
      value: String(category.id),
      label: category.name || (`Category ${category.id}`)
    }));

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [categoriesQuery.data]);

  // Helper to find category ID by type
  const findCategoryByType = (categoryType: string): number | undefined => {
    const cat = categoriesQuery.data?.find(
      (c: Category) => c.category_type?.toLowerCase() === categoryType.toLowerCase()
    );
    return cat?.id;
  };

  const scanMutation = useMutation({
    mutationFn: async (values: ScanFolderFormValues) => {
      // Auto-select category based on media type if not manually overridden
      let movieCategoryId = values.movieCategory && values.movieCategory !== '__default' 
        ? Number(values.movieCategory) 
        : undefined;
      let seriesCategoryId = values.seriesCategory && values.seriesCategory !== '__default' 
        ? Number(values.seriesCategory) 
        : undefined;

      // For specific media types, auto-select the matching category
      if (values.media === 'anime' && !seriesCategoryId) {
        seriesCategoryId = findCategoryByType('Anime');
        movieCategoryId = seriesCategoryId; // Use same category for both
      } else if (values.media === 'kids' && !movieCategoryId) {
        movieCategoryId = findCategoryByType('Kids');
        seriesCategoryId = movieCategoryId;
      }

      const response = await contentService.scanFolderIngest({
        rootPath: values.rootPath,
        media: values.media,
        duplicatePolicy: values.duplicatePolicy,
        addSubs: values.addSubs,
        movieCategory: movieCategoryId,
        seriesCategory: seriesCategoryId});

      if (!response.success || !response.data) {
        throw new Error(response.error?.details || t('scanFolder.errors.scanFailed'));
      }

      return response.data;
    },
    // Configure specific retry settings for long scanning operations
    retry: false, // Don't retry failed scans - they should complete or fail cleanly
    // React Query doesn't have a direct timeout, but we can configure retry behavior
    onSuccess: (data) => {
      setResult(data);
      onSuccess?.();
      toast.success(t('notifications.scan.folderCompleted'));
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('scanFolder.errors.unexpectedError');
      toast.error(t('notifications.scan.error', { message }));
    }});

  const wasOpenRef = useRef(open);

  useEffect(() => {
    // Only act on transitions to avoid update loops with react-query notifyManager
    const wasOpen = wasOpenRef.current;

    if (!wasOpen && open) {
      // Just opened: clear previous results and mutation state for a clean start
      setResult(null);
      reset({
        rootPath: '',
        media: 'mixed',
        duplicatePolicy: 'omit',
        addSubs: true,
        movieCategory: '__default',
        seriesCategory: '__default'});
      // Intentionally do not include scanMutation in deps to avoid reset-trigger loops
      scanMutation.reset();
    }

    if (wasOpen && !open) {
      // Just closed: clear local state; do NOT reset mutation here to avoid notify loop on close
      setResult(null);
      reset({
        rootPath: '',
        media: 'mixed',
        duplicatePolicy: 'omit',
        addSubs: true,
        movieCategory: '__default',
        seriesCategory: '__default'});
    }

    wasOpenRef.current = open;
  }, [open, reset]);

  const onSubmit = (values: ScanFolderFormValues) => {
    setResult(null);
    scanMutation.mutate(values);
  };

  const renderResultMetrics = () => {
    if (!result) return null;

    const metrics: Array<{ label: string; value: number; tone?: 'success' | 'warning' | 'info' }> = [
      { label: t('scanFolder.results.moviesCreated'), value: result.movies_created, tone: 'success' },
      { label: t('scanFolder.results.seriesCreated'), value: result.series_created, tone: 'success' },
      { label: t('scanFolder.results.episodesCreated'), value: result.episodes_created, tone: 'success' },
      { label: t('scanFolder.results.subtitlesAdded'), value: result.subtitles_added, tone: 'info' },
      { label: t('scanFolder.results.replaced'), value: result.replaced, tone: 'info' },
      { label: t('scanFolder.results.skipped'), value: result.skipped, tone: 'warning' },
    ];

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {metric.label}
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        {result.logs.length > 0 && (
          <div>
            <Label>{t('scanFolder.results.scanLog')}</Label>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-background p-3 text-xs font-mono">
              {result.logs.map((entry, index) => (
                <div key={`${entry}-${index}`} className="py-1 border-b last:border-b-0 border-transparent border-dashed">
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderSearch className="h-5 w-5" />
            {t('admin.content.actions.scanFolders')}
          </DialogTitle>
          <DialogDescription>
            {t('admin.content.dialogs.scanLibraryFolderDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <div>
              <AlertTitle>{t('scanFolder.alert.title')}</AlertTitle>
              <AlertDescription>
                {t('scanFolder.alert.descriptionPrefix')}
                {' '}
                <code className="mx-1 rounded bg-muted px-1">.srt</code>
                {' '}
                {t('scanFolder.alert.descriptionMiddle')}
                {' '}
                {t('scanFolder.alert.descriptionSuffix')}
              </AlertDescription>
            </div>
          </Alert>

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-3">
              <div>
                <Label htmlFor="rootPath">{t('scanFolder.form.rootPath')}</Label>
                <Controller
                  name="rootPath"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="rootPath"
                      placeholder={t('scanFolder.form.rootPathPlaceholder')}
                      {...field}
                    />
                  )}
                />
                {errors.rootPath && (
                  <p className="mt-1 text-sm text-destructive">{errors.rootPath.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="media">{t('scanFolder.mediaType.label')}</Label>
                  <Controller
                    name="media"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="media">
                          <SelectValue placeholder={t('scanFolder.mediaType.placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {MEDIA_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {t(`scanFolder.mediaType.${value}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div>
                  <Label htmlFor="duplicatePolicy">{t('scanFolder.duplicatePolicy.label')}</Label>
                  <Controller
                    name="duplicatePolicy"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="duplicatePolicy">
                          <SelectValue placeholder={t('scanFolder.duplicatePolicy.placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {DUPLICATE_POLICY_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {t(`scanFolder.duplicatePolicy.${value}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                <div>
                  <Label className="text-sm">{t('scanFolder.form.attachSubtitles')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('scanFolder.form.attachSubtitlesHelpPrefix')}
                    {' '}
                    <code className="mx-1 rounded bg-muted px-1">.srt</code>
                    {' '}
                    {t('scanFolder.form.attachSubtitlesHelpSuffix')}
                  </p>
                </div>
                <Controller
                  name="addSubs"
                  control={control}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="movieCategory">{t('scanFolder.form.overrideMovieCategory')}</Label>
                <Controller
                  name="movieCategory"
                  control={control}
                  render={({ field }) => (
                    <Select value={(field.value ?? '__default')} onValueChange={field.onChange}>
                      <SelectTrigger id="movieCategory">
                        <SelectValue placeholder={t('scanFolder.form.defaultVod')} />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Use '__default' sentinel for the default option — the Select component disallows empty string values */}
                        <SelectItem value="__default">{t('scanFolder.form.defaultVod')}</SelectItem>
                        {categoryTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('scanFolder.form.overrideMovieCategoryHelp')}
                </p>
              </div>

              <div>
                <Label htmlFor="seriesCategory">{t('scanFolder.form.overrideSeriesCategory')}</Label>
                <Controller
                  name="seriesCategory"
                  control={control}
                  render={({ field }) => (
                    <Select value={(field.value ?? '__default')} onValueChange={field.onChange}>
                      <SelectTrigger id="seriesCategory">
                        <SelectValue placeholder={t('scanFolder.form.defaultSeries')} />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Use '__default' sentinel for the default option — the Select component disallows empty string values */}
                        <SelectItem value="__default">{t('scanFolder.form.defaultSeries')}</SelectItem>
                        {categoryTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('scanFolder.form.overrideSeriesCategoryHelp')}
                </p>
              </div>
            </div>

            {renderResultMetrics()}

            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{t('scanFolder.badges.tmdbLookup')}</Badge>
                <Badge variant="secondary">{t('scanFolder.badges.subtitlePairing')}</Badge>
                <Badge variant="secondary">{t('scanFolder.badges.recursiveScan')}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={scanMutation.isPending}
                >
                  {t('common.close')}
                </Button>
                <Button type="submit" disabled={scanMutation.isPending}>
                  {scanMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('scan.scanning')}
                    </>
                  ) : (
                    t('scan.start')
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
