import { apiService } from './api';
import { API_ENDPOINTS } from '@/constants/api';
import { ApiResult } from '@/types/api';

export interface EpgSource {
  id: number;
  name: string;
  url: string;
  timezone: string;
  cache_ttl_minutes: number;
  is_active: boolean;
}

export interface CreateEpgSourceRequest {
  name: string;
  url: string;
  timezone?: string;
  cache_ttl_minutes?: number;
  is_active?: boolean;
}

export interface UpdateEpgSourceRequest {
  name?: string;
  url?: string;
  timezone?: string;
  cache_ttl_minutes?: number;
  is_active?: boolean;
}

export interface EpgChannelInfo {
  id: string;
  display_name: string;
  icon?: string;
}

export interface EpgProgramsResponse {
  programs: Array<{
    channel_id: string;
    title: string;
    description?: string;
    start: string; // ISO8601 UTC
    end: string;   // ISO8601 UTC
    category?: string;
  }>;
}

class EpgService {
  // Admin sources
  async getSources(): Promise<ApiResult<EpgSource[]>> {
    return apiService.get<EpgSource[]>(API_ENDPOINTS.ADMIN.EPG.SOURCES);
  }

  async createSource(payload: CreateEpgSourceRequest): Promise<ApiResult<EpgSource>> {
    return apiService.post<EpgSource>(API_ENDPOINTS.ADMIN.EPG.SOURCES, payload);
  }

  async updateSource(id: number, payload: UpdateEpgSourceRequest): Promise<ApiResult<EpgSource>> {
    return apiService.put<EpgSource>(API_ENDPOINTS.ADMIN.EPG.SOURCE_BY_ID(id), payload);
    }

  async deleteSource(id: number): Promise<ApiResult<{ success: boolean }>> {
    return apiService.delete<{ success: boolean }>(API_ENDPOINTS.ADMIN.EPG.SOURCE_BY_ID(id));
  }

  async discoverChannels(id: number): Promise<ApiResult<EpgChannelInfo[]>> {
    return apiService.get<EpgChannelInfo[]>(API_ENDPOINTS.ADMIN.EPG.SOURCE_CHANNELS(id));
  }

  async patchTvChannelEpg(channelId: number, payload: { epg_source_id?: number; epg_channel_id?: string; epg_offset_minutes?: number }): Promise<ApiResult<{ success: boolean }>> {
    return apiService.patch<{ success: boolean }>(API_ENDPOINTS.ADMIN.EPG.TV_CHANNEL_EPG(channelId), payload);
  }

  async getTvChannelEpg(channelId: number): Promise<ApiResult<{ epg_source_id?: number; epg_channel_id?: string; epg_offset_minutes: number }>> {
    return apiService.get<{ epg_source_id?: number; epg_channel_id?: string; epg_offset_minutes: number }>(API_ENDPOINTS.ADMIN.EPG.TV_CHANNEL_EPG(channelId));
  }

  // Delivery
  async getEpg(params: { channel_ids: number[]; start: string; end: string }): Promise<ApiResult<EpgProgramsResponse>> {
    const qs = new URLSearchParams({
      channel_ids: params.channel_ids.join(','),
      start: params.start,
      end: params.end}).toString();
    return apiService.get<EpgProgramsResponse>(`${API_ENDPOINTS.TV.EPG}?${qs}`);
  }
}

export const epgService = new EpgService();
export type { EpgService };

