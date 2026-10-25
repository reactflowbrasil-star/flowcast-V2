'use client';

import { useState, useEffect, memo, useMemo, useCallback } from 'react';
import AdminProfileDialog from '../admin/AdminProfileDialog';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useUnreadTickets } from '@/hooks/useUnreadTickets';

import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import {
  BarChart3,
  Users,
  Video,
  Gift,
  UserCheck,
  Smartphone,
  Settings,
  Home,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Activity,
  MessageSquare,
  Shield,
  Key,
  List,
  DollarSign,
  UserCircle,
  ScanLine,
  Mail,
  Download,
  Package,
  CreditCard
} from 'lucide-react';

interface SidebarItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tab: string;
  badge?: string;
  description?: string;
}

const sidebarItems: SidebarItem[] = [
  {
    id: 'overview',
    icon: Home,
    tab: 'overview'
  },
  {
    id: 'content',
    icon: Video,
    tab: 'content'
  },
  {
    id: 'media-scanner',
    icon: ScanLine,
    tab: 'media-scanner'
  },
  {
    id: 'gift-codes',
    icon: Gift,
    tab: 'gift-codes'
  },
  {
    id: 'epg',
    icon: List,
    tab: 'epg'
  },
  {
    id: 'resellers',
    icon: UserCheck,
    tab: 'resellers'
  },
  {
    id: 'users',
    icon: Users,
    tab: 'users'
  },
  {
    id: 'demos',
    icon: UserCheck,
    tab: 'demos'
  },
  {
    id: 'devices',
    icon: Smartphone,
    tab: 'devices'
  },
  {
    id: 'tickets',
    icon: MessageSquare,
    tab: 'tickets'
  },
  {
    id: 'logs',
    icon: Activity,
    tab: 'logs'
  },
  {
    id: 'security',
    icon: Shield,
    tab: 'security'
  },
  {
    id: 'master-keys',
    icon: Key,
    tab: 'master-keys'
  },
  {
    id: 'billing',
    icon: DollarSign,
    tab: 'billing'
  },
  {
    id: 'email',
    icon: Mail,
    tab: 'email'
  },
  {
    id: 'app-versions',
    icon: Download,
    tab: 'app-versions'
  },
  {
    id: 'settings',
    icon: Settings,
    tab: 'settings'
  },
  {
    id: 'packages',
    icon: Package,
    tab: 'packages'
  },
  {
    id: 'direct-subscriptions',
    icon: CreditCard,
    tab: 'direct-subscriptions'
  },
];

interface AdminSidebarProps {
  className?: string;
}

export default function AdminSidebar({ className }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams?.get('tab') ?? 'overview';
  const { logout, user } = useAuth();
  const { data: unreadData } = useUnreadTickets();
  const { t } = useTranslation();

  // Detect mobile and auto-collapse
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Hide admin-only items for non-admin users (memoized)
  const items = useMemo((): SidebarItem[] => {
    if (user?.role !== 'admin') {
      const hide = new Set(['billing', 'resellers', 'master-keys', 'security']);
      return sidebarItems.filter((i) => !hide.has(i.id));
    }
    return sidebarItems;
  }, [user?.role]);

  const handleNavigation = useCallback((tab: string) => {
    router.push(`/admin?tab=${tab}`);
  }, [router]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      // Logout error handled silently
    }
  }, [logout]);

  return (
    <div
      className={cn(
        'z-50 flex h-screen flex-col border-r border-sidebar-border/80 bg-sidebar/90 text-sidebar-foreground shadow-[6px_0_22px_rgba(15,23,42,0.05)] backdrop-blur-xl transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border/80 p-4">
        {!collapsed && (
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-sidebar-foreground">{t('sidebar.brand')}</h1>
              <p className="text-xs text-muted-foreground">{t('sidebar.adminDashboard')}</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1.5">
          {items.map((item) => {
            const isActive = currentTab === item.tab;
            const Icon = item.icon;

            return (
              <Tooltip key={item.id} content={t(`sidebar.${item.id}`)} disabled={!collapsed}>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={collapsed ? t(`sidebar.${item.id}`) : undefined}
                  title={collapsed ? t(`sidebar.${item.id}`) : undefined}
                  className={cn(
                    'relative h-10 w-full justify-start rounded-lg p-3 transition-all duration-200',
                    collapsed ? 'px-2' : 'px-3',
                    isActive && 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary/90',
                    !isActive && 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                  onClick={() => handleNavigation(item.tab)}
                >
                  <Icon className={cn('h-5 w-5', collapsed ? 'mx-auto' : 'mr-3')} />
                  {!collapsed && (
                    <div className="flex items-center justify-between w-full">
                      <span className="font-medium">{t(`sidebar.${item.id}`)}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="ml-2">
                          {t(`sidebar.badge.${item.badge!.toLowerCase()}`)}
                        </Badge>
                      )}
                      {item.id === 'tickets' && unreadData?.total_unread && unreadData.total_unread > 0 && (
                        <Badge className="ml-2 animate-pulse bg-destructive text-destructive-foreground">
                          {unreadData.total_unread}
                        </Badge>
                      )}
                    </div>
                  )}
                  {collapsed && item.id === 'tickets' && unreadData?.total_unread && unreadData.total_unread > 0 && (
                    <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-destructive animate-pulse" />
                  )}
                </Button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border/80 p-3">
        <Separator className="mb-3" />

        {/* System Status */}
        {!collapsed && (
          <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{t('sidebar.systemStatus')}</span>
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">{t('sidebar.systemOperational')}</p>
          </div>
        )}

        {user && (
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed ? 'px-2' : 'px-3'
            )}
            onClick={() => setIsProfileOpen(true)}
          >
            <UserCircle className={cn('h-4 w-4', collapsed ? 'mx-auto' : 'mr-3')} />
            {!collapsed && <span>{t('sidebar.profile')}</span>}
          </Button>
        )}

        {/* Logout Button */}
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive',
            collapsed ? 'px-2' : 'px-3'
          )}
          onClick={handleLogout}
        >
          <LogOut className={cn('h-4 w-4', collapsed ? 'mx-auto' : 'mr-3')} />
          {!collapsed && <span>{t('sidebar.logout')}</span>}
        </Button>
      </div>
      {user && (
        <AdminProfileDialog
          open={isProfileOpen}
          onOpenChange={setIsProfileOpen}
          user={user}
        />
      )}
    </div>
  );
}
