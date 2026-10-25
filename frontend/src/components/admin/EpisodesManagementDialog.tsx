/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { z } from 'zod';
import { VideoUploadField } from '@/components/ui/video-upload-field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Play, AlertCircle, Loader2, Pencil, Upload } from 'lucide-react';
import { Content, Series, Season as SeasonType, Episode as EpisodeType } from '@/types';
import { contentService } from '@/services';
import { apiErrorMessage } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import i18n from '@/lib/i18n';
import { toast } from 'sonner';

// Episode schema (used for local form state)
const episodeSchema = z.object({
  id: z.number().optional(),
  episode_number: z.number().min(1),
  title: z.string().min(1, i18n.t('manualSeries.titleRequired')),
  description: z.string().optional(),
  video_url: z.string().optional(),
  poster_url: z.string().optional(),
  runtime: z.number().min(1).optional()
});

// Extend inferred type with a few optional backend fields we sometimes map
type Episode = z.infer<typeof episodeSchema> & {
  image_url?: string;
  has_subtitles?: boolean;
};

// A stream draft that hasn't been saved to the backend yet (for new episodes)
interface PendingStreamDraft {
  stream_url: string;
  quality: string;
  language: string;
  audio_languages: string;
  format: string;
  drm_keys: string;
  drm_type: string;
}

interface Season {
  id?: number;
  season_number: number;
  title: string;
  description?: string;
  poster_url?: string;
  episodes: Episode[];
}

interface EpisodesManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  series: Content;
  onSuccess: () => void;
}

export default function EpisodesManagementDialog({
  isOpen,
  onClose,
  series,
  onSuccess }: EpisodesManagementDialogProps) {
  const nsLoading = useLoadNamespace('admin/episodes');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeasonTab, setActiveSeasonTab] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation(['admin/episodes', 'admin', 'translation']);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNovela] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLicenseServerUrl, setPreviewLicenseServerUrl] = useState<string | null>(null);
  const [previewDrmType, setPreviewDrmType] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [previewPoster, setPreviewPoster] = useState<string | undefined>(undefined);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const lastSaveRef = React.useRef<number>(0);
  // Pending streams for new episodes (key: "seasonIndex-episodeIndex")
  const [pendingStreams, setPendingStreams] = useState<Map<string, PendingStreamDraft[]>>(new Map());
  const [deletedEpisodeIds, setDeletedEpisodeIds] = useState<Set<number>>(new Set());
  const [deletedSeasonIds, setDeletedSeasonIds] = useState<Set<number>>(new Set());
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<Array<{ id?: number; title: string; ok: boolean; error?: string }>>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const defaultEpisode = (num = 1): Episode => ({
    episode_number: num,
    title: t('episodes.defaultEpisodeTitle', { number: num }),
    description: '',
    video_url: '',
    poster_url: '',
    runtime: undefined
  });

  const defaultSeason = (seasonNumber = 1): Season => ({
    season_number: seasonNumber,
    title: t('episodes.defaultSeasonTitle', { number: seasonNumber }),
    description: '',
    poster_url: '',
    episodes: [defaultEpisode(1)]
  });

  const checkEpisodeSubtitles = async (episodeId: number): Promise<boolean> => {
    try {
      const result = await contentService.getEpisodeSubtitles(episodeId);
      return result.success && result.data && result.data.length > 0;
    } catch (_error) {
      return false;
    }
  };

  const loadSeriesData = useCallback(async () => {
    setIsLoadingData(true);
    setLoadError(null);
    try {
      // UNIFIED: All episodic content (series, anime) uses the same series API
      // The category_id differentiates the type, not the API endpoint
      const seriesResult = await contentService.getSeriesByContentId(series.id);

      if (!seriesResult.success) {
        throw new Error(apiErrorMessage(seriesResult.error, t('episodes.failedToLoad')));
      }

      const seriesData = seriesResult.data as Series;
      const seasonsWithEpisodes: Season[] = [];

      // UNIFIED: All episodic content uses series/seasons/episodes structure
      const seasonsResult = await contentService.getSeriesSeasons(seriesData.id);
      if (!seasonsResult.success) {
        throw new Error(apiErrorMessage(seasonsResult.error, t('episodes.failedToLoadSeasons')));
      }

      const seasonsData = (seasonsResult.data || []) as SeasonType[];

      for (const seasonData of seasonsData) {
        const episodesResult = await contentService.getSeasonEpisodes(seasonData.id);
        const episodesData = episodesResult.success ? (episodesResult.data as EpisodeType[]) : [];

        const episodes: Episode[] = await Promise.all(
          (episodesData || []).map(async (ep) => {
            const hasSubtitles = ep.id ? await checkEpisodeSubtitles(ep.id) : false;
            return {
              id: ep.id,
              episode_number: ep.episode_number ?? 1,
              title: ep.title || t('episodes.untitled'),
              description: ep.description || '',
              video_url: ep.stream_url || '',
              poster_url: ep.image_url || ep.poster_url || '',
              image_url: ep.image_url || ep.poster_url || '',
              runtime: ep.runtime || undefined,
              has_subtitles: hasSubtitles
            };
          })
        );

        if (episodes.length === 0) {
          episodes.push(defaultEpisode(1));
        }

        seasonsWithEpisodes.push({
          id: seasonData.id,
          season_number: seasonData.season_number,
          title: (seasonData as any).title || t('episodes.defaultSeasonTitle', { number: seasonData.season_number }),
          description: (seasonData as any).description || '',
          poster_url: (seasonData as any).poster_url || '',
          episodes
        });
      }

      if (seasonsWithEpisodes.length === 0) {
        seasonsWithEpisodes.push(defaultSeason(1));
      }

      setSeasons(seasonsWithEpisodes);
      setActiveSeasonTab('0');
    } catch (_error) {
      setLoadError(t('episodes.failedToLoad')); // Generic error
      setSeasons([defaultSeason(1)]);
      setActiveSeasonTab('0');
    } finally {
      setIsLoadingData(false);
    }
  }, [series, t]);

  useEffect(() => {
    if (isOpen && series) {
      loadSeriesData();
    }
  }, [isOpen, series, loadSeriesData]);

  const handlePreviewEpisode = async (episodeId?: number, title?: string, poster?: string) => {
    if (!episodeId) return;
    setPreviewTitle(title || t('episodes.previewTitle'));
    setPreviewPoster(poster);
    setIsPreviewOpen(true);
    setIsPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewLicenseServerUrl(null);
    setPreviewDrmType(null);
    setPreviewError(null);
    try {
      const result = await contentService.getEpisodeForDelivery(episodeId);
      if (result.success && result.data?.stream_url) {
        // Extract DRM info
        const dataAny = result.data as any;
        if (dataAny.license_server_url) setPreviewLicenseServerUrl(dataAny.license_server_url);
        if (dataAny.drm_type) setPreviewDrmType(dataAny.drm_type);

        const s = result.data.stream_url.trim();
        try {
          if (s.startsWith('/api/')) {
            // Pre-check HEAD
            try {
              const head = await fetch(s, { method: 'HEAD', credentials: 'include', cache: 'no-store' });
              if (!head.ok) {
                setPreviewError(t('episodes.previewError'));
              }
            } catch (e: any) {
              setPreviewError(t('episodes.previewError'));
            }
            setPreviewUrl(s);
          } else {
            const u = new URL(s);
            if (u.pathname.startsWith('/api/')) {
              const normalized = `${u.pathname}${u.search}${u.hash}`;
              try {
                const head = await fetch(normalized, { method: 'HEAD', credentials: 'include', cache: 'no-store' });
                if (!head.ok) setPreviewError(t('episodes.previewError'));
              } catch { }
              setPreviewUrl(normalized);
            } else {
              setPreviewUrl(s);
            }
          }
        } catch {
          setPreviewUrl(s);
        }
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const loadExternalScript = async (id: string, src: string) => {
    return new Promise<void>((resolve, reject) => {
      if (document.getElementById(id)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      s.id = id;
      document.body.appendChild(s);
    });
  };

  React.useEffect(() => {
    let hlsInstance: any = null;
    let shakaPlayer: any = null;
    const video = videoRef.current;
    if (!isPreviewOpen || !previewUrl || !video) return;

    const url = previewUrl;
    const lower = url.split('?')[0].toLowerCase();

    const cleanup = () => {
      try {
        if (hlsInstance) hlsInstance.destroy();
        if (shakaPlayer) shakaPlayer.destroy();
      } catch { }
    };

    const setup = async () => {
      try {
        if (lower.endsWith('.mpd')) {
          await loadExternalScript('shaka-player-lib', '/vendor/shaka-player.compiled.min.js');
          const shaka = (window as any).shaka;
          if (!shaka) {
            setPreviewError(t('episodes.previewError'));
            return;
          }
          shakaPlayer = new shaka.Player();
          await shakaPlayer.attach(video);

          // Configure DRM
          const drmConfig: any = {
            retryParameters: {
              maxAttempts: 3,
              baseDelay: 1000,
              backoffFactor: 2,
              fuzzFactor: 0.5
            }
          };

          const useWidevine = previewLicenseServerUrl && (previewDrmType === 'widevine' || !previewDrmType);
          const usePlayReady = previewLicenseServerUrl && previewDrmType === 'playready';

          if (useWidevine) {
            drmConfig.servers = { 'com.widevine.alpha': previewLicenseServerUrl };
            drmConfig.advanced = {
              'com.widevine.alpha': {
                videoRobustness: 'SW_SECURE_CRYPTO',
                audioRobustness: 'SW_SECURE_CRYPTO'
              }
            };
          } else if (usePlayReady) {
            drmConfig.servers = { 'com.microsoft.playready': previewLicenseServerUrl };
          } else {
            drmConfig.preferredKeySystems = ['org.w3.clearkey'];
          }

          shakaPlayer.configure({ drm: drmConfig });

          await shakaPlayer.load(url);
          return;
        }
        if (lower.endsWith('.m3u8')) {
          const canNative = video.canPlayType('application/vnd.apple.mpegurl');
          if (canNative) { video.src = url; return; }
          await loadExternalScript('hls-js-lib', '/vendor/hls.min.js');
          const Hls = (window as any).Hls;
          if (Hls && Hls.isSupported()) {
            hlsInstance = new Hls();
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(video);
            return;
          }
          setPreviewError(t('episodes.previewNotSupported'));
          video.src = url;
          return;
        }
        video.src = url;
      } catch (e: any) {
        setPreviewError(t('episodes.previewError'));
      }
    };

    setup().then(() => {
      // Restore volume/position
      try {
        const key = `preview_state.episode.${previewTitle}`;
        const raw = localStorage.getItem(key);
        if (raw && videoRef.current) {
          const state = JSON.parse(raw);
          if (typeof state.volume === 'number') videoRef.current.volume = Math.max(0, Math.min(1, state.volume));
          const setTime = () => {
            if (typeof state.currentTime === 'number' && state.currentTime > 1) {
              try { if (videoRef.current) videoRef.current.currentTime = state.currentTime; } catch { }
            }
          };
          if (videoRef.current.readyState >= 1) setTime(); else videoRef.current.addEventListener('loadedmetadata', setTime, { once: true });
        }
      } catch { }
    });
    return cleanup;
  }, [isPreviewOpen, previewUrl, previewLicenseServerUrl, previewDrmType]);

  // Persist episode preview state (volume/position)
  React.useEffect(() => {
    const video = videoRef.current;
    if (!isPreviewOpen || !previewUrl || !video) return;
    const key = `preview_state.episode.${previewTitle}`;
    const onTime = () => {
      const now = Date.now();
      if (now - lastSaveRef.current < 1500) return;
      lastSaveRef.current = now;
      try {
        const raw = localStorage.getItem(key);
        const base = raw ? JSON.parse(raw) : {};
        base.currentTime = Math.floor(video.currentTime || 0);
        base.volume = video.volume;
        localStorage.setItem(key, JSON.stringify(base));
      } catch { }
    };
    const onVolume = () => {
      try {
        const raw = localStorage.getItem(key);
        const base = raw ? JSON.parse(raw) : {};
        base.volume = video.volume;
        localStorage.setItem(key, JSON.stringify(base));
      } catch { }
    };
    const onError = () => {
      try {
        const err = (video.error && (video.error as any).message) || t('user.live.playbackError');
        setPreviewError(String(err));
      } catch { }
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('error', onError);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('error', onError);
    };
  }, [isPreviewOpen, previewUrl, previewTitle]);

  const addSeason = () => {
    const newSeasonNumber = seasons.length + 1;
    const newSeason: Season = defaultSeason(newSeasonNumber);
    setSeasons([...seasons, newSeason]);
    setActiveSeasonTab((seasons.length).toString());
  };

  const removeSeason = (seasonIndex: number) => {
    if (seasons.length > 1) {
      const removedSeason = seasons[seasonIndex];
      // Track the season ID for backend deletion if it already exists in the DB
      if (removedSeason?.id) {
        setDeletedSeasonIds(prev => new Set(prev).add(removedSeason.id!));
      }
      const updatedSeasons = seasons.filter((_: Season, index: number) => index !== seasonIndex);
      setSeasons(updatedSeasons);
      if (parseInt(activeSeasonTab) >= updatedSeasons.length) {
        setActiveSeasonTab('0');
      }
    }
  };

  const updateSeason = (seasonIndex: number, updatedSeason: Season) => {
    const updatedSeasons = [...seasons];
    updatedSeasons[seasonIndex] = updatedSeason;
    setSeasons(updatedSeasons);
  };

  const addEpisode = (seasonIndex: number) => {
    const updatedSeasons = [...seasons];
    const currentEpisodes = updatedSeasons[seasonIndex].episodes;
    const newEpisodeNumber = currentEpisodes.length + 1;
    const newEpisode: Episode = defaultEpisode(newEpisodeNumber);
    updatedSeasons[seasonIndex].episodes.push(newEpisode);
    setSeasons(updatedSeasons);
  };

  const removeEpisode = (seasonIndex: number, episodeIndex: number) => {
    const updatedSeasons = [...seasons];
    const removedEpisode = updatedSeasons[seasonIndex].episodes[episodeIndex];
    // Track the episode ID for backend deletion if it already exists in the DB
    if (removedEpisode?.id) {
      setDeletedEpisodeIds(prev => new Set(prev).add(removedEpisode.id!));
    }
    updatedSeasons[seasonIndex].episodes = updatedSeasons[seasonIndex].episodes.filter(
      (_, index) => index !== episodeIndex
    );
    setSeasons(updatedSeasons);
  };

  const updateEpisode = (seasonIndex: number, episodeIndex: number, updatedEpisode: Episode) => {
    const updatedSeasons = [...seasons];
    updatedSeasons[seasonIndex].episodes[episodeIndex] = updatedEpisode;
    setSeasons(updatedSeasons);
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      const ensureSuccess = <T,>(result: { success: boolean; error?: any }, fallbackMessage: string): void => {
        if (!result.success) {
          throw new Error(apiErrorMessage(result.error, fallbackMessage));
        }
      };

      // Delete episodes removed in UI
      if (deletedEpisodeIds.size > 0) {
        const deleteEpResults = await Promise.all(
          Array.from(deletedEpisodeIds).map(id => contentService.deleteEpisode(id))
        );
        deleteEpResults.forEach((result) => {
          ensureSuccess(result, t('episodes.failedToDeleteEpisode', { defaultValue: 'Failed to delete episode' }));
        });
        setDeletedEpisodeIds(new Set());
      }

      // Delete seasons removed in UI
      if (deletedSeasonIds.size > 0) {
        const deleteSeasonResults = await Promise.all(
          Array.from(deletedSeasonIds).map(id => contentService.deleteSeason(id))
        );
        deleteSeasonResults.forEach((result) => {
          ensureSuccess(result, t('episodes.failedToDeleteSeason', { defaultValue: 'Failed to delete season' }));
        });
        setDeletedSeasonIds(new Set());
      }

      const updatePromises: Promise<void>[] = [];

      for (let si = 0; si < seasons.length; si++) {
        const season = seasons[si];
        for (let ei = 0; ei < season.episodes.length; ei++) {
          const episode = season.episodes[ei];
          if (episode.id) {
            // Update existing episode
            const updatePromise = contentService.updateEpisode(episode.id, {
              title: episode.title,
              description: episode.description,
              stream_url: episode.video_url,
              image_url: episode.poster_url
            }).then((result) => {
              ensureSuccess(result, t('episodes.failedToUpdateEpisode', { defaultValue: 'Failed to update episode' }));
            });
            updatePromises.push(updatePromise);
          } else if (season.id && episode.title) {
            // Create new episode — video_url is optional now since streams are primary
            const key = `${si}-${ei}`;
            const drafts = pendingStreams.get(key) || [];
            const createPromise: Promise<void> = (async () => {
              const createResult = await contentService.createEpisode({
                season_id: season.id!,
                episode_number: episode.episode_number,
                title: episode.title,
                description: episode.description || '',
                stream_url: episode.video_url || (drafts.length > 0 ? drafts[0].stream_url : ''),
                image_url: episode.poster_url || ''
              });
              ensureSuccess(createResult, t('episodes.failedToCreateEpisode', { defaultValue: 'Failed to create episode' }));

              // After creating the episode, add any pending streams
              if (createResult.data && drafts.length > 0) {
                const newEpId = (createResult.data as any).id;
                if (newEpId) {
                  for (let di = 0; di < drafts.length; di++) {
                    const d = drafts[di];
                    const addStreamResult = await contentService.addEpisodeStream(newEpId, {
                      stream_url: d.stream_url,
                      quality: d.quality || undefined,
                      language: d.language || undefined,
                      audio_languages: d.audio_languages || undefined,
                      format: d.format || undefined,
                      drm_keys: d.drm_keys || undefined,
                      drm_type: d.drm_type || undefined,
                      is_default: di === 0,
                    });
                    ensureSuccess(addStreamResult, t('episodes.failedToAddStream', { defaultValue: 'Failed to add stream' }));
                  }
                }
              }
            })();
            updatePromises.push(createPromise);
          }
        }
      }

      await Promise.all(updatePromises);
      setPendingStreams(new Map());
      toast.success(t('episodes.savedSuccess', { defaultValue: 'Episodes saved successfully' }));
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving episodes:', error);
      toast.error(error instanceof Error ? error.message : t('episodes.failedToSave', { defaultValue: 'Failed to save episodes' }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[80vw] md:!max-w-[65vw] max-h-[75vh] overflow-y-auto" style={{ maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📺 {t('episodes.manageTitle', { title: series.title })}
          </DialogTitle>
        </DialogHeader>

        {nsLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2">{t('common.loading', { defaultValue: 'Loading...' })}</span>
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{series.title}</CardTitle>
                <CardDescription>
                  {series.description || t('episodes.noDescription')}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Preview Dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={(open) => { if (!open) { setIsPreviewOpen(false); setPreviewUrl(null); } }}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{previewTitle}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {isPreviewLoading && (
                    <div className="flex h-64 items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500" />
                    </div>
                  )}
                  {!isPreviewLoading && previewError && (
                    <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
                      {previewError}
                    </div>
                  )}
                  {!isPreviewLoading && previewUrl && (
                    <video
                      key={previewUrl}
                      controls
                      autoPlay
                      playsInline
                      className="w-full max-h-[70vh] rounded bg-black"
                      poster={previewPoster}
                      ref={videoRef}
                    >
                      <source src={previewUrl} />
                    </video>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {isLoadingData && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span>{t('episodes.loadingSeasons')}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {loadError && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    <span>{t('episodes.errorLoadingData')}: {loadError}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t('episodes.seasonsAndEpisodes')}</CardTitle>
                    <CardDescription>
                      {t('episodes.manageSeasonsDescription')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={async () => {
                      // Test all episodes in active season
                      const idx = parseInt(activeSeasonTab || '0', 10) || 0;
                      if (!seasons[idx]) return;
                      setIsTesting(true);
                      setTestResults([]);
                      const current = seasons[idx];
                      const results: Array<{ id?: number; title: string; ok: boolean; error?: string }> = [];
                      for (const ep of current.episodes) {
                        if (!ep.id) {
                          results.push({ id: undefined, title: ep.title, ok: false, error: t('common.error') });
                          continue;
                        }
                        try {
                          const res = await contentService.getEpisodeForDelivery(ep.id);
                          if (res.success && res.data?.stream_url) {
                            results.push({ id: ep.id, title: ep.title, ok: true });
                          } else {
                            results.push({ id: ep.id, title: ep.title, ok: false, error: res.error?.details || t('episodes.noUrl') });
                          }
                        } catch (_error) {
                          const errorMessage = _error instanceof Error ? _error.message : t('common.error');
                          results.push({ id: ep.id, title: ep.title, ok: false, error: errorMessage });
                        }
                      }
                      setTestResults(results);
                      setIsTesting(false);
                    }} variant="outline" size="sm" disabled={isLoadingData || isTesting} className="bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700">
                      {isTesting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                          {t('episodes.testingEpisodes', { defaultValue: 'Testing...' })}
                        </>
                      ) : (
                        <>
                          🧪 {t('episodes.testAll')}
                        </>
                      )}
                    </Button>
                    <Button onClick={loadSeriesData} variant="outline" size="sm" disabled={isLoadingData}>
                      🔄 {t('common.reload')}
                    </Button>
                    <Button onClick={addSeason} variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('episodes.addSeason')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {testResults.length > 0 && (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm">
                    <div className="text-sm font-semibold mb-3 text-blue-800 flex items-center">
                      📊 {t('episodes.testResults')}
                      <Badge variant="outline" className="ml-2 bg-white">
                        {testResults.filter(r => r.ok).length}/{testResults.length}
                      </Badge>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {testResults.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 p-2 rounded text-sm ${r.ok ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                          <span className="text-lg">{r.ok ? '✅' : '❌'}</span>
                          <span className="font-medium">{r.title || t('episodes.untitled')}</span>
                          {r.error && <span className="text-xs opacity-75">— {r.error}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isLoadingData && seasons.length > 0 && (
                  <Tabs value={activeSeasonTab} onValueChange={setActiveSeasonTab}>
                    <div className="w-full">
                      <TabsList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1 p-1 h-auto">
                        {seasons.map((season, index) => (
                          <TabsTrigger key={index} value={index.toString()} className="flex flex-col items-center gap-1 p-2 h-auto min-h-[60px] text-xs">
                            <span className="font-medium text-xs leading-tight text-center">{t('episodes.seasonLabel', { number: season.season_number })}</span>
                            <Badge variant="outline" className="text-xs px-1 py-0">
                              {season.episodes.length} {t('episodes.epShort')}
                            </Badge>
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>

                    {seasons.map((season, seasonIndex) => (
                      <TabsContent key={seasonIndex} value={seasonIndex.toString()} className="mt-6">
                        <div className="space-y-6">
                          <SeasonEditor
                            season={season}
                            seasonIndex={seasonIndex}
                            onUpdateSeason={(updatedSeason) => updateSeason(seasonIndex, updatedSeason)}
                            onAddEpisode={() => addEpisode(seasonIndex)}
                            onRemoveEpisode={(episodeIndex) => removeEpisode(seasonIndex, episodeIndex)}
                            onUpdateEpisode={(episodeIndex, updatedEpisode) =>
                              updateEpisode(seasonIndex, episodeIndex, updatedEpisode)
                            }
                            onRemoveSeason={() => removeSeason(seasonIndex)}
                            canRemoveSeason={seasons.length > 1}
                            isNovela={isNovela}
                            onPreviewEpisode={handlePreviewEpisode}
                            pendingStreams={pendingStreams}
                            setPendingStreams={setPendingStreams}
                          />
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                )}

                {!isLoadingData && seasons.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-gray-500 mb-4">
                      <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>{t('episodes.noSeasonsFound')}</p>
                      <p className="text-sm">{t('episodes.addFirstSeasonHint')}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Season Editor Component
interface SeasonEditorProps {
  season: Season;
  seasonIndex: number;
  onUpdateSeason: (season: Season) => void;
  onAddEpisode: () => void;
  onRemoveEpisode: (episodeIndex: number) => void;
  onUpdateEpisode: (episodeIndex: number, episode: Episode) => void;
  onRemoveSeason: () => void;
  canRemoveSeason: boolean;
  isNovela: boolean;
  onPreviewEpisode: (episodeId?: number, title?: string, poster?: string) => void;
  pendingStreams: Map<string, PendingStreamDraft[]>;
  setPendingStreams: React.Dispatch<React.SetStateAction<Map<string, PendingStreamDraft[]>>>;
}

function SeasonEditor({
  season,
  seasonIndex,
  onUpdateSeason,
  onAddEpisode,
  onRemoveEpisode,
  onUpdateEpisode,
  onRemoveSeason,
  canRemoveSeason,
  isNovela,
  onPreviewEpisode,
  pendingStreams,
  setPendingStreams }: SeasonEditorProps) {
  const { t } = useTranslation(['admin/episodes', 'admin', 'translation']);

  const updateSeasonField = (field: keyof Season, value: string | number | Episode[] | undefined) => {
    onUpdateSeason({
      ...season,
      [field]: value
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`season_title_${seasonIndex}`}>{t('episodes.seasonTitle')}</Label>
          <Input
            id={`season_title_${seasonIndex}`}
            value={season.title}
            onChange={(e) => updateSeasonField('title', e.target.value)}
            placeholder={t('episodes.defaultSeasonPlaceholder')}
          />
        </div>
        <div>
          <Label htmlFor={`season_number_${seasonIndex}`}>{t('episodes.seasonNumber')}</Label>
          <Input
            id={`season_number_${seasonIndex}`}
            type="number"
            value={season.season_number}
            onChange={(e) => updateSeasonField('season_number', parseInt(e.target.value))}
            min="1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`season_description_${seasonIndex}`}>{t('episodes.description')}</Label>
        <Textarea
          id={`season_description_${seasonIndex}`}
          value={season.description || ''}
          onChange={(e) => updateSeasonField('description', e.target.value)}
          placeholder={t('episodes.seasonDescriptionPlaceholder')}
          rows={2}
        />
      </div>

      <div>
        <Label htmlFor={`season_poster_${seasonIndex}`}>{t('episodes.posterUrl')}</Label>
        <Input
          id={`season_poster_${seasonIndex}`}
          value={season.poster_url || ''}
          onChange={(e) => updateSeasonField('poster_url', e.target.value)}
          placeholder={t('createContent.form.posterUrlPlaceholder', { ns: 'translation' })}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">{t('episodes.episodesCount', { count: season.episodes.length })}</h4>
          <div className="flex gap-2">
            <Button onClick={onAddEpisode} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('episodes.addEpisode')}
            </Button>
            {canRemoveSeason && (
              <Button onClick={onRemoveSeason} variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                {t('episodes.removeSeason')}
              </Button>
            )}
          </div>
        </div>

        <EpisodesList
          episodes={season.episodes}
          seasonIndex={seasonIndex}
          onRemoveEpisode={onRemoveEpisode}
          onUpdateEpisode={onUpdateEpisode}
          isNovela={isNovela}
          onPreviewEpisode={onPreviewEpisode}
          pendingStreams={pendingStreams}
          setPendingStreams={setPendingStreams}
        />
      </div>
    </div>
  );
}

// Episodes List Component
interface EpisodesListProps {
  episodes: Episode[];
  seasonIndex: number;
  onRemoveEpisode: (episodeIndex: number) => void;
  onUpdateEpisode: (episodeIndex: number, episode: Episode) => void;
  isNovela: boolean;
  onPreviewEpisode: (episodeId?: number, title?: string, poster?: string) => void;
  pendingStreams: Map<string, PendingStreamDraft[]>;
  setPendingStreams: React.Dispatch<React.SetStateAction<Map<string, PendingStreamDraft[]>>>;
}

function EpisodesList({
  episodes,
  seasonIndex,
  onRemoveEpisode,
  onUpdateEpisode,
  isNovela,
  onPreviewEpisode,
  pendingStreams,
  setPendingStreams }: EpisodesListProps) {
  const { t } = useTranslation(['admin/episodes', 'admin', 'translation']);

  return (
    <Accordion type="single" collapsible className="w-full">
      {episodes.map((episode, episodeIndex) => (
        <AccordionItem key={episodeIndex} value={`episode-${episodeIndex}`}>
          <AccordionTrigger className="text-left">
            <div className="flex items-center justify-between w-full mr-4">
              <span>{t('episodes.episodeLabel', { number: episode.episode_number })}: {episode.title || t('episodes.untitled')}</span>
              <div className="flex items-center gap-2">
                <Badge variant={episode.video_url ? 'default' : 'secondary'} className="text-xs">
                  {episode.video_url ? t('episodes.urlSet') : t('episodes.noUrl')}
                </Badge>
                {episode.has_subtitles && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    SUB
                  </Badge>
                )}
                {episode.video_url && (
                  <Tooltip content={t('episodes.preview')}>
                    <span
                      role="button"
                      tabIndex={0}
                      className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onPreviewEpisode(episode.id, episode.title, episode.poster_url || episode.image_url); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onPreviewEpisode(episode.id, episode.title, episode.poster_url || episode.image_url); } }}
                    >
                      <Play className="h-4 w-4 text-green-500" />
                    </span>
                  </Tooltip>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <EpisodeEditor
              episode={episode}
              episodeIndex={episodeIndex}
              seasonIndex={seasonIndex}
              onUpdateEpisode={(updatedEpisode) => onUpdateEpisode(episodeIndex, updatedEpisode)}
              onRemoveEpisode={() => onRemoveEpisode(episodeIndex)}
              isNovela={isNovela}
              onPreviewEpisode={(id, title, poster) => onPreviewEpisode(id, title, poster)}
              pendingStreams={pendingStreams.get(`${seasonIndex}-${episodeIndex}`) || []}
              onPendingStreamsChange={(drafts) => {
                const key = `${seasonIndex}-${episodeIndex}`;
                setPendingStreams(prev => {
                  const next = new Map(prev);
                  if (drafts.length === 0) next.delete(key); else next.set(key, drafts);
                  return next;
                });
              }}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

// Episode Editor Component
interface EpisodeEditorProps {
  episode: Episode;
  episodeIndex: number;
  seasonIndex: number;
  onUpdateEpisode: (episode: Episode) => void;
  onRemoveEpisode: () => void;
  isNovela: boolean;
  onPreviewEpisode: (episodeId?: number, title?: string, poster?: string) => void;
  pendingStreams: PendingStreamDraft[];
  onPendingStreamsChange: (drafts: PendingStreamDraft[]) => void;
}

function EpisodeEditor({
  episode,
  episodeIndex,
  seasonIndex,
  onUpdateEpisode,
  onRemoveEpisode,
  isNovela,
  onPreviewEpisode,
  pendingStreams: pendingStreamDrafts,
  onPendingStreamsChange }: EpisodeEditorProps) {
  const [decryptedUrl, setDecryptedUrl] = React.useState<string>('');
  const [isLoadingUrl, setIsLoadingUrl] = React.useState(false);
  const [subtitleTracks, setSubtitleTracks] = React.useState<Array<{
    id: number;
    language: string;
    label?: string;
    url?: string;
  }>>([]);
  const [subtitleLanguage, setSubtitleLanguage] = React.useState('en');
  const [subtitleFile, setSubtitleFile] = React.useState<File | null>(null);
  const [isUploadingSubtitle, setIsUploadingSubtitle] = React.useState(false);
  const [deletingSubtitleId, setDeletingSubtitleId] = React.useState<number | null>(null);
  const subtitleFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const userEditedUrlRef = React.useRef(false);
  const { t } = useTranslation(['admin/episodes', 'admin', 'translation']);

  // ── Episode Streams State ──
  interface StreamDraft { stream_url: string; quality: string; language: string; audio_languages: string; format: string; drm_keys: string; drm_type: string; }
  const emptyStreamDraft: StreamDraft = { stream_url: '', quality: '', language: '', audio_languages: '', format: '', drm_keys: '', drm_type: '' };
  const [episodeStreams, setEpisodeStreams] = React.useState<Array<{
    id: number; stream_url: string; quality?: string; language?: string; audio_languages?: string;
    format?: string; drm_type?: string; drm_keys?: string; is_default: boolean;
  }>>([]);
  const [loadingStreams, setLoadingStreams] = React.useState(false);
  const [showStreamForm, setShowStreamForm] = React.useState(false);
  const [newStream, setNewStream] = React.useState<StreamDraft>(emptyStreamDraft);
  const [addingStream, setAddingStream] = React.useState(false);
  const [editingStreamId, setEditingStreamId] = React.useState<number | null>(null);
  const [uploadingStreamFile, setUploadingStreamFile] = React.useState(false);
  const streamFileRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    // Only load decrypted URL if we have an ID (existing episode)
    // For new episodes, we just use the video_url from props
    let isActive = true;
    userEditedUrlRef.current = false;

    const loadDecryptedUrl = async () => {
      if (episode.id) {
        setIsLoadingUrl(true);
        try {
          const result = await contentService.getEpisodeForEditing(episode.id);
          if (isActive) {
            if (result.success && result.data?.stream_url) {
              // Avoid overriding user edits if request returns late.
              if (!userEditedUrlRef.current) {
                setDecryptedUrl(result.data.stream_url);
              }
            } else {
              if (!userEditedUrlRef.current) {
                setDecryptedUrl(episode.video_url || '');
              }
            }
          }
        } catch (error) {
          console.error('Error loading decrypted URL:', error);
          if (isActive && !userEditedUrlRef.current) setDecryptedUrl(episode.video_url || '');
        } finally {
          if (isActive) setIsLoadingUrl(false);
        }
      } else {
        // Only update if it differs significantly to avoid cursor jumps,
        // but ideally we rely on local state for typing.
        // Here we just sync initial or external changes.
        if (episode.video_url !== decryptedUrl) {
          setDecryptedUrl(episode.video_url || '');
        }
      }
    };

    // We intentionally omit episode.video_url from deps to avoid circular loop while typing
    // We only want to re-load if the episode ID changes (switching episodes)
    loadDecryptedUrl();

    return () => { isActive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode.id]);

  const loadEpisodeSubtitles = React.useCallback(async (): Promise<number> => {
    if (!episode.id) {
      setSubtitleTracks([]);
      return 0;
    }

    const result = await contentService.getEpisodeSubtitles(episode.id);
    if (result.success && Array.isArray(result.data)) {
      const tracks = result.data.map((track) => ({
        id: Number(track.id),
        language: String(track.language || '').toUpperCase(),
        label: track.label,
        url: track.url
      }));
      setSubtitleTracks(tracks);
      return tracks.length;
    }

    setSubtitleTracks([]);
    return 0;
  }, [episode.id]);

  React.useEffect(() => {
    loadEpisodeSubtitles().catch(() => {
      setSubtitleTracks([]);
    });
  }, [loadEpisodeSubtitles]);

  const handleUploadSubtitle = async () => {
    if (!episode.id || !subtitleFile || !subtitleLanguage.trim()) return;

    setIsUploadingSubtitle(true);
    const result = await contentService.uploadEpisodeSubtitle(
      episode.id,
      subtitleFile,
      subtitleLanguage
    );
    setIsUploadingSubtitle(false);

    if (!result.success) {
      toast.error(apiErrorMessage(result.error, t('episodes.subtitleUploadFailed')));
      return;
    }

    toast.success(t('episodes.subtitleUploaded'));
    setSubtitleFile(null);
    if (subtitleFileInputRef.current) {
      subtitleFileInputRef.current.value = '';
    }
    const count = await loadEpisodeSubtitles();
    updateEpisodeField('has_subtitles', count > 0);
  };

  const handleDeleteSubtitle = async (subtitleId: number) => {
    if (!episode.id) return;

    setDeletingSubtitleId(subtitleId);
    const result = await contentService.deleteEpisodeSubtitle(episode.id, subtitleId);
    setDeletingSubtitleId(null);

    if (!result.success) {
      toast.error(apiErrorMessage(result.error, t('episodes.subtitleDeleteFailed')));
      return;
    }

    toast.success(t('episodes.subtitleDeleted'));
    const count = await loadEpisodeSubtitles();
    updateEpisodeField('has_subtitles', count > 0);
  };

  const updateEpisodeField = (
    field: keyof Episode,
    value: string | number | boolean | undefined
  ) => {
    onUpdateEpisode({
      ...episode,
      [field]: value
    });
  };

  // ── Episode Streams CRUD ──
  const loadEpisodeStreams = React.useCallback(async () => {
    if (!episode.id) return;
    setLoadingStreams(true);
    try {
      const result = await contentService.getEpisodeStreams(episode.id);
      if (result.success && Array.isArray(result.data)) {
        setEpisodeStreams(result.data.map(s => ({
          id: s.id, stream_url: s.stream_url,
          quality: s.quality || undefined, language: s.language || undefined,
          audio_languages: s.audio_languages || undefined,
          format: s.format || undefined,
          drm_type: s.drm_type || undefined, drm_keys: s.drm_keys || undefined,
          is_default: s.is_default,
        })));
      } else { setEpisodeStreams([]); }
    } catch { setEpisodeStreams([]); }
    setLoadingStreams(false);
  }, [episode.id]);

  React.useEffect(() => { loadEpisodeStreams(); }, [loadEpisodeStreams]);

  const handleAddEpisodeStream = async () => {
    if (!newStream.stream_url.trim()) return;

    if (episode.id) {
      // ── Existing episode: call API directly ──
      setAddingStream(true);
      try {
        const payload: Record<string, unknown> = {
          stream_url: newStream.stream_url,
          quality: newStream.quality || undefined,
          language: newStream.language || undefined,
          audio_languages: newStream.audio_languages || undefined,
          format: newStream.format || undefined,
          drm_keys: newStream.drm_keys || undefined,
          drm_type: newStream.drm_type || undefined,
          is_default: episodeStreams.length === 0,
        };
        await contentService.addEpisodeStream(episode.id, payload);
        toast.success(t('episodes.streamAdded', { defaultValue: 'Stream added' }));
        setNewStream(emptyStreamDraft);
        setShowStreamForm(false);
        await loadEpisodeStreams();
      } catch (err) { console.error('Add stream failed:', err); }
      setAddingStream(false);
    } else {
      // ── New episode: store draft locally ──
      const draft: PendingStreamDraft = { ...newStream };
      onPendingStreamsChange([...pendingStreamDrafts, draft]);
      toast.success(t('episodes.streamAdded', { defaultValue: 'Stream queued (will be saved with episode)' }));
      setNewStream(emptyStreamDraft);
      setShowStreamForm(false);
    }
  };

  const handleSaveEditStream = async () => {
    if (!episode.id || !editingStreamId || !newStream.stream_url.trim()) return;
    setAddingStream(true);
    try {
      const payload: Record<string, unknown> = {
        stream_url: newStream.stream_url,
        quality: newStream.quality || undefined,
        language: newStream.language || undefined,
        audio_languages: newStream.audio_languages || undefined,
        format: newStream.format || undefined,
        drm_keys: newStream.drm_keys || undefined,
        drm_type: newStream.drm_type || undefined,
      };
      await contentService.updateEpisodeStream(episode.id, editingStreamId, payload);
      toast.success(t('episodes.streamUpdated', { defaultValue: 'Stream updated' }));
      setNewStream(emptyStreamDraft);
      setEditingStreamId(null);
      setShowStreamForm(false);
      await loadEpisodeStreams();
    } catch (err) { console.error('Edit stream failed:', err); }
    setAddingStream(false);
  };

  const handleSetDefaultEpisodeStream = async (streamId: number) => {
    if (!episode.id) return;
    try {
      await contentService.updateEpisodeStream(episode.id, streamId, { is_default: true } as any);
      await loadEpisodeStreams();
    } catch (err) { console.error('Set default failed:', err); }
  };

  const handleEditEpisodeStream = (s: typeof episodeStreams[0]) => {
    setEditingStreamId(s.id);
    setNewStream({
      stream_url: s.stream_url || '',
      quality: s.quality || '',
      language: s.language || '',
      audio_languages: s.audio_languages || '',
      format: s.format || '',
      drm_keys: s.drm_keys || '',
      drm_type: s.drm_type || '',
    });
    setShowStreamForm(true);
  };

  const handleDeleteEpisodeStream = async (streamId: number) => {
    if (!episode.id) return;
    if (!window.confirm('Delete this stream?')) return;
    try {
      await contentService.deleteEpisodeStream(episode.id, streamId);
      toast.success(t('episodes.streamDeleted', { defaultValue: 'Stream deleted' }));
      await loadEpisodeStreams();
    } catch (err) { console.error('Delete stream failed:', err); }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`episode_title_${seasonIndex}_${episodeIndex}`}>{t('episodes.episodeTitle')}</Label>
          <Input
            id={`episode_title_${seasonIndex}_${episodeIndex}`}
            value={episode.title}
            onChange={(e) => updateEpisodeField('title', e.target.value)}
            placeholder={t('episodes.defaultEpisodeTitle', { number: episode.episode_number })}
          />
        </div>
        <div>
          <Label htmlFor={`episode_number_${seasonIndex}_${episodeIndex}`}>{t('episodes.episodeNumber')}</Label>
          <Input
            id={`episode_number_${seasonIndex}_${episodeIndex}`}
            type="number"
            value={episode.episode_number}
            onChange={(e) => updateEpisodeField('episode_number', parseInt(e.target.value))}
            min="1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`episode_description_${seasonIndex}_${episodeIndex}`}>{t('episodes.description')}</Label>
        <Textarea
          id={`episode_description_${seasonIndex}_${episodeIndex}`}
          value={episode.description || ''}
          onChange={(e) => updateEpisodeField('description', e.target.value)}
          placeholder={t('episodes.episodeDescriptionPlaceholder')}
          rows={2}
        />
      </div>

      <div>
        <Label htmlFor={`episode_video_url_${seasonIndex}_${episodeIndex}`}>
          {t('episodes.videoUrlLabel')} <span className="text-sm text-gray-500 ml-2">({t('episodes.videoExamples')})</span>
        </Label>
        <VideoUploadField
          value={decryptedUrl}
          onChange={(val) => {
            userEditedUrlRef.current = true;
            setDecryptedUrl(val);
            updateEpisodeField('video_url', val);
          }}
          onUpload={async (file) => {
            if (!episode.id) return '';
            const result = await contentService.uploadEpisodeVideo(episode.id, file);
            if (result.success && result.data) {
              return result.data.path;
            }
            throw new Error(result.error?.details || 'Upload failed');
          }}
          uploadId={episode.id}
          placeholder={t('createContent.form.videoUrlPlaceholder', { ns: 'translation' })}
          className={`text-lg p-0 ${decryptedUrl ? 'border-green-300' : 'border-red-300'}`} // p-0 to let internal input handle padding if needed, or adjust
        />
        {isLoadingUrl && (
          <p className="text-sm text-gray-500 mt-1">🔓 {t('episodes.decrypting')}</p>
        )}
      </div>

      {/* ── Multi-Stream Manager (per episode) ── */}
      <div className="rounded-md border p-3 bg-muted/10 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Streams</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => { setEditingStreamId(null); setNewStream(emptyStreamDraft); setShowStreamForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Stream
          </Button>
        </div>

        {episode.id && loadingStreams ? (
          <p className="text-xs text-muted-foreground py-2">Loading streams…</p>
        ) : (episodeStreams.length === 0 && pendingStreamDrafts.length === 0) ? (
          <p className="text-xs text-muted-foreground py-2">No streams yet. Add one to enable playback.</p>
        ) : (
          <div className="space-y-2">
            {episodeStreams.map((s) => (
              <div key={s.id} className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${s.is_default ? 'border-primary bg-primary/5' : 'bg-white'}`}>
                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                  {s.is_default && <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">DEFAULT</span>}
                  {s.quality && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{s.quality}</span>}
                  {s.language && <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{s.language}</span>}
                  {s.audio_languages && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">🔊 {s.audio_languages}</span>}
                  {s.format && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{s.format}</span>}
                  {s.drm_type && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">🔒 {s.drm_type}</span>}
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={s.stream_url}>{s.stream_url}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!s.is_default && (
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleSetDefaultEpisodeStream(s.id)} title="Set as default">
                      ⭐
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleEditEpisodeStream(s)} title="Edit stream">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2 text-red-600 hover:text-red-700" onClick={() => handleDeleteEpisodeStream(s.id)} title="Delete stream">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {/* Pending stream drafts (for new episodes not yet saved) */}
            {pendingStreamDrafts.map((d, idx) => (
              <div key={`pending-${idx}`} className="flex items-center gap-2 rounded border border-dashed border-yellow-400 px-3 py-2 text-sm bg-yellow-50">
                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] font-bold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded">PENDING</span>
                  {d.quality && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{d.quality}</span>}
                  {d.language && <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{d.language}</span>}
                  {d.format && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{d.format}</span>}
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={d.stream_url}>{d.stream_url}</span>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2 text-red-600" onClick={() => {
                  onPendingStreamsChange(pendingStreamDrafts.filter((_, i) => i !== idx));
                }} title="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit Stream inline form */}
        {showStreamForm && (
          <div className="rounded border border-dashed border-primary/40 p-3 bg-primary/5 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="md:col-span-2">
                <Label className="text-xs">Stream URL *</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={newStream.stream_url}
                    onChange={(e) => setNewStream(p => ({ ...p, stream_url: e.target.value }))}
                    placeholder="https://... or /media/..."
                    disabled={uploadingStreamFile}
                  />
                  <input
                    ref={streamFileRef}
                    type="file"
                    accept="video/*,.mkv,.avi,.ts,.m2ts"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !episode.id) return;
                      setUploadingStreamFile(true);
                      try {
                        const result = await contentService.uploadEpisodeVideo(episode.id, file);
                        if (result.success && result.data?.path) {
                          setNewStream(p => ({ ...p, stream_url: result.data!.path }));
                        } else {
                          console.error('Upload failed:', result.error);
                        }
                      } catch (err) {
                        console.error('Upload error:', err);
                      }
                      setUploadingStreamFile(false);
                      if (streamFileRef.current) streamFileRef.current.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={uploadingStreamFile}
                    onClick={() => streamFileRef.current?.click()}
                  >
                    {uploadingStreamFile ? (
                      <span className="animate-spin mr-1">⏳</span>
                    ) : (
                      <Upload className="w-4 h-4 mr-1" />
                    )}
                    {uploadingStreamFile ? 'Uploading…' : 'Upload File'}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Quality</Label>
                <select
                  value={newStream.quality}
                  onChange={(e) => setNewStream(p => ({ ...p, quality: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">—</option>
                  <option value="360p">360p</option>
                  <option value="480p">480p</option>
                  <option value="720p">720p (HD)</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="4K">4K (Ultra HD)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Language</Label>
                <Input value={newStream.language} onChange={(e) => setNewStream(p => ({ ...p, language: e.target.value }))} placeholder="ENG, ESP, LAT..." />
              </div>
              <div>
                <Label className="text-xs">Audio</Label>
                <Input value={newStream.audio_languages} onChange={(e) => setNewStream(p => ({ ...p, audio_languages: e.target.value }))} placeholder="DUAL, 5.1, ENG-LAT..." />
              </div>
              <div>
                <Label className="text-xs">Format</Label>
                <select
                  value={newStream.format}
                  onChange={(e) => setNewStream(p => ({ ...p, format: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">—</option>
                  <option value="HLS">HLS (m3u8)</option>
                  <option value="DASH">DASH (mpd)</option>
                  <option value="FILE">File (mp4, mkv, avi…)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">DRM Type</Label>
                <select
                  value={newStream.drm_type}
                  onChange={(e) => setNewStream(p => ({ ...p, drm_type: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">None</option>
                  <option value="clearkey">ClearKey</option>
                  <option value="widevine">Widevine</option>
                  <option value="playready">PlayReady</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">DRM Keys (kid_hex:key_hex)</Label>
                <Textarea
                  value={newStream.drm_keys}
                  onChange={(e) => setNewStream(p => ({ ...p, drm_keys: e.target.value }))}
                  placeholder="kid_hex:key_hex"
                  rows={2}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">One key per line</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              {editingStreamId ? (
                <Button type="button" size="sm" onClick={handleSaveEditStream} disabled={addingStream || !newStream.stream_url.trim()}>
                  {addingStream ? '⏳' : <Pencil className="w-4 h-4 mr-1" />} Update Stream
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={handleAddEpisodeStream} disabled={addingStream || !newStream.stream_url.trim()}>
                  {addingStream ? '⏳' : <Plus className="w-4 h-4 mr-1" />} Add Stream
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => { setShowStreamForm(false); setEditingStreamId(null); setNewStream(emptyStreamDraft); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`episode_poster_${seasonIndex}_${episodeIndex}`}>{t('episodes.posterUrl')}</Label>
          <Input
            id={`episode_poster_${seasonIndex}_${episodeIndex}`}
            value={episode.poster_url || ''}
            onChange={(e) => updateEpisodeField('poster_url', e.target.value)}
            placeholder={t('createContent.form.posterUrlPlaceholder', { ns: 'translation' })}
          />
        </div>
        <div>
          <Label htmlFor={`episode_runtime_${seasonIndex}_${episodeIndex}`}>{t('episodes.runtimeMinutes')}</Label>
          <Input
            id={`episode_runtime_${seasonIndex}_${episodeIndex}`}
            type="number"
            value={episode.runtime || ''}
            onChange={(e) => updateEpisodeField('runtime', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="45"
            min="1"
          />
        </div>
      </div>

      <div className="rounded-md border p-3 bg-muted/20 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t('episodes.externalSubtitles')}</Label>
          <Badge variant="outline">{subtitleTracks.length}</Badge>
        </div>

        {subtitleTracks.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('episodes.noSubtitlesForEpisode')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subtitleTracks.map((track) => (
              <div
                key={track.id}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs bg-white"
              >
                {track.url ? (
                  <a
                    href={track.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono hover:text-primary transition"
                  >
                    {track.language}
                  </a>
                ) : (
                  <span className="font-mono">{track.language}</span>
                )}
                <button
                  type="button"
                  className="text-red-600 hover:text-red-700 disabled:opacity-50"
                  disabled={deletingSubtitleId === track.id}
                  onClick={() => handleDeleteSubtitle(track.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[130px_1fr_auto] gap-2 items-end">
          <div>
            <Label htmlFor={`episode_subtitle_language_${seasonIndex}_${episodeIndex}`}>{t('common.language')}</Label>
            <Input
              id={`episode_subtitle_language_${seasonIndex}_${episodeIndex}`}
              value={subtitleLanguage}
              onChange={(e) => setSubtitleLanguage(e.target.value.trim().toLowerCase())}
              placeholder={t('episodes.subtitleLanguagePlaceholder')}
              maxLength={16}
            />
          </div>
          <div>
            <Label htmlFor={`episode_subtitle_file_${seasonIndex}_${episodeIndex}`}>{t('episodes.subtitleFileLabel')}</Label>
            <Input
              id={`episode_subtitle_file_${seasonIndex}_${episodeIndex}`}
              ref={subtitleFileInputRef}
              type="file"
              accept=".srt,.vtt,text/vtt,application/x-subrip"
              onChange={(e) => setSubtitleFile(e.target.files?.[0] ?? null)}
              disabled={!episode.id}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              onClick={handleUploadSubtitle}
              disabled={!episode.id || isUploadingSubtitle || !subtitleFile || !subtitleLanguage.trim()}
            >
              {isUploadingSubtitle ? t('common.uploading') : t('episodes.uploadSubtitle')}
            </Button>
            {!episode.id && (
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {t('episodes.saveFirstToUpload', { defaultValue: 'Save episode first to upload subtitles' })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!episode.id}
          onClick={() => onPreviewEpisode(episode.id, episode.title, episode.poster_url || episode.image_url)}
        >
          <Play className="h-4 w-4 mr-2" />
          {t('episodes.preview')}
        </Button>
        <Button onClick={onRemoveEpisode} variant="destructive" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          {t('episodes.removeEpisode')}
        </Button>
      </div>
    </div>
  );
}
