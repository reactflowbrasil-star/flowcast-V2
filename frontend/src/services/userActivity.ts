import { apiService } from './api';
import { ApiResult } from '@/types/api';

interface LoginHistoryFilters {
  user_id?: number;
  username?: string;
  start_date?: string;
  end_date?: string;
  ip_address?: string;
  page?: number;
  limit?: number;
}

interface ViewingHistoryFilters {
  user_id?: number;
  username?: string;
  content_type?: string;
  start_date?: string;
  end_date?: string;
  ip_address?: string;
  page?: number;
  limit?: number;
}

interface LoginHistoryEntry {
  id: number;
  user_id: number;
  username: string;
  login_timestamp: string;
  ip_address?: string;
  device_info?: string;
  user_agent?: string;
  success: boolean;
}

interface ViewingHistoryEntry {
  id: number;
  user_id: number;
  username: string;
  content_type: string;
  content_id?: number;
  content_title: string;
  episode_title?: string;
  season_number?: number;
  episode_number?: number;
  start_timestamp: string;
  ip_address?: string;
  device_info?: string;
  user_agent?: string;
}

interface LoginHistoryResponse {
  logs: LoginHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface ViewingHistoryResponse {
  logs: ViewingHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface DashboardMetrics {
  total_logins_today: number;
  unique_active_users: number;
  failed_login_attempts: number;
  total_content_views: number;
  most_viewed_content: PopularContent[];
  device_distribution: DeviceStats[];
  hourly_activity: HourlyActivity[];
  users_multiple_devices: MultiDeviceUser[];
}

interface PopularContent {
  content_id?: number;
  content_title: string;
  content_type: string;
  view_count: number;
}

interface DeviceStats {
  device_type: string;
  count: number;
  percentage: number;
}

interface HourlyActivity {
  hour: number;
  login_count: number;
  view_count: number;
}

interface MultiDeviceUser {
  user_id: number;
  username: string;
  device_count: number;
  devices: string[];
}

export class UserActivityService {
  // Get login history (admin only)
  async getLoginHistory(filters: LoginHistoryFilters): Promise<ApiResult<LoginHistoryResponse>> {
    try {
      const params = new URLSearchParams();
      
      if (filters.user_id) params.append('user_id', filters.user_id.toString());
      if (filters.username) params.append('username', filters.username);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.ip_address) params.append('ip_address', filters.ip_address);
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.limit) params.append('limit', filters.limit.toString());

      const queryString = params.toString();
      const url = `/api/admin/activity/login-history${queryString ? `?${queryString}` : ''}`;
      
      const result = await apiService.get<LoginHistoryResponse>(url);
      return result;
    } catch (error) {
      console.error('Error fetching login history:', error);
      return {
        success: false,
        error: {
          error: 'Failed to fetch login history',
          details: error instanceof Error ? error.message : 'Failed to fetch login history',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Get viewing history (admin only)
  async getViewingHistory(filters: ViewingHistoryFilters): Promise<ApiResult<ViewingHistoryResponse>> {
    try {
      const params = new URLSearchParams();
      
      if (filters.user_id) params.append('user_id', filters.user_id.toString());
      if (filters.username) params.append('username', filters.username);
      if (filters.content_type) params.append('content_type', filters.content_type);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.ip_address) params.append('ip_address', filters.ip_address);
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.limit) params.append('limit', filters.limit.toString());

      const queryString = params.toString();
      const url = `/api/admin/activity/viewing-history${queryString ? `?${queryString}` : ''}`;
      
      const result = await apiService.get<ViewingHistoryResponse>(url);
      return result;
    } catch (error) {
      console.error('Error fetching viewing history:', error);
      return {
        success: false,
        error: {
          error: 'Failed to fetch viewing history',
          details: error instanceof Error ? error.message : 'Failed to fetch viewing history',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Get dashboard metrics (admin only)
  async getDashboardMetrics(): Promise<ApiResult<DashboardMetrics>> {
    try {
      const result = await apiService.get<DashboardMetrics>('/api/admin/activity/dashboard-metrics');
      return result;
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      return {
        success: false,
        error: {
          error: 'Failed to fetch dashboard metrics',
          details: error instanceof Error ? error.message : 'Failed to fetch dashboard metrics',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

export const userActivityService = new UserActivityService();
