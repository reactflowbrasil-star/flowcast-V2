import { apiService } from './api';
import { API_ENDPOINTS } from '@/constants';
import type { ApiResult } from '@/types/api';
import type { DiscoveryOverview } from '@/types/discovery';

class DiscoveryService {
  async getOverview(params?: { language?: string; limit?: number }): Promise<ApiResult<DiscoveryOverview>> {
    const searchParams = new URLSearchParams();

    if (params?.language) {
      searchParams.set('language', params.language);
    }

    if (typeof params?.limit === 'number') {
      searchParams.set('limit', params.limit.toString());
    }

    const queryString = searchParams.toString();
    const url = queryString
      ? `${API_ENDPOINTS.DISCOVERY.OVERVIEW}?${queryString}`
      : API_ENDPOINTS.DISCOVERY.OVERVIEW;

    return apiService.get<DiscoveryOverview>(url);
  }
}

export const discoveryService = new DiscoveryService();
export type { DiscoveryService };
