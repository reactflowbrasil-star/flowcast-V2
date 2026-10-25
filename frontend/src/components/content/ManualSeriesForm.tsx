'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Plus, Trash2 } from 'lucide-react';
import { contentService } from '@/services';
import { ContentType } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { VideoUploadField } from '@/components/ui/video-upload-field';

// Manual series schema
// Manual series schema helper
const createManualSeriesSchema = (t: (key: string) => string) => z.object({
  title: z.string().min(1, t('manualSeries.titleRequired')),
  description: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  poster_url: z.string().refine(
    (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/'),
    t('common.invalidData')
  ).optional().or(z.literal('')),
  backdrop_url: z.string().refine(
    (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/'),
    t('common.invalidData')
  ).optional().or(z.literal('')),
  active: z.boolean()
});

type ManualSeriesData = z.infer<ReturnType<typeof createManualSeriesSchema>>;

interface Season {
  season_number: number;
  title: string;
  episodes: Episode[];
}

interface Episode {
  episode_number: number;
  title: string;
  video_url: string;
}

interface ManualSeriesFormProps {
  contentType: ContentType.SERIES | ContentType.ANIME;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export default function ManualSeriesForm({
  contentType,
  open,
  onOpenChange,
  onClose
}: ManualSeriesFormProps) {
  const { t } = useTranslation();

  // Create reactive schema based on current language
  const manualSeriesSchema = useMemo(() => createManualSeriesSchema(t), [t]);

  const [step, setStep] = useState<'basic' | 'seasons'>('basic');
  const [seasons, setSeasons] = useState<Season[]>([
    {
      season_number: 1,
      title: t('seriesManagement.defaultSeasonTitle', { number: 1 }),
      episodes: [{ episode_number: 1, title: t('seriesManagement.defaultEpisodeTitle', { number: 1 }), video_url: '' }]
    }
  ]);
  const queryClient = useQueryClient();
  const [pendingEpisodeFiles, setPendingEpisodeFiles] = useState<Record<string, File>>({});
  const [pendingEpisodeSubtitles, setPendingEpisodeSubtitles] = useState<Record<string, { file: File; language: string }>>({});

  const form = useForm<ManualSeriesData>({
    resolver: zodResolver(manualSeriesSchema),
    defaultValues: {
      title: '',
      description: '',
      year: undefined,
      poster_url: '',
      backdrop_url: '',
      active: true
    }
  });

  // Create series mutation
  const createSeriesMutation = useMutation({
    mutationFn: async (data: ManualSeriesData & { seasons: Season[] }) => {
      const result = await contentService.createSeries({
        title: data.title,
        description: data.description,
        year: data.year,
        poster_url: data.poster_url,
        backdrop_url: data.backdrop_url,
        active: data.active,
        category_type: contentType === ContentType.ANIME ? 'Anime' : undefined,
        seasons: data.seasons.map(season => ({
          season_number: season.season_number,
          title: season.title,
          episodes: season.episodes.filter(ep => ep.video_url.trim() !== '').map(episode => ({
            episode_number: episode.episode_number,
            title: episode.title,
            video_url: episode.video_url
          }))
        })).filter(season => season.episodes.length > 0)
      });

      if (result.success) {
        const newSeries = result.data;

        // Handle pending video uploads for episodes
        let videoUploadFailures = 0;
        const uploadPromises = Object.entries(pendingEpisodeFiles).map(async ([key, file]) => {
          try {
            const [seasonIdx, episodeIdx] = key.split('-').map(Number);
            const seasonData = data.seasons[seasonIdx];
            const episodeData = seasonData?.episodes?.[episodeIdx];
            if (!seasonData || !episodeData) {
              videoUploadFailures++;
              return;
            }

            const createdSeason = newSeries.seasons?.find((s: any) => s.season_number === seasonData.season_number);
            const createdEpisode = createdSeason?.episodes?.find((e: any) => e.episode_number === episodeData.episode_number);

            if (createdEpisode?.id) {
              await contentService.uploadEpisodeVideo(createdEpisode.id, file);
            } else {
              videoUploadFailures++;
            }
          } catch (e) {
            console.error('Failed to upload video for episode', key, e);
            videoUploadFailures++;
          }
        });

        if (uploadPromises.length > 0) {
          await Promise.all(uploadPromises);
          if (videoUploadFailures > 0) {
            toast.warning(t('createContent.uploadingEpisodesError'));
          } else {
            toast.success(t('createContent.uploadingEpisodesSuccess'));
          }
        }

        // Handle pending subtitle uploads for episodes
        const subtitlePromises = Object.entries(pendingEpisodeSubtitles)
          .filter(([, entry]) => entry && entry.file) // Guard against undefined file
          .map(async ([key, { file, language }]) => {
            try {
              const [seasonIdx, episodeIdx] = key.split('-').map(Number);
              const seasonData = data.seasons[seasonIdx];
              const episodeData = seasonData?.episodes?.[episodeIdx];
              if (!seasonData || !episodeData) return;

              const createdSeason = newSeries.seasons?.find((s: any) => s.season_number === seasonData.season_number);
              const createdEpisode = createdSeason?.episodes?.find((e: any) => e.episode_number === episodeData.episode_number);

              if (createdEpisode?.id) {
                await contentService.uploadEpisodeSubtitle(createdEpisode.id, file, language || 'en');
              }
            } catch (e) {
              console.error('Failed to upload subtitle for episode', key, e);
            }
          });

        if (subtitlePromises.length > 0) {
          await Promise.all(subtitlePromises);
        }

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
    setStep('basic');
    setSeasons([{
      season_number: 1,
      title: t('seriesManagement.defaultSeasonTitle', { number: 1 }),
      episodes: [{ episode_number: 1, title: t('seriesManagement.defaultEpisodeTitle', { number: 1 }), video_url: '' }]
    }]);
    setPendingEpisodeFiles({});
    setPendingEpisodeSubtitles({});
    createSeriesMutation.reset();
  };

  const handleBasicSubmit = () => {
    setStep('seasons');
  };

  const handleFinalSubmit = () => {
    const basicData = form.getValues();
    createSeriesMutation.mutate({
      ...basicData,
      seasons
    });
  };

  const addSeason = () => {
    const newSeasonNumber = seasons.length + 1;
    setSeasons([...seasons, {
      season_number: newSeasonNumber,
      title: t('seriesManagement.defaultSeasonTitle', { number: newSeasonNumber }),
      episodes: [{ episode_number: 1, title: t('seriesManagement.defaultEpisodeTitle', { number: 1 }), video_url: '' }]
    }]);
  };

  const removeSeason = (seasonIndex: number) => {
    if (seasons.length > 1) {
      setSeasons(seasons.filter((_, index) => index !== seasonIndex));
    }
  };

  const addEpisode = (seasonIndex: number) => {
    const newSeasons = [...seasons];
    const newEpisodeNumber = newSeasons[seasonIndex].episodes.length + 1;
    newSeasons[seasonIndex].episodes.push({
      episode_number: newEpisodeNumber,
      title: t('seriesManagement.defaultEpisodeTitle', { number: newEpisodeNumber }),
      video_url: ''
    });
    setSeasons(newSeasons);
  };

  const removeEpisode = (seasonIndex: number, episodeIndex: number) => {
    const newSeasons = [...seasons];
    if (newSeasons[seasonIndex].episodes.length > 1) {
      newSeasons[seasonIndex].episodes.splice(episodeIndex, 1);
      setSeasons(newSeasons);
    }
  };

  const updateEpisode = (seasonIndex: number, episodeIndex: number, field: keyof Episode, value: string) => {
    const newSeasons = [...seasons];
    if (field === 'episode_number') {
      newSeasons[seasonIndex].episodes[episodeIndex][field] = parseInt(value) || 1;
    } else {
      (newSeasons[seasonIndex].episodes[episodeIndex] as Record<keyof Episode, any>)[field] = value;
    }
    setSeasons(newSeasons);
  };

  const updateSeasonTitle = (seasonIndex: number, title: string) => {
    const newSeasons = [...seasons];
    newSeasons[seasonIndex].title = title;
    setSeasons(newSeasons);
  };

  const getContentTypeLabel = () => {
    return contentType === ContentType.SERIES ? t('contentTypeExtended.tvSeries') : t('contentTypeExtended.anime');
  };

  const getValidEpisodesCount = () => {
    return seasons.reduce((total, season) => {
      return total + season.episodes.filter(ep => ep.video_url.trim() !== '').length;
    }, 0);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            {t('manualSeries.addManual', { type: getContentTypeLabel() })}
          </DialogTitle>
          <DialogDescription>
            {t('manualSeries.dialogDescription', { type: getContentTypeLabel().toLowerCase() })}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={step} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">{t('manualSeries.stepBasicInfo')}</TabsTrigger>
            <TabsTrigger value="seasons" disabled={step === 'basic'}>{t('manualSeries.stepSeasonsEpisodes')}</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-6">
            <form onSubmit={form.handleSubmit(handleBasicSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('manualSeries.detailsTitle', { type: getContentTypeLabel() })}</CardTitle>
                  <CardDescription>
                    {t('manualSeries.detailsDescription', { type: getContentTypeLabel().toLowerCase() })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Title */}
                  <div>
                    <Label htmlFor="title">{t('manualSeries.titleRequired')}</Label>
                    <Input
                      id="title"
                      {...form.register('title')}
                      placeholder={t('manualSeries.titlePlaceholder', { type: getContentTypeLabel().toLowerCase() })}
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
                      placeholder={t('manualSeries.descriptionPlaceholder', { type: getContentTypeLabel().toLowerCase() })}
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

                  {/* Active Status */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="active"
                      {...form.register('active')}
                      className="rounded"
                    />
                    <Label htmlFor="active">{t('manualSeries.activeType', { type: getContentTypeLabel() })}</Label>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                >
                  {t('common.cancel')}
                </Button>
                <Button type="submit">
                  {t('manualSeries.nextAddSeasons')}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* Seasons Tab */}
          <TabsContent value="seasons" className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">{t('seriesManagement.seasonsAndEpisodes')}</h3>
                  <p className="text-sm text-gray-600">
                    {t('manualSeries.validEpisodes', { count: getValidEpisodesCount() })}
                  </p>
                </div>
                <Button onClick={addSeason} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('seriesManagement.addSeason')}
                </Button>
              </div>

              {seasons.map((season, seasonIndex) => (
                <Card key={seasonIndex}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Input
                          value={season.title}
                          onChange={(e) => updateSeasonTitle(seasonIndex, e.target.value)}
                          className="font-medium"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => addEpisode(seasonIndex)}
                          variant="outline"
                          size="sm"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          {t('seriesManagement.episodes')}
                        </Button>
                        {seasons.length > 1 && (
                          <Button
                            onClick={() => removeSeason(seasonIndex)}
                            variant="outline"
                            size="sm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {season.episodes.map((episode, episodeIndex) => (
                      <div key={episodeIndex} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-1">
                          <Label className="text-xs">{t('manualSeries.episodeShort', { number: episode.episode_number })}</Label>
                        </div>
                        <div className="col-span-4">
                          <Input
                            placeholder={t('seriesManagement.episodeTitlePlaceholder')}
                            value={episode.title}
                            onChange={(e) => updateEpisode(seasonIndex, episodeIndex, 'title', e.target.value)}
                          />
                        </div>
                        <div className="col-span-6">
                          <VideoUploadField
                            value={episode.video_url}
                            onChange={(value) => updateEpisode(seasonIndex, episodeIndex, 'video_url', value)}
                            onUpload={async (file) => {
                              setPendingEpisodeFiles(prev => ({
                                ...prev,
                                [`${seasonIndex}-${episodeIndex}`]: file
                              }));
                              return `[Pending Upload] ${file.name}`;
                            }}
                            disabled={createSeriesMutation.isPending}
                            placeholder={t('manualSeries.videoUrlOptionalPlaceholder')}
                          />
                          {/* Episode Subtitle (Optional) */}
                          <div className="mt-2 flex gap-2 items-end">
                            <div className="w-[80px]">
                              <Label className="text-xs">{t('common.language')}</Label>
                              <Input
                                value={pendingEpisodeSubtitles[`${seasonIndex}-${episodeIndex}`]?.language || 'en'}
                                onChange={(e) => {
                                  const key = `${seasonIndex}-${episodeIndex}`;
                                  setPendingEpisodeSubtitles(prev => ({
                                    ...prev,
                                    [key]: {
                                      ...prev[key],
                                      language: e.target.value.trim().toLowerCase(),
                                      file: prev[key]?.file
                                    }
                                  }));
                                }}
                                placeholder="en"
                                maxLength={8}
                                className="text-xs h-8"
                              />
                            </div>
                            <div className="flex-1">
                              <Label className="text-xs">{t('createContent.labels.subtitleFile')}</Label>
                              <Input
                                type="file"
                                accept=".srt,.vtt"
                                className="text-xs h-8"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const key = `${seasonIndex}-${episodeIndex}`;
                                    setPendingEpisodeSubtitles(prev => ({
                                      ...prev,
                                      [key]: {
                                        file,
                                        language: prev[key]?.language || 'en'
                                      }
                                    }));
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="col-span-1">
                          {season.episodes.length > 1 && (
                            <Button
                              onClick={() => removeEpisode(seasonIndex, episodeIndex)}
                              variant="outline"
                              size="sm"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('basic')}
              >
                {t('common.back')}
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={createSeriesMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleFinalSubmit}
                  disabled={createSeriesMutation.isPending || getValidEpisodesCount() === 0}
                >
                  {createSeriesMutation.isPending ? t('createContent.creating') : t('manualSeries.createType', { type: getContentTypeLabel() })}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
