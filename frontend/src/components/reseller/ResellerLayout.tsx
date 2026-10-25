'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import {
  LayoutDashboard,
  Users,
  Smartphone,
  Clock,
  CreditCard,
  LifeBuoy,
  Activity,
  Calendar,
  Menu,
  X,
  Search,
  Bell,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Key
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import ThemeSelector from '@/components/ThemeSelector';
import { useResellerCredits } from '@/hooks/useResellerCredits';
import NotificationsDropdown from '@/components/ui/notifications-dropdown';
import { APP_NAME } from '@/constants/app';

interface ResellerLayoutProps {
  children: React.ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function ResellerLayout({ children, currentView, onNavigate }: ResellerLayoutProps) {
  useLoadNamespace('reseller');
  const { t } = useTranslation('reseller');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { user, logout } = useAuth();
  const { data: creditBalance } = useResellerCredits();

  const menuItems = [
    { id: 'dashboard', label: t('layout.navigation.dashboard'), icon: LayoutDashboard, section: t('layout.sections.main') },
    { id: 'users', label: t('layout.navigation.subscribers'), icon: Users, section: t('layout.sections.operations') },
    { id: 'devices', label: t('layout.navigation.connections'), icon: Smartphone, section: t('layout.sections.operations') },
    { id: 'expiration', label: t('layout.navigation.expirations'), icon: Calendar, section: t('layout.sections.operations') },
    { id: 'demos', label: t('layout.navigation.trialUsers'), icon: Clock, section: t('layout.sections.operations') },
    { id: 'credits', label: t('layout.navigation.walletCredits'), icon: CreditCard, section: t('layout.sections.finance') },
    { id: 'api-keys', label: t('layout.navigation.apiKeys'), icon: Key, section: t('layout.sections.developer') },
    { id: 'tickets', label: t('layout.navigation.support'), icon: LifeBuoy, section: t('layout.sections.support') },
    { id: 'logs', label: t('layout.navigation.activityLogs'), icon: Activity, section: t('layout.sections.support') },
  ];

  // Group items by section
  const groupedItems = menuItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {} as Record<string, typeof menuItems>);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex font-sans text-slate-900 dark:text-slate-50">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto flex flex-col shadow-xl lg:shadow-none",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-indigo-600 dark:text-indigo-400">
            <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
              <Activity className="h-5 w-5" />
            </div>
            {t('dashboard.welcomeBack', { name: '' }).split(',')[0] || APP_NAME}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
          {Object.entries(groupedItems).map(([section, items]) => (
            <div key={section}>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
                {section}
              </h3>
              <div className="space-y-1">
                {items.map((item) => {
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                        isActive
                          ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100"
                      )}
                    >
                      <item.icon className={cn(
                        "h-5 w-5 transition-colors",
                        isActive
                          ? "text-indigo-600 dark:text-indigo-400"
                          : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                      )} />
                      {item.label}
                      {isActive && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer (Wallet) */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <Wallet className="h-4 w-4 text-emerald-500" />
                {t('layout.wallet.balance')}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-full"
                onClick={() => onNavigate('credits')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {creditBalance ? creditBalance.credits.toFixed(2) : '0.00'}
              <span className="text-sm font-normal text-slate-400 ml-1">{t('layout.wallet.currencyUnit')}</span>
            </div>
            <Button
              className="w-full mt-3 h-8 text-xs bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white border-none shadow-none"
              onClick={() => onNavigate('credits')}
            >
              {t('layout.wallet.addCredits')}
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {/* Sticky Header */}
        <header className="h-14 sm:h-16 sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center px-3 sm:px-4 lg:px-8 justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <Button variant="ghost" size="icon" className="lg:hidden -ml-1 sm:-ml-2 h-9 w-9 sm:h-10 sm:w-10" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
            </Button>

            {/* Global Search (Visual) - hidden on small screens */}
            <div className="relative max-w-md w-full hidden md:block group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder={t('layout.search.placeholder')}
                className="pl-10 h-9 bg-slate-100/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500/20 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            <NotificationsDropdown variant="reseller" />
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1 hidden sm:block" />
            <div className="hidden sm:block">
              <ThemeSelector />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="pl-1 sm:pl-2 pr-1 sm:pr-4 gap-1 sm:gap-3 h-8 sm:h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8 border border-slate-200 dark:border-slate-700">
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold text-xs sm:text-sm">
                      {user?.username?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-medium leading-none">{user?.username}</p>
                    <p className="text-xs text-slate-500 mt-1">{t('layout.account.reseller')}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('layout.account.myAccount')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onNavigate('profile')}>
                  <User className="mr-2 h-4 w-4" />
                  {t('layout.account.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate('credits')}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {t('layout.account.billing')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('layout.account.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 xl:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
