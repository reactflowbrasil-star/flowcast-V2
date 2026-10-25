import { apiService } from './api';
import { ApiResult } from '@/types';
import { User, UserRole, UpdateResellerDemoLimitRequest } from '@/types';
import { API_ENDPOINTS } from '@/constants/api';

export interface CreateUserRequest {
  username: string;
  password: string;
  email: string;
  role: UserRole;
  max_devices: number;
  credits?: number;
  active?: boolean;
  expires_at?: string;
  category_ids?: number[];
  daily_demo_limit?: number;
}

export interface CreateResellerRequest {
  username: string;
  password: string;
  email: string;
  credits?: number;
  daily_demo_limit?: number;
}

export interface CreateEndUserRequest {
  username: string;
  password: string;
  email: string;
  max_devices: number;
  reseller_id?: number;
  expires_at?: string;
  category_ids?: number[];
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  max_devices?: number;
  active?: boolean;
  password?: string;
  category_ids?: number[];
}

export interface ExtendSubscriptionRequest {
  extension_months: number;
  category_ids?: number[];
}

export interface GetUsersRequest {
  role?: UserRole;
  active?: boolean;
  page?: number;
  limit?: number;
  search?: string;
}

export interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

class UserService {
  /**
   * Get users with optional filtering
   */
  async getUsers(params?: GetUsersRequest): Promise<ApiResult<User[]>> {
    try {
      // Use specific endpoint for resellers
      let endpoint: string = API_ENDPOINTS.ADMIN.USERS;
      if (params?.role === UserRole.RESELLER) {
        endpoint = API_ENDPOINTS.ADMIN.RESELLERS;
        // Remove role param since the endpoint is specific to resellers
        const { role: _role, ...otherParams } = params;
        const result = await apiService.get<User[]>(endpoint, { params: otherParams });
        return result;
      } else if (params?.role === UserRole.END_USER) {
        // For end users, use the admin users endpoint
        endpoint = API_ENDPOINTS.ADMIN.USERS;
        // Remove role param since the endpoint is specific to end users
        const { role: _role, ...otherParams } = params;
        const result = await apiService.get<User[]>(endpoint, { params: otherParams });
        return result;
      }

      const result = await apiService.get<User[]>(endpoint, { params });
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Users Fetch Failed',
          details: 'Failed to fetch users',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get users created by a specific reseller
   */
  async getResellerUsers(_resellerId: number): Promise<ApiResult<User[]>> {
    try {
      const result = await apiService.get<User[]>('/api/reseller/users');
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Reseller Users Fetch Failed',
          details: 'Failed to fetch reseller users',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<ApiResult<User>> {
    try {
      const result = await apiService.get<User>(`/api/admin/users/${userId}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Fetch Failed',
          details: 'Failed to fetch user details',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create a new user (generic - deprecated, use specific methods)
   */
  async createUser(userData: CreateUserRequest): Promise<ApiResult<User>> {
    try {
      // Route to specific endpoint based on role
      if (userData.role === UserRole.RESELLER) {
        return this.createReseller({
          username: userData.username,
          password: userData.password,
          email: userData.email,
          credits: userData.credits,
          daily_demo_limit: userData.daily_demo_limit});
      } else if (userData.role === UserRole.END_USER) {
        return this.createEndUser({
          username: userData.username,
          password: userData.password,
          email: userData.email,
          max_devices: userData.max_devices,
          expires_at: userData.expires_at,
          category_ids: userData.category_ids});
      } else {
        // For admin users, use the generic endpoint
        const result = await apiService.post<User>(API_ENDPOINTS.ADMIN.USERS, userData);
        return result;
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'User Creation Failed',
          details: 'Failed to create user',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create a new reseller
   */
  async createReseller(userData: CreateResellerRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.post<User>(API_ENDPOINTS.ADMIN.RESELLERS, userData);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Reseller Creation Failed',
          details: 'Failed to create reseller',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create a new end user
   */
  async createEndUser(userData: CreateEndUserRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.post<User>(API_ENDPOINTS.ADMIN.USERS, userData);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update user information
   */
  async updateUser(userId: number, userData: UpdateUserRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(`/api/admin/users/${userId}`, userData);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Update Failed',
          details: 'Failed to update user',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Extend user subscription (reseller only)
   */
  async extendUserSubscription(userId: number, extensionData: ExtendSubscriptionRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(`/api/reseller/users/${userId}/extend`, extensionData);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Extend Subscription Failed',
          details: 'Failed to extend subscription',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Update user credits
   */
  async updateUserCredits(userId: number, credits: number): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(`/api/admin/users/${userId}/credits`, { credits });
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Credits Update Failed',
          details: 'Failed to update user credits',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId: number): Promise<ApiResult<{ success: boolean }>> {
    try {
      const result = await apiService.delete<{ success: boolean }>(`/api/admin/users/${userId}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Deletion Failed',
          details: 'Failed to delete user',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Ban/unban user (reseller only)
   */
  async toggleUserStatus(userId: number, active: boolean): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(`/api/reseller/users/${userId}/status`, { active });
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Status Update Failed',
          details: 'Failed to update user status',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get user's devices
   */
  async getUserDevices(userId: number): Promise<ApiResult<Array<{
    id: number;
    device_id: string;
    device_name: string;
    last_seen: string;
    active: boolean;
  }>>> {
    try {
      const result = await apiService.get<Array<{
        id: number;
        device_id: string;
        device_name: string;
        last_seen: string;
        active: boolean;
      }>>(`/api/admin/users/${userId}/devices`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Devices Fetch Failed',
          details: 'Failed to fetch user devices',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Remove user device
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
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: number): Promise<ApiResult<{
    total_streams: number;
    active_devices: number;
    last_login: string;
    total_watch_time: number;
    favorite_content: Array<{
      id: number;
      title: string;
      watch_count: number;
    }>;
  }>> {
    try {
      const result = await apiService.get<{
        total_streams: number;
        active_devices: number;
        last_login: string;
        total_watch_time: number;
        favorite_content: Array<{
          id: number;
          title: string;
          watch_count: number;
        }>;
      }>(`/api/admin/users/${userId}/stats`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Stats Failed',
          details: 'Failed to fetch user statistics',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Reset user password
   */
  async resetUserPassword(userId: number, newPassword: string): Promise<ApiResult<{ success: boolean }>> {
    try {
      const result = await apiService.put<{ success: boolean }>(API_ENDPOINTS.ADMIN.USER_PASSWORD(userId), { password: newPassword });
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Password Reset Failed',
          details: 'Failed to reset user password',
          timestamp: new Date().toISOString()}
      };
    }
  }



  /**
   * Transfer user to another reseller
   */
  async transferUser(userId: number, newResellerId: number): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(`/api/admin/users/${userId}/transfer`, {
        new_reseller_id: newResellerId
      });
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Transfer Failed',
          details: 'Failed to transfer user to new reseller',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Bulk operations on users
   */
  async bulkUpdateUsers(userIds: number[], updates: Partial<UpdateUserRequest>): Promise<ApiResult<{
    updated: number;
    failed: number;
    errors: string[];
  }>> {
    try {
      const result = await apiService.put<{
        updated: number;
        failed: number;
        errors: string[];
      }>(`${API_ENDPOINTS.ADMIN.USERS}/bulk`, {
        user_ids: userIds,
        updates
      });
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Bulk Update Failed',
          details: 'Failed to perform bulk user update',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Export users data
   */
  async exportUsers(format: 'csv' | 'json' = 'csv'): Promise<ApiResult<{ download_url: string }>> {
    try {
      const result = await apiService.get<{ download_url: string }>(`/api/admin/users/export?format=${format}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Export Failed',
          details: 'Failed to export users data',
          timestamp: new Date().toISOString()}
      };
    }
  }
  /**
   * Update reseller information (admin only)
   */
  async updateReseller(resellerId: number, userData: UpdateUserRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(`/api/admin/resellers/${resellerId}`, userData);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Reseller Update Failed',
          details: 'Failed to update reseller',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Update reseller demo limit (admin only)
   */
  async updateResellerDemoLimit(resellerId: number, request: UpdateResellerDemoLimitRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(`/api/admin/resellers/${resellerId}/demo-limit`, request);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Demo Limit Update Failed',
          details: 'Failed to update reseller demo limit',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Delete end user (reseller only)
   */
  async deleteEndUser(userId: number): Promise<ApiResult<void>> {
    try {
      const result = await apiService.delete<void>(`/api/reseller/users/${userId}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Deletion Failed',
          details: 'Failed to delete user',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get end users created by a specific reseller (admin only)
   */
  async getResellerEndUsers(resellerId: number): Promise<ApiResult<User[]>> {
    try {
      const result = await apiService.get<User[]>(`/api/admin/resellers/${resellerId}/users`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Fetch Failed',
          details: 'Failed to fetch reseller end users',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Reset daily demo counters for all resellers (admin only)
   */
  async resetDailyDemoCounters(): Promise<ApiResult<{ success: boolean; message: string; resellers_updated: number }>> {
    try {
      const result = await apiService.post<{ success: boolean; message: string; resellers_updated: number }>('/api/admin/demos/reset-counters');
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Reset Failed',
          details: 'Failed to reset daily demo counters',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get activity logs for admin (all logs)
   */
  async getAdminActivityLogs(filters?: {
    action_type?: string;
    user_id?: number;
    target_user_id?: number;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResult<any>> {
    try {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, value.toString());
          }
        });
      }

      const url = `/api/admin/logs${params.toString() ? `?${params.toString()}` : ''}`;
      const result = await apiService.get<any>(url);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Fetch Failed',
          details: 'Failed to fetch admin activity logs',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get activity logs for reseller (only their related logs)
   */
  async getResellerActivityLogs(filters?: {
    action_type?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResult<any>> {
    try {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, value.toString());
          }
        });
      }

      const url = `/api/reseller/logs${params.toString() ? `?${params.toString()}` : ''}`;
      const result = await apiService.get<any>(url);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Fetch Failed',
          details: 'Failed to fetch reseller activity logs',
          timestamp: new Date().toISOString()}
      };
    }
  }

}

export const userService = new UserService();
