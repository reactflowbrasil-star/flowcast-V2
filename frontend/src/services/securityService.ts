import { apiClient } from './api';
import { extractErrorMessage } from '@/lib/error-message';
import type {
  SecurityStatsResponse,
  SecurityIncidentsResponse,
  SecurityBansResponse,
  SecurityFilters,
  CreateSecurityBanRequest,
  SecurityBan,
  SecurityIncident,
  UnbanUserRequest,
  UserBanStatus} from '../types/security';

interface SecurityIncidentDetails {
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
  timestamp?: string;
  location?: string;
}

export class SecurityService {
  private static readonly BASE_URL = '/api/admin/security';

  /**
   * Get security statistics
   */
  static async getSecurityStats(): Promise<SecurityStatsResponse> {
    const response = await apiClient.get<SecurityStatsResponse>(`${this.BASE_URL}/stats`);
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to fetch security stats'));
  }

  /**
   * Get security incidents with filters
   */
  static async getSecurityIncidents(filters?: SecurityFilters): Promise<SecurityIncidentsResponse> {
    const params = new URLSearchParams();

    if (filters?.incident_type) params.append('incident_type', filters.incident_type);
    if (filters?.username) params.append('username', filters.username);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const queryString = params.toString();
    const url = queryString ? `${this.BASE_URL}/incidents?${queryString}` : `${this.BASE_URL}/incidents`;

    const response = await apiClient.get<SecurityIncidentsResponse>(url);
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to fetch security incidents'));
  }

  /**
   * Delete a security incident
   */
  static async deleteSecurityIncident(incidentId: number): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`${this.BASE_URL}/incidents/${incidentId}`);
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to delete security incident'));
  }

  /**
   * Get security bans
   */
  static async getSecurityBans(filters?: SecurityFilters): Promise<SecurityBansResponse> {
    const params = new URLSearchParams();

    if (filters?.username) params.append('username', filters.username);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const queryString = params.toString();
    const url = queryString ? `${this.BASE_URL}/bans?${queryString}` : `${this.BASE_URL}/bans`;

    const response = await apiClient.get<SecurityBansResponse>(url);
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to fetch security bans'));
  }

  /**
   * Create a manual security ban
   */
  static async createSecurityBan(request: CreateSecurityBanRequest): Promise<SecurityBan> {
    const response = await apiClient.post<SecurityBan>(`${this.BASE_URL}/bans`, request);
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to create security ban'));
  }

  /**
   * Unban a user
   */
  static async unbanUser(username: string, reason: string): Promise<{ success: boolean; message: string }> {
    const request: UnbanUserRequest = { reason };
    const response = await apiClient.post<{ success: boolean; message: string }>(`${this.BASE_URL}/users/${encodeURIComponent(username)}/unban`, request);
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to unban user'));
  }

  /**
   * Check a user's ban status
   */
  static async checkUserBanStatus(username: string): Promise<UserBanStatus> {
    const response = await apiClient.get<UserBanStatus>(`${this.BASE_URL}/users/${encodeURIComponent(username)}/ban-status`);
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to check user ban status'));
  }

  /**
   * Clean up expired bans
   */
  static async cleanupExpiredBans(): Promise<{ success: boolean; cleaned_bans: number; message: string }> {
    const response = await apiClient.post<{ success: boolean; cleaned_bans: number; message: string }>(`${this.BASE_URL}/bans/cleanup`, {});
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to cleanup expired bans'));
  }

  /**
   * Create a manual security incident
   */
  static async createSecurityIncident(request: {
    username: string;
    incident_type: string;
    ip_address?: string;
    user_agent?: string;
    device_id?: string;
    details?: SecurityIncidentDetails;
  }): Promise<SecurityIncident> {
    const response = await apiClient.post<SecurityIncident>(`${this.BASE_URL}/incidents`, request);
    if (response.success) {
      return response.data;
    }
    throw new Error(extractErrorMessage(response.error, 'Failed to create security incident'));
  }

  /**
   * Format date for display
   */
  static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'});
  }

  /**
   * Calculate remaining ban time
   */
  static calculateTimeRemaining(expiresAt?: string): string {
    if (!expiresAt) return 'Permanent';
    
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  /**
   * Get incident severity color
   */
  static getIncidentSeverityColor(incidentType: string): string {
    switch (incidentType) {
      case 'BRUTE_FORCE':
        return 'bg-orange-500/15 text-orange-700 dark:text-orange-300';
      case 'SUSPICIOUS_ACTIVITY':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
      case 'MULTIPLE_DEVICES':
        return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
      case 'TOKEN_MANIPULATION':
        return 'bg-purple-500/15 text-purple-700 dark:text-purple-300';
      default:
        return 'bg-muted text-foreground';
    }
  }

  /**
   * Get ban severity color
   */
  static getBanSeverityColor(banLevel: number): string {
    switch (banLevel) {
      case 1:
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
      case 2:
        return 'bg-orange-500/15 text-orange-700 dark:text-orange-300';
      case 3:
        return 'bg-red-500/15 text-red-700 dark:text-red-300';
      default:
        return 'bg-muted text-foreground';
    }
  }

  /**
   * Get a human-readable incident type description
   */
  static getIncidentTypeLabel(incidentType: string): string {
    const labels: Record<string, string> = {
      'BRUTE_FORCE': 'Brute Force Attack',
      'SUSPICIOUS_ACTIVITY': 'Suspicious Activity',
      'MULTIPLE_DEVICES': 'Multiple Devices',
      'TOKEN_MANIPULATION': 'Token Manipulation',
      'USER_UNBANNED': 'User Unbanned'};
    return labels[incidentType] || incidentType;
  }

  /**
   * Get ban level description
   */
  static getBanLevelLabel(banLevel: number): string {
    const labels: Record<number, string> = {
      1: 'Level 1 (20 minutes)',
      2: 'Level 2 (72 hours)',
      3: 'Level 3 (Permanent)'};
    return labels[banLevel] || `Level ${banLevel}`;
  }

  /**
   * Fetch blacklisted devices
   */
  static async getBlacklistedDevices(): Promise<{
    devices: Array<{
      user_id: number;
      username: string;
      device_id: string;
      blacklisted_at: string;
    }>;
    total: number;
    success: boolean;
  }> {
    const response = await apiClient.get<{
      devices: Array<{
        user_id: number;
        username: string;
        device_id: string;
        blacklisted_at: string;
      }>;
      total: number;
      success: boolean;
    }>(`${this.BASE_URL}/blacklisted-devices`);
    if (response.success) {
      return response.data;
    }
    throw new Error('Failed to fetch blacklisted devices');
  }

  /**
   * Remove a device from blacklist
   */
  static async removeDeviceFromBlacklist(userId: number, deviceId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(`${this.BASE_URL}/blacklisted-devices/remove`, {
      user_id: userId,
      device_id: deviceId
    });
    if (response.success) {
      return response.data;
    }
    throw new Error('Failed to remove device from blacklist');
  }
}
