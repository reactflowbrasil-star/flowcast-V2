'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Search, Play, Plus, Trash2, AlertCircle, CheckCircle, Star } from 'lucide-react';
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

// Episode schema
const episodeSchema = z.object({
  episode_number: z.number().min(1),
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  video_url: z.string().url(i18n.t('seriesManagement.videoUrlRequired')),
  poster_url: urlOrMetadataPath,
  runtime: z.number().min(1).optional()});

// Season schema
const seasonSchema = z.object({
  season_number: z.number().min(1),
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  poster_url: urlOrMetadataPath,
  episodes: z.array(episodeSchema).min(1, i18n.t('errors.invalidData'))});

// Series schema
const seriesSchema = z.object({
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 5).optional(),
  poster_url: urlOrMetadataPath,
  backdrop_url: urlOrMetadataPath,
  tmdb_id: z.number().optional(),
  active: z.boolean(),
  seasons: z.array(seasonSchema).min(1, i18n.t('errors.invalidData'))});

type SeriesData = z.infer<typeof seriesSchema>;
// type SeasonData = z.infer<typeof seasonSchema>;
// type EpisodeData = z.infer<typeof episodeSchema>;

interface SeriesManagementInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export default function SeriesManagementInterface({ 
  open, 
  onOpenChange, 
  onClose 
}: SeriesManagementInterfaceProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTMDBSeries, setSelectedTMDBSeries] = useState<TMDBSearchResult | null>(null);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [activeTab, setActiveTab] = useState('tmdb');
  const [currentSeasonTab, setCurrentSeasonTab] = useState('0');
  
  const queryClient = useQueryClient();

  const form = useForm<SeriesData>({
    resolver: zodResolver(seriesSchema),
    defaultValues: {
      title: '',
      description: '',
      year: undefined,
      poster_url: '',
      backdrop_url: '',
      tmdb_id: undefined,
      active: true,
      seasons: [
        {
          season_number: 1,
          title: t('seriesManagement.defaultSeasonTitle', { number: 1 }),
          description: '',
          poster_url: '',
          episodes: [
            {
              episode_number: 1,
              title: t('seriesManagement.defaultEpisodeTitle', { number: 1 }),
              description: '',
              video_url: '',
              poster_url: '',
              runtime: undefined}
          ]
        }
      ]}});

  const { fields: seasonFields, append: appendSeason, remove: removeSeason } = useFieldArray({
    control: form.control,
    name: 'seasons'});

  // TMDB Search Query
  const { data: tmdbResults, isLoading: isSearching, error: searchError } = useQuery({
    queryKey: ['tmdb-search-tv', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return null;
      
      const result = await tmdbService.searchContent(searchQuery, ContentType.SERIES);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!searchQuery.trim() && !useManualEntry});

  // Get TMDB series details
  const { data: tmdbSeriesDetails } = useQuery({
    queryKey: ['tmdb-tv-details', selectedTMDBSeries?.id],
    queryFn: async () => {
      if (!selectedTMDBSeries?.id) return null;
      
      const result = await tmdbService.getTVDetails(selectedTMDBSeries.id);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!selectedTMDBSeries?.id});

  // Create series mutation
  const createSeriesMutation = useMutation({
    mutationFn: async (data: SeriesData) => {
      const result = await contentService.createSeries(data);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', ContentType.SERIES] });
      handleClose();
    }});

  const handleClose = () => {
    onClose();
    form.reset();
    setSearchQuery('');
    setSelectedTMDBSeries(null);
    setUseManualEntry(false);
    setActiveTab('tmdb');
    setCurrentSeasonTab('0');
    createSeriesMutation.reset();
  };

  const handleTMDBSelect = (series: TMDBSearchResult) => {
    setSelectedTMDBSeries(series);

    // Auto-fill form with TMDB data
    form.setValue('title', series.title);
    form.setValue('description', series.overview || '');
    form.setValue('year', series.year || new Date(series.release_date || '').getFullYear());
    form.setValue('poster_url', series.poster_url || '');
    form.setValue('backdrop_url', series.backdrop_url || '');
    form.setValue('tmdb_id', series.id);

    setActiveTab('manual');
  };

  // Auto-populate seasons from TMDB details
  useEffect(() => {
    if (tmdbSeriesDetails && selectedTMDBSeries) {
      const seasons = tmdbSeriesDetails.seasons
        .filter(season => season.season_number > 0) // Skip specials
        .map(season => ({
          season_number: season.season_number,
          title: season.name,
          description: season.overview || '',
          poster_url: season.poster_path ? `https://image.tmdb.org/t/p/w500${season.poster_path}` : '',
          episodes: Array.from({ length: season.episode_count }, (_, i) => ({
            episode_number: i + 1,
            title: t('seriesManagement.defaultEpisodeTitle', { number: i + 1 }),
            description: '',
            video_url: '',
            poster_url: '',
            runtime: undefined}))
        }));
      
      form.setValue('seasons', seasons);
    }
  }, [tmdbSeriesDetails, selectedTMDBSeries, form]);

  const addSeason = () => {
    const newSeasonNumber = seasonFields.length + 1;
    appendSeason({
      season_number: newSeasonNumber,
      title: t('seriesManagement.defaultSeasonTitle', { number: newSeasonNumber }),
      description: '',
      poster_url: '',
      episodes: [
        {
          episode_number: 1,
          title: t('seriesManagement.defaultEpisodeTitle', { number: 1 }),
          description: '',
          video_url: '',
          poster_url: '',
          runtime: undefined}
      ]
    });
    setCurrentSeasonTab((seasonFields.length).toString());
  };

  const addEpisodeToSeason = (seasonIndex: number) => {
    const currentEpisodes = form.getValues(`seasons.${seasonIndex}.episodes`);
    const newEpisodeNumber = currentEpisodes.length + 1;
    
    form.setValue(`seasons.${seasonIndex}.episodes`, [
      ...currentEpisodes,
      {
        episode_number: newEpisodeNumber,
        title: t('seriesManagement.defaultEpisodeTitle', { number: newEpisodeNumber }),
        description: '',
        video_url: '',
        poster_url: '',
        runtime: undefined}
    ]);
  };

  const removeEpisodeFromSeason = (seasonIndex: number, episodeIndex: number) => {
    const currentEpisodes = form.getValues(`seasons.${seasonIndex}.episodes`);
    const updatedEpisodes = currentEpisodes.filter((_, i) => i !== episodeIndex);
    form.setValue(`seasons.${seasonIndex}.episodes`, updatedEpisodes);
  };

  const handleSubmit = (data: SeriesData) => {
    createSeriesMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            {t('seriesManagement.addSeriesContent')}
          </DialogTitle>
          <DialogDescription>
            {t('seriesManagement.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tmdb">
              <Search className="h-4 w-4 mr-2" />
              {t('createContent.tmdbSearch')}
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Play className="h-4 w-4 mr-2" />
              {t('seriesManagement.seriesStructure')}
            </TabsTrigger>
          </TabsList>

          {/* TMDB Search Tab */}
          <TabsContent value="tmdb" className="space-y-6">
            {/* Search Input */}
            <div className="space-y-2">
              <Label htmlFor="search">{t('seriesManagement.searchTvSeries')}</Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  placeholder={t('seriesManagement.enterSeriesTitleEllipsis')}
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
                  {t('seriesManagement.tmdbSearchFailed')}
                </AlertDescription>
              </Alert>
            )}

            {tmdbResults && tmdbResults.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tmdbResults.slice(0, 6).map((series) => (
                  <Card 
                    key={series.id} 
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      selectedTMDBSeries?.id === series.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => handleTMDBSelect(series)}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        {series.poster_url && (
                          <Image
                            src={series.poster_url.replace('w500', 'w92')}
                            alt={series.title}
                            width={64}
                            height={96}
                            className="w-16 h-24 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">{series.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {series.year || new Date(series.release_date || '').getFullYear()}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              {series.vote_average?.toFixed(1) || t('seriesManagement.notAvailable')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {series.overview}
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
                  {t('seriesManagement.noSeriesFound', { query: searchQuery })}
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Manual Entry Tab */}
          <TabsContent value="manual" className="space-y-6">
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {/* Selected TMDB Item Preview */}
              {selectedTMDBSeries && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('seriesManagement.selectedFromTmdb')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">{selectedTMDBSeries.title}</span>
                      <Badge variant="outline">{t('seriesManagement.tmdbId', { id: selectedTMDBSeries.id })}</Badge>
                      {tmdbSeriesDetails && (
                        <Badge variant="secondary">
                          {t('seriesManagement.seasonsCount', { count: tmdbSeriesDetails.seasons.filter(s => s.season_number > 0).length })}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Basic Series Information */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('seriesManagement.seriesInformation')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="title">{t('seriesManagement.seriesTitleRequired')}</Label>
                      <Input
                        id="title"
                        {...form.register('title')}
                        placeholder={t('seriesManagement.enterSeriesTitle')}
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
                        {...form.register('year', { valueAsNumber: true })}
                        placeholder={t('seriesManagement.firstAirDateYear')}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="description">{t('createContent.labels.description')}</Label>
                    <Textarea
                      id="description"
                      {...form.register('description')}
                      placeholder={t('seriesManagement.seriesDescriptionPlaceholder')}
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

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="active"
                      {...form.register('active')}
                      className="rounded"
                    />
                    <Label htmlFor="active">{t('seriesManagement.activeSeries')}</Label>
                  </div>
                </CardContent>
              </Card>

              {/* Seasons and Episodes Management */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{t('seriesManagement.seasonsAndEpisodes')}</CardTitle>
                      <CardDescription>
                        {t('seriesManagement.manageSeasonsAndEpisodes')}
                      </CardDescription>
                    </div>
                    <Button type="button" onClick={addSeason} variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('seriesManagement.addSeason')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {seasonFields.length > 0 && (
                    <Tabs value={currentSeasonTab} onValueChange={setCurrentSeasonTab}>
                      <TabsList className="grid w-full grid-cols-4 lg:grid-cols-6">
                        {seasonFields.map((season, index) => (
                          <TabsTrigger key={season.id} value={index.toString()}>
                            {t('seriesManagement.seasonTab', { number: season.season_number })}
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {seasonFields.map((season, seasonIndex) => (
                        <TabsContent key={season.id} value={seasonIndex.toString()} className="space-y-4 mt-6">
                          {/* Season Information */}
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <Label htmlFor={`season_title_${seasonIndex}`}>{t('seriesManagement.seasonTitle')}</Label>
                              <Input
                                id={`season_title_${seasonIndex}`}
                                {...form.register(`seasons.${seasonIndex}.title`)}
                                placeholder={t('seriesManagement.seasonTitlePlaceholder')}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`season_poster_${seasonIndex}`}>{t('seriesManagement.seasonPosterUrl')}</Label>
                              <Input
                                id={`season_poster_${seasonIndex}`}
                                {...form.register(`seasons.${seasonIndex}.poster_url`)}
                                placeholder={t('seriesManagement.seasonPosterPlaceholder')}
                              />
                            </div>
                          </div>

                          <div>
                            <Label htmlFor={`season_description_${seasonIndex}`}>{t('seriesManagement.seasonDescription')}</Label>
                            <Textarea
                              id={`season_description_${seasonIndex}`}
                              {...form.register(`seasons.${seasonIndex}.description`)}
                              placeholder={t('seriesManagement.seasonDescriptionPlaceholder')}
                              rows={2}
                            />
                          </div>

                          {/* Episodes */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{t('seriesManagement.episodes')}</h4>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  onClick={() => addEpisodeToSeason(seasonIndex)}
                                  variant="outline"
                                  size="sm"
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  {t('seriesManagement.addEpisode')}
                                </Button>
                                {seasonFields.length > 1 && (
                                  <Button
                                    type="button"
                                    onClick={() => removeSeason(seasonIndex)}
                                    variant="destructive"
                                    size="sm"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {t('seriesManagement.removeSeason')}
                                  </Button>
                                )}
                              </div>
                            </div>

                            <EpisodeList
                              seasonIndex={seasonIndex}
                              form={form}
                              onRemoveEpisode={removeEpisodeFromSeason}
                            />
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  )}
                </CardContent>
              </Card>

              {/* Error Display */}
              {createSeriesMutation.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {createSeriesMutation.error.message}
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
                  disabled={createSeriesMutation.isPending}
                >
                  {createSeriesMutation.isPending ? t('createContent.creating') : t('seriesManagement.createSeries')}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Episode List Component
interface EpisodeListProps {
  seasonIndex: number;
  form: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onRemoveEpisode: (seasonIndex: number, episodeIndex: number) => void;
}

function EpisodeList({ seasonIndex, form, onRemoveEpisode }: EpisodeListProps) {
  const { t } = useTranslation();
  const episodes = form.watch(`seasons.${seasonIndex}.episodes`) || []; // eslint-disable-line @typescript-eslint/no-explicit-any

  return (
    <Accordion type="single" collapsible className="w-full">
      {episodes.map((episode: any, episodeIndex: number) => (
        <AccordionItem key={episodeIndex} value={`episode-${episodeIndex}`}>
          <AccordionTrigger className="text-left">
            <div className="flex items-center justify-between w-full mr-4">
              <span>{t('seriesManagement.episodeHeader', { number: episode.episode_number, title: episode.title || t('seriesManagement.untitled') })}</span>
              <Badge variant="outline" className="text-xs">
                {episode.video_url ? t('seriesManagement.urlSet') : t('seriesManagement.noUrl')}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor={`episode_title_${seasonIndex}_${episodeIndex}`}>{t('seriesManagement.episodeTitle')}</Label>
                  <Input
                    id={`episode_title_${seasonIndex}_${episodeIndex}`}
                    {...form.register(`seasons.${seasonIndex}.episodes.${episodeIndex}.title`)}
                    placeholder={t('seriesManagement.episodeTitlePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor={`episode_runtime_${seasonIndex}_${episodeIndex}`}>{t('seriesManagement.runtimeMinutes')}</Label>
                  <Input
                    id={`episode_runtime_${seasonIndex}_${episodeIndex}`}
                    type="number"
                    {...form.register(`seasons.${seasonIndex}.episodes.${episodeIndex}.runtime`, { valueAsNumber: true })}
                    placeholder={t('seriesManagement.runtimePlaceholder')}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor={`episode_description_${seasonIndex}_${episodeIndex}`}>{t('seriesManagement.episodeDescription')}</Label>
                <Textarea
                  id={`episode_description_${seasonIndex}_${episodeIndex}`}
                  {...form.register(`seasons.${seasonIndex}.episodes.${episodeIndex}.description`)}
                  placeholder={t('seriesManagement.episodeDescriptionPlaceholder')}
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor={`episode_video_url_${seasonIndex}_${episodeIndex}`}>{t('seriesManagement.videoUrlRequired')}</Label>
                <Input
                  id={`episode_video_url_${seasonIndex}_${episodeIndex}`}
                  {...form.register(`seasons.${seasonIndex}.episodes.${episodeIndex}.video_url`)}
                  placeholder={t('seriesManagement.episodeVideoPlaceholder')}
                />
              </div>

              <div>
                <Label htmlFor={`episode_poster_url_${seasonIndex}_${episodeIndex}`}>{t('seriesManagement.episodePosterUrl')}</Label>
                <Input
                  id={`episode_poster_url_${seasonIndex}_${episodeIndex}`}
                  {...form.register(`seasons.${seasonIndex}.episodes.${episodeIndex}.poster_url`)}
                  placeholder={t('seriesManagement.episodePosterPlaceholder')}
                />
              </div>

              {episodes.length > 1 && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => onRemoveEpisode(seasonIndex, episodeIndex)}
                    variant="destructive"
                    size="sm"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('seriesManagement.removeEpisode')}
                  </Button>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
