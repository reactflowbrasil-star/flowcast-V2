import { apiService } from './api';
import { ApiResult, WatchHistoryResponse } from '@/types';

class UserHistoryService {
  async getWatchHistory(params?: { page?: number; limit?: number }): Promise<ApiResult<WatchHistoryResponse>> {
    return apiService.get<WatchHistoryResponse>('/api/user/history', {
      params});
  }

  async clearWatchHistory(): Promise<ApiResult<{ success: boolean; message: string }>> {
    return apiService.delete<{ success: boolean; message: string }>('/api/user/history/clear');
  }
}

export const userHistoryService = new UserHistoryService();
