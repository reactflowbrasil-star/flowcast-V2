'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertCircle, Search, Play, Film, Loader2, ExternalLink } from 'lucide-react';
import { contentService, tmdbService, TMDBSearchResult } from '@/services';
import { ContentType } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { TMDBSeasonDetails } from '@/types/tmdb';
import { extractErrorMessage } from '@/lib/error-message';
import i18n from '@/lib/i18n';

// Debug logging toggle: set NEXT_PUBLIC_DEBUG_LOGS=true to enable logs in browser
const __DEBUG__ = process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true';
const dlog = (...args: any[]) => { if (__DEBUG__) console.log(...args); };

// Validation schema
const searchSchema = z.object({
  query: z.string().min(1, i18n.t('errors.invalidData'))
});

type SearchData = z.infer<typeof searchSchema>;

interface CreateSeriesFromTMDBDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contentType: ContentType.SERIES | ContentType.ANIME;
}

export default function CreateSeriesFromTMDBDialog({
  isOpen,
  onClose,
  onSuccess,
  contentType }: CreateSeriesFromTMDBDialogProps) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  useLoadNamespace('admin/createSeries');
  const { t, i18n } = useTranslation(['admin/createSeries', 'admin', 'translation']);
  const [step, setStep] = useState<'search' | 'select' | 'episodes'>('search');
  const [selectedSeries, setSelectedSeries] = useState<TMDBSearchResult | null>(null);
  const [episodeUrls, setEpisodeUrls] = useState<Record<string, string>>({});
  const [episodeMediaFiles, setEpisodeMediaFiles] = useState<Record<string, File | null>>({});
  const [episodeSubtitleFiles, setEpisodeSubtitleFiles] = useState<Record<string, File | null>>({});
  const [episodeSubtitleLangs, setEpisodeSubtitleLangs] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const searchForm = useForm<SearchData>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      query: ''
    }
  });

  // TMDB search query - only enabled when dialog is open
  const { data: searchResults, isLoading: isSearching, refetch: refetchSearch } = useQuery({
    queryKey: ['tmdb-search-series', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];

      const result = await tmdbService.searchContent(searchQuery, contentType);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    enabled: false, // Manual trigger
  });

  // Get TV details when series is selected
  const { data: tvDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['tmdb-tv-details', selectedSeries?.id],
    queryFn: async () => {
      if (!selectedSeries?.id) return null;

      const result = await tmdbService.getTVDetails(selectedSeries.id);
      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    },
    enabled: isOpen && !!selectedSeries?.id
  });

  // Get season details for all seasons
  const { data: seasonsDetails, isLoading: isLoadingSeasons, error: seasonsError } = useQuery({
    queryKey: ['tmdb-seasons-details', selectedSeries?.id, tvDetails?.seasons],
    queryFn: async () => {
      dlog('🔍 Fetching seasons details...');
      dlog('selectedSeries:', selectedSeries);
      dlog('tvDetails:', tvDetails);

      if (!selectedSeries?.id || !tvDetails?.seasons) {
        dlog('❌ Missing selectedSeries or tvDetails.seasons');
        return [];
      }

      const seasonPromises = tvDetails.seasons
        .filter(season => season.season_number > 0) // Skip specials
        .map(async (season) => {
          dlog(`📺 Fetching season ${season.season_number}...`);
          const result = await tmdbService.getSeasonDetails(selectedSeries.id, season.season_number);
          dlog(`Season ${season.season_number} result:`, result);
          if (result.success) {
            return result.data;
          }
          return null;
        });

      const results = await Promise.all(seasonPromises);
      const filteredResults = results.filter(Boolean) as TMDBSeasonDetails[];
      dlog('✅ Final seasons details:', filteredResults);
      return filteredResults;
    },
    enabled: isOpen && !!selectedSeries?.id && !!tvDetails?.seasons
  });

  // Create series mutation
  const createSeriesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSeries || !seasonsDetails) {
        throw new Error(t('createSeries.errors.missingData'));
      }

      // Build series payload from TMDB metadata. URLs are optional because
      // episodes can be uploaded manually after creation.
      const seasons = seasonsDetails.map(season => ({
        season_number: season.season_number,
        title: season.name,
        description: season.overview || '',
        poster_url: season.poster_path ? `https://image.tmdb.org/t/p/w500${season.poster_path}` : '',
        episodes: season.episodes.map(episode => ({
          episode_number: episode.episode_number,
          title: episode.name,
          description: episode.overview || '',
          video_url: (episodeUrls[`${season.season_number}-${episode.episode_number}`] || '').trim(),
          poster_url: episode.still_path ? `https://image.tmdb.org/t/p/w500${episode.still_path}` : '',
          runtime: episode.runtime || undefined
        }))
      }));

      const seriesData = {
        title: selectedSeries.title,
        description: selectedSeries.overview,
        year: selectedSeries.year,
        poster_url: selectedSeries.poster_url,
        backdrop_url: selectedSeries.backdrop_url,
        tmdb_id: selectedSeries.id,
        active: true,
        seasons
      };

      let result;

      // Use the correct endpoint based on content type
      switch (contentType) {
        case ContentType.SERIES:
          result = await contentService.createSeries(seriesData);
          break;
        case ContentType.ANIME:
          result = await contentService.createAnimeSeries(seriesData);
          break;
        default:
          throw new Error(t('createSeries.errors.unsupportedType', { type: contentType }));
      }

      if (result.success) {
        return result.data;
      }
      throw new Error(extractErrorMessage(result.error, t('common.serverError')));
    }
  });

  const resetModalState = useCallback(() => {
    setStep('search');
    setSelectedSeries(null);
    setEpisodeUrls({});
    setEpisodeMediaFiles({});
    setEpisodeSubtitleFiles({});
    setEpisodeSubtitleLangs({});
    setSearchQuery('');
    searchForm.reset();
  }, [searchForm]);

  const handleClose = () => {
    onClose();
    resetModalState();
    // Ensure mutation state is cleared when closing
    createSeriesMutation.reset();
  };

  // Reset state when contentType changes
  useEffect(() => {
    resetModalState();
  }, [contentType, resetModalState]);

  // Debug logs (toggle via NEXT_PUBLIC_DEBUG_LOGS)
  dlog('🎬 Component state:', {
    step,
    selectedSeries,
    tvDetails,
    seasonsDetails,
    isLoadingSeasons,
    seasonsError
  });

  // Early return AFTER all hooks have been called
  if (!isOpen) {
    return null;
  }

  const handleSearch = (data: SearchData) => {
    setSearchQuery(data.query);
    // Use setTimeout to ensure state is updated before refetch
    setTimeout(() => refetchSearch(), 0);
  };

  const handleSelectSeries = (series: TMDBSearchResult) => {
    setSelectedSeries(series);
    setStep('select');
  };

  const handleProceedToEpisodes = () => {
    if (seasonsDetails && seasonsDetails.length > 0) {
      // Initialize episode URLs
      const urls: Record<string, string> = {};
      const subtitleLangs: Record<string, string> = {};
      seasonsDetails.forEach(season => {
        season.episodes.forEach(episode => {
          const key = `${season.season_number}-${episode.episode_number}`;
          urls[key] = '';
          subtitleLangs[key] = 'en';
        });
      });
      setEpisodeUrls(urls);
      setEpisodeSubtitleLangs(subtitleLangs);
      setStep('episodes');
    }
  };

  const handleEpisodeUrlChange = (seasonNumber: number, episodeNumber: number, url: string) => {
    const key = `${seasonNumber}-${episodeNumber}`;
    setEpisodeUrls(prev => ({
      ...prev,
      [key]: url
    }));
  };

  const handleEpisodeMediaFileChange = (key: string, file: File | null) => {
    setEpisodeMediaFiles(prev => ({ ...prev, [key]: file }));
  };

  const handleEpisodeSubtitleFileChange = (key: string, file: File | null) => {
    setEpisodeSubtitleFiles(prev => ({ ...prev, [key]: file }));
  };

  const handleEpisodeSubtitleLangChange = (key: string, language: string) => {
    setEpisodeSubtitleLangs(prev => ({ ...prev, [key]: language.trim().toLowerCase() }));
  };

  const getEpisodeIdFromCreatedSeries = (
    createdSeries: any,
    seasonNumber: number,
    episodeNumber: number
  ): number | null => {
    const seasons = Array.isArray(createdSeries?.seasons) ? createdSeries.seasons : [];
    const season = seasons.find((s: any) => Number(s?.season_number) === seasonNumber);
    const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
    const episode = episodes.find((ep: any) => Number(ep?.episode_number) === episodeNumber);
    const id = Number(episode?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  };

  const uploadPendingEpisodeAssets = async (createdSeries: any) => {
    const uploadFailures: string[] = [];

    for (const [key, mediaFile] of Object.entries(episodeMediaFiles)) {
      if (!mediaFile) continue;
      const [seasonRaw, episodeRaw] = key.split('-');
      const seasonNumber = Number(seasonRaw);
      const episodeNumber = Number(episodeRaw);
      const episodeId = getEpisodeIdFromCreatedSeries(createdSeries, seasonNumber, episodeNumber);

      if (!episodeId) {
        uploadFailures.push(
          `S${seasonNumber}E${episodeNumber}: ${t('createSeries.messages.episodeNotFoundAfterCreation')}`
        );
        continue;
      }

      const mediaResult = await contentService.uploadEpisodeVideo(episodeId, mediaFile);
      if (!mediaResult.success) {
        uploadFailures.push(
          `S${seasonNumber}E${episodeNumber}: ${extractErrorMessage(mediaResult.error, t('createSeries.errors.uploadVideoFailed'))}`
        );
      }
    }

    for (const [key, subtitleFile] of Object.entries(episodeSubtitleFiles)) {
      if (!subtitleFile) continue;
      const [seasonRaw, episodeRaw] = key.split('-');
      const seasonNumber = Number(seasonRaw);
      const episodeNumber = Number(episodeRaw);
      const episodeId = getEpisodeIdFromCreatedSeries(createdSeries, seasonNumber, episodeNumber);
      const subtitleLang = (episodeSubtitleLangs[key] || 'en').trim().toLowerCase();

      if (!episodeId) {
        uploadFailures.push(
          `S${seasonNumber}E${episodeNumber}: ${t('createSeries.messages.episodeNotFoundForSubtitle')}`
        );
        continue;
      }

      const subtitleResult = await contentService.uploadEpisodeSubtitle(episodeId, subtitleFile, subtitleLang);
      if (!subtitleResult.success) {
        uploadFailures.push(
          `S${seasonNumber}E${episodeNumber}: ${extractErrorMessage(subtitleResult.error, t('createSeries.errors.uploadSubtitleFailed'))}`
        );
      }
    }

    if (uploadFailures.length > 0) {
      const preview = uploadFailures.slice(0, 3).join(' | ');
      toast.warning(t('createSeries.messages.uploadsFailedSummary', {
        type: getContentTypeLabel(),
        count: uploadFailures.length,
        preview
      }));
    }
  };

  const handleCreateSeries = async () => {
    try {
      const createdSeries = await createSeriesMutation.mutateAsync();
      await uploadPendingEpisodeAssets(createdSeries);
      onSuccess();
      handleClose();
      toast.success(t('createSeries.messages.createdSuccess', { type: getContentTypeLabel() }));
    } catch (error) {
      // Mutation error is already surfaced in UI, this keeps toast feedback consistent.
      toast.error(error instanceof Error ? error.message : t('createSeries.errors.createFailed'));
    }
  };

  // Allow creating series with at least one URL or at least one uploaded episode file.
  const hasAtLeastOneUrl = Object.values(episodeUrls).some(url => url.trim() !== '');
  const hasAtLeastOneFile = Object.values(episodeMediaFiles).some(file => !!file);
  const canCreateSeries = Boolean(seasonsDetails && (hasAtLeastOneUrl || hasAtLeastOneFile));

  const getContentTypeLabel = () => {
    switch (contentType) {
      case ContentType.SERIES:
        return t('content.categories.series.label', { ns: 'translation' });
      case ContentType.ANIME:
        return t('content.categories.anime.label', { ns: 'translation' });
      default:
        return t('common.category', { ns: 'translation' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            {t('createSeries.dialogTitle', { type: getContentTypeLabel() })}
          </DialogTitle>
          <DialogDescription>
            {t('createSeries.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={step} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="search" disabled={step !== 'search'}>
              {t('createSeries.tabSearch')}
            </TabsTrigger>
            <TabsTrigger value="select" disabled={step !== 'select'}>
              {t('createSeries.tabReview')}
            </TabsTrigger>
            <TabsTrigger value="episodes" disabled={step !== 'episodes'}>
              {t('createSeries.tabEpisodes')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-6">
            <form onSubmit={searchForm.handleSubmit(handleSearch)} className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    {...searchForm.register('query')}
                    placeholder={t('createContent.searchPlaceholder', { ns: 'translation', type: getContentTypeLabel().toLowerCase() })}
                    className="h-12"
                  />
                </div>
                <Button type="submit" disabled={isSearching} className="h-12 px-8">
                  {isSearching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('createSeries.searching')}
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      {t('createSeries.search')}
                    </>
                  )}
                </Button>
              </div>
            </form>

            {searchResults && searchResults.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {searchResults.slice(0, 6).map((series) => (
                  <Card
                    key={series.id}
                    className="cursor-pointer transition-all hover:shadow-lg"
                    onClick={() => handleSelectSeries(series)}
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
                          <h4 className="font-medium truncate">{series.title}</h4>
                          <p className="text-sm text-gray-600 mb-2">
                            {series.year || t('createSeries.unknownYear')}
                          </p>
                          <p className="text-xs text-gray-500 line-clamp-3">
                            {series.overview || t('createSeries.noDescription')}
                          </p>
                          <Badge variant="outline" className="mt-2">
                            ⭐ {series.vote_average?.toFixed(1) || t('createSeries.na')}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="select" className="space-y-6">
            {selectedSeries && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Film className="h-5 w-5" />
                    {selectedSeries.title}
                    <a
                      href={`https://www.themoviedb.org/tv/${selectedSeries.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    {selectedSeries.poster_url && (
                      <Image
                        src={selectedSeries.poster_url}
                        alt={selectedSeries.title}
                        width={128}
                        height={192}
                        className="w-32 h-48 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-gray-600 mb-4">{selectedSeries.overview}</p>

                      {isLoadingDetails && (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('createSeries.loadingDetails')}
                        </div>
                      )}

                      {tvDetails && (
                        <div className="space-y-2">
                          <p>{t('seriesManagement.seasonsCount', { ns: 'translation', count: tvDetails.number_of_seasons })}</p>
                          <p>{t('seriesManagement.episodes', { ns: 'translation' })}: {tvDetails.number_of_episodes}</p>
                          <p>{t('seriesManagement.firstAirDateYear', { ns: 'translation' })}: {tvDetails.first_air_date}</p>
                        </div>
                      )}

                      {isLoadingSeasons && (
                        <div className="flex items-center gap-2 mt-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('createSeries.loadingEpisodes')}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {seasonsDetails && seasonsDetails.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('createSeries.previewTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {seasonsDetails.map(season => (
                      <div key={season.season_number} className="border rounded p-4">
                        <h4 className="font-medium mb-2">
                          {t('seriesManagement.defaultSeasonTitle', { ns: 'translation', number: season.season_number })}: {season.name}
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          {season.episodes.length} {t('seriesManagement.episodes', { ns: 'translation' })}
                        </p>
                        <div className="text-xs text-gray-500">
                          {t('seriesManagement.episodes', { ns: 'translation' })}: {season.episodes.map(ep => ep.episode_number).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="episodes" className="space-y-6">
            {seasonsDetails && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{t('createSeries.addEpisodeUrls')}</h3>
                  <Badge variant="outline">
                    {Object.keys(episodeUrls).filter((key) => {
                      const hasUrl = (episodeUrls[key] || '').trim() !== '';
                      const hasFile = !!episodeMediaFiles[key];
                      return hasUrl || hasFile;
                    }).length} / {Object.keys(episodeUrls).length} {t('createSeries.completed')}
                  </Badge>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {seasonsDetails.map(season => (
                    <AccordionItem key={season.season_number} value={`season-${season.season_number}`}>
                      <AccordionTrigger>
                        {t('seriesManagement.defaultSeasonTitle', { ns: 'translation', number: season.season_number })}: {season.name} ({season.episodes.length} {t('seriesManagement.episodes', { ns: 'translation' })})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                          {season.episodes.map(episode => (
                            <div key={episode.episode_number} className="space-y-2">
                              <Label htmlFor={`episode-${season.season_number}-${episode.episode_number}`}>
                                {t('createSeries.episodeLabel', { number: episode.episode_number, name: episode.name })}
                              </Label>
                              <Input
                                id={`episode-${season.season_number}-${episode.episode_number}`}
                                value={episodeUrls[`${season.season_number}-${episode.episode_number}`] || ''}
                                onChange={(e) => handleEpisodeUrlChange(season.season_number, episode.episode_number, e.target.value)}
                                placeholder={t('createContent.form.videoUrlPlaceholder', { ns: 'translation' })}
                              />
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">{t('createSeries.uploadEpisodeVideoOptional')}</Label>
                                  <Input
                                    type="file"
                                    accept="video/*,.mp4,.mkv,.avi,.mov,.webm,.m4v,.ts"
                                    onChange={(e) =>
                                      handleEpisodeMediaFileChange(
                                        `${season.season_number}-${episode.episode_number}`,
                                        e.target.files?.[0] ?? null
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t('createSeries.uploadSubtitleOptional')}</Label>
                                  <div className="grid grid-cols-[90px_1fr] gap-2">
                                    <Input
                                      value={episodeSubtitleLangs[`${season.season_number}-${episode.episode_number}`] || 'en'}
                                      onChange={(e) =>
                                        handleEpisodeSubtitleLangChange(
                                          `${season.season_number}-${episode.episode_number}`,
                                          e.target.value
                                        )
                                      }
                                      placeholder={t('createSeries.subtitleLanguagePlaceholder')}
                                      maxLength={16}
                                    />
                                    <Input
                                      type="file"
                                      accept=".srt,.vtt,text/vtt,application/x-subrip"
                                      onChange={(e) =>
                                        handleEpisodeSubtitleFileChange(
                                          `${season.season_number}-${episode.episode_number}`,
                                          e.target.files?.[0] ?? null
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            {createSeriesMutation.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {createSeriesMutation.error.message}
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {step === 'search' && (
            <Button variant="outline" onClick={handleClose}>
              {t('createSeries.cancel')}
            </Button>
          )}

          {step === 'select' && (
            <>
              <Button variant="outline" onClick={() => setStep('search')}>
                {t('createSeries.backToSearch')}
              </Button>
              <Button variant="outline" onClick={handleClose}>
                {t('createSeries.cancel')}
              </Button>
              <Button
                onClick={handleProceedToEpisodes}
                disabled={!seasonsDetails || seasonsDetails.length === 0 || isLoadingSeasons}
              >
                {t('createSeries.nextAddUrls')}
              </Button>
            </>
          )}

          {step === 'episodes' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>
                {t('createSeries.back')}
              </Button>
              <Button variant="outline" onClick={handleClose}>
                {t('createSeries.cancel')}
              </Button>
              <Button
                onClick={handleCreateSeries}
                disabled={!canCreateSeries || createSeriesMutation.isPending}
              >
                {createSeriesMutation.isPending ? t('createSeries.creating') : t('createSeries.createButton', { type: getContentTypeLabel() })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
