import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import i18n from '@/lib/i18n';

interface UnreadTicketsResponse {
  total_unread: number;
}

export function useUnreadTickets() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['unread-tickets', user?.role],
    queryFn: async () => {
      if (!user) {
        throw new Error(i18n.t('auth.session.sessionExpired'));
      }

      // Use the correct endpoint based on user role
      const endpoint = user.role === 'admin'
        ? '/api/admin/tickets/unread-count'
        : '/api/reseller/tickets/unread-count';

      const result = await apiService.get<UnreadTicketsResponse>(endpoint);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    enabled: !!user, // Only run query if user is authenticated
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });
}
