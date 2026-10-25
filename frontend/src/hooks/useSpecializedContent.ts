import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { contentService } from '@/services/content';
import type { Content } from '@/types/content';
import type { 
  CreateKidsContentRequest,
  CreateAnimeContentRequest,
  CreateEventRequest
} from '@/services/content';

// Hook for Kids Content
export function useKidsContent() {
  const { t } = useTranslation();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = async (params?: { page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.getKidsContent(params);
      if (result.success) {
        setContent(result.data);
      } else {
        setError(result.error.details || t('user.kids.errorTitle'));
      }
    } catch {
      setError(t('user.kids.errorTitle'));
    } finally {
      setLoading(false);
    }
  };

  const createContent = async (data: CreateKidsContentRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.createKidsContent(data);
      if (result.success) {
        await fetchContent(); // Refresh list
        return result.data;
      } else {
        setError(result.error.details || t('common.serverError'));
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
    fetchContent();
  }, []);

  return {
    content,
    loading,
    error,
    fetchContent,
    createContent,
    refresh: fetchContent
  };
}

// Hook for Anime Content
export function useAnimeContent() {
  const { t } = useTranslation();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = async (params?: { page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.getAnimeContent(params);
      if (result.success) {
        setContent(result.data);
      } else {
        setError(result.error.details || t('user.anime.errorTitle'));
      }
    } catch {
      setError(t('user.anime.errorTitle'));
    } finally {
      setLoading(false);
    }
  };

  const createContent = async (data: CreateAnimeContentRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.createAnimeContent(data);
      if (result.success) {
        await fetchContent(); // Refresh list
        return result.data;
      } else {
        setError(result.error.details || t('common.serverError'));
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
    fetchContent();
  }, []);

  return {
    content,
    loading,
    error,
    fetchContent,
    createContent,
    refresh: fetchContent
  };
}

// Hook for Events
export function useEvents() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async (params?: { page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.getEvents(params);
      if (result.success) {
        setEvents(result.data);
      } else {
        setError(result.error.details || t('user.events.errorTitle'));
      }
    } catch {
      setError(t('user.events.errorTitle'));
    } finally {
      setLoading(false);
    }
  };

  const createEvent = async (data: CreateEventRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.createEvent(data);
      if (result.success) {
        await fetchEvents(); // Refresh list
        return result.data;
      } else {
        setError(result.error.details || t('common.serverError'));
        return null;
      }
    } catch {
      setError(t('common.serverError'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getEventsByDate = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentService.getEventsByDate(date);
      if (result.success) {
        return result.data;
      } else {
        setError(result.error.details || t('common.serverError'));
        return [];
      }
    } catch {
      setError(t('common.serverError'));
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  return {
    events,
    loading,
    error,
    fetchEvents,
    createEvent,
    getEventsByDate,
    refresh: fetchEvents
  };
}
