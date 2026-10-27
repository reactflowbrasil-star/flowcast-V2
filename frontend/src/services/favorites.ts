import apiService from './api';
import { ApiResult } from '@/types';

export type ContentType = 'movie' | 'series' | 'channel';

export interface FavoritesData {
  movies: string[];
  series: string[];
  channels: string[];
  music_tracks: string[];
  music_albums: string[];
  music_artists: string[];
  data?: {
    movies: FavoriteContent[];
    series: FavoriteContent[];
  };
}

export interface FavoriteContent {
  id: number;
  title: string;
  genre?: string | null;
  content_type?: string | null;
  poster_url?: string | null;
  image_url?: string | null;
  backdrop_url?: string | null;
  year?: number | null;
}

interface BackendResponse<T> {
  success: boolean;
  data?: T | null;
  error?: string | null;
}

interface FavoriteRecord {
  id: number;
  user_id: number;
  content_type: ContentType;
  content_id: string;
  created_at: string;
}

export interface AddFavoriteRequest {
  content_type: ContentType;
  content_id: string;
}

class FavoritesService {
  private baseUrl = '/api/user/favorites';

  /**
   * Get all favorites for the current user
   */
  async getFavorites(): Promise<FavoritesData> {
    try {
      const response = await apiService.get<BackendResponse<FavoritesData> | FavoritesData>(this.baseUrl);
      return this.unwrap(response, 'Error fetching favorites', () => this.createEmptyFavorites());
    } catch (error) {
      console.error('Error fetching favorites:', error);
      throw error;
    }
  }

  /**
   * Add a favorite
   */
  async addFavorite(contentType: ContentType, contentId: string): Promise<boolean> {
    try {
      const request: AddFavoriteRequest = {
        content_type: contentType,
        content_id: contentId};
      const response = await apiService.post<BackendResponse<FavoriteRecord>>(this.baseUrl, request);
      this.unwrap(response, 'Error adding favorite');
      return true;
    } catch (error) {
      console.error('Error adding favorite:', error);
      throw error;
    }
  }

  /**
   * Remove a favorite
   */
  async removeFavorite(contentType: ContentType, contentId: string): Promise<boolean> {
    try {
      const response = await apiService.delete<BackendResponse<boolean>>(
        `${this.baseUrl}/${contentType}/${contentId}`
      );
      return this.unwrap(response, 'Error removing favorite', () => false);
    } catch (error) {
      console.error('Error removing favorite:', error);
      throw error;
    }
  }

  /**
   * Check if content is favorited
   */
  async isFavorite(contentType: ContentType, contentId: string): Promise<boolean> {
    try {
      const response = await apiService.get<BackendResponse<boolean>>(
        `${this.baseUrl}/check/${contentType}/${contentId}`
      );
      return this.unwrap(response, 'Error checking favorite', () => false);
    } catch (error) {
      console.error('Error checking favorite:', error);
      return false;
    }
  }

  /**
   * Get favorites by type
   */
  async getFavoritesByType(contentType: ContentType): Promise<string[]> {
    try {
      const response = await apiService.get<BackendResponse<string[]>>(
        `${this.baseUrl}/type/${contentType}`
      );
      return this.unwrap(response, 'Error fetching favorites by type', () => []);
    } catch (error) {
      console.error('Error fetching favorites by type:', error);
      return [];
    }
  }

  /**
   * Get favorites statistics
   */
  async getFavoritesStats(): Promise<Record<string, number>> {
    try {
      const response = await apiService.get<BackendResponse<Record<string, number>>>(`${this.baseUrl}/stats`);
      return this.unwrap(response, 'Error fetching favorites stats', () => ({}));
    } catch (error) {
      console.error('Error fetching favorites stats:', error);
      return {};
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(contentType: ContentType, contentId: string): Promise<boolean> {
    const isFav = await this.isFavorite(contentType, contentId);
    if (isFav) {
      await this.removeFavorite(contentType, contentId);
      return false;
    } else {
      await this.addFavorite(contentType, contentId);
      return true;
    }
  }

  private unwrap<T>(
    response: ApiResult<BackendResponse<T> | T>,
    errorMessage: string,
    fallback?: () => T
  ): T {
    if (!response.success) {
      throw new Error(response.error?.details ?? errorMessage);
    }

    const payload = response.data;
    if (!payload) return fallback ? fallback() : (() => { throw new Error(errorMessage); })();
    if ('success' in payload) {
      if (!payload.success) throw new Error(payload.error ?? errorMessage);
      if (payload.data === undefined || payload.data === null) {
        if (fallback) return fallback();
        throw new Error(errorMessage);
      }
      return payload.data;
    }
    return payload as T;
  }

  private createEmptyFavorites(): FavoritesData {
    return {
      movies: [],
      series: [],
      channels: [],
      music_tracks: [],
      music_albums: [],
      music_artists: []};
  }
}

export const favoritesService = new FavoritesService();
export default favoritesService;
