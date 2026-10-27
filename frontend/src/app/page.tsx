'use client';

import React from 'react';
import Image from 'next/image';
import UserDashboard from './user/page';
import ModernUserSidebar from '@/components/user/ModernUserSidebar';
import MobileBottomNav from '@/components/user/MobileBottomNav';

/**
 * The application root is the viewer experience. Keep the administration
 * area available at /admin while providing the streaming catalog at /.
 */
export default function Home() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white flex flex-col overflow-x-hidden">
      <ModernUserSidebar />
      <MobileBottomNav />
      <Image
        src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/flowcast-logo.png`}
        alt="Flowcast"
        width={132}
        height={44}
        className="absolute left-4 top-4 z-40 h-auto w-28 object-contain md:hidden"
        priority
      />
      <main className="flex-1 w-full pb-20 md:pb-0 md:pl-[80px] transition-all duration-300">
        <UserDashboard />
      </main>
    </div>
  );
}
