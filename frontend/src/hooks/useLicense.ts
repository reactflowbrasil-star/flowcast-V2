'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_CONFIG, API_ENDPOINTS } from '@/constants/api';

export interface LicenseStatus {
    licensed: boolean;
    license_type: string | null; // 'Regular License' | 'Extended License'
    buyer?: string;
    item_name?: string;
    activated_at?: string;
    supported_until?: string;
}

/**
 * Hook to query and manage the StreamCore license via the backend API.
 *
 * - `status`: the current license state (null while loading)
 * - `isLoading`: true during the initial fetch & activation calls
 * - `error`: last error message (if any)
 * - `activate(code)`: submit a purchase code for activation
 * - `refresh()`: re-fetch the license status
 * - `isExtended`: true when the active license is "Extended License"
 * - `isRegular`: true when the active license is "Regular License"
 */
export function useLicense() {
    const [status, setStatus] = useState<LicenseStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch public (no-auth) license type endpoint
    const fetchType = useCallback(async () => {
        try {
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_ENDPOINTS.LICENSE.TYPE}`);
            if (res.ok) {
                const data = await res.json();
                setStatus({
                    licensed: data.licensed ?? false,
                    license_type: data.license_type ?? null,
                });
            } else {
                // Backend unreachable — treat as unlicensed
                setStatus({ licensed: false, license_type: null });
            }
        } catch {
            setStatus({ licensed: false, license_type: null });
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch full status (requires admin token)
    const fetchStatus = useCallback(async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('iptv_auth_token') : null;
            if (!token) return;

            const res = await fetch(`${API_CONFIG.BASE_URL}${API_ENDPOINTS.ADMIN.LICENSE.STATUS}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data: LicenseStatus = await res.json();
                setStatus(data);
            }
        } catch {
            // ignore — keep existing status
        }
    }, []);

    // Activate a purchase code
    const activate = useCallback(async (purchaseCode: string): Promise<{ success: boolean; error?: string; status?: LicenseStatus }> => {
        setIsLoading(true);
        setError(null);

        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('iptv_auth_token') : null;
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_ENDPOINTS.ADMIN.LICENSE.ACTIVATE}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ purchase_code: purchaseCode }),
            });

            const data = await res.json();

            if (data.success && data.license) {
                setStatus(data.license);
                return { success: true, status: data.license };
            } else {
                const errMsg = data.error || 'Activation failed';
                setError(errMsg);
                return { success: false, error: errMsg };
            }
        } catch (e: any) {
            const msg = e?.message || 'Network error';
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchType();
    }, [fetchType]);

    return {
        status,
        isLoading,
        error,
        activate,
        refresh: fetchStatus,
        refreshType: fetchType,
        isExtended: status?.license_type === 'Extended License',
        isRegular: status?.license_type === 'Regular License',
        isLicensed: status?.licensed ?? false,
    };
}
