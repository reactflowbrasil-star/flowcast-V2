import React, { useState, useEffect } from 'react';
import {
  ShieldExclamationIcon,
  UserMinusIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  ClockIcon,
  NoSymbolIcon
} from '@heroicons/react/24/outline';
import { SecurityService } from '../../services/securityService';
import type { SecurityStatsResponse } from '../../types/security';
import SecurityIncidentsTable from './SecurityIncidentsTable';
import SecurityBansTable from './SecurityBansTable';
import SecurityStats from './SecurityStats';
import BlacklistedDevicesTable from './BlacklistedDevicesTable';
import CreateBanModal from './CreateBanModal';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { AdminSectionHeader } from './AdminSectionHeader';

const SecurityPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'stats' | 'incidents' | 'bans' | 'blacklisted-devices'>('stats');
  const [stats, setStats] = useState<SecurityStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateBanModal, setShowCreateBanModal] = useState(false);
  useLoadNamespace('admin/security');
  const { t } = useTranslation('admin/security');

  useEffect(() => {
    loadSecurityStats();
  }, []);

  const loadSecurityStats = async () => {
    try {
      setLoading(true);
      const statsData = await SecurityService.getSecurityStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading security stats:', error);
      toast.error(t('notifications.security.errorLoadingStatistics'));
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupExpiredBans = async () => {
    try {
      const result = await SecurityService.cleanupExpiredBans();
      toast.success(result.message);
      loadSecurityStats(); // Refresh stats
    } catch (error) {
      console.error('Error cleaning up expired bans:', error);
      toast.error(t('notifications.security.errorCleaningExpiredBans'));
    }
  };

  const tabs = [
    {
      id: 'stats' as const,
      name: t('tabs.overview'),
      icon: ChartBarIcon,
      count: stats?.total_incidents || 0
    },
    {
      id: 'incidents' as const,
      name: t('tabs.incidents'),
      icon: ExclamationTriangleIcon,
      count: stats?.incidents_today || 0
    },
    {
      id: 'bans' as const,
      name: t('tabs.bans'),
      icon: UserMinusIcon,
      count: stats?.active_bans || 0
    },
    {
      id: 'blacklisted-devices' as const,
      name: t('tabs.blacklistedDevices'),
      icon: NoSymbolIcon,
      count: 0, // We'll update this later when we get the count
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={ShieldExclamationIcon}
        title={t('title')}
        description={t('subtitle')}
        actions={(
          <>
            <button
              onClick={handleCleanupExpiredBans}
              className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <ClockIcon className="mr-2 h-4 w-4" />
              {t('actions.cleanupExpiredBans')}
            </button>
            <button
              onClick={() => setShowCreateBanModal(true)}
              className="inline-flex items-center rounded-md border border-transparent bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
            >
              <NoSymbolIcon className="mr-2 h-4 w-4" />
              {t('actions.createManualBan')}
            </button>
          </>
        )}
      />

      {/* Quick Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="bg-card overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">
                      {t('cards.totalIncidents')}
                    </dt>
                    <dd className="text-lg font-medium text-foreground">
                      {stats.total_incidents}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClockIcon className="h-6 w-6 text-red-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">
                      {t('cards.todaysIncidents')}
                    </dt>
                    <dd className="text-lg font-medium text-foreground">
                      {stats.incidents_today}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UserMinusIcon className="h-6 w-6 text-orange-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">
                      {t('cards.activeBans')}
                    </dt>
                    <dd className="text-lg font-medium text-foreground">
                      {stats.active_bans}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <NoSymbolIcon className="h-6 w-6 text-red-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">
                      {t('cards.permanentBans')}
                    </dt>
                    <dd className="text-lg font-medium text-foreground">
                      {stats.permanent_bans}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">
                      {t('cards.blacklistedDevices')}
                    </dt>
                    <dd className="text-lg font-medium text-foreground">
                      --
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-card shadow rounded-lg">
        <div className="border-b border-border">
          <nav className="-mb-px flex space-x-4 px-6" aria-label={t('tabs.overview')}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.name}
                  {tab.count > 0 && (
                    <span className={`${activeTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'
                      } ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'stats' && stats && <SecurityStats stats={stats} />}
          {activeTab === 'incidents' && <SecurityIncidentsTable />}
          {activeTab === 'bans' && <SecurityBansTable onRefresh={loadSecurityStats} />}
          {activeTab === 'blacklisted-devices' && <BlacklistedDevicesTable />}
        </div>
      </div>

      {/* Create Ban Modal */}
      {showCreateBanModal && (
        <CreateBanModal
          isOpen={showCreateBanModal}
          onClose={() => setShowCreateBanModal(false)}
          onSuccess={() => {
            setShowCreateBanModal(false);
            loadSecurityStats();
          }}
        />
      )}
    </div>
  );
};

export default SecurityPanel;
