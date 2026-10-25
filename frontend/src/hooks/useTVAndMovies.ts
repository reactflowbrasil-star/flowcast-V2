import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { contentService } from '@/services/content';
import type { Content } from '@/types/content';
import { ContentType } from '@/types/content';
import type { CreateTVChannelRequest } from '@/services/content';
import { apiErrorMessage } from '@/lib/utils';

// Hook for TV Channels
export function useTVChannels() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = async (params?: { page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.getTVChannels(params);
      if (result.success) {
        setChannels(result.data);
        } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
      }
    } catch {
      setError(t('common.serverError'));
    } finally {
      setLoading(false);
    }
  };

  const createChannel = async (data: CreateTVChannelRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.createTVChannel(data);
      if (result.success) {
        await fetchChannels(); // Refresh list
        return result.data;
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
        return null;
      }
    } catch {
      setError(t('common.serverError'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateChannel = async (id: number, data: Partial<CreateTVChannelRequest>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.updateContent(id, {
        title: data.name,
        description: data.description,
        image_url: data.logo_url});
      if (result.success) {
        await fetchChannels(); // Refresh list
        return result.data;
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
        return null;
      }
    } catch {
      setError(t('common.serverError'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteChannel = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.deleteContent(id);
      if (result.success) {
        await fetchChannels(); // Refresh list
        return true;
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
        return false;
      }
    } catch {
      setError(t('common.serverError'));
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  return {
    channels,
    loading,
    error,
    fetchChannels,
    createChannel,
    updateChannel,
    deleteChannel,
    refresh: fetchChannels
  };
}

// Hook for Movies/VOD Content
export function useMovies() {
  const { t } = useTranslation();
  const [movies, setMovies] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMovies = async (params?: { page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.getMovies(params);
      if (result.success) {
        setMovies(result.data);
        } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
      }
    } catch {
      setError(t('common.serverError'));
    } finally {
      setLoading(false);
    }
  };

  const createMovie = async (data: {
    title: string;
    description?: string;
    image_url?: string;
    stream_url: string;
    tmdb_id?: number;
    year?: number;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.createContent({
        title: data.title,
        description: data.description,
        year: data.year,
        poster_url: data.image_url,
        video_url: data.stream_url,
        type: ContentType.VOD,
        tmdb_id: data.tmdb_id,
        active: true});
      if (result.success) {
        await fetchMovies(); // Refresh list
        return result.data;
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
        return null;
      }
    } catch {
      setError(t('common.serverError'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateMovie = async (id: number, data: {
    title?: string;
    description?: string;
    image_url?: string;
    stream_url?: string;
    tmdb_id?: number;
    year?: number;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.updateContent(id, data);
      if (result.success) {
        await fetchMovies(); // Refresh list
        return result.data;
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
        return null;
      }
    } catch {
      setError(t('common.serverError'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteMovie = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.deleteContent(id);
      if (result.success) {
        await fetchMovies(); // Refresh list
        return true;
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
        return false;
      }
    } catch {
      setError(t('common.serverError'));
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies();
  }, []);

  return {
    movies,
    loading,
    error,
    fetchMovies,
    createMovie,
    updateMovie,
    deleteMovie,
    refresh: fetchMovies
  };
}

// Hook for Series
export function useSeries() {
  const { t } = useTranslation();
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSeries = async (params?: { page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.getSeries(params?.page, params?.limit);
      if (result.success) {
        setSeries(result.data.series);
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
      }
    } catch {
      setError(t('common.serverError'));
    } finally {
      setLoading(false);
    }
  };

  const createSeries = async (data: {
    title: string;
    description?: string;
    image_url?: string;
    tmdb_id?: number;
    year?: number;
  }) => {
    setLoading(true);
    setError(null);
    try {
      // Convert simple request to complex format expected by service
      const complexData = {
        title: data.title,
        description: data.description,
        year: data.year,
        poster_url: data.image_url,
        tmdb_id: data.tmdb_id,
        active: true,
        seasons: [] // Empty seasons array for simple creation
      };
      const result = await contentService.createSeries(complexData);
      if (result.success) {
        await fetchSeries(); // Refresh list
        return result.data;
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
        return null;
      }
    } catch {
      setError(t('common.serverError'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getSeriesById = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.getSeriesById(id);
      if (result.success) {
        return result.data;
      } else {
        setError(apiErrorMessage(result.error, t('common.serverError')));
        return null;
      }
    } catch {
      setError(t('common.serverError'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeries();
  }, []);

  return {
    series,
    loading,
    error,
    fetchSeries,
    createSeries,
    getSeriesById,
    refresh: fetchSeries
  };
}
