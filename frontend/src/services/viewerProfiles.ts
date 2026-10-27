import apiService from './api';
import type { ApiResult } from '@/types';
import type { ViewerProfile, ViewerProfileInput } from '@/lib/viewerProfiles';

class ViewerProfilesService {
  list(): Promise<ApiResult<ViewerProfile[]>> {
    return apiService.get<ViewerProfile[]>('/api/user/profiles');
  }

  create(input: ViewerProfileInput): Promise<ApiResult<ViewerProfile>> {
    return apiService.post<ViewerProfile>('/api/user/profiles', input);
  }

  update(id: number, input: ViewerProfileInput): Promise<ApiResult<ViewerProfile>> {
    return apiService.put<ViewerProfile>(`/api/user/profiles/${id}`, input);
  }

  delete(id: number): Promise<ApiResult<{ deleted: boolean }>> {
    return apiService.delete<{ deleted: boolean }>(`/api/user/profiles/${id}`);
  }
}

export const viewerProfilesService = new ViewerProfilesService();
