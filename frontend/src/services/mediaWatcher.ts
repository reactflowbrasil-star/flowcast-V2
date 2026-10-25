import { apiClient } from './api';

export type MediaWatchType = 'movies' | 'series' | 'kids' | 'anime';

export interface MediaWatchFolder {
  id: number;
  folder_path: string;
  media_type: MediaWatchType;
  category_id: number;
  check_interval_minutes: number;
  last_check: string | null;
  enabled: boolean;
  created_at: string;
}

export interface CreateMediaWatchFolderRequest {
  folder_path: string;
  media_type: MediaWatchType;
  category_id: number;
  check_interval_minutes?: number;
}

export interface UpdateMediaWatchFolderRequest {
  folder_path?: string;
  media_type?: MediaWatchType;
  category_id?: number;
  check_interval_minutes?: number;
  enabled?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    error: string;
    details?: string;
  };
}

class MediaWatcherService {
  private baseUrl = '/api/admin/media-watcher';

  /**
   * List all watch folders
   */
  async listFolders(): Promise<ApiResponse<MediaWatchFolder[]>> {
    try {
      const response = await apiClient.get<MediaWatchFolder[]>(`${this.baseUrl}/folders`);
      return {
        success: true,
        data: response.data};
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.error || error.message || 'Failed to list folders'}};
    }
  }

  /**
   * Get a specific watch folder
   */
  async getFolder(id: number): Promise<ApiResponse<MediaWatchFolder>> {
    try {
      const response = await apiClient.get<MediaWatchFolder>(`${this.baseUrl}/folders/${id}`);
      return {
        success: true,
        data: response.data};
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.error || error.message || 'Failed to get folder'}};
    }
  }

  /**
   * Create a new watch folder
   */
  async createFolder(request: CreateMediaWatchFolderRequest): Promise<ApiResponse<MediaWatchFolder>> {
    try {
      const response = await apiClient.post<MediaWatchFolder>(`${this.baseUrl}/folders`, request);
      return {
        success: true,
        data: response.data};
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.error || error.message || 'Failed to create folder'}};
    }
  }

  /**
   * Update a watch folder
   */
  async updateFolder(id: number, request: UpdateMediaWatchFolderRequest): Promise<ApiResponse<MediaWatchFolder>> {
    try {
      const response = await apiClient.put<MediaWatchFolder>(`${this.baseUrl}/folders/${id}`, request);
      return {
        success: true,
        data: response.data};
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.error || error.message || 'Failed to update folder'}};
    }
  }

  /**
   * Delete a watch folder
   */
  async deleteFolder(id: number): Promise<ApiResponse<void>> {
    try {
      await apiClient.delete(`${this.baseUrl}/folders/${id}`);
      return {
        success: true};
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.error || error.message || 'Failed to delete folder'}};
    }
  }

  /**
   * Force immediate check of a folder
   */
  async checkFolderNow(id: number): Promise<ApiResponse<void>> {
    try {
      await apiClient.post(`${this.baseUrl}/folders/${id}/check-now`);
      return {
        success: true};
    } catch (error: any) {
      return {
        success: false,
        error: {
          error: error.response?.data?.error || error.message || 'Failed to check folder'}};
    }
  }
}

export const mediaWatcherService = new MediaWatcherService();

