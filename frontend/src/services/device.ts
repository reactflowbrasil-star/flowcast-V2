import { apiService } from './api';
import { ApiResult } from '@/types';
import { Device, RegisterDeviceRequest, DeviceConnectionCheck } from '@/types';
import { API_ENDPOINTS } from '@/constants/api';

export interface DeviceWithUser {
  id: number;
  user_id: number;
  username: string;
  device_id: string;
  device_name: string;
  last_active: string;
  created_at: string;
  max_devices: number;
}

export interface DeviceStats {
  total_devices: number;
  active_devices: number;
  users_with_devices: number;
  users_at_limit: number;
  total_capacity: number;
  avg_devices_per_user: number;
  utilization: number;
  devices_by_role: Record<string, number>;
  devices_by_user?: Array<{
    user_id: number;
    username: string;
    device_count: number;
    max_devices: number;
  }>;
}

class DeviceService {
  /**
   * Get all devices for admin view
   */
  async getAllDevices(params?: {
    user_id?: number;
    active_only?: boolean;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<ApiResult<{
    devices: DeviceWithUser[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  }>> {
    try {
      const result = await apiService.get<{
        devices: DeviceWithUser[];
        success?: boolean;
        total?: number;
        page?: number;
        limit?: number;
        total_pages?: number;
      }>(API_ENDPOINTS.ADMIN.DEVICES, { params });
      // Backend returns { success, devices } (non-paginated) — wrap for callers expecting pagination
      if (result.success && result.data) {
        const devices = result.data.devices || [];
        return {
          success: true,
          data: {
            devices,
            total: result.data.total ?? devices.length,
            page: result.data.page ?? 1,
            limit: result.data.limit ?? devices.length,
            total_pages: result.data.total_pages ?? 1,
          },
        };
      }
      return result as ApiResult<{ devices: DeviceWithUser[]; total: number; page: number; limit: number; total_pages: number }>;
    } catch {
      return {
        success: false,
        error: {
          error: 'Devices Fetch Failed',
          details: 'Failed to fetch devices',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get devices for current user
   */
  async getUserDevices(): Promise<ApiResult<{
    devices: Device[];
    max_devices: number;
  }>> {
    try {
      const result = await apiService.get<{
        devices: Device[];
        max_devices: number;
      }>('/api/devices');
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Devices Fetch Failed',
          details: 'Failed to fetch user devices',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Register a new device for current user
   */
  async registerDevice(request: RegisterDeviceRequest): Promise<ApiResult<{ success: boolean; message: string }>> {
    try {
      const result = await apiService.post<{ success: boolean; message: string }>('/api/devices', request);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Device Registration Failed',
          details: 'Failed to register device',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Remove a device for current user
   */
  async removeDevice(deviceId: string): Promise<ApiResult<{ success: boolean; message: string }>> {
    try {
      const result = await apiService.delete<{ success: boolean; message: string }>(`/api/devices/${deviceId}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Device Removal Failed',
          details: 'Failed to remove device',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Remove a device for specific user (admin/reseller)
   */
  async removeUserDevice(userId: number, deviceId: string): Promise<ApiResult<{ success: boolean }>> {
    try {
      const result = await apiService.delete<{ success: boolean }>(`/api/admin/users/${userId}/devices/${deviceId}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Device Removal Failed',
          details: 'Failed to remove user device',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Remove and blacklist a device for specific user (admin/reseller)
   */
  async removeAndBlacklistUserDevice(userId: number, deviceId: string): Promise<ApiResult<{ success: boolean }>> {
    try {
      const result = await apiService.delete<{ success: boolean }>(`/api/admin/users/${userId}/devices/${deviceId}/remove-and-blacklist`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Device Removal and Blacklist Failed',
          details: 'Failed to remove and blacklist user device',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Blacklist a device for specific user (admin/reseller) without removing it
   */
  async blacklistUserDevice(userId: number, deviceId: string): Promise<ApiResult<{ success: boolean }>> {
    try {
      const result = await apiService.post<{ success: boolean }>(`/api/admin/users/${userId}/devices/${deviceId}/blacklist`, {});
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Device Blacklist Failed',
          details: 'Failed to blacklist user device',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Check if device can connect
   */
  async checkDeviceConnection(deviceId: string): Promise<ApiResult<DeviceConnectionCheck>> {
    try {
      const result = await apiService.get<DeviceConnectionCheck>(`/api/devices/${deviceId}/check`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Device Check Failed',
          details: 'Failed to check device connection',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get device statistics (admin only)
   */
  async getDeviceStats(): Promise<ApiResult<DeviceStats>> {
    try {
      const result = await apiService.get<{ stats: DeviceStats, success: boolean }>(API_ENDPOINTS.ADMIN.DEVICE_STATS);
      if (result.success && result.data.stats) {
        return {
          success: true,
          data: result.data.stats
        };
      }
      return {
        success: false,
        error: {
          error: 'Device Stats Fetch Failed',
          details: 'Invalid response format',
          timestamp: new Date().toISOString()
        }
      };
    } catch {
      return {
        success: false,
        error: {
          error: 'Device Stats Fetch Failed',
          details: 'Failed to fetch device statistics',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Force disconnect a device (admin only)
   */
  async forceDisconnectDevice(userId: number, deviceId: string): Promise<ApiResult<{ success: boolean }>> {
    try {
      const result = await apiService.post<{ success: boolean }>(`/api/admin/devices/${deviceId}/disconnect`, {});
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Device Disconnect Failed',
          details: 'Failed to disconnect device',
          timestamp: new Date().toISOString()
        }
      };
    }
  }



  /**
   * Get devices for specific user (admin/reseller)
   */
  async getUserDevicesById(userId: number): Promise<ApiResult<Device[]>> {
    try {
      // Backend returns { user_id, devices, device_count } — unwrap the devices array
      const result = await apiService.get<{ user_id: number; devices: Device[]; device_count: number }>(`/api/admin/users/${userId}/devices`);
      if (result.success && result.data) {
        return { success: true, data: result.data.devices || [] };
      }
      return { success: false, error: result.error };
    } catch {
      return {
        success: false,
        error: {
          error: 'User Devices Fetch Failed',
          details: 'Failed to fetch user devices',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

export const deviceService = new DeviceService();
