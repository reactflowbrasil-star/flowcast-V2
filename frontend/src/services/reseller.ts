import { apiService } from './api';
import { ApiResult } from '@/types';
import { User, Device, CreateDemoRequest, DemoStats } from '@/types';
import { UpdateUserRequest } from './user';
import { API_ENDPOINTS } from '@/constants/api';

export interface CreditBalance {
  credits: number;
}

export interface CreditCalculation {
  devices: number;
  credit_cost: number;
  current_credits: number;
  sufficient_credits: boolean;
}

export interface CreditRates {
  default_devices: number;
  credit_per_user_3_devices: number;
  credit_per_user_5_devices: number;
  credit_per_extra_device: number;
}

export interface CreateResellerEndUserRequest {
  username: string;
  password: string;
  email: string;
  max_devices: number;
  expires_at?: string;
  category_ids?: number[];
}

export interface UserDevicesResponse {
  user_id: number;
  devices: Device[];
  device_count: number;
}

class ResellerService {


  /**
   * Get credit rates configuration
   */
  async getCreditRates(): Promise<ApiResult<CreditRates>> {
    try {
      const result = await apiService.get<CreditRates>(API_ENDPOINTS.RESELLER.CREDIT_RATES);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Credit Rates Fetch Failed',
          details: 'Failed to fetch credit rates',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get current credit balance
   */
  async getCreditBalance(): Promise<ApiResult<{ credits: number }>> {
    try {
      const result = await apiService.get<{ credits: number }>(`${API_ENDPOINTS.RESELLER.CREDITS}`);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Credit Balance Fetch Failed',
          details: 'Failed to fetch current credit balance',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Calculate credit cost for creating end user
   */
  async calculateCreditCost(devices: number): Promise<ApiResult<CreditCalculation>> {
    try {
      const result = await apiService.get<CreditCalculation>(
        API_ENDPOINTS.RESELLER.CALCULATE_CREDITS(devices)
      );
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Credit Calculation Failed',
          details: 'Failed to calculate credit cost',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get reseller's end users
   */
  async getEndUsers(): Promise<ApiResult<User[]>> {
    try {
      const result = await apiService.get<User[]>(API_ENDPOINTS.RESELLER.USERS);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'End Users Fetch Failed',
          details: 'Failed to fetch end users',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create new end user
   */
  async createEndUser(userData: CreateResellerEndUserRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.post<User>(API_ENDPOINTS.RESELLER.USERS, userData);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'End User Creation Failed',
          details: 'Failed to create end user',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Update end user
   */
  async updateEndUser(userId: number, userData: UpdateUserRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(`${API_ENDPOINTS.RESELLER.USERS}/${userId}`, userData);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'End User Update Failed',
          details: 'Failed to update end user',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Set end user active status
   */
  async setEndUserActiveStatus(userId: number, active: boolean): Promise<ApiResult<User>> {
    try {
      const result = await apiService.put<User>(
        `/api/reseller/users/${userId}/status`,
        { active }
      );
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Status Update Failed',
          details: 'Failed to update user status',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get devices for specific end user
   */
  async getUserDevices(userId: number): Promise<ApiResult<UserDevicesResponse>> {
    try {
      const result = await apiService.get<UserDevicesResponse>(
        API_ENDPOINTS.RESELLER.USER_DEVICES(userId)
      );
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'User Devices Fetch Failed',
          details: 'Failed to fetch user devices',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create demo user
   */
  async createDemoUser(demoData: CreateDemoRequest): Promise<ApiResult<User>> {
    try {
      const result = await apiService.post<User>('/api/reseller/demos', demoData);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Demo User Creation Failed',
          details: 'Failed to create demo user',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get demo statistics
   */
  async getDemoStats(): Promise<ApiResult<DemoStats>> {
    try {
      const result = await apiService.get<DemoStats>('/api/reseller/demos/stats');
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Demo Stats Fetch Failed',
          details: 'Failed to fetch demo statistics',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get credit usage statistics
   */
  async getCreditUsageStats(): Promise<ApiResult<any>> {
    try {
      const result = await apiService.get<any>('/api/reseller/credits/usage');
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Credit Usage Stats Failed',
          details: 'Failed to fetch credit usage statistics',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get reseller purchase pricing config (includes base price + discount tiers)
   * Uses GET /api/reseller/credits/rates which now returns legacy per-user rates plus pricing
   */
  async getCreditPurchaseRates(): Promise<ApiResult<any>> {
    try {
      const result = await apiService.get<any>(API_ENDPOINTS.RESELLER.CREDIT_RATES);
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Purchase Rates Fetch Failed',
          details: 'Failed to fetch credit purchase pricing',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create Stripe Checkout Session and return redirect URL
   */
  async createCheckoutSession(quantity: number): Promise<ApiResult<{ url: string }>> {
    try {
      const result = await apiService.post<{ url: string }>(
        API_ENDPOINTS.RESELLER.CHECKOUT_SESSION,
        { quantity }
      );
      return result;
    } catch {
      return {
        success: false,
        error: {
          error: 'Checkout Session Failed',
          details: 'Failed to create Stripe Checkout session',
          timestamp: new Date().toISOString()}
      };
    }
  }
}
 
export const resellerService = new ResellerService();
