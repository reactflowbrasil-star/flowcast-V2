'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import MobileBottomNav from '@/components/user/MobileBottomNav';

export default function UserLayout({
  children }: {
    children: React.ReactNode;
  }) {
  const pathname = usePathname();
  const isWatchPage = pathname.includes('/watch');

  // Minimal layout for watch page
  if (isWatchPage) {
    return <div className="min-h-screen bg-black text-white">{children}</div>;
  }

  return (
    <div className="relative min-h-screen bg-[#050505] text-white flex flex-col overflow-x-hidden">
      {/* Fixed Sidebar for Desktop */}
      <ModernUserSidebar />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Main Content Wrapper */}
      {/* pl-0 on mobile, pl-[80px] on desktop to align with the collapsed sidebar */}
      <div className="flex-1 w-full pb-20 md:pb-0 md:pl-[80px] transition-all duration-300">
        {children}
      </div>
    </div>
  );
}
