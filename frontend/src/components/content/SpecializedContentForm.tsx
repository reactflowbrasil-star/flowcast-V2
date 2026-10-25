'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Search, Heart, Calendar, Baby, Sparkles, Plus, Trash2, AlertCircle, CheckCircle, Star, Film } from 'lucide-react';
import { tmdbService, contentService } from '@/services';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/utils';
import i18n from '@/lib/i18n';
import { ContentType } from '@/types';
import { TMDBSearchResult } from '@/services/tmdb';
import { VideoUploadField } from '@/components/ui/video-upload-field';

// Chapter schema for episodic specialized content
// Helper to validate URLs or local /metadata/ paths
const urlOrMetadataPath = z.string().refine(
  (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/metadata/') || val.startsWith('/api/'),
  i18n.t('errors.invalidData')
).optional().or(z.literal(''));

const chapterSchema = z.object({
  chapter_number: z.number().min(1),
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  video_url: urlOrMetadataPath,
  poster_url: urlOrMetadataPath,
  air_date: z.string().optional()
});



// Base specialized content schema
const baseSpecializedContentSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  poster_url: urlOrMetadataPath,
  backdrop_url: urlOrMetadataPath,
  tmdb_id: z.number().optional(),
  active: z.boolean()
});

// Events Schema (like TV channels with additional fields)
const eventsContentSchema = baseSpecializedContentSchema.extend({
  video_url: z.string().min(1, i18n.t('seriesManagement.videoUrlRequired')).refine(
    (val) => /^https?:\/\/.+/i.test(val) || val.startsWith('/') || val.startsWith('[Pending Upload]'),
    i18n.t('seriesManagement.videoUrlRequired')
  ),
  provider: z.string().optional(),
  country: z.string().optional(),
  format: z.enum(['DRM', 'M3U8']).optional(),
  drm_keys: z.string().optional()
});

// Kids Schema (simple video)
const kidsContentSchema = baseSpecializedContentSchema.extend({
  video_url: z.string().min(1, i18n.t('seriesManagement.videoUrlRequired')).refine(
    (val) => /^https?:\/\/.+/i.test(val) || val.startsWith('/') || val.startsWith('[Pending Upload]'),
    i18n.t('seriesManagement.videoUrlRequired')
  )
});

// Anime Schema (with episodes)
const animeContentSchema = baseSpecializedContentSchema.extend({
  chapters: z.array(chapterSchema).min(1, i18n.t('errors.invalidData'))
});

type SpecializedContentData = {
  title: string;
  description?: string;
  year?: number;
  poster_url?: string;
  backdrop_url?: string;
  tmdb_id?: number;
  active: boolean;
  video_url?: string;
  chapters?: Array<{
    title: string;
    description?: string;
    stream_url?: string;
    image_url?: string;
  }>;
  event_date?: string;
  venue?: string;
  ticket_url?: string;
};

interface SpecializedContentFormProps {
  contentType: ContentType.EVENTS | ContentType.KIDS | ContentType.ANIME;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export default function SpecializedContentForm({
  contentType,
  open,
  onOpenChange,
  onClose
}: SpecializedContentFormProps) {
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [pendingSubtitleFile, setPendingSubtitleFile] = useState<File | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState('en');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTMDBItem, setSelectedTMDBItem] = useState<TMDBSearchResult | null>(null);
  const [activeTab, setActiveTab] = useState(
    (contentType === ContentType.EVENTS) ? 'manual' : 'tmdb'
  );

  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Determine schema based on content type
  const getSchema = () => {
    switch (contentType) {
      case ContentType.EVENTS:
        return eventsContentSchema;
      case ContentType.KIDS:
        return kidsContentSchema;
      case ContentType.ANIME:
        return animeContentSchema;
      default:
        return kidsContentSchema;
    }
  };

  // Get default values based on content type
  const getDefaultValues = () => {
    const base = {
      title: '',
      description: '',
      year: undefined,
      poster_url: '',
      backdrop_url: '',
      tmdb_id: undefined,
      active: true
    };

    switch (contentType) {
      case ContentType.KIDS:
        return { ...base, video_url: '' };
      case ContentType.ANIME:
        return {
          ...base,
          chapters: [
            {
              chapter_number: 1,
              title: t('seriesManagement.defaultEpisodeTitle', { number: 1 }),
              description: '',
              video_url: '',
              poster_url: '',
              air_date: ''
            }
          ]
        };
      case ContentType.EVENTS:
        return {
          ...base,
          video_url: '',
          provider: '',
          country: '',
          format: undefined,
          drm_keys: ''
        };
      default:
        return { ...base, video_url: '' };
    }
  };

  const form = useForm({
    resolver: zodResolver(getSchema()),
    defaultValues: getDefaultValues()
  });

  // Field arrays for episodic content and events
  const { fields: chapterFields, append: appendChapter, remove: removeChapter } = useFieldArray({
    control: form.control,
    name: 'chapters'
  });



  // TMDB Search Query (for Kids and Anime)
  const { data: tmdbResults, isLoading: isSearching, error: searchError } = useQuery({
    queryKey: ['tmdb-search-specialized', searchQuery, contentType],
    queryFn: async () => {
      if (!searchQuery.trim()) return null;

      const result = await tmdbService.searchContent(searchQuery, contentType);
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('common.serverError')));
    },
    enabled: !!searchQuery.trim() && (contentType === ContentType.KIDS || contentType === ContentType.ANIME)
  });

  // Create content mutation
  const createContentMutation = useMutation({
    mutationFn: async (data: SpecializedContentData) => {
      let result;

      switch (contentType) {
        case ContentType.EVENTS: {
          // Map form to CreateEventRequest (stream_url required, event_type required)
          const eventPayload = {
            title: data.title,
            description: data.description,
            image_url: data.poster_url,
            event_type: 'live' as const, // default to 'live'
            provider: (data as any).provider,
            country: (data as any).country,
            format: (data as any).format,
            drm_keys: (data as any).drm_keys,
            stream_url: data.video_url ?? '',
            origin: (data as any).origin,
            user_agent: (data as any).user_agent,
            referer: (data as any).referer,
            custom_headers: (data as any).custom_headers
          };
          result = await contentService.createEvent(eventPayload);
          break;
        }
        case ContentType.ANIME: {
          // If anime has chapters (episodes), create as series with Anime category
          const chapters = (data as any).chapters as Array<{ title: string; video_url: string; episode_number?: number }> | undefined;
          if (chapters && chapters.length > 0) {
            const animeSeriesPayload = {
              title: data.title,
              description: data.description,
              poster_url: data.poster_url,
              backdrop_url: data.backdrop_url,
              tmdb_id: data.tmdb_id,
              year: data.year,
              active: true,
              category_type: 'Anime',
              seasons: [{
                season_number: 1,
                title: data.title,
                episodes: chapters.map((ch, idx) => ({
                  episode_number: ch.episode_number || (idx + 1),
                  title: ch.title,
                  video_url: ch.video_url || '',
                })),
              }],
            };
            result = await contentService.createSeries(animeSeriesPayload);
          } else {
            // Flat anime content without episodes
            const animePayload = {
              title: data.title,
              description: data.description,
              image_url: data.poster_url,
              stream_url: data.video_url ?? '',
              tmdb_id: data.tmdb_id,
              year: data.year
            };
            result = await contentService.createAnimeContent(animePayload);
          }
          break;
        }
        case ContentType.KIDS: {
          const kidsPayload = {
            title: data.title,
            description: data.description,
            image_url: data.poster_url,
            stream_url: data.video_url ?? '',
            tmdb_id: data.tmdb_id,
            year: data.year
          };
          result = await contentService.createKidsContent(kidsPayload);
          break;
        }
        default:
          result = await contentService.createContent({
            title: data.title,
            description: data.description,
            year: data.year,
            poster_url: data.poster_url,
            backdrop_url: data.backdrop_url,
            video_url: data.video_url ?? '',
            type: contentType,
            tmdb_id: data.tmdb_id,
            active: data.active,
            provider: (data as any).provider,
            country: (data as any).country,
            format: (data as any).format,
            drm_keys: (data as any).drm_keys,
            origin: (data as any).origin,
            user_agent: (data as any).user_agent,
            referer: (data as any).referer,
            custom_headers: (data as any).custom_headers,
            proxy_url: (data as any).proxy_url,
            doh_url: (data as any).doh_url
          });
      }

      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', contentType] });
      handleClose();
    }
  });

  const handleClose = () => {
    onClose();
    form.reset();
    setSearchQuery('');
    setSelectedTMDBItem(null);
    setActiveTab(
      (contentType === ContentType.EVENTS) ? 'manual' : 'tmdb'
    );
    createContentMutation.reset();
    setPendingUploadFile(null);
    setPendingSubtitleFile(null);
    setSubtitleLanguage('en');
  };

  const handleTMDBSelect = (item: TMDBSearchResult) => {
    setSelectedTMDBItem(item);

    // Auto-fill form with TMDB data
    form.setValue('title', item.title);
    form.setValue('description', item.overview || '');
    const parsedYear = item.year || (item.release_date ? new Date(item.release_date).getFullYear() : undefined);
    form.setValue('year', (parsedYear && !isNaN(parsedYear)) ? parsedYear : undefined);
    form.setValue('poster_url', item.poster_url || '');
    form.setValue('backdrop_url', item.backdrop_url || '');
    form.setValue('tmdb_id', item.id);

    setActiveTab('manual');
  };

  const addChapter = () => {
    const newChapterNumber = chapterFields.length + 1;
    appendChapter({
      chapter_number: newChapterNumber,
      title: `${t('createContent.chapterLabel')} ${newChapterNumber}`,
      description: '',
      video_url: '',
      poster_url: '',
      air_date: ''
    });
  };



  const handleSubmit = async (data: SpecializedContentData) => {
    try {
      const shouldUploadVideo = !!pendingUploadFile && (contentType === ContentType.KIDS || contentType === ContentType.EVENTS) && data.video_url?.startsWith('[Pending Upload]');

      // Create content (with placeholder video_url if uploading)
      const result = await createContentMutation.mutateAsync({
        ...data,
        video_url: shouldUploadVideo ? '' : data.video_url
      });

      if (!result?.id) throw new Error(t('common.serverError'));

      // Upload video file if pending
      if (shouldUploadVideo && pendingUploadFile) {
        const uploadResult = await contentService.uploadContentVideo(result.id, pendingUploadFile);
        if (!uploadResult.success) {
          toast.error(t('notifications.content.uploadFailed', { message: uploadResult.error?.details }));
        } else {
          toast.success(t('notifications.content.uploadSuccess'));
        }
      }

      // Upload subtitle file if selected
      if (pendingSubtitleFile) {
        const subtitleResult = await contentService.uploadContentSubtitle(
          result.id,
          pendingSubtitleFile,
          subtitleLanguage || 'en'
        );
        if (!subtitleResult.success) {
          toast.error(subtitleResult.error?.details || t('common.serverError'));
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getContentTypeInfo = () => {
    switch (contentType) {
      case ContentType.EVENTS:
        return {
          icon: Calendar,
          title: t('contentTypeExtended.event'),
          description: t('createContent.description', { type: t('contentTypeExtended.event') }),
          color: 'bg-orange-500'
        };
      case ContentType.KIDS:
        return {
          icon: Baby,
          title: t('contentTypeExtended.kidsContent'),
          description: t('createContent.description', { type: t('contentTypeExtended.kidsContent') }),
          color: 'bg-yellow-500'
        };
      case ContentType.ANIME:
        return {
          icon: Sparkles,
          title: t('contentTypeExtended.anime'),
          description: t('createContent.description', { type: t('contentTypeExtended.anime') }),
          color: 'bg-indigo-500'
        };
      default:
        return {
          icon: Heart,
          title: t('contentTypeExtended.content'),
          description: t('createContent.description', { type: t('contentTypeExtended.content') }),
          color: 'bg-gray-500'
        };
    }
  };

  const contentInfo = getContentTypeInfo();
  const showTMDBSearch = contentType === ContentType.KIDS || contentType === ContentType.ANIME;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <contentInfo.icon className="h-5 w-5" />
            {t('createContent.addNew', { type: contentInfo.title })}
          </DialogTitle>
          <DialogDescription>
            {t('createContent.description', { type: contentInfo.title })}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {showTMDBSearch && (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="tmdb">
                <Search className="h-4 w-4 mr-2" />
                {t('createContent.tmdbSearch')}
              </TabsTrigger>
              <TabsTrigger value="manual">
                <contentInfo.icon className="h-4 w-4 mr-2" />
                {t('createContent.manualEntry')}
              </TabsTrigger>
            </TabsList>
          )}

          {/* TMDB Search Tab */}
          {showTMDBSearch && (
            <TabsContent value="tmdb" className="space-y-6">
              {/* Search Input */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    {t('createContent.searchLabel', { type: contentType === ContentType.ANIME ? t('contentTypeExtended.anime') : t('contentTypeExtended.kidsContent') })}
                  </CardTitle>
                  <CardDescription>
                    {t('createContent.dialogDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        id="search"
                        placeholder={t('createContent.searchPlaceholder', { type: contentType === ContentType.ANIME ? t('contentTypeExtended.anime') : t('contentTypeExtended.kidsContent') })}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="text-lg py-3"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab('manual')}
                      className="px-6"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('createContent.manualEntry')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Search Results */}
              {isSearching && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
              )}

              {searchError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('createContent.searchFailed')}
                  </AlertDescription>
                </Alert>
              )}

              {tmdbResults && tmdbResults.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">{t('createContent.searchResults')}</h3>
                    <Badge variant="outline" className="text-sm px-3 py-1">
                      {t('createContent.resultsFound', { count: tmdbResults.length })}
                    </Badge>
                  </div>
                  <div className="grid gap-4 grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 max-h-[60vh] overflow-y-auto pr-2">
                    {tmdbResults.slice(0, 18).map((item) => (
                      <Card
                        key={item.id}
                        className={`cursor-pointer transition-all duration-200 hover:shadow-lg border group ${selectedTMDBItem?.id === item.id
                          ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50 shadow-lg'
                          : 'hover:border-blue-200 hover:bg-gray-50 border-gray-200'
                          }`}
                        onClick={() => handleTMDBSelect(item)}
                      >
                        <CardContent className="p-0">
                          <div className="relative overflow-hidden rounded-t-lg">
                            {item.poster_url ? (
                              <img
                                src={item.poster_url.replace('w500', 'w342')}
                                alt={item.title}
                                className="w-full h-48 object-cover transition-transform duration-200 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-48 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                                <Film className="h-8 w-8 text-gray-400" />
                              </div>
                            )}
                            <div className="absolute top-2 right-2">
                              <Badge variant="secondary" className="bg-black/75 text-white text-xs px-1.5 py-0.5 shadow-lg">
                                <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                                {item.vote_average?.toFixed(1) || t('common.notAvailable')}
                              </Badge>
                            </div>
                            {selectedTMDBItem?.id === item.id && (
                              <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                <CheckCircle className="h-8 w-8 text-blue-600 bg-white rounded-full p-1 shadow-lg" />
                              </div>
                            )}
                          </div>
                          <div className="p-3 space-y-1">
                            <h3 className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.25rem]">
                              {item.title}
                            </h3>
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-blue-600">
                                {item.year || (item.release_date ? new Date(item.release_date).getFullYear() : '?')}
                              </p>
                              <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                                {contentType === ContentType.ANIME ? t('contentTypeExtended.anime') : t('contentTypeExtended.kidsContent')}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                              {item.overview || t('createContent.noDescription')}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {tmdbResults && tmdbResults.length === 0 && searchQuery && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('createContent.noResultsDescription', { type: contentInfo.title, query: searchQuery })}
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          )}

          {/* Manual Entry Tab */}
          <TabsContent value="manual" className="space-y-6">
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {/* Selected TMDB Item Preview */}
              {selectedTMDBItem && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('createContent.metadataLoaded', { title: selectedTMDBItem?.title ?? '', id: selectedTMDBItem?.id ?? '' })}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">
                        {selectedTMDBItem.title}
                      </span>
                      <Badge variant="outline">{t('createContent.idLabel', { id: selectedTMDBItem.id })}</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('createContent.labels', { type: contentInfo.title })}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
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
                        {...form.register('year', {
                          valueAsNumber: true,
                          setValueAs: (value) => value === '' ? undefined : Number(value)
                        })}
                        placeholder={t('createContent.form.yearPlaceholder')}
                      />
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

                  <div className="grid gap-4 md:grid-cols-2">
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

                  {/* Simple video URL for Kids */}
                  {(contentType === ContentType.KIDS) && (
                    <div>
                      <Label htmlFor="video_url">{t('createContent.labels.videoUrl')} *</Label>
                      <VideoUploadField
                        value={form.watch('video_url') || ''}
                        onChange={(value) => {
                          form.setValue('video_url', value);
                        }}
                        onUpload={async (file) => {
                          setPendingUploadFile(file);
                          return `[Pending Upload] ${file.name}`;
                        }}
                        disabled={createContentMutation.isPending}
                        placeholder={t('createContent.form.videoUrlPlaceholder')}
                        error={(form.formState.errors as any)?.video_url?.message}
                      />
                    </div>
                  )}

                  {/* Events specific fields */}
                  {contentType === ContentType.EVENTS && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Provider */}
                        <div>
                          <Label htmlFor="provider">{t('createContent.labels.provider')}</Label>
                          <Input
                            id="provider"
                            {...(form.register as any)('provider')}
                            placeholder={t('createContent.form.providerPlaceholder')}
                          />
                        </div>

                        {/* Country */}
                        <div>
                          <Label htmlFor="country">{t('createContent.labels.country')}</Label>
                          <Input
                            id="country"
                            {...(form.register as any)('country')}
                            placeholder={t('createContent.form.countryPlaceholder')}
                          />
                        </div>
                      </div>

                      {/* Format */}
                      <div>
                        <Label htmlFor="format">{t('createContent.labels.format')}</Label>
                        <select
                          id="format"
                          {...(form.register as any)('format')}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        >
                          <option value="">{t('createContent.form.formatSelectPlaceholder')}</option>
                          <option value="M3U8">{t('createContent.form.formatOption.m3u8')}</option>
                          <option value="DRM">{t('createContent.form.formatOption.drm')}</option>
                        </select>
                      </div>

                      {/* DRM Keys - Show only when DRM format is selected */}
                      {(form.watch as any)('format') === 'DRM' && (
                        <div>
                          <Label htmlFor="drm_keys">{t('createContent.labels.drmKeys')}</Label>
                          <textarea
                            id="drm_keys"
                            {...(form.register as any)('drm_keys')}
                            placeholder={t('createContent.form.drmPlaceholder')}
                            rows={3}
                            className="w-full p-2 border border-gray-300 rounded-md font-mono text-sm"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {t('createContent.tv.drmFormatNote')}
                          </p>
                        </div>
                      )}

                      {/* Stream URL */}
                      <div>
                        <Label htmlFor="video_url">{t('createContent.labels.videoUrl')} *</Label>
                        <VideoUploadField
                          value={form.watch('video_url') || ''}
                          onChange={(value) => {
                            form.setValue('video_url', value);
                          }}
                          onUpload={async (file) => {
                            setPendingUploadFile(file);
                            return `[Pending Upload] ${file.name}`;
                          }}
                          disabled={createContentMutation.isPending}
                          placeholder={t('createContent.form.videoUrlPlaceholder')}
                          error={(form.formState.errors as any)?.video_url?.message}
                        />
                      </div>
                    </>
                  )}

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="active"
                      {...form.register('active')}
                      className="rounded"
                    />
                    <Label htmlFor="active">{t('common.active')} {t('contentType')}</Label>
                  </div>

                  {/* Subtitle Upload (Optional) - Kids and Events */}
                  {(contentType === ContentType.KIDS || contentType === ContentType.EVENTS) && (
                    <div className="rounded-md border p-3 bg-muted/20 space-y-3">
                      <Label className="text-sm font-medium">{t('createContent.labels.externalSubtitleOptional')}</Label>
                      <div className="grid grid-cols-1 md:grid-cols-[110px_1fr] gap-2 items-end">
                        <div>
                          <Label htmlFor="subtitle_language" className="text-xs">{t('common.language')}</Label>
                          <Input
                            id="subtitle_language"
                            value={subtitleLanguage}
                            onChange={(e) => setSubtitleLanguage(e.target.value.trim().toLowerCase())}
                            placeholder={t('createContent.form.subtitleLanguagePlaceholder')}
                            maxLength={16}
                          />
                        </div>
                        <div>
                          <Label htmlFor="subtitle_file" className="text-xs">{t('createContent.labels.subtitleFile')}</Label>
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
                </CardContent>
              </Card>

              {/* Anime Episodes */}
              {contentType === ContentType.ANIME && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{t('createContent.episodesTitle')}</CardTitle>
                        <CardDescription>{t('createContent.episodesDescription')}</CardDescription>
                      </div>
                      <Button type="button" onClick={addChapter} variant="outline">
                        <Plus className="h-4 w-4 mr-2" />
                        {t('createContent.addEpisode')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {chapterFields.map((chapter, index) => (
                        <AccordionItem key={chapter.id} value={`chapter-${index}`}>
                          <AccordionTrigger className="text-left">
                            <div className="flex items-center justify-between w-full mr-4">
                              <span>{t('createContent.chapterLabel', { number: index + 1, title: form.watch(`chapters.${index}.title`) || t('createContent.untitled') })}</span>
                              <Badge variant="outline" className="text-xs">
                                {form.watch(`chapters.${index}.video_url`) ? t('createContent.urlSet') : t('createContent.noUrl')}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-4 pt-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <Label htmlFor={`chapter_title_${index}`}>{contentType === ContentType.ANIME ? t('createContent.episodeTitle') : t('createContent.chapterTitle')}</Label>
                                  <Input
                                    id={`chapter_title_${index}`}
                                    {...form.register(`chapters.${index}.title`)}
                                    placeholder={contentType === ContentType.ANIME ? t('createContent.form.episodeTitlePlaceholder') : t('createContent.form.chapterTitlePlaceholder')}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`chapter_air_date_${index}`}>{t('createContent.labels.airDate')}</Label>
                                  <Input
                                    id={`chapter_air_date_${index}`}
                                    type="date"
                                    {...form.register(`chapters.${index}.air_date`)}
                                  />
                                </div>
                              </div>

                              <div>
                                <Label htmlFor={`chapter_description_${index}`}>{t('createContent.chapterDescriptionLabel')}</Label>
                                <Textarea
                                  id={`chapter_description_${index}`}
                                  {...form.register(`chapters.${index}.description`)}
                                  placeholder={t('createContent.form.chapterDescriptionPlaceholder')}
                                  rows={2}
                                />
                              </div>

                              <div>
                                <Label htmlFor={`chapter_video_url_${index}`}>{t('createContent.labels.videoUrlOptional')}</Label>
                                <Input
                                  id={`chapter_video_url_${index}`}
                                  {...form.register(`chapters.${index}.video_url`)}
                                  placeholder={t('createContent.form.chapterVideoUrlPlaceholder')}
                                />
                              </div>

                              <div>
                                <Label htmlFor={`chapter_poster_url_${index}`}>{t('createContent.labels.chapterPosterUrl')}</Label>
                                <Input
                                  id={`chapter_poster_url_${index}`}
                                  {...form.register(`chapters.${index}.poster_url`)}
                                  placeholder={t('createContent.form.chapterPosterUrlPlaceholder')}
                                />
                              </div>

                              {chapterFields.length > 1 && (
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    onClick={() => removeChapter(index)}
                                    variant="destructive"
                                    size="sm"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {t('createContent.removeChapter')}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              )}



              {/* Error Display */}
              {createContentMutation.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {createContentMutation.error.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Form Actions */}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={handleClose}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={createContentMutation.isPending}
                >
                  {createContentMutation.isPending ? t('createContent.creating') : t('createContent.createButton', { type: contentInfo.title })}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
