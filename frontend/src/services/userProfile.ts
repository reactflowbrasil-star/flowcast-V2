import { apiService } from './api';
import type { ApiResult, UserProfile, ChangePasswordRequestPayload } from '@/types';

class UserProfileService {
  async getProfile(): Promise<ApiResult<UserProfile>> {
    return apiService.get<UserProfile>('/api/user/profile');
  }

  async updateProfile(payload: { email?: string | null }): Promise<ApiResult<UserProfile>> {
    return apiService.put<UserProfile>('/api/user/profile', payload);
  }

  async changePassword(payload: ChangePasswordRequestPayload): Promise<ApiResult<{ success: boolean; message: string }>> {
    return apiService.put<{ success: boolean; message: string }>('/api/user/profile/password', payload);
  }
}

export const userProfileService = new UserProfileService();
