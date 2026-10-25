'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ResellerRoute } from '@/components/auth/ProtectedRoute';
import ResellerDashboard from '@/components/reseller/ResellerDashboard';
import ResellerProfileDialog from '@/components/reseller/ResellerProfileDialog';
import { useBannedRedirect } from '@/hooks/useBannedRedirect';

function ResellerPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialView = searchParams.get('tab') || searchParams.get('view') || 'dashboard';
  const [profileOpen, setProfileOpen] = useState(false);

  useBannedRedirect();

  return (
    <ResellerRoute>
      <ResellerDashboard initialView={initialView} />
      {user && (
        <ResellerProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          user={user}
        />
      )}
    </ResellerRoute>
  );
}

export default function ResellerPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <ResellerPageContent />
    </Suspense>
  );
}
