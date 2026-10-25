import { apiService } from './api';

export interface MasterApiKey {
  id: number;
  key_name: string;
  api_key: string;
  enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
  last_used_at?: string;
  description?: string;
}

export interface MasterApiKeyListItem {
  id: number;
  key_name: string;
  api_key_preview: string;
  enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
  last_used_at?: string;
  description?: string;
}

export interface CreateMasterApiKeyRequest {
  key_name: string;
  description?: string;
}

export interface UpdateMasterApiKeyRequest {
  key_name?: string;
  enabled?: boolean;
  description?: string;
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    error: string;
    details: string;
    timestamp: string;
  };
}

class MasterApiKeyService {
  /**
   * Get all Master API Keys
   */
  async getMasterApiKeys(): Promise<ApiResult<MasterApiKeyListItem[]>> {
    try {
      const result = await apiService.get<{ success: boolean; data: MasterApiKeyListItem[] }>('/api/admin/master-api-keys');

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Failed to fetch Master API Keys',
            details: 'Unable to retrieve Master API Keys list',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Network Error',
          details: 'Failed to fetch Master API Keys',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get Master API Key by ID (shows full key)
   */
  async getMasterApiKeyById(id: number): Promise<ApiResult<MasterApiKey>> {
    try {
      const result = await apiService.get<{ success: boolean; data: MasterApiKey }>(`/api/admin/master-api-keys/${id}`);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Failed to fetch Master API Key',
            details: 'Unable to retrieve Master API Key details',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Network Error',
          details: 'Failed to fetch Master API Key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create new Master API Key
   */
  async createMasterApiKey(request: CreateMasterApiKeyRequest): Promise<ApiResult<MasterApiKey>> {
    try {
      const result = await apiService.post<{ success: boolean; data: MasterApiKey; message: string }>('/api/admin/master-api-keys', request);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data,
          message: result.data.message
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Failed to create Master API Key',
            details: 'Unable to create new Master API Key',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Network Error',
          details: 'Failed to create Master API Key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Update Master API Key
   */
  async updateMasterApiKey(id: number, request: UpdateMasterApiKeyRequest): Promise<ApiResult<MasterApiKey>> {
    try {
      const result = await apiService.put<{ success: boolean; data: MasterApiKey; message: string }>(`/api/admin/master-api-keys/${id}`, request);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data,
          message: result.data.message
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Failed to update Master API Key',
            details: 'Unable to update Master API Key',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Network Error',
          details: 'Failed to update Master API Key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Delete Master API Key
   */
  async deleteMasterApiKey(id: number): Promise<ApiResult<void>> {
    try {
      const result = await apiService.delete<{ success: boolean; message: string }>(`/api/admin/master-api-keys/${id}`);

      if (result.success && result.data.success) {
        return {
          success: true,
          message: result.data.message
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Failed to delete Master API Key',
            details: 'Unable to delete Master API Key',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Network Error',
          details: 'Failed to delete Master API Key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Regenerate Master API Key
   */
  async regenerateMasterApiKey(id: number): Promise<ApiResult<MasterApiKey>> {
    try {
      const result = await apiService.post<{ success: boolean; data: MasterApiKey; message: string }>(`/api/admin/master-api-keys/${id}/regenerate`, {});

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data,
          message: result.data.message
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Failed to regenerate Master API Key',
            details: 'Unable to regenerate Master API Key',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Network Error',
          details: 'Failed to regenerate Master API Key',
          timestamp: new Date().toISOString()}
      };
    }
  }
}

export const masterApiKeyService = new MasterApiKeyService();
