'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, AlertCircle, Film, Download, Loader2, Upload, X } from 'lucide-react';
import { useMediaUpload, formatFileSize } from '@/hooks/useMediaUpload';
import { Progress } from '@/components/ui/progress';
import { contentService, tmdbService } from '@/services';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { ContentType } from '@/types';
import { extractErrorMessage } from '@/lib/error-message';
import i18n from '@/lib/i18n';

const isValidVideoUrlOrPath = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^rtmps?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith('/')) return true; // absolute Unix path or API path
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true; // Windows absolute path
  return false;
};

// Validation schema
const createContentSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  poster_url: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  backdrop_url: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  video_url: z
    .string()
    .min(1, i18n.t('seriesManagement.videoUrlRequired'))
    .refine(isValidVideoUrlOrPath, i18n.t('errors.invalidData')),
  tmdb_id: z.number().optional(),
  active: z.boolean(),
  // TV Channel specific fields
  channel_number: z.number().min(1).optional(),
  provider: z.string().optional(),
  country: z.string().optional(),
  format: z.enum(['DRM', 'M3U8']).optional(),
  // DRM fields (all content types)
  drm_keys: z.string().optional(),
  drm_type: z.string().optional(),
  license_server_url: z.string().optional(),
  drm_headers: z.string().optional(),
  // LiveTV specific headers
  origin: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  user_agent: z.string().optional(),
  referer: z.string().url(i18n.t('errors.invalidData')).optional().or(z.literal('')),
  custom_headers: z.string().optional()
});

type CreateContentData = {
  title: string;
  description?: string;
  year?: number;
  poster_url?: string;
  backdrop_url?: string;
  video_url: string;
  tmdb_id?: number;
  active: boolean;
  // TV Channel specific fields
  channel_number?: number;
  provider?: string;
  country?: string;
  format?: 'DRM' | 'M3U8';
  // DRM fields (all content types)
  drm_keys?: string;
  drm_type?: string;
  license_server_url?: string;
  drm_headers?: string;
  // LiveTV specific headers
  origin?: string;
  user_agent?: string;
  referer?: string;
  custom_headers?: string;
};

interface TMDBResult {
  id: number;
  title: string;
  overview?: string;
  release_date?: string;
  poster_url?: string;
  backdrop_url?: string;
  vote_average?: number;
  media_type?: string;
  year?: number;
}

interface CreateContentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: ContentType;
  onSuccess: () => void;
}

export default function CreateContentDialog({
  isOpen,
  onClose,
  contentType,
  onSuccess }: CreateContentDialogProps) {
  const nsLoading = useLoadNamespace('admin/createContent');

  const { t } = useTranslation(['admin/createContent', 'admin', 'translation']);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTMDBItem, setSelectedTMDBItem] = useState<TMDBResult | null>(null);
  const [activeTab, setActiveTab] = useState<'tmdb' | 'manual'>(contentType === ContentType.TV ? 'manual' : 'tmdb');
  const [pendingSubtitleFile, setPendingSubtitleFile] = useState<File | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState('en');

  // Media upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, progress: uploadProgress, isUploading: isUploadingMedia, error: uploadError, cancelUpload } = useMediaUpload();

  // Map content type to category for upload
  const getCategoryForUpload = (): string => {
    switch (contentType) {
      case ContentType.VOD: return 'vod';
      case ContentType.SERIES: return 'series';
      case ContentType.KIDS: return 'kids';
      case ContentType.ANIME: return 'anime';
      case ContentType.EVENTS: return 'events';
      default: return 'vod';
    }
  };

  // Handle file selection for upload
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const category = getCategoryForUpload();
      const tmdbId = form.getValues('tmdb_id');
      const title = form.getValues('title') || file.name;

      const result = await uploadFile(file, category, tmdbId, title);

      // Set the video URL to the uploaded file's URL
      form.setValue('video_url', result.path ?? result.url, { shouldValidate: true });
    } catch (error) {
      // Error is already handled by the hook
      console.error('Upload failed:', error);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const form = useForm<CreateContentData>({
    resolver: zodResolver(createContentSchema),
    defaultValues: {
      title: '',
      description: '',
      year: undefined,
      poster_url: '',
      backdrop_url: '',
      video_url: '',
      tmdb_id: undefined,
      active: true,
      // TV Channel specific fields
      channel_number: undefined,
      provider: '',
      country: '',
      format: undefined,
      drm_keys: '',
      drm_type: '',
      license_server_url: '',
      drm_headers: '',
      // LiveTV specific headers
      origin: '',
      user_agent: '',
      referer: '',
      custom_headers: ''
    }
  });

  // TMDB search query
  const { data: tmdbResults, isLoading: isSearching, error: searchError, refetch: refetchSearch } = useQuery({
    queryKey: ['tmdb-search', searchQuery, contentType],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];

      const result = await tmdbService.searchContent(searchQuery, contentType);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    enabled: !!searchQuery.trim() && activeTab === 'tmdb'
  });

  // Create content mutation
  const createContentMutation = useMutation({
    mutationFn: async (data: CreateContentData) => {
      let result;

      // Use specialized endpoints for Kids and Anime
      if (contentType === ContentType.TV) {
        // Use specialized endpoint for TV Channels with Live TV fields
        const tvData = {
          name: data.title, // Note: API expects 'name' not 'title'
          description: data.description,
          logo_url: data.poster_url, // Note: API expects 'logo_url' not 'image_url'
          stream_url: data.video_url,
          channel_number: data.channel_number,
          provider: data.provider,
          country: data.country,
          format: data.format,
          drm_keys: data.drm_keys,
          origin: data.origin,
          user_agent: data.user_agent,
          referer: data.referer,
          custom_headers: data.custom_headers,
          active: data.active,
          is_live: true, // TV channels are always live
        };
        result = await contentService.createTVChannel(tvData);
      } else {
        // Universal path for VOD, Series, Kids, Anime
        const genericData = {
          ...data,
          type: contentType
        };
        result = await contentService.createContent(genericData);
      }

      if (result.success) {
        const createdContent = result.data as any;
        const createdContentId = Number(createdContent?.id);
        const supportsSubtitleUpload = [
          ContentType.VOD,
          ContentType.SERIES,
          ContentType.KIDS,
          ContentType.ANIME
        ].includes(contentType);

        if (pendingSubtitleFile && supportsSubtitleUpload) {
          if (!Number.isFinite(createdContentId) || createdContentId <= 0) {
            throw new Error(t('common.serverError'));
          }

          const subtitleUploadResult = await contentService.uploadContentSubtitle(
            createdContentId,
            pendingSubtitleFile,
            (subtitleLanguage || 'en').trim().toLowerCase()
          );

          if (!subtitleUploadResult.success) {
            throw new Error(extractErrorMessage(subtitleUploadResult.error, t('common.serverError')));
          }
        }

        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      onSuccess();
      form.reset();
      setSelectedTMDBItem(null);
      setSearchQuery('');
      setPendingSubtitleFile(null);
      setSubtitleLanguage('en');
    }
  });

  // Load TMDB details when item is selected
  const loadTMDBDetails = async (item: TMDBResult) => {
    setSelectedTMDBItem(item);

    // Auto-fill form with TMDB data
    form.setValue('title', item.title);
    form.setValue('description', item.overview || '');
    const parsedYear = item.year || (item.release_date ? new Date(item.release_date).getFullYear() : undefined);
    form.setValue('year', (parsedYear && !isNaN(parsedYear)) ? parsedYear : undefined);
    form.setValue('tmdb_id', item.id);

    if (item.poster_url) {
      form.setValue('poster_url', item.poster_url);
    }
    if (item.backdrop_url) {
      form.setValue('backdrop_url', item.backdrop_url);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // The search will be triggered automatically by the useQuery when searchQuery changes
      // We just need to refetch if needed
      refetchSearch();
    }
  };

  const handleSubmit = (data: CreateContentData) => {
    // Validate required fields
    if (!data.title?.trim() || !data.video_url?.trim()) {
      return;
    }

    createContentMutation.mutate(data);
  };

  // Reset form only when the dialog closes to avoid update loops
  useEffect(() => {
    if (!isOpen) {
      form.reset();
      setSelectedTMDBItem(null);
      setSearchQuery('');
      setActiveTab(contentType === ContentType.TV ? 'manual' : 'tmdb');
      setPendingSubtitleFile(null);
      setSubtitleLanguage('en');
    }
    // Depend only on `isOpen` and `contentType` (form is stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contentType]);

  const getContentTypeLabel = () => {
    switch (contentType) {
      case ContentType.VOD:
        return t('contentType.movie');
      case ContentType.TV:
        return t('contentType.tvChannel');
      case ContentType.SERIES:
        return t('contentType.tvSeries');
      case ContentType.EVENTS:
        return t('contentType.event');
      case ContentType.KIDS:
        return t('contentType.kidsContent');
      case ContentType.ANIME:
        return t('contentType.anime');
      default:
        return t('contentType.content');
    }
  };

  if (isOpen && nsLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('common.loading')}</DialogTitle>
            <DialogDescription>{t('common.loading')}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle>{t('createContent.addNew', { type: getContentTypeLabel() })}</DialogTitle>
          <DialogDescription>
            {t('createContent.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'tmdb' | 'manual')}>
          <TabsList className={`grid w-full h-12 bg-gray-100 p-1 ${contentType === ContentType.TV ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {contentType !== ContentType.TV && (
              <TabsTrigger
                value="tmdb"
                className="flex items-center gap-2 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Search className="h-4 w-4" />
                {t('createContent.tmdbSearch')}
              </TabsTrigger>
            )}
            <TabsTrigger
              value="manual"
              className="flex items-center gap-2 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Film className="h-4 w-4" />
              {t('createContent.manualEntry')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tmdb" className="space-y-6">
            <div className="relative">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('createContent.searchPlaceholder', { type: getContentTypeLabel().toLowerCase() })}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-10 h-12 text-base border-2 focus:border-primary transition-colors"
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="h-12 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('createContent.searching')}
                    </>
                  ) : (
                    t('createContent.searchTmdb')
                  )}
                </Button>
              </div>
            </div>

            {searchError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('createContent.searchFailed')}: {searchError.message}
                </AlertDescription>
              </Alert>
            )}

            {isSearching && (
              <div className="flex flex-col items-center justify-center py-12 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border">
                <div className="relative">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <div className="absolute inset-0 h-8 w-8 rounded-full border-2 border-blue-200 animate-pulse"></div>
                </div>
                <p className="mt-4 text-lg font-medium text-gray-900">{t('createContent.searchingTmdb')}</p>
                <p className="text-sm text-gray-600 mt-1">{t('createContent.findingMatches', { query: searchQuery })}</p>
              </div>
            )}

            {tmdbResults && tmdbResults.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">{t('createContent.searchResults')}</h3>
                  <Badge variant="outline" className="text-sm">
                    {t('createContent.resultsFound', { count: tmdbResults.length })}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 space-y-0">
                  {tmdbResults.map((item) => (
                    <Card
                      key={item.id}
                      className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-2 ${selectedTMDBItem?.id === item.id
                        ? 'ring-2 ring-blue-500 border-blue-200 bg-blue-50'
                        : 'hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      onClick={() => loadTMDBDetails(item)}
                    >
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex-shrink-0">
                            {item.poster_url ? (
                              <Image
                                src={item.poster_url.replace('w500', 'w154')}
                                alt={item.title}
                                width={80}
                                height={112}
                                className="w-20 h-28 object-cover rounded-lg shadow-md"
                              />
                            ) : (
                              <div className="w-20 h-28 bg-gray-200 rounded-lg flex items-center justify-center">
                                <Film className="h-8 w-8 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div>
                              <h4 className="font-semibold text-gray-900 truncate text-base">
                                {item.title}
                              </h4>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {item.year || (item.release_date ? new Date(item.release_date).getFullYear() : t('createContent.unknownYear'))}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {item.media_type === 'movie' ? t('contentType.movie') : t('contentType.tvShow')}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed">
                              {item.overview || t('createContent.noDescription')}
                            </p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-yellow-500">⭐</span>
                                <span className="text-sm font-medium">
                                  {item.vote_average?.toFixed(1) || t('common.notAvailable')}
                                </span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {t('createContent.idLabel', { id: item.id })}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {searchQuery && tmdbResults && tmdbResults.length === 0 && !isSearching && (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <div className="max-w-sm mx-auto">
                  <Film className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('createContent.noResultsFound')}</h3>
                  <p className="text-gray-600 mb-4">
                    {t('createContent.noResultsDescription', { type: getContentTypeLabel().toLowerCase(), query: searchQuery })}
                  </p>
                  <div className="space-y-2 text-sm text-gray-500 mb-4">
                    <p>• {t('createContent.suggestions.tryKeywords')}</p>
                    <p>• {t('createContent.suggestions.checkSpelling')}</p>
                    <p>• {t('createContent.suggestions.useOriginalTitle')}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() => setActiveTab('manual')}
                  >
                    {t('createContent.switchToManual')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('createContent.manualAlert')}
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        {/* Content Form */}
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">{t('createContent.labels.title')} *</Label>
              <Input
                id="title"
                {...form.register('title')}
                placeholder={t('createContent.form.titlePlaceholder')}
              />
              {form.formState.errors.title && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="year">{t('createContent.labels.year')}</Label>
              <Input
                id="year"
                type="number"
                min="1900"
                max={new Date().getFullYear() + 5}
                {...form.register('year', {
                  valueAsNumber: true,
                  setValueAs: (value) => value === '' ? undefined : Number(value)
                })}
                placeholder={t('createContent.form.yearPlaceholder')}
              />
              {form.formState.errors.year && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.year.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="description">{t('createContent.labels.description')}</Label>
            <Textarea
              id="description"
              {...form.register('description')}
              placeholder={t('createContent.form.descriptionPlaceholder')}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="video_url">{t('createContent.labels.videoUrl')} *</Label>
            <div className="relative">
              <Input
                id="video_url"
                {...form.register('video_url')}
                placeholder={t('createContent.form.videoUrlPlaceholder')}
                className="pr-12"
                disabled={isUploadingMedia}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingMedia}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('createContent.uploadVideo')}
              >
                <Upload className="h-5 w-5 text-gray-500 hover:text-blue-600" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept="video/*,.mp4,.mkv,.avi,.mov,.webm,.m4v,.ts"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            {uploadProgress && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{t('createContent.uploading')} {uploadProgress.percentage}%</span>
                  <button
                    type="button"
                    onClick={cancelUpload}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Progress value={uploadProgress.percentage} className="h-2" />
                <span className="text-xs text-gray-500">
                  {formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)}
                </span>
              </div>
            )}
            {uploadError && (
              <p className="text-sm text-red-600 mt-1">{uploadError}</p>
            )}
            {form.formState.errors.video_url && !uploadError && (
              <p className="text-sm text-red-600 mt-1">
                {form.formState.errors.video_url.message}
              </p>
            )}
          </div>

          {contentType !== ContentType.TV && contentType !== ContentType.EVENTS && (
            <div className="rounded-md border p-3 bg-muted/20 space-y-3">
              <Label className="text-sm font-medium">
                {t('manualSeries.subtitlesTitle', { ns: 'translation' })}
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-[110px_1fr] gap-2 items-end">
                <div>
                  <Label htmlFor="subtitle_language" className="text-xs">
                    {t('common.language')}
                  </Label>
                  <Input
                    id="subtitle_language"
                    value={subtitleLanguage}
                    onChange={(e) => setSubtitleLanguage(e.target.value.trim().toLowerCase())}
                    placeholder={t('manualSeries.subtitleLanguagePlaceholder', { ns: 'translation' })}
                    maxLength={16}
                  />
                </div>
                <div>
                  <Label htmlFor="subtitle_file" className="text-xs">
                    {t('manualSeries.subtitleFile', { ns: 'translation' })}
                  </Label>
                  <Input
                    id="subtitle_file"
                    type="file"
                    accept=".srt,.vtt,text/vtt,application/x-subrip"
                    onChange={(e) => setPendingSubtitleFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="poster_url">{t('createContent.labels.posterUrl')}</Label>
              <Input
                id="poster_url"
                {...form.register('poster_url')}
                placeholder={t('createContent.form.posterUrlPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="backdrop_url">{t('createContent.labels.backdropUrl')}</Label>
              <Input
                id="backdrop_url"
                {...form.register('backdrop_url')}
                placeholder={t('createContent.form.backdropUrlPlaceholder')}
              />
            </div>
          </div>

          {/* TV Channel specific fields - only show for TV content */}
          {contentType === ContentType.TV && (
            <>
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">{t('createContent.tv.tvSettingsTitle')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="channel_number">{t('createContent.labels.channelNumber')}</Label>
                    <Input
                      id="channel_number"
                      type="number"
                      {...form.register('channel_number', { valueAsNumber: true })}
                      placeholder={t('createContent.form.channelNumberPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="provider">{t('createContent.labels.provider')}</Label>
                    <Input
                      id="provider"
                      {...form.register('provider')}
                      placeholder={t('createContent.form.providerPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">{t('createContent.labels.country')}</Label>
                    <Input
                      id="country"
                      {...form.register('country')}
                      placeholder={t('createContent.form.countryPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="format">{t('createContent.labels.format')}</Label>
                    <select
                      id="format"
                      {...form.register('format')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">{t('createContent.form.formatSelectPlaceholder')}</option>
                      <option value="M3U8">{t('createContent.form.formatOption.m3u8')}</option>
                      <option value="DRM">{t('createContent.form.formatOption.drm')}</option>
                    </select>
                  </div>
                </div>

                {form.watch('format') === 'DRM' && (
                  <div className="mt-4">
                    <Label htmlFor="drm_keys">{t('createContent.labels.drmKeys')}</Label>
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
                  </div>
                )}
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">{t('createContent.tv.liveTvTitle')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div>
                    <Label htmlFor="custom_headers">{t('createContent.labels.customHeaders')}</Label>
                    <Textarea
                      id="custom_headers"
                      {...form.register('custom_headers')}
                      placeholder={t('createContent.form.customHeadersPlaceholder')}
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('createContent.tv.customHeadersNote')}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* DRM Settings for non-TV content types */}
          {contentType !== ContentType.TV && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🔒</span>
                <h3 className="text-sm font-semibold">{t('createContent.drm.sectionTitle')}</h3>
                <span className="text-xs text-muted-foreground">{t('createContent.drm.optional')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="drm_type_vod">{t('createContent.drm.drmType')}</Label>
                  <select
                    id="drm_type_vod"
                    {...form.register('drm_type')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">{t('createContent.drm.noDrm')}</option>
                    <option value="clearkey">{t('createContent.drm.clearkey')}</option>
                    <option value="widevine">{t('createContent.drm.widevine')}</option>
                    <option value="playready">{t('createContent.drm.playready')}</option>
                  </select>
                </div>
              </div>

              {form.watch('drm_type') === 'clearkey' && (
                <div className="mt-3">
                  <Label htmlFor="drm_keys_vod">{t('createContent.drm.clearKeyKeys')}</Label>
                  <Input
                    id="drm_keys_vod"
                    {...form.register('drm_keys')}
                    placeholder="kid_hex:key_hex"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('createContent.drm.clearKeyFormat')}</p>
                </div>
              )}

              {(form.watch('drm_type') === 'widevine' || form.watch('drm_type') === 'playready') && (
                <div className="mt-3 space-y-3">
                  <div>
                    <Label htmlFor="license_server_url_vod">{t('createContent.drm.licenseServerUrl')}</Label>
                    <Input
                      id="license_server_url_vod"
                      {...form.register('license_server_url')}
                      placeholder="https://license.example.com/wv"
                    />
                  </div>
                  <div>
                    <Label htmlFor="drm_headers_vod">{t('createContent.drm.drmHeadersJson')}</Label>
                    <Textarea
                      id="drm_headers_vod"
                      {...form.register('drm_headers')}
                      placeholder='{"X-Custom-Header": "value"}'
                      rows={2}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('createContent.drm.licenseHeadersNote')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Advanced Stream Settings for non-TV content */}
          {contentType !== ContentType.TV && (
            <details className="border-t pt-4">
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                <span>⚙️</span> {t('createContent.streamHeaders.sectionTitle')}
              </summary>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="origin_vod">{t('createContent.streamHeaders.origin')}</Label>
                  <Input
                    id="origin_vod"
                    {...form.register('origin')}
                    placeholder="https://example.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('createContent.streamHeaders.originNote')}</p>
                </div>
                <div>
                  <Label htmlFor="user_agent_vod">{t('createContent.streamHeaders.userAgent')}</Label>
                  <Input
                    id="user_agent_vod"
                    {...form.register('user_agent')}
                    placeholder="Mozilla/5.0..."
                  />
                </div>
                <div>
                  <Label htmlFor="referer_vod">{t('createContent.streamHeaders.referer')}</Label>
                  <Input
                    id="referer_vod"
                    {...form.register('referer')}
                    placeholder="https://example.com/"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="custom_headers_vod">{t('createContent.streamHeaders.customHeaders')}</Label>
                  <Textarea
                    id="custom_headers_vod"
                    {...form.register('custom_headers')}
                    placeholder='{"X-Custom-Header": "value"}'
                    rows={2}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </details>
          )}

          {selectedTMDBItem && (
            <Alert>
              <Download className="h-4 w-4" />
              <AlertDescription>
                {t('createContent.metadataLoaded', { title: selectedTMDBItem.title, id: selectedTMDBItem.id })}
              </AlertDescription>
            </Alert>
          )}

          {createContentMutation.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {createContentMutation.error.message}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
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
