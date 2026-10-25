import { apiService } from './api';
import { ApiResult } from '@/types';
import { API_ENDPOINTS } from '@/constants/api';

export interface BillingOverview {
  currency: string;
  online_amount_cents: number;
  offline_amount_cents: number;
  adjustments_amount_cents: number;
  total_amount_cents: number;
  credits_from_online: number;
  credits_from_offline: number;
  credits_from_adjustments: number;
  total_credits: number;
}

export interface BillingTransaction {
  id: number;
  reseller_id: number;
  reseller_username: string;
  source: 'stripe' | 'offline' | 'adjustment';
  method?: string | null;
  reference?: string | null;
  amount_cents: number;
  currency: string;
  credits_qty: number;
  status: 'completed' | 'pending' | 'refunded' | 'failed';
  notes?: string | null;
  created_at: string;
  created_by?: number | null;
}

export interface BillingTransactionsQuery {
  page?: number;
  per_page?: number;
  source?: 'stripe' | 'offline' | 'adjustment';
  status?: 'completed' | 'pending' | 'refunded' | 'failed';
  method?: 'card' | 'cash' | 'bank' | 'other';
  reseller_id?: number;
  reference?: string;
  start_date?: string;     // ISO 8601 or YYYY-MM-DD
  end_date?: string;       // ISO 8601 or YYYY-MM-DD
  min_amount_cents?: number;
  max_amount_cents?: number;
}

export interface PaginatedBillingTransactions {
  items: BillingTransaction[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}

export interface CreateOfflinePaymentRequest {
  reseller_id: number;
  amount_cents: number; // positive integer
  currency?: string;    // defaults to backend currency
  credits_qty: number;  // positive integer
  method?: string;      // cash/bank/other
  reference?: string;   // invoice number, etc.
  notes?: string;
}

class BillingService {
  async getOverview(): Promise<ApiResult<BillingOverview>> {
    try {
      return await apiService.get<BillingOverview>(API_ENDPOINTS.ADMIN.BILLING.OVERVIEW);
    } catch {
      return {
        success: false,
        error: {
          error: 'Billing Overview Failed',
          details: 'Failed to fetch billing overview',
          timestamp: new Date().toISOString()}};
    }
  }

  async getTransactions(params?: BillingTransactionsQuery): Promise<ApiResult<PaginatedBillingTransactions>> {
    try {
      const qs = new URLSearchParams();
      if (params) {
        if (params.page != null) qs.set('page', String(params.page));
        if (params.per_page != null) qs.set('per_page', String(params.per_page));
        if (params.source) qs.set('source', params.source);
        if (params.status) qs.set('status', params.status);
        if (params.method) qs.set('method', params.method);
        if (params.reseller_id != null) qs.set('reseller_id', String(params.reseller_id));
        if (params.reference) qs.set('reference', params.reference);
        if (params.start_date) qs.set('start_date', params.start_date);
        if (params.end_date) qs.set('end_date', params.end_date);
        if (params.min_amount_cents != null) qs.set('min_amount_cents', String(params.min_amount_cents));
        if (params.max_amount_cents != null) qs.set('max_amount_cents', String(params.max_amount_cents));
      }
      const url =
        qs.toString().length > 0
          ? `${API_ENDPOINTS.ADMIN.BILLING.TRANSACTIONS}?${qs.toString()}`
          : API_ENDPOINTS.ADMIN.BILLING.TRANSACTIONS;

      const raw = await apiService.get<any>(url);
      if (raw.success) {
        const data = raw.data;
        // Backend may return plain array; normalize to paginated shape
        if (Array.isArray(data)) {
          const items = data as BillingTransaction[];
          return {
            success: true,
            data: {
              items,
              page: 1,
              per_page: items.length,
              total: items.length,
              has_more: false}};
        }
        return raw as ApiResult<PaginatedBillingTransactions>;
      }
      return raw;
    } catch {
      return {
        success: false,
        error: {
          error: 'Billing Transactions Failed',
          details: 'Failed to fetch billing transactions',
          timestamp: new Date().toISOString()}};
    }
  }

  async createOfflinePayment(payload: CreateOfflinePaymentRequest): Promise<ApiResult<BillingTransaction>> {
    try {
      return await apiService.post<BillingTransaction>(API_ENDPOINTS.ADMIN.BILLING.OFFLINE_PAYMENT, payload);
    } catch {
      return {
        success: false,
        error: {
          error: 'Offline Payment Failed',
          details: 'Failed to create offline payment',
          timestamp: new Date().toISOString()}};
    }
  }
}

export const billingService = new BillingService();
