import { apiService } from './api';
import { ApiResult } from '@/types';

export interface Notification {
  id: string;
  notification_type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  count?: number;
  priority: 'high' | 'medium' | 'low';
  created_at: string;
  action_url?: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  total_count: number;
  unread_count: number;
}

class NotificationsService {
  async getResellerNotifications(): Promise<ApiResult<NotificationsResponse>> {
    try {
      return await apiService.get<NotificationsResponse>('/api/reseller/notifications');
    } catch {
      return {
        success: false,
        error: {
          error: 'Failed to fetch notifications',
          details: 'Could not load notifications',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async getAdminNotifications(): Promise<ApiResult<NotificationsResponse>> {
    try {
      return await apiService.get<NotificationsResponse>('/api/admin/notifications');
    } catch {
      return {
        success: false,
        error: {
          error: 'Failed to fetch notifications',
          details: 'Could not load notifications',
          timestamp: new Date().toISOString()}
      };
    }
  }
}

export const notificationsService = new NotificationsService();
