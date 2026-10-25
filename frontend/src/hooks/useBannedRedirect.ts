import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to automatically redirect banned users to the banned page
 * Should be used in protected pages to ensure banned users can't access them
 */
export const useBannedRedirect = () => {
  const { user, isAuthenticated, isBanned } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only check if user is authenticated and we're not already on the banned page
    if (isAuthenticated && user && pathname !== '/banned') {
      if (isBanned()) {
        router.push('/banned');
      }
    }
  }, [user, isAuthenticated, isBanned, router, pathname]);

  return {
    isBanned: isBanned(),
    shouldRedirect: isAuthenticated && isBanned() && pathname !== '/banned'
  };
};
