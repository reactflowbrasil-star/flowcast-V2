import type { UserRole } from './auth';

export interface UserProfile {
  id: number;
  username: string;
  email?: string | null;
  role: UserRole;
  max_devices: number;
  expires_at?: string | null;
  active: boolean;
  created_at: string;
  device_count: number;
  subscribed_categories?: number[] | null;
}

export interface ChangePasswordRequestPayload {
  current_password: string;
  new_password: string;
}
