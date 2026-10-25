'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoUploadField } from '@/components/ui/video-upload-field';
import { Film, Baby, Upload } from 'lucide-react';
import { contentService, tmdbService, TMDBSearchResult } from '@/services';
import { ContentType } from '@/types';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

// Helper to validate URLs or local /metadata/ paths
const urlOrMetadataPath = z.string().refine(
  (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/metadata/') || val.startsWith('/api/'),
  i18n.t('errors.invalidData')
).optional().or(z.literal(''));

// Movie content schema
const movieContentSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  poster_url: urlOrMetadataPath,
  backdrop_url: urlOrMetadataPath,
  video_url: z.string().min(1, i18n.t('seriesManagement.videoUrlRequired')),
  tmdb_id: z.number().optional(),
  active: z.boolean()
});

type MovieContentData = z.infer<typeof movieContentSchema>;

interface MovieContentFormProps {
  contentType: ContentType.VOD | ContentType.KIDS;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export default function MovieContentForm({
  contentType,
  open,
  onOpenChange,
  onClose
}: MovieContentFormProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTMDBItem, setSelectedTMDBItem] = useState<TMDBSearchResult | null>(null);
  const [activeTab, setActiveTab] = useState('tmdb');
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [pendingSubtitleFile, setPendingSubtitleFile] = useState<File | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState('en');
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const form = useForm<MovieContentData>({
    resolver: zodResolver(movieContentSchema),
    defaultValues: {
      title: '',
      description: '',
      year: undefined,
      poster_url: '',
      backdrop_url: '',
      video_url: '',
      tmdb_id: undefined,
      active: true
    }
  });

  // TMDB Search Query
  const { data: tmdbResults, isLoading: isSearching } = useQuery({
    queryKey: ['tmdb-search-movie', searchQuery, contentType],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];

      const result = await tmdbService.searchContent(searchQuery, contentType);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!searchQuery.trim()
  });

  // Create content mutation
  const createContentMutation = useMutation({
    mutationFn: async (data: MovieContentData) => {
      const result = await contentService.createContent({
        ...data,
        type: contentType
      });

      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    }
  });

  const handleClose = () => {
    onClose();
    form.reset();
    setSearchQuery('');
    setSelectedTMDBItem(null);
    setActiveTab('tmdb');
    setPendingUploadFile(null);
    setPendingSubtitleFile(null);
    setSubtitleLanguage('en');
    createContentMutation.reset();
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

  const handleSubmit = async (data: MovieContentData) => {
    try {
      const shouldUploadVideo = !!pendingUploadFile && data.video_url.startsWith('[Pending Upload]');
      const createdContent = await createContentMutation.mutateAsync({
        ...data,
        video_url: shouldUploadVideo ? '' : data.video_url
      });

      if (!createdContent?.id) {
        throw new Error(t('common.serverError'));
      }

      if (shouldUploadVideo && pendingUploadFile) {
        const uploadVideoResult = await contentService.uploadContentVideo(
          createdContent.id,
          pendingUploadFile
        );
        if (!uploadVideoResult.success) {
          throw new Error(uploadVideoResult.error?.details || t('common.serverError'));
        }
      }

      if (pendingSubtitleFile) {
        const uploadSubtitleResult = await contentService.uploadContentSubtitle(
          createdContent.id,
          pendingSubtitleFile,
          subtitleLanguage || 'en'
        );
        if (!uploadSubtitleResult.success) {
          throw new Error(uploadSubtitleResult.error?.details || t('common.serverError'));
        }
      }

      queryClient.invalidateQueries({ queryKey: ['content', contentType] });
      toast.success(t('createContent.createdSuccess', { type: contentType === ContentType.VOD ? t('contentType.movie') : t('contentType.kids') }));
      handleClose();
    } catch (error) {
      toast.error(t('createContent.createFailed', {
        message: error instanceof Error ? error.message : t('common.serverError')
      }));
    }
  };

  const getContentTypeInfo = () => {
    switch (contentType) {
      case ContentType.VOD:
        return {
          icon: Film,
          title: t('contentType.movie'),
          description: t('createContent.description', { type: t('contentType.movie') }),
          color: 'bg-blue-500'
        };
      case ContentType.KIDS:
        return {
          icon: Baby,
          title: t('contentType.kids'),
          description: t('createContent.description', { type: t('contentType.kids') }),
          color: 'bg-green-500'
        };
      default:
        return {
          icon: Film,
          title: t('contentTypeExtended.content'),
          description: t('createContent.description', { type: t('contentTypeExtended.content') }),
          color: 'bg-gray-500'
        };
    }
  };

  const getContentTypeLabel = () => {
    return contentType === ContentType.VOD ? t('contentType.movie') : t('contentType.kids');
  };

  const contentInfo = getContentTypeInfo();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <contentInfo.icon className="h-5 w-5" />
            {t('createContent.add', { type: contentType === ContentType.VOD ? t('contentType.movie') : t('contentType.kids') })}
          </DialogTitle>
          <DialogDescription>
            {t('createContent.description', { type: contentType === ContentType.VOD ? t('contentType.movie') : t('contentType.kids') })}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tmdb">{t('createContent.tmdbSearch')}</TabsTrigger>
            <TabsTrigger value="manual">{t('createContent.manualEntry')}</TabsTrigger>
          </TabsList>

          {/* TMDB Search Tab */}
          <TabsContent value="tmdb" className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="search">
                {t('createContent.searchLabel', { type: contentType === ContentType.KIDS ? t('contentType.kids') : t('contentType.movie') })}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  placeholder={t('createContent.searchPlaceholder', { type: contentType === ContentType.KIDS ? t('contentType.kids') : t('contentType.movie') })}
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

            {tmdbResults && tmdbResults.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">{t('createContent.searchResults')}</h3>
                  <div className="text-sm text-muted-foreground">
                    {t('createContent.resultsFound', { count: tmdbResults.length })}
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 max-h-[60vh] overflow-y-auto pr-2">
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
                            <Image
                              src={item.poster_url.replace('w500', 'w342')}
                              alt={item.title}
                              width={342}
                              height={128}
                              className="w-full h-32 object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-32 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                              <Film className="h-8 w-8 text-gray-400" />
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <div className="bg-black/75 text-white text-xs px-1.5 py-0.5 rounded text-center min-w-[2rem]">
                              ⭐ {item.vote_average?.toFixed(1) || t('common.notAvailable')}
                            </div>
                          </div>
                          {selectedTMDBItem?.id === item.id && (
                            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                              <div className="h-8 w-8 text-blue-600 bg-white rounded-full flex items-center justify-center shadow-lg text-sm font-bold">
                                ✓
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-2 space-y-1">
                          <h3 className="font-semibold text-xs leading-tight line-clamp-2 min-h-[1.5rem]">
                            {item.title}
                          </h3>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-blue-600">
                              {item.year || (item.release_date ? new Date(item.release_date).getFullYear() : t('createSeries.unknownYear', { ns: 'admin/createSeries', defaultValue: '?' }))}
                            </p>
                            <div className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                              {contentType === ContentType.VOD ? t('contentType.movie') : t('contentType.kids')}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.overview || t('createContent.noDescription')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Manual Entry Tab */}
          <TabsContent value="manual" className="space-y-6">
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    {t('createContent.contentDetails')}
                  </CardTitle>
                  <CardDescription>
                    {t('createContent.contentDetailsDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Title */}
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

                  {/* Year */}
                  <div>
                    <Label htmlFor="year">{t('createContent.labels.year')}</Label>
                    <Input
                      id="year"
                      type="number"
                      {...form.register('year', { valueAsNumber: true })}
                      placeholder={t('createContent.form.yearPlaceholder')}
                    />
                  </div>

                  {/* Poster URL */}
                  <div>
                    <Label htmlFor="poster_url">{t('createContent.labels.posterUrl')}</Label>
                    <Input
                      id="poster_url"
                      {...form.register('poster_url')}
                      placeholder={t('createContent.form.posterUrlPlaceholder')}
                    />
                  </div>

                  {/* Backdrop URL */}
                  <div>
                    <Label htmlFor="backdrop_url">{t('createContent.labels.backdropUrl')}</Label>
                    <Input
                      id="backdrop_url"
                      {...form.register('backdrop_url')}
                      placeholder={t('createContent.form.backdropUrlPlaceholder')}
                    />
                  </div>

                  {/* Video URL or Upload */}
                  <div>
                    <Label htmlFor="video_url">{t('createContent.labels.videoUrl')} *</Label>
                    <VideoUploadField
                      value={form.watch('video_url')}
                      onChange={(value) => {
                        form.setValue('video_url', value);
                      }}
                      onUpload={async (file) => {
                        // Store file for later upload after content creation
                        setPendingUploadFile(file);
                        return `[Pending Upload] ${file.name}`;
                      }}
                      disabled={createContentMutation.isPending}
                      placeholder={t('createContent.form.videoUrlPlaceholder')}
                      error={form.formState.errors.video_url?.message}
                    />
                  </div>

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
                </CardContent>
              </Card>

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
                  {createContentMutation.isPending ? t('createContent.creating') : t('createContent.createButton', { type: contentType === ContentType.VOD ? t('contentType.movie') : t('contentType.kids') })}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
