import axios from 'axios';
import apiService from './api';
import { API_CONFIG } from '@/constants';
import { ApiResult, ApiError } from '@/types';
import { STORAGE_KEYS } from '@/constants';

export interface AppVersion {
    id: number;
    app_type: 'phone' | 'tv';
    version: string;
    version_code: number;
    apk_filename: string;
    file_size: number;
    file_hash: string;
    force_update: boolean;
    release_notes?: string;
    min_required_version?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    download_url: string;
}

export interface CreateAppVersionRequest {
    app_type: 'phone' | 'tv';
    version: string;
    version_code: number;
    force_update: boolean;
    release_notes?: string;
    min_required_version?: string;
    apk_file: File;
}

export interface UpdateAppVersionRequest {
    force_update?: boolean;
    release_notes?: string;
    min_required_version?: string;
    is_active?: boolean;
}

// Get the direct backend URL - uses API_CONFIG.BASE_URL which properly handles env vars
const getDirectBackendUrl = (): string => {
    return API_CONFIG.BASE_URL;
};

// Get auth token from storage
const getAuthToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || null;
};

export const appVersionService = {
    // Public (for testing mainly, usually accessed by apps)
    checkVersion: async (appType: 'phone' | 'tv', currentCode?: number) => {
        return apiService.get(`/api/app/version`, {
            params: { app_type: appType, current_version_code: currentCode }
        });
    },

    // Admin
    listVersions: async (appType?: 'phone' | 'tv'): Promise<ApiResult<AppVersion[]>> => {
        return apiService.get<AppVersion[]>('/api/admin/app-versions', {
            params: { app_type: appType }
        });
    },

    createVersion: async (data: CreateAppVersionRequest, onUploadProgress?: (progress: number) => void): Promise<ApiResult<AppVersion>> => {
        const formData = new FormData();
        formData.append('app_type', data.app_type);
        formData.append('version', data.version);
        formData.append('version_code', data.version_code.toString());
        formData.append('force_update', data.force_update.toString());
        if (data.release_notes) formData.append('release_notes', data.release_notes);
        if (data.min_required_version) formData.append('min_required_version', data.min_required_version);
        formData.append('apk_file', data.apk_file);

        // CRITICAL: Upload directly to backend, bypassing Next.js proxy
        // The Next.js rewrite proxy has an internal 30s timeout that cannot be configured
        const directUrl = getDirectBackendUrl();
        const token = getAuthToken();

        console.log('📦 Uploading APK directly to backend:', directUrl);

        try {
            const response = await axios.post<AppVersion>(
                `${directUrl}/api/admin/app-versions`,
                formData,
                {
                    headers: {
                        'Authorization': token ? `Bearer ${token}` : '',
                        'X-Admin-Panel': 'true'},
                    onUploadProgress: (progressEvent) => {
                        if (onUploadProgress && progressEvent.total) {
                            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                            onUploadProgress(progress);
                        }
                    },
                    timeout: 600000, // 10 minutes
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity}
            );
            return { success: true, data: response.data };
        } catch (error: any) {
            const apiError: ApiError = {
                error: error.response?.data?.error || 'Upload failed',
                details: error.response?.data?.details || error.message || 'Unknown error',
                timestamp: new Date().toISOString()};
            return { success: false, error: apiError };
        }
    },

    updateVersion: async (id: number, data: UpdateAppVersionRequest): Promise<ApiResult<AppVersion>> => {
        return apiService.put<AppVersion>(`/api/admin/app-versions/${id}`, data);
    },

    deleteVersion: async (id: number): Promise<ApiResult<void>> => {
        return apiService.delete<void>(`/api/admin/app-versions/${id}`);
    },

    getDownloadUrl: (filename: string) => {
        return `${API_CONFIG.BASE_URL}/api/app/download/${filename}`;
    }
};

