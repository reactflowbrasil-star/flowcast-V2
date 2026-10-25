import apiService from './api';
import { ApiResult } from '@/types';
 
export interface RedeemResponse {
  redeemed: boolean;
  user_id?: number;
  username?: string;
  message: string;
}
 
export interface GiftCodeCreateRequest {
  code?: string;
  duration_months: number;
  uses_total: number;
  expires_at?: string | null;
  allowed_categories?: number[] | null;
  max_devices?: number | null;
}
 
export interface BulkCreateRequest {
  prefix?: string | null;
  count: number;
  duration_months: number;
  uses_total: number;
  expires_at?: string | null;
  allowed_categories?: number[] | null;
  max_devices?: number | null;
}
 
export interface GiftCode {
  id: number;
  code: string;
  duration_days: number;
  uses_total: number;
  uses_remaining: number;
  expires_at?: string | null;
  allowed_categories?: number[] | null;
  max_devices?: number | null;
  created_by: number;
  created_at: string;
}
 
export interface GiftCodeValidation {
  code: string;
  duration_days: number;
  uses_remaining: number;
  expires_at?: string | null;
  allowed_categories?: number[] | null;
  max_devices?: number | null;
}
 
export interface RedeemRequestPayload {
  action?: 'create' | 'extend';
  code: string;
  username?: string;
  password?: string;
  email?: string;
  category_ids?: number[];
}

export interface UsernameAvailabilityResponse {
  available: boolean;
  message: string;
}
 
const validateCode = async (payload: { code: string }): Promise<ApiResult<GiftCodeValidation>> => {
  return apiService.post<GiftCodeValidation>('/api/redeem/validate', payload);
};
 
const redeem = async (payload: RedeemRequestPayload): Promise<ApiResult<RedeemResponse>> => {
  return apiService.post<RedeemResponse>('/api/redeem', payload);
};

const checkUsernameAvailability = async (username: string): Promise<ApiResult<UsernameAvailabilityResponse>> => {
  const encoded = encodeURIComponent(username);
  return apiService.get<UsernameAvailabilityResponse>(`/api/redeem/check-username/${encoded}`);
};
 
const adminList = async (): Promise<ApiResult<GiftCode[]>> => {
  return apiService.get<GiftCode[]>('/api/admin/gift-codes');
};
 
const adminCreate = async (payload: GiftCodeCreateRequest): Promise<ApiResult<GiftCode>> => {
  return apiService.post<GiftCode>('/api/admin/gift-codes', payload);
};
 
const adminBulkCreate = async (payload: BulkCreateRequest): Promise<ApiResult<GiftCode[]>> => {
  return apiService.post<GiftCode[]>('/api/admin/gift-codes/bulk', payload);
};
 
const adminBulkDelete = async (ids: number[]): Promise<ApiResult<{ deleted: number }>> => {
  // Send as DELETE with body (axios supports data in config)
  return apiService.request<{ deleted: number }>({
    method: 'DELETE',
    url: '/api/admin/gift-codes',
    data: ids});
};
 
export const giftCodesService = {
  validateCode,
  redeem,
  checkUsernameAvailability,
  adminList,
  adminCreate,
  adminBulkCreate,
  adminBulkDelete};
 
export default giftCodesService;