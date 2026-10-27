import apiService from './api';
import { ApiResult } from '@/types';

// ─── Types ───

export interface Package {
    id: number;
    name: string;
    description?: string;
    price_cents: number;
    currency: string;
    billing_mode: 'recurring' | 'one_time';
    billing_interval?: string;
    duration_days?: number;
    max_devices: number;
    category_ids: number[];
    features?: Record<string, boolean>;
    stripe_price_id?: string;
    badge_text?: string;
    badge_color?: string;
    active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface PublicPackage {
    id: number;
    name: string;
    description?: string;
    price_cents: number;
    currency: string;
    billing_mode: string;
    billing_interval?: string;
    duration_days?: number;
    max_devices: number;
    category_ids: number[];
    features?: Record<string, boolean>;
    badge_text?: string;
    badge_color?: string;
}

export interface DirectSubscription {
    id: number;
    user_id: number;
    package_id: number;
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    stripe_session_id?: string;
    status: 'pending' | 'active' | 'past_due' | 'canceled' | 'expired';
    current_period_start?: string;
    current_period_end?: string;
    cancel_at_period_end: boolean;
    created_at: string;
    updated_at: string;
}

export interface SubscriptionStatus {
    subscription: DirectSubscription | null;
    package: PublicPackage | null;
    subscription_source: string | null;
}

export interface CreatePackageRequest {
    name: string;
    description?: string;
    price_cents: number;
    currency?: string;
    billing_mode: string;
    billing_interval?: string;
    duration_days?: number;
    max_devices?: number;
    category_ids: number[];
    features?: Record<string, boolean>;
    stripe_price_id?: string;
    badge_text?: string;
    badge_color?: string;
    sort_order?: number;
}

export interface UpdatePackageRequest {
    name?: string;
    description?: string;
    price_cents?: number;
    currency?: string;
    billing_mode?: string;
    billing_interval?: string;
    duration_days?: number;
    max_devices?: number;
    category_ids?: number[];
    features?: Record<string, boolean>;
    stripe_price_id?: string;
    badge_text?: string;
    badge_color?: string;
    active?: boolean;
    sort_order?: number;
}

export interface RegisterRequest {
    username: string;
    email: string;
    password: string;
}

export interface SubscriptionStats {
    total_active: number;
    total_canceled: number;
    total_expired: number;
    total_revenue_cents: number;
    new_this_month: number;
}

// ─── Public API (no auth) ───

const listPublicPackages = async (): Promise<ApiResult<PublicPackage[]>> => {
    return apiService.get<PublicPackage[]>('/api/public/packages');
};

const register = async (payload: RegisterRequest): Promise<ApiResult<{ message: string; requires_verification: boolean; user_id: number; token?: string }>> => {
    return apiService.post('/api/public/register', payload);
};

const checkEmail = async (email: string): Promise<ApiResult<{ available: boolean }>> => {
    return apiService.post('/api/public/check-email', { email });
};

// ─── Authenticated end-user ───

const getSubscription = async (): Promise<ApiResult<SubscriptionStatus>> => {
    return apiService.get<SubscriptionStatus>('/api/user/subscription');
};

const subscribe = async (packageId: number): Promise<ApiResult<{ url: string; session_id: string }>> => {
    return apiService.post('/api/user/subscribe', { package_id: packageId });
};

const cancelSubscription = async (): Promise<ApiResult<{ message: string; cancel_at_period_end?: boolean; current_period_end?: string | null }>> => {
    return apiService.post('/api/user/subscription/cancel');
};

const resubscribe = async (packageId: number): Promise<ApiResult<{ url: string; session_id: string }>> => {
    return apiService.post('/api/user/subscription/resubscribe', { package_id: packageId });
};

// ─── Admin ───

const adminListPackages = async (): Promise<ApiResult<Package[]>> => {
    return apiService.get<Package[]>('/api/admin/packages');
};

const adminCreatePackage = async (payload: CreatePackageRequest): Promise<ApiResult<Package>> => {
    return apiService.post<Package>('/api/admin/packages', payload);
};

const adminUpdatePackage = async (id: number, payload: UpdatePackageRequest): Promise<ApiResult<Package>> => {
    return apiService.put<Package>(`/api/admin/packages/${id}`, payload);
};

const adminDeactivatePackage = async (id: number): Promise<ApiResult<{ message: string }>> => {
    return apiService.delete<{ message: string }>(`/api/admin/packages/${id}`);
};

const adminListSubscriptions = async (): Promise<ApiResult<DirectSubscription[]>> => {
    return apiService.get<DirectSubscription[]>('/api/admin/direct-subscriptions');
};

const adminGetSubscriptionStats = async (): Promise<ApiResult<SubscriptionStats>> => {
    return apiService.get<SubscriptionStats>('/api/admin/direct-subscriptions/stats');
};

export const packagesService = {
    listPublicPackages,
    register,
    checkEmail,
    getSubscription,
    subscribe,
    cancelSubscription,
    resubscribe,
    adminListPackages,
    adminCreatePackage,
    adminUpdatePackage,
    adminDeactivatePackage,
    adminListSubscriptions,
    adminGetSubscriptionStats,
};

export default packagesService;
