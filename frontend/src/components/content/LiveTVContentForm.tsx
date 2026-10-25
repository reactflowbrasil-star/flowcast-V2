'use client';

import { useForm } from 'react-hook-form';
import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tv, Calendar, Upload } from 'lucide-react';
import { contentService } from '@/services';
import { ContentType } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

const DEFAULT_CHANNEL_CATEGORIES = [
  'Entertainment',
  'Sports',
  'News',
  'Movies',
  'Series',

  'Kids',
  'Documentary',
  'Lifestyle',
  'Culture & Education',
  'International',
];

// Helper to validate URLs or local /metadata/ paths
const urlOrMetadataPath = z.string().refine(
  (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/metadata/') || val.startsWith('/api/'),
  i18n.t('errors.invalidData')
).optional().or(z.literal(''));

// Live TV content schema
const liveTVContentSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  channel_number: z.union([z.number().min(1), z.undefined()]),
  channel_category: z.string().optional(),
  provider: z.string().optional(),
  country: z.string().optional(),
  format: z.enum(['DRM', 'M3U8']).optional(),
  video_url: z.string().min(1, i18n.t('seriesManagement.videoUrlRequired')).refine(
    (val) => /^https?:\/\/.+/i.test(val) || val.startsWith('/'),
    i18n.t('seriesManagement.videoUrlRequired')
  ),
  poster_url: urlOrMetadataPath,
  drm_keys: z.string().optional(),
  drm_type: z.enum(['clearkey', 'widevine', 'playready']).optional(),
  license_server_url: z.string().url().optional().or(z.literal('')),
  drm_headers: z.string().optional(),
  active: z.boolean(),
  // LiveTV specific headers
  origin: z.string().optional(),
  user_agent: z.string().optional(),
  referer: z.string().optional(),
  custom_headers: z.string().optional(),
  // Per-channel HTTP proxy (Live TV only). Format: http://user:pass@ip:port
  proxy_url: z.string().regex(/^$|^http:\/\/[^:@]+:[^@]+@[^:]+:\d+$/i, i18n.t('errors.invalidData')).optional(),
  // Per-channel DNS-over-HTTPS resolver
  doh_url: z.string().regex(/^$|^https?:\/\/.+/i, i18n.t('errors.invalidData')).optional()
});

type LiveTVContentData = z.infer<typeof liveTVContentSchema>;

// Simple validation rules for React Hook Form
const validationRules = {
  title: {
    required: i18n.t('manualSeries.titleRequired'),
    minLength: { value: 1, message: i18n.t('manualSeries.titleRequired') }
  },
  video_url: {
    required: i18n.t('seriesManagement.videoUrlRequired'),
    pattern: {
      value: /^(https?:\/\/.+|\/.+)/i,
      message: i18n.t('seriesManagement.videoUrlRequired')
    }
  },
  channel_number: {
    min: { value: 1, message: i18n.t('errors.invalidData') }
  }
};

interface LiveTVContentFormProps {
  contentType: ContentType.TV | ContentType.EVENTS;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export default function LiveTVContentForm({
  contentType,
  open,
  onOpenChange,
  onClose }: LiveTVContentFormProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const form = useForm<LiveTVContentData>({
    resolver: zodResolver(liveTVContentSchema), // Re-enable validation
    mode: 'onBlur', // Validate on blur instead of on change
    defaultValues: {
      title: '',
      description: '',
      channel_number: undefined,
      channel_category: '',
      provider: '',
      country: '',
      format: undefined,
      video_url: '',
      poster_url: '',
      drm_keys: '',
      drm_type: undefined,
      license_server_url: '',
      drm_headers: '',
      active: true,
      // LiveTV specific headers
      origin: '',
      user_agent: '',
      referer: '',
      custom_headers: '',
      proxy_url: '',
      doh_url: ''
    }
  });

  const categoriesQuery = useQuery<string[], Error>({
    queryKey: ['tv-channel-categories', 'options'],
    enabled: open,
    queryFn: async () => {
      const result = await contentService.getTVChannelCategories();
      if (!result.success) {
        throw new Error(result.error.details || t('common.serverError'));
      }
      return (result.data ?? []).map((name) => name.trim()).filter(Boolean);
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0
  });

  const selectedCategoryValue = form.watch('channel_category') || '';

  const channelCategories = useMemo(() => {
    const combined = [...DEFAULT_CHANNEL_CATEGORIES, ...(categoriesQuery.data ?? [])];

    const uniqueMap = new Map<string, string>();
    combined.forEach((rawName) => {
      const name = rawName?.trim();
      if (!name) return;
      uniqueMap.set(name.toLowerCase(), name);
    });

    if (selectedCategoryValue) {
      const normalized = selectedCategoryValue.toLowerCase();
      if (!uniqueMap.has(normalized)) {
        uniqueMap.set(normalized, selectedCategoryValue);
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b));
  }, [categoriesQuery.data, selectedCategoryValue]);

  const isLoadingCategories = categoriesQuery.isLoading && channelCategories.length === 0;

  // Create content mutation
  const createContentMutation = useMutation({
    mutationFn: async (data: LiveTVContentData) => {
      let result;

      if (contentType === ContentType.EVENTS) {
        // For events, use the specialized event endpoint
        result = await contentService.createEvent({
          title: data.title,
          description: data.description,
          image_url: data.poster_url,
          event_type: 'live', // Default event type
          provider: data.provider,
          country: data.country,
          format: data.format,
          drm_keys: data.drm_keys,
          stream_url: data.video_url,
          // Streaming headers
          origin: data.origin,
          user_agent: data.user_agent,
          referer: data.referer,
          custom_headers: data.custom_headers
        });
      } else {
        // For TV channels, use the regular content endpoint
        result = await contentService.createContent({
          ...data,
          type: contentType,
          is_live: contentType === ContentType.TV, // TV channels are live, events might not be
        });
      }

      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', contentType] });
      toast.success(t('createContent.createdSuccess', { type: getContentTypeLabel() }));
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(t('notifications.content.createFailed', { message: error.message }));
    }
  });

  const handleClose = () => {
    onClose();
    form.reset();
    createContentMutation.reset();
  };

  const handleSubmit = (data: LiveTVContentData) => {
    createContentMutation.mutate(data);
  };

  const getContentTypeInfo = () => {
    switch (contentType) {
      case ContentType.TV:
        return {
          icon: Tv,
          title: t('contentTypeExtended.tvChannel'),
          description: t('admin.content.categories.tv.description'),
          color: 'bg-purple-500'
        };
      case ContentType.EVENTS:
        return {
          icon: Calendar,
          title: t('contentTypeExtended.event'),
          description: t('admin.content.categories.events.description'),
          color: 'bg-orange-500'
        };
      default:
        return {
          icon: Tv,
          title: t('contentTypeExtended.content'),
          description: t('common.description'),
          color: 'bg-gray-500'
        };
    }
  };

  const getContentTypeLabel = () => {
    return contentType === ContentType.TV ? t('contentTypeExtended.tvChannel') : t('contentTypeExtended.event');
  };

  const contentInfo = getContentTypeInfo();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <contentInfo.icon className="h-5 w-5" />
            {t('createContent.add', { type: contentInfo.title })}
          </DialogTitle>
          <DialogDescription>
            {contentInfo.description}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {contentInfo.title} {t('common.details')}
              </CardTitle>
              <CardDescription>
                {t('createContent.tv.tvSettingsTitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div>
                <Label htmlFor="title">{t('createContent.labels.title')} *</Label>
                <Input
                  id="title"
                  {...form.register('title', validationRules.title)}
                  placeholder={t('createContent.form.titlePlaceholder')}
                />
                {form.formState.errors.title && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.title.message}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description">{t('createContent.labels.description')}</Label>
                <Textarea
                  id="description"
                  {...form.register('description')}
                  placeholder={t('createContent.form.descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              {/* Channel Number (for TV channels) */}
              {contentType === ContentType.TV && (
                <div>
                  <Label htmlFor="channel_number">{t('createContent.labels.channelNumber')}</Label>
                  <Input
                    id="channel_number"
                    type="number"
                    {...form.register('channel_number', {
                      ...validationRules.channel_number,
                      valueAsNumber: true,
                      setValueAs: (value) => {
                        if (value === '' || value === undefined || value === null) return undefined;
                        const num = Number(value);
                        return isNaN(num) ? undefined : num;
                      }
                    })}
                    placeholder={t('createContent.form.channelNumberPlaceholder')}
                  />
                  {form.formState.errors.channel_number && (
                    <p className="text-sm text-red-600 mt-1">
                      {form.formState.errors.channel_number.message}
                    </p>
                  )}
                </div>
              )}

              {/* Provider */}
              <div>
                <Label htmlFor="provider">{t('createContent.labels.provider')}</Label>
                <Input
                  id="provider"
                  {...form.register('provider')}
                  placeholder={t('createContent.form.providerPlaceholder')}
                />
              </div>

              {/* Channel Category */}
              <div>
                <Label htmlFor="channel_category">{t('createContent.labels.channelCategory')}</Label>
                <Select
                  value={selectedCategoryValue || undefined}
                  onValueChange={(value) => form.setValue('channel_category', value)}
                  disabled={isLoadingCategories}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={isLoadingCategories ? t('createContent.loadingCategories') : t('createContent.form.channelCategoryPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {channelCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Country */}
              <div>
                <Label htmlFor="country">{t('createContent.labels.country')}</Label>
                <Input
                  id="country"
                  {...form.register('country')}
                  placeholder={t('createContent.form.countryPlaceholder')}
                />
              </div>

              {/* Format */}
              <div>
                <Label htmlFor="format">{t('createContent.labels.format')}</Label>
                <Select onValueChange={(value) => form.setValue('format', value as 'DRM' | 'M3U8')}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('createContent.form.formatSelectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M3U8">{t('createContent.form.formatOption.m3u8')}</SelectItem>
                    <SelectItem value="DRM">{t('createContent.form.formatOption.drm')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* DRM Configuration - Show only when DRM format is selected */}
              {form.watch('format') === 'DRM' && (
                <>
                  {/* DRM Type Selector */}
                  <div>
                    <Label htmlFor="drm_type">{t('createContent.labels.drmType')} *</Label>
                    <Select
                      value={form.watch('drm_type') || ''}
                      onValueChange={(value) => form.setValue('drm_type', value as 'clearkey' | 'widevine' | 'playready')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('createContent.form.drmTypePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clearkey">{t('createContent.form.drmType.clearkey')}</SelectItem>
                        <SelectItem value="widevine">{t('createContent.form.drmType.widevine')}</SelectItem>
                        <SelectItem value="playready">{t('createContent.form.drmType.playready')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      {t('createContent.tv.drmTypeHelp')}
                    </p>
                  </div>

                  {/* ClearKey Fields */}
                  {form.watch('drm_type') === 'clearkey' && (
                    <div>
                      <Label htmlFor="drm_keys">{t('createContent.labels.drmKeys')} *</Label>
                      <Textarea
                        id="drm_keys"
                        {...form.register('drm_keys')}
                        placeholder={t('createContent.form.drmPlaceholder')}
                        rows={3}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {t('createContent.tv.drmFormatNote')}
                      </p>
                      {form.formState.errors.drm_keys && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.drm_keys.message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Widevine/PlayReady Fields */}
                  {(form.watch('drm_type') === 'widevine' || form.watch('drm_type') === 'playready') && (
                    <>
                      <div>
                        <Label htmlFor="license_server_url">{t('createContent.labels.licenseServerUrl')} *</Label>
                        <Input
                          id="license_server_url"
                          {...form.register('license_server_url')}
                          placeholder={t('createContent.form.licenseServerUrlPlaceholder')}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {form.watch('drm_type') === 'widevine'
                            ? t('createContent.tv.widevineLicenseHelp')
                            : t('createContent.tv.playreadyLicenseHelp')}
                        </p>
                        {form.formState.errors.license_server_url && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.license_server_url.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="drm_headers">{t('createContent.labels.licenseRequestHeadersOptional')}</Label>
                        <Textarea
                          id="drm_headers"
                          {...form.register('drm_headers')}
                          placeholder={t('createContent.form.licenseHeadersPlaceholder')}
                          rows={3}
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {t('createContent.tv.licenseHeadersHelp')}
                        </p>
                        {form.formState.errors.drm_headers && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.drm_headers.message}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Video URL */}
              <div>
                <Label htmlFor="video_url">{t('createContent.labels.videoUrl')} *</Label>
                <Input
                  id="video_url"
                  {...form.register('video_url', validationRules.video_url)}
                  placeholder={t('createContent.form.videoUrlPlaceholder')}
                />
                {form.formState.errors.video_url && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.video_url.message}
                  </p>
                )}
              </div>

              {/* Logo/Poster URL */}
              <div>
                <Label htmlFor="poster_url">{t('createContent.labels.posterUrl')}</Label>
                <Input
                  id="poster_url"
                  {...form.register('poster_url')}
                  placeholder={t('createContent.form.posterUrlPlaceholder')}
                />
                {form.formState.errors.poster_url && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.poster_url.message}
                  </p>
                )}
              </div>

              {/* Active Status */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="active"
                  {...form.register('active')}
                  className="rounded"
                />
                <Label htmlFor="active">{t('common.active')} {contentInfo.title}</Label>
              </div>
            </CardContent>
          </Card>

          {/* LiveTV Headers Section - For TV channels and Events */}
          {(contentType === ContentType.TV || contentType === ContentType.EVENTS) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  {t('createContent.tv.liveTvTitle')}
                </CardTitle>
                <CardDescription>
                  {t('createContent.tv.customHeadersNote')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertTitle>{t('createContent.tv.liveTvTitle')}</AlertTitle>
                  <AlertDescription>
                    {t('createContent.tv.customHeadersNote')}
                  </AlertDescription>
                </Alert>

                {/* Origin Header */}
                <div>
                  <Label htmlFor="origin">{t('createContent.labels.origin')}</Label>
                  <Input
                    id="origin"
                    {...form.register('origin')}
                    placeholder={t('createContent.form.originPlaceholder')}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('createContent.tv.originNote')}
                  </p>
                </div>

                {/* User-Agent Header */}
                <div>
                  <Label htmlFor="user_agent">{t('createContent.labels.userAgent')}</Label>
                  <Input
                    id="user_agent"
                    {...form.register('user_agent')}
                    placeholder={t('createContent.form.userAgentPlaceholder')}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('createContent.tv.userAgentNote')}
                  </p>
                </div>

                {/* Referer Header */}
                <div>
                  <Label htmlFor="referer">{t('createContent.labels.referer')}</Label>
                  <Input
                    id="referer"
                    {...form.register('referer')}
                    placeholder={t('createContent.form.refererPlaceholder')}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('createContent.tv.refererNote')}
                  </p>
                </div>

                {/* Custom Headers */}
                <div>
                  <Label htmlFor="custom_headers">{t('createContent.labels.customHeaders')}</Label>
                  <Textarea
                    id="custom_headers"
                    {...form.register('custom_headers')}
                    placeholder={t('createContent.form.customHeadersLinesPlaceholder')}
                    rows={3}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('createContent.tv.customHeadersNote')}
                  </p>
                </div>

                {/* HTTP Proxy (Live TV only) */}
                {contentType === ContentType.TV && (
                  <div>
                    <Label htmlFor="proxy_url">{t('createContent.labels.httpProxyOptional')}</Label>
                    <Input
                      id="proxy_url"
                      {...form.register('proxy_url')}
                      placeholder={t('createContent.form.proxyUrlPlaceholder')}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('createContent.tv.proxyHelp')}
                    </p>
                    {form.formState.errors.proxy_url && (
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.proxy_url.message as string}
                      </p>
                    )}
                  </div>
                )}

                {/* DNS-over-HTTPS */}
                {contentType === ContentType.TV && (
                  <div>
                    <Label htmlFor="doh_url">{t('createContent.labels.dohOptional')}</Label>
                    <Input
                      id="doh_url"
                      {...form.register('doh_url')}
                      placeholder={t('createContent.form.dohUrlPlaceholder')}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('createContent.tv.dohHelp')}
                    </p>
                    {form.formState.errors.doh_url && (
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.doh_url.message as string}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createContentMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createContentMutation.isPending}
            >
              {createContentMutation.isPending ? t('createContent.creating') : t('createContent.createButton', { type: getContentTypeLabel() })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
