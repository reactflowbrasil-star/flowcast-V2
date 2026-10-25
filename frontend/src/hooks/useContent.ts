// Content management hook

'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contentService } from '@/services';
import { apiErrorMessage } from '@/lib/utils';
import {
  SearchRequest,
  SearchResponse,
  StreamResponse,
  Content,
  ContentType
} from '@/types';

export function useCategories() {
  const { t } = useTranslation();
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const result = await contentService.getCategories();
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('products.errors.loadCategoriesFailed')));
    }});
}

export function useContentByCategory(categoryId: number, page: number = 1, limit: number = 20) {
  const { t } = useTranslation();
  return useQuery({
    queryKey: ['content', 'category', categoryId, page, limit],
    queryFn: async () => {
      const result = await contentService.getContentByCategory(categoryId, page, limit);
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('common.serverError')));
    },
    enabled: !!categoryId});
}

export function useSearchContent() {
  const { t } = useTranslation();
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchContent = useCallback(async (searchParams: SearchRequest) => {
    setIsSearching(true);
    setSearchError(null);

    try {
      const result = await contentService.searchContent(searchParams);

      if (result.success) {
        setSearchResults(result.data ?? null);
      } else {
        setSearchError(apiErrorMessage(result.error, t('common.serverError')));
        setSearchResults(null);
      }
    } catch {
      setSearchError(t('common.unknownError'));
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchResults(null);
    setSearchError(null);
  }, []);

  return {
    searchContent,
    clearSearch,
    isSearching,
    searchResults,
    searchError};
}

export function useStreamUrl() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [streamData, setStreamData] = useState<StreamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getStreamUrl = useCallback(async (contentId: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await contentService.getStreamUrl(contentId);

      if (result.success) {
        setStreamData(result.data ?? null);
      } else {
        setError(apiErrorMessage(result.error, t('watch.streamError')));
        setStreamData(null);
      }
    } catch {
      setError(t('watch.streamError'));
      setStreamData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearStream = useCallback(() => {
    setStreamData(null);
    setError(null);
  }, []);

  return {
    getStreamUrl,
    clearStream,
    isLoading,
    streamData,
    error};
}

export function useContentMutations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const createContentMutation = useMutation({
    mutationFn: async (contentData: Partial<Content>) => {
      const result = await contentService.createContent({
        title: contentData.title || '',
        description: contentData.description,
        year: contentData.year,
        poster_url: contentData.poster_url,
        backdrop_url: contentData.backdrop_url,
        video_url: contentData.video_url || contentData.stream_url || '',
        type: contentData.content_type as ContentType || ContentType.VOD,
        active: contentData.active ?? true});
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      // Invalidate and refetch content queries
      queryClient.invalidateQueries({ queryKey: ['content'] });
    }});

  const updateContentMutation = useMutation({
    mutationFn: async ({ contentId, contentData }: { contentId: number; contentData: Partial<Content> }) => {
      const result = await contentService.updateContent(contentId, contentData);
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('common.serverError')));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content'] });
    }});

  const deleteContentMutation = useMutation({
    mutationFn: async (contentId: number) => {
      const result = await contentService.deleteContent(contentId);
      if (!result.success) {
        throw new Error(apiErrorMessage(result.error, t('common.serverError')));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content'] });
    }});

  return {
    createContent: createContentMutation,
    updateContent: updateContentMutation,
    deleteContent: deleteContentMutation};
}
