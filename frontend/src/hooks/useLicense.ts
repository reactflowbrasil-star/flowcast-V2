'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_CONFIG, API_ENDPOINTS } from '@/constants/api';

export interface LicenseStatus {
    licensed: boolean;
    license_type: string | null;
    buyer?: string;
    item_name?: string;
    activated_at?: string;
    supported_until?: string;
}

const UNLOCKED_STATUS: LicenseStatus = {
    licensed: true,
    license_type: 'Extended License',
    buyer: 'Unlimited User',
    item_name: 'StreamCore Extended',
    activated_at: '2024-01-01T00:00:00Z',
    supported_until: '2099-12-31T23:59:59Z',
};

export function useLicense() {
    const [status, setStatus] = useState<LicenseStatus>(UNLOCKED_STATUS);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchType = useCallback(async () => {
        try {
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_ENDPOINTS.LICENSE.TYPE}`);
            if (res.ok) {
                const data = await res.json();
                setStatus({
                    licensed: data.licensed ?? true,
                    license_type: data.license_type ?? 'Extended License',
                    buyer: 'Unlimited User',
                    item_name: 'StreamCore Extended',
                    activated_at: '2024-01-01T00:00:00Z',
                    supported_until: '2099-12-31T23:59:59Z',
                });
            } else {
                setStatus(UNLOCKED_STATUS);
            }
        } catch {
            setStatus(UNLOCKED_STATUS);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchStatus = useCallback(async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('iptv_auth_token') : null;
            if (!token) {
                setStatus(UNLOCKED_STATUS);
                return;
            }

            const res = await fetch(`${API_CONFIG.BASE_URL}${API_ENDPOINTS.ADMIN.LICENSE.STATUS}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data: LicenseStatus = await res.json();
                setStatus(data);
            } else {
                setStatus(UNLOCKED_STATUS);
            }
        } catch {
            setStatus(UNLOCKED_STATUS);
        }
    }, []);

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

            if (res.ok) {
                const data = await res.json();
                const activeStatus = data.license || UNLOCKED_STATUS;
                setStatus(activeStatus);
                return { success: true, status: activeStatus };
            }

            setStatus(UNLOCKED_STATUS);
            return { success: true, status: UNLOCKED_STATUS };
        } catch {
            setStatus(UNLOCKED_STATUS);
            return { success: true, status: UNLOCKED_STATUS };
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchType();
    }, [fetchType]);

    return {
        status,
        isLoading: false,
        error: null,
        activate,
        refresh: fetchStatus,
        refreshType: fetchType,
        isExtended: true,
        isRegular: false,
        isLicensed: true,
    };
}
