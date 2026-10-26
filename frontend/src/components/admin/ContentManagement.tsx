'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Film, Trash2, Search, Settings2, FolderSearch, RefreshCw, Loader2, Wand2, ChevronDown, Upload } from 'lucide-react';
import { contentService, tmdbService } from '@/services';
import { Content, ContentType, TmdbMetadataRefreshResult } from '@/types';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import CreateContentDialog from './CreateContentDialog';
import CreateSeriesFromTMDBDialog from './CreateSeriesFromTMDBDialog';
import EditContentDialog from './EditContentDialog';
import EditTVChannelDialog from './EditTVChannelDialog';
import EditEventDialog from './EditEventDialog';
import EditSeriesDialog from './EditSeriesDialog';
import BulkImportTVChannelsDialog from './BulkImportTVChannelsDialog';
import BulkImportContentDialog from './BulkImportContentDialog';
import MovieContentForm from '../content/MovieContentForm';
import LiveTVContentForm from '../content/LiveTVContentForm';
import ManualMovieForm from '../content/ManualMovieForm';
import ManualSeriesForm from '../content/ManualSeriesForm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ManageTVChannelCategoriesDialog from './ManageTVChannelCategoriesDialog';
import TvProviderManagerDialog from './TvProviderManagerDialog';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { CATEGORY_CONFIG, type ActionConfig, type CategoryConfig } from './contentManagement/config';
import { inferVideoType, streamKind } from './contentManagement/stream';
import ContentTable from './contentManagement/ContentTable';
import ContentFilters from './contentManagement/ContentFilters';
import { AdminSectionHeader } from './AdminSectionHeader';
import { toProxiedStreamUrl } from '@/lib/streamProxy';

interface ContentManagementProps {
  className?: string;
}

export default function ContentManagement({ className }: ContentManagementProps) {
  const nsLoading = useLoadNamespace('admin/content');
  const { t, i18n } = useTranslation(['admin/content', 'admin', 'translation']);
  const [selectedCategory, setSelectedCategory] = useState<ContentType>(ContentType.VOD);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateSeriesDialogOpen, setIsCreateSeriesDialogOpen] = useState(false);
  const [isCreateMovieDialogOpen, setIsCreateMovieDialogOpen] = useState(false);
  const [isCreateLiveTVDialogOpen, setIsCreateLiveTVDialogOpen] = useState(false);
  const [isBulkImportDialogOpen, setIsBulkImportDialogOpen] = useState(false);
  const [isBulkImportContentDialogOpen, setIsBulkImportContentDialogOpen] = useState(false);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [isCreateManualMovieDialogOpen, setIsCreateManualMovieDialogOpen] = useState(false);
  const [isCreateManualSeriesDialogOpen, setIsCreateManualSeriesDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isProviderManagerOpen, setIsProviderManagerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showColumns, setShowColumns] = useState(false);
  const [colDescription, setColDescription] = useState(true);
  const [colType, setColType] = useState(true);
  const [colStatus, setColStatus] = useState(true);
  const [colCreated, setColCreated] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [countryFilter, setCountryFilter] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<Content | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDrmKeys, setPreviewDrmKeys] = useState<string | null>(null);
  const [previewLicenseServerUrl, setPreviewLicenseServerUrl] = useState<string | null>(null);
  const [previewDrmType, setPreviewDrmType] = useState<'clearkey' | 'widevine' | 'playready' | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const previewRequestRef = useRef<number | null>(null);

  // TMDB Enrich single content
  const [isEnrichDialogOpen, setIsEnrichDialogOpen] = useState(false);
  const [enrichContent, setEnrichContent] = useState<Content | null>(null);
  const [enrichTmdbId, setEnrichTmdbId] = useState('');
  const [enrichMediaType, setEnrichMediaType] = useState<'movie' | 'tv'>('tv');
  const [enrichSearchMode, setEnrichSearchMode] = useState<'id' | 'search'>('id');
  const [enrichSearchQuery, setEnrichSearchQuery] = useState('');
  const [enrichSearchResults, setEnrichSearchResults] = useState<Array<{ id: number; title: string; year?: number; poster_url?: string; overview?: string }>>([]);
  const [enrichSearchLoading, setEnrichSearchLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSaveRef = useRef<number>(0);
  // Using Shaka for all streams - no mode selector needed
  const { confirm: confirmAction, ConfirmationDialog } = useConfirmation();
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  const categories = useMemo(
    () => CATEGORY_CONFIG.map((category) => ({
      ...category,
      // Note: keys live under the "content" root inside the admin/content namespace file.
      label: t(category.labelKey.replace('admin.content.', 'content.')),
      description: t(category.descriptionKey.replace('admin.content.', 'content.'))
    })),
    // Also re-run when namespace loading state changes so translations populate after hydration
    [t, i18n.language, nsLoading]
  );

  const currentCategory = categories.find((cat) => cat.type === selectedCategory);
  const tmdbCategoryType = currentCategory?.tmdbType;

  // Compute type column label based on category (used in table and column toggle)
  const typeColumnLabel = useMemo(() => {
    switch (selectedCategory) {
      case ContentType.TV:
        return t('content.table.columns.format');
      case ContentType.EVENTS:
        return t('content.table.columns.type');
      default:
        return t('content.table.columns.year');
    }
  }, [selectedCategory, t]);

  useEffect(() => {
    setPage(1);
  }, [selectedCategory]);

  // Load preferences (v1 global)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('admin_content_prefs');
      if (raw) {
        const prefs = JSON.parse(raw);
        if (typeof prefs.searchTerm === 'string') setSearchTerm(prefs.searchTerm);
        if (prefs.filterActive === 'all' || prefs.filterActive === 'active' || prefs.filterActive === 'inactive') setFilterActive(prefs.filterActive);
        if (typeof prefs.colDescription === 'boolean') setColDescription(prefs.colDescription);
        if (typeof prefs.colType === 'boolean') setColType(prefs.colType);
        if (typeof prefs.colStatus === 'boolean') setColStatus(prefs.colStatus);
        if (typeof prefs.colCreated === 'boolean') setColCreated(prefs.colCreated);
        if (typeof prefs.yearFilter === 'string') setYearFilter(prefs.yearFilter);
        if (typeof prefs.providerFilter === 'string') setProviderFilter(prefs.providerFilter);
        if (typeof prefs.countryFilter === 'string') setCountryFilter(prefs.countryFilter);
        if (typeof prefs.pageSize === 'number' && prefs.pageSize > 0) setPageSize(prefs.pageSize);
      }
    } catch { }
  }, []);

  // Save preferences
  useEffect(() => {
    try {
      const prefs = {
        searchTerm,
        filterActive,
        colDescription,
        colType,
        colStatus,
        colCreated,
        yearFilter,
        providerFilter,
        countryFilter,
        pageSize
      };
      localStorage.setItem('admin_content_prefs', JSON.stringify(prefs));
    } catch { }
  }, [searchTerm, filterActive, colDescription, colType, colStatus, colCreated, yearFilter, providerFilter, countryFilter, pageSize]);

  useEffect(() => {
    setIsPreviewOpen(false);
    setPreviewContent(null);
    setPreviewUrl(null);
    setPreviewDrmKeys(null);
    setPreviewLicenseServerUrl(null);
    setPreviewDrmType(null);
    setIsPreviewLoading(false);
    previewRequestRef.current = null;
  }, [selectedCategory]);

  const handleClosePreview = () => {
    previewRequestRef.current = null;
    setIsPreviewOpen(false);
    setPreviewContent(null);
    setPreviewUrl(null);
    setIsPreviewLoading(false);
  };

  const handlePreviewContent = async (content: Content) => {
    previewRequestRef.current = content.id;
    setPreviewContent(content);
    setIsPreviewOpen(true);
    setPreviewUrl(null);
    setPreviewDrmKeys(null);
    setIsPreviewLoading(true);
    setPreviewError(null);

    try {
      const result = await contentService.getStreamUrl(content.id);

      if (previewRequestRef.current !== content.id) {
        return;
      }

      if (result.success && result.data) {
        const streamUrl = result.data.stream_url?.trim();
        const anyData: any = result.data as any;
        // Only capture ClearKey info for Live TV and Events
        if ((selectedCategory === ContentType.TV || selectedCategory === ContentType.EVENTS) && anyData && (anyData.drm_keys || anyData.drm_keys_hex)) {
          setPreviewDrmKeys(anyData.drm_keys || anyData.drm_keys_hex);
        }
        // Capture license server URL and DRM type for Widevine/PlayReady
        if (anyData && anyData.license_server_url) {
          setPreviewLicenseServerUrl(anyData.license_server_url);
        }
        if (anyData && anyData.drm_type) {
          setPreviewDrmType(anyData.drm_type);
        }
        if (streamUrl) {
          // Normalize backend absolute API URLs to same-origin relative, so CSP with default-src 'self' passes.
          let normalizedStreamUrl = streamUrl;
          try {
            if (normalizedStreamUrl.startsWith('/api/')) {
              // Keep the existing same-origin API URL.
            } else {
              const u = new URL(normalizedStreamUrl);
              if (u.pathname.startsWith('/api/')) {
                normalizedStreamUrl = `${u.pathname}${u.search}${u.hash}`;
              }
            }
          } catch {
            // Keep relative stream URLs as supplied by the backend.
          }
          setPreviewUrl(toProxiedStreamUrl(normalizedStreamUrl));
        } else {
          const fallback = t('content.preview.error', {});
          toast.error(fallback);
        }
      } else {
        const fallback = t('content.preview.error', {});
        toast.error(fallback);
      }
    } catch (err) {
      if (previewRequestRef.current === content.id) {
        console.error('Failed to load preview stream', err);
        const fallback = t('content.preview.error', {});
        toast.error(fallback);
      }
    } finally {
      if (previewRequestRef.current === content.id) {
        setIsPreviewLoading(false);
      }
    }
  };

  useEffect(() => {
    // Initialize adaptive/dash playback when URL changes
    let hlsInstance: any = null;
    let shakaPlayer: any = null;
    const video = videoRef.current;
    if (!isPreviewOpen || !previewUrl || !video) return;

    const url = previewUrl;
    const kind = streamKind(url);

    const cleanup = () => {
      try {
        if (hlsInstance) {
          hlsInstance.destroy();
          hlsInstance = null;
        }
        if (shakaPlayer) {
          shakaPlayer.destroy();
          shakaPlayer = null;
        }
      } catch { }
    };

    const setup = async () => {
      try {
        if (kind === 'HLS') {
          // hls.js handles PHP proxy URLs (stream.php?url=...m3u8) that
          // Shaka cannot play due to text/html Content-Type on sub-requests.
          try {
            const hlsMod: any = await import('hls.js');
            const HlsCtor = hlsMod?.default ?? hlsMod;
            if (HlsCtor?.isSupported?.()) {
              hlsInstance = new HlsCtor({ enableWorker: true, lowLatencyMode: true });
              hlsInstance.on(HlsCtor.Events.ERROR, (_e: any, data: any) => {
                if (!data?.fatal) return;
                console.error('[Admin preview] hls.js fatal error:', data.details);
                setPreviewError(`HLS error: ${data.details ?? 'unknown'}`);
              });
              hlsInstance.loadSource(url);
              hlsInstance.attachMedia(video);
              console.log('▶️ Admin preview: Loading HLS stream with hls.js:', url);
              return;
            }
          } catch { }
          // Fallback: try native HLS (Safari) or direct
          video.src = url;
          return;
        }

        if (kind === 'DASH') {
          await loadExternalScript('shaka-player-lib', '/vendor/shaka-player.compiled.min.js');
          const shaka = (window as any).shaka;
          if (!shaka) {
            setPreviewError(t('content.preview.error', {}));
            return;
          }
          shakaPlayer = new shaka.Player();
          await shakaPlayer.attach(video);
          try {
            shakaPlayer.addEventListener('error', (ev: any) => {
              const code = ev?.detail?.code || ev?.code;
              setPreviewError(`Shaka error: ${code ?? 'desconocido'}`);
            });
          } catch { }

          // Configure DRM based on available settings
          const drmConfig: any = {
            retryParameters: {
              maxAttempts: 3,
              baseDelay: 1000,
              backoffFactor: 2,
              fuzzFactor: 0.5
            }
          };

          // Determine if we should use Widevine/PlayReady (license server available)
          const useWidevine = previewLicenseServerUrl && (previewDrmType === 'widevine' || !previewDrmType);
          const usePlayReady = previewLicenseServerUrl && previewDrmType === 'playready';

          if (useWidevine) {
            drmConfig.servers = { 'com.widevine.alpha': previewLicenseServerUrl };
            drmConfig.advanced = {
              'com.widevine.alpha': { videoRobustness: 'SW_SECURE_CRYPTO', audioRobustness: 'SW_SECURE_CRYPTO' }
            };
            console.log('🔐 Admin preview: Configuring Widevine DRM with license server');
          } else if (usePlayReady) {
            drmConfig.servers = { 'com.microsoft.playready': previewLicenseServerUrl };
            console.log('🔐 Admin preview: Configuring PlayReady DRM with license server');
          } else if (previewDrmKeys) {
            const map: Record<string, string> = {};
            previewDrmKeys.split(',').forEach((pair: string) => {
              const [kid, key] = pair.split(':');
              if (kid && key) {
                map[kid.trim().toLowerCase()] = key.trim().toLowerCase();
              }
            });
            if (Object.keys(map).length > 0) {
              drmConfig.clearKeys = map;
              drmConfig.preferredKeySystems = ['org.w3.clearkey'];
              console.log('🔑 Admin preview: Configuring ClearKey DRM');
            }
          } else {
            drmConfig.preferredKeySystems = ['org.w3.clearkey'];
          }

          shakaPlayer.configure({ drm: drmConfig });
          console.log('▶️ Admin preview: Loading DASH stream with Shaka:', url);
          await shakaPlayer.load(url, undefined, 'application/dash+xml');
          return;
        }

        // Default: direct video (for non-streaming files like .mp4, .webm)
        video.src = url;
      } catch (e: any) {
        setPreviewError(
          t('content.preview.error', {})
        );
      }
    };

    setup();
    return cleanup;
  }, [isPreviewOpen, previewUrl, previewDrmKeys, previewLicenseServerUrl, previewDrmType]);

  // Restore preview media state (volume/position/player) when opening
  useEffect(() => {
    const video = videoRef.current;
    if (!isPreviewOpen || !previewUrl || !video || !previewContent?.id) return;
    try {
      const raw = localStorage.getItem(`preview_state.content.${previewContent.id}`);
      if (raw) {
        const state = JSON.parse(raw);
        if (typeof state.volume === 'number') video.volume = Math.max(0, Math.min(1, state.volume));
        const setTime = () => {
          if (typeof state.currentTime === 'number' && state.currentTime > 1) {
            try { video.currentTime = state.currentTime; } catch { }
          }
        };
        if (video.readyState >= 1) setTime(); else video.addEventListener('loadedmetadata', setTime, { once: true });
      }
    } catch { }
  }, [isPreviewOpen, previewUrl, previewContent?.id]);

  // Persist volume/position periodically and on changes
  useEffect(() => {
    const video = videoRef.current;
    if (!isPreviewOpen || !video || !previewContent?.id) return;
    const id = previewContent.id;
    const onTime = () => {
      const now = Date.now();
      if (now - lastSaveRef.current < 1500) return; // throttle
      lastSaveRef.current = now;
      try {
        const raw = localStorage.getItem(`preview_state.content.${id}`);
        const base = raw ? JSON.parse(raw) : {};
        base.currentTime = Math.floor(video.currentTime || 0);
        base.volume = video.volume;
        localStorage.setItem(`preview_state.content.${id}`, JSON.stringify(base));
      } catch { }
    };
    const onVolume = () => {
      try {
        const raw = localStorage.getItem(`preview_state.content.${id}`);
        const base = raw ? JSON.parse(raw) : {};
        base.volume = video.volume;
        localStorage.setItem(`preview_state.content.${id}`, JSON.stringify(base));
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
  }, [isPreviewOpen, previewContent?.id]);

  // (Removed player mode persistence - now always using Shaka)

  // Fetch content by category
  const {
    data: contentData,
    isLoading,
    error,
    isFetching } = useQuery({
      queryKey: ['content', selectedCategory, page, pageSize, searchTerm, filterActive],
      queryFn: async () => {
        const result = await contentService.getContent({
          type: selectedCategory,
          page,
          limit: pageSize,
          search: searchTerm || undefined,
          active: filterActive === 'active' ? true : filterActive === 'inactive' ? false : undefined
        });
        if (result.success) {
          return result.data;
        }
        throw new Error(result.error?.details ?? t('common.serverError'));
      },
      placeholderData: keepPreviousData
    });

  useEffect(() => {
    if (!contentData) {
      return;
    }

    if (contentData.total === 0) {
      if (page !== 1) {
        setPage(1);
      }
      return;
    }

    const maxPage = Math.max(1, Math.ceil(contentData.total / contentData.limit));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [contentData, page]);

  // Delete content mutation
  const deleteContentMutation = useMutation({
    mutationFn: async (contentId: number) => {
      const result = await contentService.deleteContent(contentId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.details ?? t('common.serverError'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
    }
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const result = await contentService.bulkDeleteContent(ids);
      if (result.success && result.data) {
        return result.data;
      }
      throw new Error(result.error?.details || t('common.serverError'));
    },
    onSuccess: () => {
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
    },
    onError: (err: any) => {
      toast.error(err instanceof Error ? err.message : t('common.serverError'));
    }
  });

  const tmdbRefreshMutation = useMutation<
    TmdbMetadataRefreshResult,
    Error,
    { categoryType: string; contentType: ContentType }
  >({
    mutationFn: async (variables) => {
      const result = await contentService.refreshTmdbMetadata({
        categoryType: variables.categoryType
      });

      if (result.success && result.data) {
        return result.data;
      }

      throw new Error(
        result.error?.details || t('content.tmdb.error')
      );
    },
    onSuccess: (data, variables) => {
      const summary = t('content.tmdb.success', {
        updated: data.updated,
        skipped: data.skipped
      });
      toast.success(summary);
      if (data.errors.length > 0) {
        toast.warning(t('content.tmdb.warning', { count: data.errors.length }));
      }
      if (data.logs.length > 0) {
        console.info('TMDB metadata refresh logs:', data.logs);
      }
      queryClient.invalidateQueries({ queryKey: ['content', variables.contentType] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('content.tmdb.error');
      toast.error(message);
    }
  });

  const { mutate: refreshMetadata, isPending: isRefreshingMetadata } = tmdbRefreshMutation;

  // Enrich single content with TMDB
  const enrichContentMutation = useMutation({
    mutationFn: async ({ contentId, tmdbId, mediaType }: { contentId: number; tmdbId: number; mediaType: string }) => {
      const result = await contentService.enrichContentTmdb(contentId, tmdbId, mediaType);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.details || t('common.serverError'));
    },
    onSuccess: () => {
      toast.success(t('content.tmdb.enrichSuccess'));
      queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
      setIsEnrichDialogOpen(false);
      setEnrichContent(null);
      setEnrichTmdbId('');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('common.serverError');
      toast.error(message);
    }
  });

  const handleEnrichContent = (content: Content) => {
    setEnrichContent(content);
    setEnrichTmdbId(content.tmdb_id?.toString() || '');
    // Auto-detect media type based on content type
    const isSeries = ['series', 'anime'].includes(content.content_type?.toLowerCase() || '');
    setEnrichMediaType(isSeries ? 'tv' : 'movie');
    setEnrichSearchMode('id');
    setEnrichSearchQuery('');
    setEnrichSearchResults([]);
    setIsEnrichDialogOpen(true);
  };

  const handleEnrichSearch = async () => {
    if (!enrichSearchQuery.trim()) return;
    setEnrichSearchLoading(true);
    try {
      const contentType = enrichMediaType === 'tv' ? ContentType.SERIES : ContentType.VOD;
      const result = await tmdbService.searchContent(enrichSearchQuery, contentType);
      if (result.success && result.data) {
        setEnrichSearchResults(result.data.map(r => ({
          id: r.id,
          title: r.title,
          year: r.year || (r.release_date ? parseInt(r.release_date.split('-')[0]) : undefined),
          poster_url: r.poster_url,
          overview: r.overview
        })));
      } else {
        setEnrichSearchResults([]);
      }
    } catch {
      setEnrichSearchResults([]);
    } finally {
      setEnrichSearchLoading(false);
    }
  };

  const handleSelectSearchResult = (result: { id: number; title: string }) => {
    setEnrichTmdbId(result.id.toString());
    setEnrichSearchMode('id');
    toast.success(t('content.tmdb.selectedResult', { title: result.title, id: result.id }));
  };

  const handleEditContent = (content: Content) => {
    setSelectedContent(content);
    setIsEditDialogOpen(true);
  };

  const handleDeleteContent = (contentId: number) => {
    confirmAction({
      title: t('content.confirmDelete'),
      description: t('content.confirmDeleteDescription'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: () => deleteContentMutation.mutate(contentId)
    });
  };

  // Clear selection when category/page changes
  useEffect(() => {
    setSelectedIds([]);
  }, [selectedCategory, page]);

  const handleRefreshMetadata = useCallback(() => {
    if (!tmdbCategoryType) return;
    const label = currentCategory?.label ?? t('content.tmdb.defaultCategory');
    if (!confirm(t('content.tmdb.confirm', { category: label }))) {
      return;
    }
    refreshMetadata({
      categoryType: tmdbCategoryType,
      contentType: selectedCategory
    });
  }, [tmdbCategoryType, currentCategory, t, refreshMetadata, selectedCategory]);

  const categoryActionConfigs = useMemo<ActionConfig[]>(() => {
    const actions: ActionConfig[] = [];

    switch (selectedCategory) {
      case ContentType.VOD:
        actions.push(
          {
            key: 'add-manual-movie',
            label: t('content.actions.addManualMovie'),
            icon: Plus,
            onSelect: () => setIsCreateManualMovieDialogOpen(true)
          },
          {
            key: 'add-from-tmdb',
            label: t('content.actions.addFromTmdb'),
            icon: Search,
            onSelect: () => setIsCreateMovieDialogOpen(true),
            variant: 'outline'
          },
          {
            key: 'bulk-import-m3u',
            label: t('content.actions.importFromM3U8'),
            icon: Upload,
            onSelect: () => setIsBulkImportContentDialogOpen(true),
            variant: 'outline'
          },
        );
        break;
      case ContentType.SERIES:
        actions.push(
          {
            key: 'add-manual-series',
            label: t('content.actions.addManualSeries'),
            icon: Plus,
            onSelect: () => setIsCreateManualSeriesDialogOpen(true)
          },
          {
            key: 'add-series-from-tmdb',
            label: t('content.actions.addFromTmdb'),
            icon: Search,
            onSelect: () => setIsCreateSeriesDialogOpen(true),
            variant: 'outline'
          },
          {
            key: 'bulk-import-m3u',
            label: t('content.actions.importFromM3U8'),
            icon: Upload,
            onSelect: () => setIsBulkImportContentDialogOpen(true),
            variant: 'outline'
          },
        );
        break;
      case ContentType.KIDS:
        actions.push(
          {
            key: 'add-manual-kids',
            label: t('content.actions.addManualKids'),
            icon: Plus,
            onSelect: () => setIsCreateManualMovieDialogOpen(true)
          },
          {
            key: 'add-kids-from-tmdb',
            label: t('content.actions.addFromTmdb'),
            icon: Search,
            onSelect: () => setIsCreateMovieDialogOpen(true),
            variant: 'outline'
          },
          {
            key: 'bulk-import-m3u',
            label: t('content.actions.importFromM3U8'),
            icon: Upload,
            onSelect: () => setIsBulkImportContentDialogOpen(true),
            variant: 'outline'
          },
        );
        break;
      case ContentType.ANIME:
        actions.push(
          {
            key: 'add-manual-anime',
            label: t('content.actions.addManualAnime'),
            icon: Plus,
            onSelect: () => setIsCreateManualSeriesDialogOpen(true)
          },
          {
            key: 'add-anime-from-tmdb',
            label: t('content.actions.addFromTmdb'),
            icon: Search,
            onSelect: () => setIsCreateSeriesDialogOpen(true),
            variant: 'outline'
          },
          {
            key: 'bulk-import-m3u',
            label: t('content.actions.importFromM3U8'),
            icon: Upload,
            onSelect: () => setIsBulkImportContentDialogOpen(true),
            variant: 'outline'
          },
        );
        break;
      case ContentType.TV:
        actions.push(
          {
            key: 'add-tv-channel',
            label: t('content.actions.addTvChannel'),
            icon: Plus,
            onSelect: () => setIsCreateLiveTVDialogOpen(true)
          },
          {
            key: 'bulk-import-tv',
            label: t('content.actions.bulkImport'),
            icon: Upload,
            onSelect: () => setIsBulkImportDialogOpen(true),
            variant: 'outline'
          },
          {
            key: 'manage-tv-categories',
            label: t('content.actions.manageCategories'),
            icon: Settings2,
            onSelect: () => setIsManageCategoriesOpen(true),
            variant: 'secondary',
            className: 'shadow-sm'
          },
        );
        break;
      case ContentType.EVENTS:
        actions.push({
          key: 'add-event',
          label: t('content.actions.addEvent'),
          icon: Plus,
          onSelect: () => setIsCreateLiveTVDialogOpen(true)
        });
        break;
      default:
        actions.push({
          key: 'add-content',
          label: t('content.actions.addContent'),
          icon: Plus,
          onSelect: () => setIsCreateDialogOpen(true)
        });
        break;
    }

    return actions;
  }, [selectedCategory, t, i18n.language, nsLoading]);

  const generalActionConfigs = useMemo<ActionConfig[]>(() => {
    const actions: ActionConfig[] = [];

    if (tmdbCategoryType) {
      actions.push({
        key: 'fill-metadata',
        label: t('content.actions.fillMetadata'),
        icon: isRefreshingMetadata ? Loader2 : Wand2,
        iconClassName: isRefreshingMetadata ? 'animate-spin' : undefined,
        onSelect: handleRefreshMetadata,
        disabled: isRefreshingMetadata
      });
    }

    if (selectedCategory === ContentType.TV) {
      actions.push({
        key: 'tv-providers',
        label: t('content.actions.tvProviders'),
        icon: RefreshCw,
        onSelect: () => setIsProviderManagerOpen(true)
      });
    }

    return actions;
  }, [
    selectedCategory,
    t,
    i18n.language,
    nsLoading,
    tmdbCategoryType,
    isRefreshingMetadata,
    handleRefreshMetadata,
  ]);

  const hasActionMenu = generalActionConfigs.length > 0 || categoryActionConfigs.length > 0;

  if (nsLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            {t('content.title')}
          </CardTitle>
          <CardDescription>{t('common.loading')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('common.loading')}</span>
        </CardContent>
      </Card>
    );
  }

  const renderCategoryActions = () => {
    if (categoryActionConfigs.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {categoryActionConfigs.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.key}
              onClick={action.onSelect}
              variant={action.variant}
              className={action.className}
              disabled={action.disabled}
            >
              {Icon ? <Icon className={cn('h-4 w-4 mr-2', action.iconClassName)} /> : null}
              {action.label}
            </Button>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`space-y-6 max-w-[1400px] mx-auto w-full ${className || ''}`}>
      <AdminSectionHeader
        icon={Film}
        title={t('content.title')}
        description={t('content.description')}
        actions={(
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <ContentFilters
              t={t}
              selectedCategory={selectedCategory}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              yearFilter={yearFilter}
              setYearFilter={setYearFilter}
              filterActive={filterActive}
              setFilterActive={setFilterActive}
              providerFilter={providerFilter}
              setProviderFilter={setProviderFilter}
              countryFilter={countryFilter}
              setCountryFilter={setCountryFilter}
              setPage={setPage}
              showColumns={showColumns}
              setShowColumns={setShowColumns}
              colDescription={colDescription}
              setColDescription={setColDescription}
              colType={colType}
              setColType={setColType}
              colStatus={colStatus}
              setColStatus={setColStatus}
              colCreated={colCreated}
              setColCreated={setColCreated}
              typeColumnLabel={typeColumnLabel}
            />
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              {/* Bulk delete selected items */}
              {selectedIds.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    confirmAction({
                      title: t('content.confirmBulkDelete', { count: selectedIds.length }),
                      description: t('content.confirmBulkDeleteDescription', { count: selectedIds.length }),
                      confirmText: t('common.delete'),
                      cancelText: t('common.cancel'),
                      variant: 'danger',
                      onConfirm: () => bulkDeleteMutation.mutate(selectedIds)
                    });
                  }}
                  disabled={bulkDeleteMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('content.actions.deleteSelected', { count: selectedIds.length })}
                </Button>
              )}

              {hasActionMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      {t('common.actions', {})}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {generalActionConfigs.map((action) => {
                      const Icon = action.icon;
                      return (
                        <DropdownMenuItem
                          key={action.key}
                          onSelect={() => action.onSelect()}
                          disabled={action.disabled}
                          className="flex items-center gap-2"
                        >
                          {Icon ? <Icon className={cn('h-4 w-4', action.iconClassName)} /> : null}
                          <span>{action.label}</span>
                        </DropdownMenuItem>
                      );
                    })}

                    {generalActionConfigs.length > 0 && categoryActionConfigs.length > 0 && (
                      <DropdownMenuSeparator />
                    )}

                    {categoryActionConfigs.map((action) => {
                      const Icon = action.icon;
                      return (
                        <DropdownMenuItem
                          key={action.key}
                          onSelect={() => action.onSelect()}
                          disabled={action.disabled}
                          className="flex items-center gap-2"
                        >
                          {Icon ? <Icon className={cn('h-4 w-4', action.iconClassName)} /> : null}
                          <span>{action.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        )}
      />

      <Card>
        <CardContent className="pt-6">
          <Tabs value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as ContentType)}>
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
              {categories.map((category) => (
                <TabsTrigger key={category.type} value={category.type} className="flex items-center gap-1">
                  {(() => { const Icon = category.icon; return <Icon className="h-3 w-3" />; })()}
                  <span className="hidden sm:inline">{category.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => (
              <TabsContent key={category.type} value={category.type} className="mt-6">
                <div className="mb-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    {(() => { const Icon = category.icon; return <Icon className="h-5 w-5" />; })()}
                    {category.label}
                  </h3>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
                <ContentTable
                  isLoading={isLoading}
                  error={error as Error | null}
                  isFetching={isFetching}
                  contentData={contentData}
                  currentCategory={currentCategory}
                  categoryActions={renderCategoryActions()}
                  yearFilter={yearFilter}
                  filterActive={filterActive}
                  providerFilter={providerFilter}
                  countryFilter={countryFilter}
                  selectedCategory={selectedCategory}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  onPreview={handlePreviewContent}
                  onEnrich={handleEnrichContent}
                  onEdit={handleEditContent}
                  onDelete={handleDeleteContent}
                  isDeleting={deleteContentMutation.isPending}
                  typeColumnLabel={typeColumnLabel}
                  colDescription={colDescription}
                  colType={colType}
                  colStatus={colStatus}
                  colCreated={colCreated}
                  pageSize={pageSize}
                  setPageSize={setPageSize}
                  setPage={setPage}
                  t={t}
                  i18nLanguage={i18n.language}
                />
              </TabsContent>
            ))}
          </Tabs>

          <Dialog
            open={isPreviewOpen}
            onOpenChange={(open) => {
              if (!open) {
                handleClosePreview();
              } else {
                setIsPreviewOpen(true);
              }
            }}
          >
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  {previewContent?.title ?? t('content.preview.title', {})}
                </DialogTitle>
                {previewContent?.description ? (
                  <DialogDescription className="text-sm text-muted-foreground">
                    {previewContent.description}
                  </DialogDescription>
                ) : null}
              </DialogHeader>
              <div className="space-y-4">
                {isPreviewLoading && (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!isPreviewLoading && previewError && (
                  <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
                    {previewError}
                  </div>
                )}
                {!isPreviewLoading && previewUrl && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5">
                      {streamKind(previewUrl)}
                    </span>
                    <button className="underline hover:text-foreground" onClick={() => { if (previewUrl) navigator.clipboard.writeText(previewUrl); }}>
                      {t('common.copy', {})} URL
                    </button>
                    <a className="underline hover:text-foreground" href={previewUrl} target="_blank" rel="noreferrer">
                      {t('common.open', {})}
                    </a>
                    <div className="ml-auto inline-flex items-center gap-1">
                      <span className="mr-1 text-muted-foreground">
                        {t('content.preview.playerLabel', { player: 'Shaka' })}
                      </span>
                    </div>
                  </div>
                )}
                {!isPreviewLoading && previewUrl && (
                  <video
                    key={previewUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full max-h-[70vh] rounded bg-black"
                    poster={previewContent?.poster_url || previewContent?.image_url}
                    ref={videoRef}
                  >
                    <source src={previewUrl} type={inferVideoType(previewUrl)} />
                    {t('content.preview.unsupported', {
                    })}
                  </video>
                )}
                {!isPreviewLoading && !previewUrl && (
                  <p className="text-sm text-muted-foreground">
                    {t('content.preview.notAvailable', {
                    })}
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Create Content Dialog */}
          <CreateContentDialog
            isOpen={isCreateDialogOpen}
            onClose={() => setIsCreateDialogOpen(false)}
            contentType={selectedCategory}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
              setIsCreateDialogOpen(false);
            }}
          />

          {/* Create Series/Anime from TMDB Dialog */}
          <CreateSeriesFromTMDBDialog
            isOpen={isCreateSeriesDialogOpen}
            onClose={() => setIsCreateSeriesDialogOpen(false)}
            contentType={selectedCategory as ContentType.SERIES | ContentType.ANIME}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
              setIsCreateSeriesDialogOpen(false);
            }}
          />

          {/* Movie Content Form (VOD + Kids) */}
          <MovieContentForm
            contentType={selectedCategory as ContentType.VOD | ContentType.KIDS}
            open={isCreateMovieDialogOpen}
            onOpenChange={setIsCreateMovieDialogOpen}
            onClose={() => {
              setIsCreateMovieDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
            }}
          />

          {/* Live TV Content Form (TV + Events) */}
          <LiveTVContentForm
            contentType={selectedCategory as ContentType.TV | ContentType.EVENTS}
            open={isCreateLiveTVDialogOpen}
            onOpenChange={setIsCreateLiveTVDialogOpen}
            onClose={() => {
              setIsCreateLiveTVDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
            }}
          />

          {/* Bulk Import TV Channels */}
          <BulkImportTVChannelsDialog
            open={isBulkImportDialogOpen}
            onOpenChange={setIsBulkImportDialogOpen}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
            }}
          />

          {/* Bulk Import Content (Movies/Series/Kids/Anime) from M3U */}
          <BulkImportContentDialog
            open={isBulkImportContentDialogOpen}
            onOpenChange={setIsBulkImportContentDialogOpen}
            contentType={selectedCategory}
            categoryLabel={currentCategory?.label || t('contentTypeExtended.content')}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
            }}
          />

          <ManageTVChannelCategoriesDialog
            open={isManageCategoriesOpen}
            onOpenChange={setIsManageCategoriesOpen}
          />

          <TvProviderManagerDialog
            open={isProviderManagerOpen}
            onOpenChange={setIsProviderManagerOpen}
          />

          {/* Manual Movie Form (VOD + Kids) */}
          <ManualMovieForm
            contentType={selectedCategory as ContentType.VOD | ContentType.KIDS}
            open={isCreateManualMovieDialogOpen}
            onOpenChange={setIsCreateManualMovieDialogOpen}
            onClose={() => {
              setIsCreateManualMovieDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
            }}
          />

          {/* Manual Series Form (Series + Anime) */}
          <ManualSeriesForm
            contentType={selectedCategory as ContentType.SERIES | ContentType.ANIME}
            open={isCreateManualSeriesDialogOpen}
            onOpenChange={setIsCreateManualSeriesDialogOpen}
            onClose={() => {
              setIsCreateManualSeriesDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
            }}
          />

          {/* Edit Content Dialog */}
          {selectedContent && (
            <>
              {(() => {
                const commonProps = {
                  isOpen: isEditDialogOpen,
                  onClose: () => {
                    setIsEditDialogOpen(false);
                    setSelectedContent(null);
                  },
                  content: selectedContent,
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: ['content', selectedCategory] });
                    setIsEditDialogOpen(false);
                    setSelectedContent(null);
                  }
                };

                // Use specific editor based on content type
                switch (selectedContent.content_type?.toLowerCase()) {
                  case 'tv':
                    return <EditTVChannelDialog {...commonProps} />;
                  case 'events':
                  case 'eventos':
                    return <EditEventDialog {...commonProps} />;
                  case 'series':
                    return <EditSeriesDialog {...commonProps} />;
                  case 'anime':
                    return <EditSeriesDialog {...commonProps} />; // Anime uses same as series
                  case 'vod':
                  case 'kids':
                  default:
                    return <EditContentDialog {...commonProps} />; // Default for VOD, Kids, and others
                }
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* TMDB Enrich Dialog */}
      <Dialog open={isEnrichDialogOpen} onOpenChange={setIsEnrichDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('content.tmdb.enrichTitle')}</DialogTitle>
            <DialogDescription>
              {t('content.tmdb.enrichDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('content.tmdb.contentTitle')}</label>
              <p className="text-sm text-muted-foreground">{enrichContent?.title}</p>
            </div>

            {/* Media Type Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('content.tmdb.mediaType')}</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="mediaType"
                    value="tv"
                    checked={enrichMediaType === 'tv'}
                    onChange={() => { setEnrichMediaType('tv'); setEnrichSearchResults([]); }}
                  />
                  <span className="text-sm">{t('content.tmdb.mediaTypeTvSeries')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="mediaType"
                    value="movie"
                    checked={enrichMediaType === 'movie'}
                    onChange={() => { setEnrichMediaType('movie'); setEnrichSearchResults([]); }}
                  />
                  <span className="text-sm">{t('content.tmdb.mediaTypeMovie')}</span>
                </label>
              </div>
            </div>

            {/* Tabs for ID vs Search */}
            <Tabs value={enrichSearchMode} onValueChange={(v) => setEnrichSearchMode(v as 'id' | 'search')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="id">{t('content.tmdb.byId')}</TabsTrigger>
                <TabsTrigger value="search">{t('content.tmdb.byName')}</TabsTrigger>
              </TabsList>

              <TabsContent value="id" className="space-y-2 mt-4">
                <label htmlFor="tmdb-id" className="text-sm font-medium">{t('content.tmdb.tmdbId')}</label>
                <input
                  id="tmdb-id"
                  type="number"
                  value={enrichTmdbId}
                  onChange={(e) => setEnrichTmdbId(e.target.value)}
                  placeholder="12345"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                />
              </TabsContent>

              <TabsContent value="search" className="space-y-3 mt-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={enrichSearchQuery}
                    onChange={(e) => setEnrichSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEnrichSearch()}
                    placeholder={t('content.tmdb.searchPlaceholder')}
                    className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  />
                  <Button onClick={handleEnrichSearch} disabled={enrichSearchLoading || !enrichSearchQuery.trim()}>
                    {enrichSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Search Results */}
                {enrichSearchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
                    {enrichSearchResults.map((result) => (
                      <div
                        key={result.id}
                        onClick={() => handleSelectSearchResult(result)}
                        className="flex gap-3 p-2 hover:bg-muted cursor-pointer"
                      >
                        {result.poster_url ? (
                          <img src={result.poster_url} alt="" className="w-10 h-14 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                            <Film className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.title}</p>
                          <p className="text-xs text-muted-foreground">ID: {result.id} {result.year && `• ${result.year}`}</p>
                          {result.overview && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{result.overview}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {enrichTmdbId && (
                  <p className="text-sm text-green-600">
                    {t('content.tmdb.selectedId', { id: enrichTmdbId })}
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEnrichDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (enrichContent && enrichTmdbId) {
                  enrichContentMutation.mutate({
                    contentId: enrichContent.id,
                    tmdbId: parseInt(enrichTmdbId, 10),
                    mediaType: enrichMediaType
                  });
                }
              }}
              disabled={!enrichTmdbId || enrichContentMutation.isPending}
            >
              {enrichContentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('content.tmdb.enrich')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog />
    </div>
  );
}
