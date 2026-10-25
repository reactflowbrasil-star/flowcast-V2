import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface UsernameValidationResult {
  available: boolean;
  message: string;
}

interface UseUsernameValidationOptions {
  debounceMs?: number;
  skipIfEmpty?: boolean;
}

export const useUsernameValidation = (
  username: string,
  options: UseUsernameValidationOptions = {}
) => {
  const { t } = useTranslation();
  const { debounceMs = 500, skipIfEmpty = true } = options;
  const { user } = useAuth();
  const [debouncedUsername, setDebouncedUsername] = useState(username);

  // Debounce the username input
  useEffect(() => {
    if (skipIfEmpty && !username.trim()) {
      setDebouncedUsername('');
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedUsername(username);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [username, debounceMs, skipIfEmpty]);

  // Query to check username availability
  const { data, isLoading, error } = useQuery({
    queryKey: ['username-check', debouncedUsername, user?.role],
    queryFn: async (): Promise<UsernameValidationResult> => {
      if (!debouncedUsername.trim() || debouncedUsername.length < 3) {
        return {
          available: false,
          message: debouncedUsername.length < 3 && debouncedUsername.length > 0
            ? t('reseller.endUsers.validation.usernameMin')
            : t('login.usernamePlaceholder')
        };
      }

      // Choose endpoint: admin/reseller when logged, public when anonymous
      let endpoint: string;
      if (user?.role === 'admin') {
        endpoint = `/api/admin/users/check-username/${encodeURIComponent(debouncedUsername)}`;
      } else if (user?.role === 'reseller') {
        endpoint = `/api/reseller/users/check-username/${encodeURIComponent(debouncedUsername)}`;
      } else {
        endpoint = `/api/redeem/check-username/${encodeURIComponent(debouncedUsername)}`;
      }

      const result = await apiService.get<UsernameValidationResult>(endpoint);
      if (!result.success) {
        throw new Error(result.error.details || t('common.serverError'));
      }
      return result.data;
    },
    enabled: !!debouncedUsername.trim() && debouncedUsername.length >= 3,
    staleTime: 30000, // Cache for 30 seconds
    retry: false, // Don't retry on validation errors
  });

  // Determine the validation state
  const getValidationState = useCallback(() => {
    if (!debouncedUsername.trim()) {
      return { isValid: null, color: 'gray', message: '' };
    }

    if (isLoading) {
      return { isValid: null, color: 'blue', message: t('common.loading') };
    }

    if (error) {
      return { isValid: false, color: 'red', message: t('common.serverError') };
    }

    if (data) {
      return {
        isValid: data.available,
        color: data.available ? 'green' : 'red',
        message: data.message
      };
    }

    return { isValid: null, color: 'gray', message: '' };
  }, [debouncedUsername, isLoading, error, data, t]);

  const validationState = getValidationState();

  return {
    isAvailable: data?.available ?? null,
    isChecking: isLoading,
    message: validationState.message,
    color: validationState.color,
    isValid: validationState.isValid,
    error: error?.message
  };
};
