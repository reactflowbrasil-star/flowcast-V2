import { apiService } from './api';
import type { ApiResult, UserProfile, ChangePasswordRequestPayload } from '@/types';

class UserProfileService {
  async getSentinelActivity(): Promise<ApiResult<{
    sentinel: { status: string; risk_level: 'normal' | 'review' | 'elevated'; unique_ips_30d: number };
    ips: Array<{ ip_address: string; login_count: number }>;
    sessions: Array<{ ip_address?: string; device?: string; user_agent?: string; last_seen?: string; distinct_devices?: number }>;
  }>> {
    return apiService.get('/api/user/sentinel/activity');
  }

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
