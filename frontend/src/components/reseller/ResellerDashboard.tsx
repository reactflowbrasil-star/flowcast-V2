'use client';

import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useUnreadTickets } from '@/hooks/useUnreadTickets';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Clock, 
  Calendar,
  ChevronRight,
  Activity,
  Plus,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { resellerService } from '@/services/reseller';

// Sub-components
import EndUserManagement from './EndUserManagement';
import UserDeviceMonitoring from './UserDeviceMonitoring';
import ExpirationMonitoring from './ExpirationMonitoring';
import DemoManagement from './DemoManagement';
import ResellerActivityLogs from './ActivityLogs';
import SupportTickets from './SupportTickets';
import BuyCredits from './BuyCredits';
import CreditBalance from './CreditBalance';
import ApiKeysManagement from './ApiKeysManagement';

import ResellerProfileDialog from './ResellerProfileDialog';
import ResellerAnalytics from './ResellerAnalytics';
import ResellerStatsCards from './ResellerStatsCards';
import QuickActions from './QuickActions';
import ResellerLayout from './ResellerLayout';

interface ResellerDashboardProps {
  className?: string;
}

type DashboardView = 
  | 'dashboard'
  | 'users' 
  | 'devices' 
  | 'expiration' 
  | 'demos' 
  | 'tickets' 
  | 'logs' 
  | 'credits'
  | 'api-keys';

// Constant for the unified "glass/transparent" card style
// This ensures all sub-views match the dashboard aesthetic
const GLASS_CARD_STYLE = "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm";

export default function ResellerDashboard({ className, initialView = 'dashboard' }: ResellerDashboardProps & { initialView?: string }) {
  const { t } = useTranslation('reseller');
  const [currentView, setCurrentView] = useState<string>(initialView);
  const [autoAction, setAutoAction] = useState<string | null>(null);
  const { user: currentUser } = useAuth();
  
  // Data Fetching
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['reseller-users'],
    queryFn: async () => {
      const result = await resellerService.getEndUsers();
      return result.success ? result.data : [];
    },
    refetchInterval: 60000
  });

  const { data: creditData } = useQuery({
    queryKey: ['reseller-credits'],
    queryFn: async () => {
      const result = await resellerService.getCreditBalance();
      return result.success ? result.data : { credits: 0 };
    },
    refetchInterval: 30000
  });

  const { data: demoStats } = useQuery({
    queryKey: ['demo-stats'],
    queryFn: async () => {
      const result = await resellerService.getDemoStats();
      return result.success ? result.data : null;
    },
    refetchInterval: 60000
  });

  const handleNavigate = (view: string) => {
    if (view === 'create-user') {
      setCurrentView('users');
      setAutoAction('create-user');
    } else if (view === 'create-demo') {
      setCurrentView('demos');
      setAutoAction('create-demo');
    } else {
      setCurrentView(view);
      setAutoAction(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-in fade-in duration-500">
            {/* Welcome Banner */}
            <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8 shadow-lg border border-indigo-100 dark:border-slate-700">
              <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-indigo-500/10 dark:bg-indigo-500/10 blur-3xl" />
              <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-64 w-64 rounded-full bg-emerald-500/10 dark:bg-emerald-500/10 blur-3xl" />
              
              <div className="relative z-10 flex flex-col gap-4 sm:gap-6">
                <div>
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300 mb-2 text-xs sm:text-sm font-medium">
                    <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>{t('dashboard.commandCenter')}</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {t('dashboard.welcomeBack', { name: currentUser?.username || '' })}
                  </h2>
                  <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm sm:text-base max-w-xl">
                    <Trans
                      t={t}
                      i18nKey="dashboard.statsDescription"
                      values={{
                        subscribers: users.length,
                        credits: (creditData?.credits ?? 0).toFixed(2)
                      }}
                      components={{
                        subscribers: <span className="font-semibold text-emerald-600 dark:text-emerald-400" />,
                        credits: <span className="font-semibold text-indigo-600 dark:text-indigo-400" />
                      }}
                    />
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Button 
                    onClick={() => handleNavigate('create-user')}
                    className="bg-indigo-600 hover:bg-indigo-700 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-none shadow-md font-semibold text-sm h-9 sm:h-10"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('dashboard.newUser')}
                  </Button>
                  <Button 
                    onClick={() => handleNavigate('create-demo')}
                    className="bg-white hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700/50 backdrop-blur-sm text-sm h-9 sm:h-10"
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {t('dashboard.newDemo')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Trend Cards */}
            <ResellerStatsCards 
              users={users} 
              creditBalance={creditData?.credits || 0}
              activeDemos={demoStats?.active_demos || 0}
              isLoading={isLoadingUsers}
            />

            {/* Main Analytics Section */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6">
              <ResellerAnalytics users={users} />
            </div>

            {/* Operations Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Expiring Soon Feed */}
              <Card className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm h-full">
                <CardContent className="p-4 sm:p-6">
                   <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base text-slate-800 dark:text-slate-100">
                        <div className="p-1 sm:p-1.5 bg-rose-100 dark:bg-rose-900/30 rounded-md text-rose-600 dark:text-rose-400">
                          <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </div>
                        {t('dashboard.expiringSoon')}
                      </h3>
                      <Button variant="ghost" size="sm" className="text-xs h-7 sm:h-8 px-2 sm:px-3" onClick={() => handleNavigate('expiration')}>
                        {t('dashboard.viewAll')} <ChevronRight className="ml-1 h-3 w-3" />
                      </Button>
                   </div>
                   <ExpirationMonitoring compact={true} />
                </CardContent>
              </Card>

              {/* Quick Actions Grid */}
              <div className="flex flex-col h-full gap-4 sm:gap-6">
                 <div>
                    <h3 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base text-slate-800 dark:text-slate-100">
                      <div className="p-1 sm:p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-md text-blue-600 dark:text-blue-400">
                         <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                      {t('dashboard.quickActions')}
                    </h3>
                    <QuickActions onAction={handleNavigate} />
                 </div>
              </div>
            </div>
          </div>
        );
      case 'users': return <EndUserManagement className={GLASS_CARD_STYLE} autoOpenCreate={autoAction === 'create-user'} />;
      case 'devices': return <UserDeviceMonitoring className={GLASS_CARD_STYLE} />;
      case 'expiration': return <ExpirationMonitoring className={GLASS_CARD_STYLE} />;
      case 'demos': return <DemoManagement className={GLASS_CARD_STYLE} autoOpenCreate={autoAction === 'create-demo'} />;
      case 'tickets': return <SupportTickets className={GLASS_CARD_STYLE} />;
      case 'logs': return <ResellerActivityLogs className={GLASS_CARD_STYLE} />;
      case 'credits': 
        return (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
               <CreditBalance className={GLASS_CARD_STYLE} />
               <BuyCredits className={GLASS_CARD_STYLE} />
            </div>
          </div>
        );
      case 'api-keys':
        return <ApiKeysManagement className={GLASS_CARD_STYLE} />;
      case 'profile': 
        return (
          <div className="max-w-4xl mx-auto space-y-6">
             <div className="flex items-center justify-between">
               <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.profileSettings')}</h2>
             </div>
             {currentUser && (
                // We render the dialog content effectively by forcing it open.
                // Ideally we would extract the form, but this works to "show" the profile.
                // However, showing a Dialog inside a page content area is weird (it will be a modal).
                // If we want it inline, we need to refactor ResellerProfileDialog.
                // Let's just keep the modal behavior but trigger it immediately when this view is active.
                <ResellerProfileDialog 
                  open={true} 
                  onOpenChange={(open) => {
                    if (!open) handleNavigate('dashboard');
                  }} 
                  user={currentUser} 
                />
             )}
          </div>
        );
      default: return null;
    }
  };

  return (
    <ResellerLayout currentView={currentView} onNavigate={handleNavigate}>
      {renderContent()}
    </ResellerLayout>
  );
}
