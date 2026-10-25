import { apiService } from './api';
import { ApiResult } from '@/types';

export interface ApiKeyPermission {
  id: string;
  name: string;
  description: string;
}

export interface ResellerApiKey {
  id: number;
  reseller_id: number;
  key_name: string;
  api_key_prefix: string;
  permissions: string[];
  allowed_origins: string;
  ip_whitelist: string[] | null;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  is_active: boolean;
  last_used_at: string | null;
  total_requests: number;
  created_at: string;
  expires_at: string | null;
}

export interface CreateApiKeyRequest {
  key_name: string;
  permissions: string[];
  allowed_origins?: string;
  ip_whitelist?: string[];
  rate_limit_per_minute?: number;
  rate_limit_per_day?: number;
  expires_at?: string;
}

export interface UpdateApiKeyRequest {
  key_name?: string;
  permissions?: string[];
  allowed_origins?: string;
  ip_whitelist?: string[];
  rate_limit_per_minute?: number;
  rate_limit_per_day?: number;
  is_active?: boolean;
  expires_at?: string;
}

export interface CreateApiKeyResponse {
  api_key: ResellerApiKey;
  secret_key: string;
}

export interface PermissionsListResponse {
  permissions: ApiKeyPermission[];
}

class ResellerApiKeysService {
  private basePath = '/api/reseller/api-keys';

  async listApiKeys(): Promise<ApiResult<ResellerApiKey[]>> {
    try {
      const result = await apiService.get<ResellerApiKey[]>(this.basePath);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'List API Keys Failed',
          details: 'Failed to fetch API keys',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async getApiKey(id: number): Promise<ApiResult<ResellerApiKey>> {
    try {
      const result = await apiService.get<ResellerApiKey>(`${this.basePath}/${id}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Get API Key Failed',
          details: 'Failed to fetch API key details',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async createApiKey(request: CreateApiKeyRequest): Promise<ApiResult<CreateApiKeyResponse>> {
    try {
      const result = await apiService.post<CreateApiKeyResponse>(this.basePath, request);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Create API Key Failed',
          details: 'Failed to create API key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async updateApiKey(id: number, request: UpdateApiKeyRequest): Promise<ApiResult<ResellerApiKey>> {
    try {
      const result = await apiService.put<ResellerApiKey>(`${this.basePath}/${id}`, request);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Update API Key Failed',
          details: 'Failed to update API key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async deleteApiKey(id: number): Promise<ApiResult<{ success: boolean; message: string }>> {
    try {
      const result = await apiService.delete<{ success: boolean; message: string }>(`${this.basePath}/${id}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Delete API Key Failed',
          details: 'Failed to delete API key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async regenerateApiKey(id: number): Promise<ApiResult<CreateApiKeyResponse>> {
    try {
      const result = await apiService.post<CreateApiKeyResponse>(`${this.basePath}/${id}/regenerate`, {});
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Regenerate API Key Failed',
          details: 'Failed to regenerate API key',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async listPermissions(): Promise<ApiResult<PermissionsListResponse>> {
    try {
      const result = await apiService.get<PermissionsListResponse>(`${this.basePath}/permissions`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'List Permissions Failed',
          details: 'Failed to fetch available permissions',
          timestamp: new Date().toISOString()}
      };
    }
  }
}

export const resellerApiKeysService = new ResellerApiKeysService();
