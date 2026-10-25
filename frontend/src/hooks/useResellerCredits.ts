import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { resellerService } from '@/services/reseller';

export function useResellerCredits() {
  const { t } = useTranslation();
  return useQuery({
    queryKey: ['reseller-credits'],
    queryFn: async () => {
      const result = await resellerService.getCreditBalance();
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error?.error || t('common.serverError'));
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });
}
