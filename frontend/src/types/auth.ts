// Authentication types based on backend API requirements

export enum UserRole {
  ADMIN = 'admin',
  RESELLER = 'reseller',
  END_USER = 'end_user'
}

export interface User {
  id: number;
  username: string;
  email?: string;
  role: UserRole;
  credits?: number;
  active: boolean;
  created_by?: number;
  max_devices: number;
  expires_at?: string;
  created_at: string;
  // Demo fields
  daily_demo_limit?: number;
  demos_created_today?: number;
  is_demo?: boolean;
  demo_expires_at?: string;
  // Subscriptions - array of category IDs from backend
  subscribed_categories?: number[];
  // Direct subscription support
  subscription_source?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  totp_code?: string;
  device_id?: string;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  username: string;
  email?: string;
  role: UserRole;
  credits?: number;
  active: boolean;
  max_devices: number;
  expires_at?: string;
  // Demo fields
  daily_demo_limit?: number;
  demos_created_today?: number;
  demos_remaining_today?: number;
  is_demo?: boolean;
  demo_expires_at?: string;
  // Subscriptions - array of category IDs from backend
  subscribed_categories?: number[];
  // Direct subscription support
  subscription_source?: string;
}

export interface CreateDemoRequest {
  username: string;
  password: string;
  email?: string;
  category_ids?: number[];
}

export interface DemoStats {
  daily_limit: number;
  demos_created_today: number;
  demos_remaining_today: number;
  active_demos: number;
}

export interface UpdateResellerDemoLimitRequest {
  daily_demo_limit: number;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  email?: string;
  role: UserRole;
  credits?: number;
  max_devices?: number;
  expires_at?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface TokenResponse {
  token: string;
}

export interface MessageResponse {
  message: string;
}
