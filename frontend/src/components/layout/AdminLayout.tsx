'use client';

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import AdminSidebar from './AdminSidebar';
import { Breadcrumbs, BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { APP_CONFIG } from '@/constants/app';
import ThemeSelector from '@/components/ThemeSelector';
import { GlobalSearch } from '@/components/admin/GlobalSearch';
import NotificationsDropdown from '@/components/ui/notifications-dropdown';
import TMDBAttribution from '@/components/common/TMDBAttribution';

interface AdminLayoutProps {
  children: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export default function AdminLayout({ children, breadcrumbs }: AdminLayoutProps) {
  useLoadNamespace('admin');
  const { t } = useTranslation();
  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-chart-1/10 blur-3xl" />
      </div>
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Content */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 px-4 py-4 shadow-sm backdrop-blur-xl transition-all duration-300 md:px-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{APP_CONFIG.NAME}</h1>
              <p className="text-sm text-muted-foreground">{t('layout.adminDashboard')}</p>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-3">
              <NotificationsDropdown variant="admin" />
              <ThemeSelector />
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>{t('layout.online')}</span>
              </div>
            </div>
          </div>

          {/* Search and Breadcrumbs Row */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 overflow-hidden">
              <Breadcrumbs
                items={breadcrumbs as BreadcrumbItem[]}
                showHome={true}
                homeHref="/admin"
              />
            </div>
            <div className="md:ml-4">
              <GlobalSearch />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {children}
          <TMDBAttribution className="mt-10 pb-6" />
        </main>
      </div>
    </div>
  );
}
