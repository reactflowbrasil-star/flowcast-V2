'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { contentService } from '@/services';
import { epgService, type EpgSource, type EpgChannelInfo } from '@/services/epg';
import { Content } from '@/types';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { extractErrorMessage } from '@/lib/error-message';
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
  'Spain',
  'USA',
];

interface EpgMappingData {
  epg_source_id?: number;
  epg_channel_id?: string;
  epg_offset_minutes?: number;
}

// Validation schema for TV Channel editing
const editTVChannelSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  logo_url: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  video_url: z.string().url(i18n.t('seriesManagement.videoUrlRequired')),
  channel_number: z.number().min(1).optional(),
  channel_category: z.string().optional(),
  provider: z.string().optional(),
  country: z.string().optional(),
  format: z.enum(['DRM', 'M3U8']).optional(),
  drm_keys: z.string().optional(),
  drm_type: z.enum(['clearkey', 'widevine', 'playready']).optional(),
  license_server_url: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  drm_headers: z.string().optional(),
  active: z.boolean(),
  // LiveTV specific headers
  origin: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  user_agent: z.string().optional(),
  referer: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  custom_headers: z.string().optional(),
  // Per-channel HTTP proxy (Live TV only). Format: http://user:pass@ip:port
  proxy_url: z
    .string()
    .regex(/^$|^http:\/\/[^:@]+:[^@]+@[^:]+:\d+$/i, i18n.t('errors.invalidData'))
    .optional()
    .or(z.literal('')),
  // Per-channel DNS-over-HTTPS resolver
  doh_url: z
    .string()
    .regex(/^$|^https?:\/\/.+/i, i18n.t('errors.invalidData'))
    .optional()
    .or(z.literal(''))});

type EditTVChannelData = z.infer<typeof editTVChannelSchema>;

interface EditTVChannelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content;
  onSuccess: () => void;
}

export default function EditTVChannelDialog({
  isOpen,
  onClose,
  content,
  onSuccess}: EditTVChannelDialogProps) {
  const nsLoadingContent = useLoadNamespace('admin/content');
  const nsLoadingEdit = useLoadNamespace('admin/editTVChannel');
  const nsLoading = nsLoadingContent || nsLoadingEdit;
  const { t, i18n } = useTranslation(['admin/content', 'admin', 'translation', 'admin/editTVChannel']);
  const form = useForm<EditTVChannelData>({
    resolver: zodResolver(editTVChannelSchema),
    defaultValues: {
      title: '',
      description: '',
      logo_url: '',
      video_url: '',
      channel_number: undefined,
      channel_category: '',
      provider: '',
      country: '',
      format: undefined,
      drm_keys: '',
      drm_type: undefined,
      license_server_url: '',
      drm_headers: '',
      // LiveTV headers
      origin: '',
      user_agent: '',
      referer: '',
      custom_headers: '',
      // Per-channel HTTP proxy
      proxy_url: '',
      doh_url: '',
      active: true}});

  const categoriesQuery = useQuery<string[], Error>({
    queryKey: ['tv-channel-categories', 'options'],
    enabled: isOpen,
    queryFn: async () => {
      const result = await contentService.getTVChannelCategories();
      if (!result.success) {
        throw new Error(extractErrorMessage(result.error, t('common.serverError')));
      }
      return (result.data ?? []).map((name) => name.trim()).filter(Boolean);
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0});

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

  // Update TV channel mutation
  const [epgSources, setEpgSources] = useState<EpgSource[]>([]);
  const [epgChannels, setEpgChannels] = useState<EpgChannelInfo[]>([]);
  const [epgSearch, setEpgSearch] = useState<string>('');
  const [selectedEpgSourceId, setSelectedEpgSourceId] = useState<number | undefined>(undefined);
  const [selectedEpgChannelId, setSelectedEpgChannelId] = useState<string>('');
  const [epgOffsetMinutes, setEpgOffsetMinutes] = useState<number>(0);
  const [epgReady, setEpgReady] = useState<boolean>(false);
  const epgInitRef = useRef<boolean>(false);

  // Derived labels for current selections
  const currentEpgSourceName = useMemo(() => {
    if (selectedEpgSourceId == null) return '';
    return epgSources.find((s) => s.id === selectedEpgSourceId)?.name || `ID ${selectedEpgSourceId}`;
  }, [selectedEpgSourceId, epgSources]);
  const currentEpgChannelLabel = useMemo(() => {
    if (!selectedEpgChannelId) return '';
    const ch = epgChannels.find((c) => c.id === selectedEpgChannelId);
    return ch ? `${ch.display_name} (${ch.id})` : selectedEpgChannelId;
  }, [selectedEpgChannelId, epgChannels]);

  const updateTVChannelMutation = useMutation({
    mutationFn: async (data: EditTVChannelData) => {
      // Map to backend format
      const backendData = {
        name: data.title,
        description: data.description || undefined,
        logo_url: data.logo_url || undefined,
        stream_url: data.video_url,
        channel_number: data.channel_number || undefined,
        is_live: true, // TV channels are always live
        channel_category: data.channel_category || undefined,
        provider: data.provider || undefined,
        country: data.country || undefined,
        format: data.format || undefined,
        drm_keys: data.drm_keys || undefined,
        drm_type: data.drm_type || undefined,
        license_server_url: data.license_server_url || undefined,
        drm_headers: data.drm_headers || undefined,
        // LiveTV headers
        origin: data.origin || '',
        user_agent: data.user_agent || '',
        referer: data.referer || '',
        custom_headers: data.custom_headers || '',
        // Per-channel HTTP proxy
        proxy_url: data.proxy_url || '',
        doh_url: data.doh_url || '',
        active: data.active};

      const result = await contentService.updateTVChannel(content.id, backendData);
      if (!result.success) {
        throw new Error(extractErrorMessage(result.error, t('common.serverError')));
      }
      // Patch EPG mapping if any value is set
      await epgService.patchTvChannelEpg(content.id, {
        epg_source_id: selectedEpgSourceId,
        epg_channel_id: selectedEpgChannelId || undefined,
        epg_offset_minutes: epgOffsetMinutes});
      return result.data;
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    }});

  // Load content data into form when dialog opens
  useEffect(() => {
    if (isOpen && content) {
      if (epgInitRef.current) return; // guard per open
      epgInitRef.current = true;

      // Load EPG sources and current mapping
      const initEpg = async () => {
        try {
          const [sourcesRes, mappingRes] = await Promise.all([
            epgService.getSources(),
            epgService.getTvChannelEpg(content.id),
          ]);
          if (sourcesRes.success && sourcesRes.data) {
            setEpgSources(sourcesRes.data);
          }
          if (mappingRes.success && mappingRes.data) {
            const mappingData = mappingRes.data as EpgMappingData;
            const srcId = mappingData.epg_source_id ?? undefined;
            const chId = mappingData.epg_channel_id ?? '';
            const off = mappingData.epg_offset_minutes ?? 0;
            setSelectedEpgSourceId(srcId);
            setSelectedEpgChannelId(chId);
            setEpgOffsetMinutes(off);
            if (srcId != null) {
              const chRes = await epgService.discoverChannels(srcId);
              if (chRes.success && chRes.data) {
                setEpgChannels(chRes.data);
              }
            } else {
              setEpgChannels([]);
            }
          }
        } catch {
          // ignore
        }
      };

      // Fetch content with decrypted URL for editing
      const loadContentForEdit = async () => {
        try {
          const result = await contentService.getContentForEdit(content.id);
          if (result.success) {
            const editableContent = result.data;
            form.setValue('title', editableContent.title);
            form.setValue('description', editableContent.description || '');
            form.setValue('logo_url', editableContent.poster_url || ''); // poster_url maps to logo_url for TV channels
            form.setValue('video_url', (editableContent as any).stream_url || editableContent.video_url || ''); // Backend returns stream_url
            form.setValue('channel_number', editableContent.channel_number || undefined);
            form.setValue('channel_category', editableContent.channel_category || '');
            form.setValue('provider', editableContent.provider || '');
            form.setValue('country', editableContent.country || '');
            form.setValue('format', editableContent.format as 'DRM' | 'M3U8' | undefined);
            form.setValue('drm_keys', editableContent.drm_keys || '');
            form.setValue('drm_type', editableContent.drm_type || undefined);
            form.setValue('license_server_url', editableContent.license_server_url || '');
            form.setValue('drm_headers', editableContent.drm_headers ? JSON.stringify(editableContent.drm_headers) : '');
            form.setValue('proxy_url', editableContent.proxy_url || '');
            form.setValue('doh_url', editableContent.doh_url || '');
            form.setValue('active', editableContent.active);
          } else {
            console.error('Failed to load content for editing:', result.error);
            // Fallback to original content data
            form.setValue('title', content.title);
            form.setValue('description', content.description || '');
            form.setValue('logo_url', content.poster_url || '');
            form.setValue('video_url', (content as any).stream_url || content.video_url || '');
            form.setValue('channel_number', content.channel_number || undefined);
            form.setValue('channel_category', content.channel_category || '');
            form.setValue('provider', content.provider || '');
            form.setValue('country', content.country || '');
            form.setValue('format', content.format as 'DRM' | 'M3U8' | undefined);
            form.setValue('drm_keys', content.drm_keys || '');
            form.setValue('drm_type', content.drm_type || undefined);
            form.setValue('license_server_url', content.license_server_url || '');
            form.setValue('drm_headers', content.drm_headers ? JSON.stringify(content.drm_headers) : '');
            form.setValue('proxy_url', content.proxy_url || '');
            form.setValue('doh_url', content.doh_url || '');
            form.setValue('active', content.active);
          }
        } catch (error) {
          console.error('Error loading content for editing:', error);
          // Fallback to original content data
          form.setValue('title', content.title);
          form.setValue('description', content.description || '');
          form.setValue('logo_url', content.poster_url || '');
          form.setValue('video_url', (content as any).stream_url || content.video_url || '');
          form.setValue('channel_number', content.channel_number || undefined);
          form.setValue('provider', content.provider || '');
          form.setValue('country', content.country || '');
          form.setValue('format', content.format as 'DRM' | 'M3U8' | undefined);
          form.setValue('drm_keys', content.drm_keys || '');
          form.setValue('drm_type', content.drm_type || undefined);
          form.setValue('license_server_url', content.license_server_url || '');
          form.setValue('drm_headers', content.drm_headers ? JSON.stringify(content.drm_headers) : '');
          form.setValue('active', content.active);
        }
      };

      (async () => {
        await initEpg();
        await loadContentForEdit();
        setEpgReady(true);
      })();
    } else if (!isOpen) {
      // reset guard when modal closes
      epgInitRef.current = false;
    }
  }, [isOpen, content]);

  const handleSubmit = (data: EditTVChannelData) => {
    updateTVChannelMutation.mutate(data);
  };

  if (isOpen && nsLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('common.loading')}</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="!max-w-[60vw] !w-[60vw] max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{t('content.editDialogs.channel.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="w-full">
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="rounded-lg border p-4 bg-background">
                <h3 className="text-lg font-semibold mb-3">{t('content.editDialogs.channel.basicInfo')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="col-span-2">
                    <Label htmlFor="title">{t('content.editDialogs.channel.name')}</Label>
                    <Input
                      id="title"
                      {...form.register('title')}
                      placeholder={t('placeholders.enterName', {})}
                    />
                    {form.formState.errors.title && (
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.title.message}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div className="col-span-2">
                    <Label htmlFor="description">{t('content.editDialogs.channel.description')}</Label>
                    <Textarea
                      id="description"
                      {...form.register('description')}
                      placeholder={t('placeholders.enterDescription', {})}
                      rows={3}
                    />
                  </div>

                  {/* Channel Number */}
                  <div>
                    <Label htmlFor="channel_number">{t('content.editDialogs.channel.channelNumber')}</Label>
                    <Input
                      id="channel_number"
                      type="number"
                      {...form.register('channel_number', { valueAsNumber: true })}
                      placeholder={t('admin/editTVChannel:placeholders.channelNumber')}
                    />
                  </div>

                  {/* Provider */}
                  <div>
                    <Label htmlFor="provider">{t('content.editDialogs.channel.provider')}</Label>
                    <Input
                      id="provider"
                      {...form.register('provider')}
                      placeholder={t('admin/editTVChannel:placeholders.provider')}
                    />
                  </div>

                  {/* Channel Category */}
                  <div>
                    <Label htmlFor="channel_category">{t('content.editDialogs.channel.channelCategory')}</Label>
                    <Select
                      value={selectedCategoryValue || undefined}
                      onValueChange={(value) => form.setValue('channel_category', value)}
                      disabled={isLoadingCategories}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={isLoadingCategories ? t('content.editDialogs.channel.epgMapping.loadingControls') : t('placeholders.selectCategory', {})}
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
                    <Label htmlFor="country">{t('content.editDialogs.channel.country')}</Label>
                    <Input
                      id="country"
                      {...form.register('country')}
                      placeholder={t('admin/editTVChannel:placeholders.country')}
                    />
                  </div>
                </div>
              </div>

              {/* Current EPG Mapping Display */}
              <div className="rounded-lg border p-4 bg-background">
                <h3 className="text-lg font-semibold mb-3">{t('content.editDialogs.channel.epgMapping.currentTitle')}</h3>
                <div className="p-4 rounded-lg mb-4 bg-input/20 dark:bg-input/20">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-foreground">{t('content.editDialogs.channel.epgMapping.source')}</label>
                      <div className="mt-1 p-2 bg-background border rounded text-sm">
                        {currentEpgSourceName || t('content.editDialogs.channel.epgMapping.noSource')}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">{t('content.editDialogs.channel.epgMapping.channelId')}</label>
                      <div className="mt-1 p-2 bg-background border rounded text-sm font-mono flex min-w-0 items-center justify-between">
                        <span className="flex-1 min-w-0 truncate">
                          {selectedEpgChannelId || t('content.editDialogs.channel.epgMapping.noChannel')}
                        </span>
                        {!!selectedEpgChannelId && (
                          <Tooltip content={t('admin/editTVChannel:tooltips.copyChannelId')} side="left">
                            <button
                              type="button"
                              className="ml-2 shrink-0 p-1 rounded hover:bg-accent"
                              onClick={() => {
                                navigator.clipboard.writeText(selectedEpgChannelId);
                                toast.success(t('admin/editTVChannel:toasts.epgChannelIdCopied'));
                              }}
                            >
                              <Copy className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">{t('content.editDialogs.channel.epgMapping.status')}</label>
                      <div className="mt-1 p-2 bg-background border rounded text-sm">
                        {epgOffsetMinutes} {t('admin/editTVChannel:hints.minutes')}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">{t('content.editDialogs.channel.epgMapping.status')}</label>
                      <div className="mt-1 p-2 bg-background border rounded text-sm">
                        {selectedEpgSourceId && selectedEpgChannelId ? (
                          <span className="text-green-600 font-medium">{t('content.editDialogs.channel.epgMapping.configured')}</span>
                        ) : (
                          <span className="text-orange-600 font-medium">{t('content.editDialogs.channel.epgMapping.notConfigured')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!epgReady && (
                    <div className="mt-2 text-xs text-muted-foreground">{t('content.editDialogs.channel.epgMapping.loading')}</div>
                  )}
                </div>

                <h4 className="text-md font-medium mb-3">{t('content.editDialogs.channel.epgMapping.editTitle')}</h4>
                {epgReady ? (
                  <>
                    <div className="grid grid-cols-12 gap-4 items-start md:items-end">
                      <div className="col-span-12 md:col-span-3">
                        <Label htmlFor="epg_source">{t('content.editDialogs.channel.epgMapping.source')}</Label>
                        <Select
                          value={selectedEpgSourceId != null ? String(selectedEpgSourceId) : undefined}
                          onValueChange={async (value) => {
                            const id = parseInt(value, 10);
                            setSelectedEpgSourceId(Number.isNaN(id) ? undefined : id);
                            setSelectedEpgChannelId('');
                            setEpgSearch('');
                            if (!Number.isNaN(id)) {
                              const res = await epgService.discoverChannels(id);
                              if (res.success && res.data) setEpgChannels(res.data);
                            } else {
                              setEpgChannels([]);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('placeholders.selectSource', {})} />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Ensure previously selected source is visible even before sources load */}
                            {selectedEpgSourceId != null && !epgSources.some(s => s.id === selectedEpgSourceId) && (
                              <SelectItem key={`sel-${selectedEpgSourceId}`} value={String(selectedEpgSourceId)}>
                                ID {selectedEpgSourceId}
                              </SelectItem>
                            )}
                            {epgSources.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-12 md:col-span-7">
                        <Label htmlFor="epg_channel">{t('content.editDialogs.channel.epgMapping.channel')}</Label>
                        <div className="grid grid-cols-12 gap-2 mt-1">
                          <div className="col-span-12 md:col-span-5 md:max-w-[300px]">
                            <Input
                              className="h-9"
                              id="epg_search"
                              value={epgSearch}
                              onChange={(e) => setEpgSearch(e.target.value)}
                              placeholder={t('admin/editTVChannel:placeholders.filterByNameOrId')}
                              disabled={!selectedEpgSourceId}
                            />
                          </div>
                          <div className="col-span-12 md:col-span-7 md:max-w-[560px]">
                            <Select
                              value={selectedEpgChannelId || undefined}
                              onValueChange={(value) => setSelectedEpgChannelId(value)}
                              disabled={!selectedEpgSourceId}
                            >
                              <SelectTrigger className="h-9 w-full truncate">
                                <SelectValue placeholder={selectedEpgSourceId ? t('placeholders.selectChannel', {}) : t('placeholders.selectSourceFirst', {})} />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Ensure previously selected value is visible even before channels load */}
                                {selectedEpgChannelId && !epgChannels.some(c => c.id === selectedEpgChannelId) && (
                                  <SelectItem key={selectedEpgChannelId} value={selectedEpgChannelId}>{selectedEpgChannelId}</SelectItem>
                                )}
                                {epgChannels
                                  .filter((c) => {
                                    if (!epgSearch.trim()) return true;
                                    const q = epgSearch.toLowerCase();
                                    return c.display_name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
                                  })
                                  .map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.display_name} ({c.id})</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-12 md:col-span-2">
                        <div>
                          <Label htmlFor="epg_offset" className="whitespace-nowrap">{t('admin/editTVChannel:labels.offsetMin')}</Label>
                        </div>
                        <Input
                          id="epg_offset"
                          type="number"
                          value={epgOffsetMinutes}
                          onChange={(e) => setEpgOffsetMinutes(parseInt(e.target.value || '0', 10))}
                          placeholder="0"
                          className="h-9"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{t('content.editDialogs.channel.epgMapping.help')}</p>
                  </>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    {t('content.editDialogs.channel.epgMapping.loadingControls')}
                  </div>
                )}
              </div>

              {/* Stream Settings */}
              <div className="rounded-lg border p-4 bg-background">
                <h3 className="text-lg font-semibold mb-3">{t('content.editDialogs.channel.streamSettings')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Format */}
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="format">{t('content.editDialogs.channel.format')}</Label>
                      <Tooltip content={t('admin/editTVChannel:tooltips.formatHelp')}>
                        <span className="text-xs text-muted-foreground">{t('admin/editTVChannel:tooltips.help')}</span>
                      </Tooltip>
                    </div>
                    <Select
                      value={form.watch('format') ?? undefined}
                      onValueChange={(value) => form.setValue('format', value as 'DRM' | 'M3U8', { shouldDirty: true })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('placeholders.selectFormat', {})} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M3U8">{t('createContent.form.formatOption.m3u8')}</SelectItem>
                        <SelectItem value="DRM">{t('createContent.form.formatOption.drm')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Video URL */}
                  <div className="col-span-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="video_url">{t('content.editDialogs.channel.streamUrl')}</Label>
                      <Tooltip content={t('admin/editTVChannel:tooltips.streamUrlHelp')}>
                        <span className="text-xs text-muted-foreground">{t('admin/editTVChannel:tooltips.help')}</span>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="video_url"
                        {...form.register('video_url')}
                        placeholder={t('admin/editTVChannel:placeholders.streamUrl')}
                        className="flex-1"
                      />
                      <Tooltip content={t('admin/editTVChannel:tooltips.copyStreamUrl')}>
                        <button
                          type="button"
                          className="p-2 border rounded hover:bg-accent"
                          onClick={() => {
                            const v = form.getValues('video_url');
                            if (v) {
                              navigator.clipboard.writeText(v);
                              toast.success(t('admin/editTVChannel:toasts.streamUrlCopied'));
                            }
                          }}
                        >
                          <Copy className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </Tooltip>
                    </div>
                    {form.formState.errors.video_url && (
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.video_url.message}
                      </p>
                    )}
                  </div>

                  {/* DRM Configuration - Show only when DRM format is selected */}
                  {form.watch('format') === 'DRM' && (
                    <>
                      {/* DRM Type Selector */}
                      <div className="col-span-2">
                        <Label htmlFor="drm_type">{t('content.editDialogs.channel.drmType')}</Label>
                        <Select
                          value={form.watch('drm_type') || ''}
                          onValueChange={(value) => form.setValue('drm_type', value as 'clearkey' | 'widevine' | 'playready', { shouldDirty: true })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('placeholders.selectDrmType', {})} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="clearkey">{t('createContent.form.drmType.clearkey')}</SelectItem>
                            <SelectItem value="widevine">{t('createContent.form.drmType.widevine')}</SelectItem>
                            <SelectItem value="playready">{t('createContent.form.drmType.playready')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('admin/editTVChannel:hints.drmTypeHelp')}
                        </p>

                        {/* ClearKey Fields */}
                        {form.watch('drm_type') === 'clearkey' && (
                          <div className="col-span-2">
                            <Label htmlFor="drm_keys">{t('content.editDialogs.channel.clearkeyKeys')}</Label>
                            <Textarea
                              id="drm_keys"
                              {...form.register('drm_keys')}
                              placeholder={t('admin/editTVChannel:placeholders.clearkeyKeys')}
                              rows={3}
                              className="font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('content.editDialogs.channel.clearkeyHelp')}
                            </p>
                          </div>
                        )}

                        {/* Widevine/PlayReady Fields */}
                        {(form.watch('drm_type') === 'widevine' || form.watch('drm_type') === 'playready') && (
                          <>
                            <div className="col-span-2">
                              <Label htmlFor="license_server_url">{t('content.editDialogs.channel.licenseServerUrl')}</Label>
                              <Input
                                id="license_server_url"
                                {...form.register('license_server_url')}
                                placeholder={t('admin/editTVChannel:placeholders.licenseServerUrl')}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                {form.watch('drm_type') === 'widevine'
                                  ? t('admin/editTVChannel:hints.widevineLicenseHelp')
                                  : t('admin/editTVChannel:hints.playreadyLicenseHelp')}
                              </p>
                            </div>

                            <div className="col-span-2">
                              <Label htmlFor="drm_headers">{t('content.editDialogs.channel.licenseHeaders')}</Label>
                              <Textarea
                                id="drm_headers"
                                {...form.register('drm_headers')}
                                placeholder={t('admin/editTVChannel:placeholders.licenseRequestHeaders')}
                                rows={3}
                                className="font-mono text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('content.editDialogs.channel.licenseHeadersHelp')}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Artwork & Status */}
              <div className="rounded-lg border p-4 bg-background">
                <h3 className="text-lg font-semibold mb-3">{t('content.editDialogs.channel.artworkStatus')}</h3>
                <div className="space-y-4">
                  {/* Logo URL */}
                  <div>
                    <Label htmlFor="logo_url">{t('content.editDialogs.channel.logoUrl')}</Label>
                    <Input
                      id="logo_url"
                      {...form.register('logo_url')}
                      placeholder={t('admin/editTVChannel:placeholders.logoUrl')}
                    />
                  </div>

                  {/* Active */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="active"
                      checked={form.watch('active')}
                      onCheckedChange={(checked) => form.setValue('active', checked)}
                    />
                    <Label htmlFor="active">{t('content.editDialogs.channel.active')}</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* LiveTV Headers Configuration */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4 text-foreground">{t('content.editDialogs.channel.liveTvHeaders.title')}</h3>
              <div className="grid grid-cols-12 gap-4">
                {/* Origin */}
                <div className="col-span-12 md:col-span-6">
                  <Label htmlFor="origin">{t('content.editDialogs.channel.liveTvHeaders.origin')}</Label>
                  <Input
                    id="origin"
                    {...form.register('origin')}
                    placeholder={t('admin/editTVChannel:placeholders.originHeader')}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin/editTVChannel:hints.originHeaderHelp')}
                  </p>
                </div>

                {/* User Agent */}
                <div className="col-span-12 md:col-span-6">
                  <Label htmlFor="user_agent">{t('content.editDialogs.channel.liveTvHeaders.userAgent')}</Label>
                  <Input
                    id="user_agent"
                    {...form.register('user_agent')}
                    placeholder={t('admin/editTVChannel:placeholders.userAgent')}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin/editTVChannel:hints.userAgentHelp')}
                  </p>
                </div>

                {/* Referer */}
                <div className="col-span-12 md:col-span-6">
                  <Label htmlFor="referer">{t('content.editDialogs.channel.liveTvHeaders.referer')}</Label>
                  <Input
                    id="referer"
                    {...form.register('referer')}
                    placeholder={t('admin/editTVChannel:placeholders.refererHeader')}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin/editTVChannel:hints.refererHeaderHelp')}
                  </p>
                </div>

                {/* Custom Headers */}
                <div className="col-span-12">
                  <Label htmlFor="custom_headers">{t('content.editDialogs.channel.liveTvHeaders.custom')}</Label>
                  <Textarea
                    id="custom_headers"
                    {...form.register('custom_headers')}
                    placeholder={t('admin/editTVChannel:placeholders.customHeaders')}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin/editTVChannel:hints.customHeadersHelp')}
                  </p>
                </div>

                {/* Proxy URL */}
                <div className="col-span-12 md:col-span-6">
                  <Label htmlFor="proxy_url">{t('content.editDialogs.channel.liveTvHeaders.proxy')}</Label>
                  <Input
                    id="proxy_url"
                    {...form.register('proxy_url')}
                    placeholder={t('admin/editTVChannel:placeholders.httpProxy')}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin/editTVChannel:hints.httpProxyHelp')}
                  </p>
                  {form.formState.errors.proxy_url && (
                    <p className="text-sm text-red-600 mt-1">
                      {form.formState.errors.proxy_url.message as string}
                    </p>
                  )}
                </div>

                {/* DoH URL */}
                <div className="col-span-12 md:col-span-6">
                  <Label htmlFor="doh_url">{t('content.editDialogs.channel.liveTvHeaders.doh')}</Label>
                  <Input
                    id="doh_url"
                    {...form.register('doh_url')}
                    placeholder={t('admin/editTVChannel:placeholders.dohUrl')}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin/editTVChannel:hints.dohUrlHelp')}
                  </p>
                  {form.formState.errors.doh_url && (
                    <p className="text-sm text-red-600 mt-1">
                      {form.formState.errors.doh_url.message as string}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Sticky Footer Actions */}
            {updateTVChannelMutation.error && (
              <p className="text-sm text-red-600">
                {updateTVChannelMutation.error.message}
              </p>
            )}
            <div className="flex justify-end gap-3 sticky bottom-0 bg-background pt-4 border-t mt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('content.editDialogs.channel.cancel')}
              </Button>
              <Button type="submit" disabled={updateTVChannelMutation.isPending}>
                {updateTVChannelMutation.isPending ? t('common.updating') : t('content.editDialogs.channel.save')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
