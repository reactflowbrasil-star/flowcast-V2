'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Film, Tv, AlertCircle, CheckCircle, Star } from 'lucide-react';
import { tmdbService, contentService } from '@/services';
import { ContentType } from '@/types';
import { TMDBSearchResult } from '@/services/tmdb';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

// Helper to validate URLs or local /metadata/ paths
const urlOrMetadataPath = z.string().refine(
  (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/metadata/') || val.startsWith('/api/'),
  i18n.t('errors.invalidData')
).optional().or(z.literal(''));

// Validation schema for movie/TV content
const movieTVContentSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  poster_url: urlOrMetadataPath,
  backdrop_url: urlOrMetadataPath,
  video_url: z.string().url(i18n.t('seriesManagement.videoUrlRequired')),
  tmdb_id: z.number().optional(),
  channel_number: z.number().min(1).optional(), // For TV channels
  is_live: z.boolean().optional(), // For TV channels
  provider: z.string().optional(), // For TV channels
  country: z.string().optional(), // For TV channels
  format: z.enum(['DRM', 'M3U8']).optional(), // For TV channels
  active: z.boolean(),
  // LiveTV specific headers (only for TV channels)
  origin: urlOrMetadataPath,
  user_agent: z.string().optional(),
  referer: urlOrMetadataPath,
  custom_headers: z.string().optional()
});

type MovieTVContentData = z.infer<typeof movieTVContentSchema>;

interface MovieTVContentFormProps {
  contentType: ContentType.VOD | ContentType.TV;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export default function MovieTVContentForm({
  contentType,
  open,
  onOpenChange,
  onClose
}: MovieTVContentFormProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTMDBItem, setSelectedTMDBItem] = useState<TMDBSearchResult | null>(null);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [activeTab, setActiveTab] = useState(contentType === ContentType.TV ? 'manual' : 'tmdb');

  const queryClient = useQueryClient();

  const form = useForm<MovieTVContentData>({
    resolver: zodResolver(movieTVContentSchema),
    defaultValues: {
      title: '',
      description: '',
      year: undefined,
      poster_url: '',
      backdrop_url: '',
      video_url: '',
      tmdb_id: undefined,
      channel_number: undefined,
      is_live: contentType === ContentType.TV,
      provider: '',
      country: '',
      format: undefined,
      // LiveTV headers
      origin: '',
      user_agent: '',
      referer: '',
      custom_headers: '',
      active: true
    }
  });

  // TMDB Search Query
  const { data: tmdbResults, isLoading: isSearching, error: searchError } = useQuery({
    queryKey: ['tmdb-search', searchQuery, contentType],
    queryFn: async () => {
      if (!searchQuery.trim()) return null;

      const result = await tmdbService.searchContent(searchQuery, contentType);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!searchQuery.trim() && !useManualEntry
  });

  // Create content mutation
  const createContentMutation = useMutation({
    mutationFn: async (data: MovieTVContentData) => {
      let result;

      if (contentType === ContentType.TV) {
        // Use TV channel creation for TV content with headers support
        const tvChannelData = {
          name: data.title,
          description: data.description,
          logo_url: data.poster_url,
          stream_url: data.video_url,
          channel_number: data.channel_number,
          is_live: data.is_live || true,
          provider: data.provider,
          country: data.country,
          format: data.format,
          drm_keys: undefined, // Not supported in this form
          active: data.active,
          // LiveTV headers
          origin: data.origin,
          user_agent: data.user_agent,
          referer: data.referer,
          custom_headers: data.custom_headers
        };
        result = await contentService.createTVChannel(tvChannelData);
      } else {
        // Use regular content creation for movies
        result = await contentService.createContent({
          ...data,
          type: contentType
        });
      }

      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
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
    setUseManualEntry(false);
    setActiveTab(contentType === ContentType.TV ? 'manual' : 'tmdb');
    createContentMutation.reset();
  };

  const handleTMDBSelect = (item: TMDBSearchResult) => {
    setSelectedTMDBItem(item);

    // Auto-fill form with TMDB data
    form.setValue('title', item.title);
    form.setValue('description', item.overview || '');
    form.setValue('year', item.year || new Date(item.release_date || '').getFullYear());
    form.setValue('poster_url', item.poster_url || '');
    form.setValue('backdrop_url', item.backdrop_url || '');
    form.setValue('tmdb_id', item.id);
  };

  const handleSubmit = (data: MovieTVContentData) => {
    createContentMutation.mutate(data);
  };

  const isMovie = contentType === ContentType.VOD;
  const isTV = contentType === ContentType.TV;
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isMovie ? <Film className="h-5 w-5" /> : <Tv className="h-5 w-5" />}
            {t('createContent.addNew', { type: isMovie ? t('contentType.movie') : t('contentType.tvChannel') })}
          </DialogTitle>
          <DialogDescription>
            {t('createContent.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${isTV ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {!isTV && (
              <TabsTrigger value="tmdb">
                <Search className="h-4 w-4 mr-2" />
                {t('createContent.tmdbSearch')}
              </TabsTrigger>
            )}
            <TabsTrigger value="manual">
              <Film className="h-4 w-4 mr-2" />
              {t('createContent.manualEntry')}
            </TabsTrigger>
          </TabsList>

          {/* TMDB Search Tab */}
          <TabsContent value="tmdb" className="space-y-6">
            {isMovie && (
              <>
                {/* Search Input */}
                <div className="space-y-2">
                  <Label htmlFor="search">{t('createContent.tmdbSearch')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="search"
                      placeholder={t('createContent.searchPlaceholder', { type: t('contentType.movie') })}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab('manual')}
                    >
                      {t('createContent.manualEntry')}
                    </Button>
                  </div>
                </div>

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
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {tmdbResults.slice(0, 6).map((item) => (
                      <Card
                        key={item.id}
                        className={`cursor-pointer transition-all hover:shadow-lg ${selectedTMDBItem?.id === item.id ? 'ring-2 ring-blue-500' : ''
                          }`}
                        onClick={() => handleTMDBSelect(item)}
                      >
                        <CardContent className="p-4">
                          <div className="flex gap-3">
                            {item.poster_url && (
                              <Image
                                src={item.poster_url.replace('w500', 'w92')}
                                alt={item.title}
                                width={64}
                                height={96}
                                className="w-16 h-24 object-cover rounded"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium truncate">{item.title}</h3>
                              <p className="text-sm text-muted-foreground">
                                {item.year || new Date(item.release_date || '').getFullYear()}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  <Star className="h-3 w-3 mr-1" />
                                  {item.vote_average?.toFixed(1) || t('common.notAvailable')}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                {item.overview}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {tmdbResults && tmdbResults.length === 0 && searchQuery && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('createContent.noResultsDescription', { type: t('contentType.movie'), query: searchQuery })}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </TabsContent>

          {/* Manual Entry Tab */}
          <TabsContent value="manual" className="space-y-6">
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {/* Selected TMDB Item Preview */}
              {selectedTMDBItem && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('createContent.searchResults')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">
                        {selectedTMDBItem.title}
                      </span>
                      <Badge variant="outline">
                        {t('createContent.idLabel', { id: selectedTMDBItem.id })}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Basic Information */}
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

                {isMovie && (
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
                    {form.formState.errors.year && (
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.year.message}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* TV Channel Specific Fields */}
              {isTV && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="channel_number">{t('createContent.labels.channelNumber')}</Label>
                      <Input
                        id="channel_number"
                        type="number"
                        {...form.register('channel_number', { valueAsNumber: true })}
                        placeholder={t('createContent.form.channelNumberPlaceholder')}
                      />
                      {form.formState.errors.channel_number && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.channel_number.message}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 pt-6">
                      <input
                        type="checkbox"
                        id="is_live"
                        {...form.register('is_live')}
                        className="rounded"
                      />
                      <Label htmlFor="is_live">{t('createContent.labels.liveChannel')}</Label>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label htmlFor="provider">{t('createContent.labels.provider')}</Label>
                      <Input
                        id="provider"
                        {...form.register('provider')}
                        placeholder={t('createContent.form.providerPlaceholder')}
                      />
                      {form.formState.errors.provider && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.provider.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="country">{t('createContent.labels.country')}</Label>
                      <Input
                        id="country"
                        {...form.register('country')}
                        placeholder={t('createContent.form.countryPlaceholder')}
                      />
                      {form.formState.errors.country && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.country.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="format">{t('createContent.labels.format')}</Label>
                      <select
                        id="format"
                        {...form.register('format')}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">{t('createContent.form.formatSelectPlaceholder')}</option>
                        <option value="M3U8">{t('format.m3u8')}</option>
                        <option value="DRM">{t('format.drm')}</option>
                      </select>
                      {form.formState.errors.format && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.format.message}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* LiveTV Headers Configuration */}
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                    <h4 className="text-md font-semibold mb-3 text-gray-900">{t('createContent.tv.liveTvTitle')}</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Origin */}
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

                      {/* User Agent */}
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

                      {/* Referer */}
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
                          placeholder={t('createContent.form.customHeadersPlaceholder')}
                          rows={3}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {t('createContent.tv.customHeadersNote')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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

              {/* URLs */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="video_url">{t('createContent.labels.videoUrl')} *</Label>
                  <Input
                    id="video_url"
                    {...form.register('video_url')}
                    placeholder={t('createContent.form.videoUrlPlaceholder')}
                  />
                  {form.formState.errors.video_url && (
                    <p className="text-sm text-red-600 mt-1">
                      {form.formState.errors.video_url.message}
                    </p>
                  )}
                </div>

                {isMovie ? (
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
                ) : (
                  <div>
                    <Label htmlFor="poster_url">{t('createContent.labels.posterUrl')}</Label>
                    <Input
                      id="poster_url"
                      {...form.register('poster_url')}
                      placeholder={t('createContent.form.posterUrlPlaceholder')}
                    />
                  </div>
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
                <Label htmlFor="active">{t('common.active')} {t('contentType')}</Label>
              </div>

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
                  {createContentMutation.isPending ? t('createContent.creating') : t('createContent.createButton', { type: isMovie ? t('contentType.movie') : t('contentType.tvChannel') })}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
