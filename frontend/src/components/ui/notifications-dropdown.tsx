'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bell, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle, 
  Info,
  Users,
  CreditCard,
  Key,
  Ticket,
  Shield,
  TrendingUp,
  ExternalLink
} from 'lucide-react';
import { notificationsService, Notification } from '@/services/notifications';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface NotificationsDropdownProps {
  variant: 'reseller' | 'admin';
  className?: string;
}

const getNotificationIcon = (id: string, type: string) => {
  const iconClass = "h-4 w-4";
  
  switch (id) {
    case 'expiring_users':
    case 'expired_users':
      return <Users className={iconClass} />;
    case 'low_credits':
    case 'recent_purchases':
      return <CreditCard className={iconClass} />;
    case 'api_activity':
      return <Key className={iconClass} />;
    case 'pending_tickets':
      return <Ticket className={iconClass} />;
    case 'security_alerts':
      return <Shield className={iconClass} />;
    case 'new_resellers':
      return <TrendingUp className={iconClass} />;
    case 'system_stats':
      return <Info className={iconClass} />;
    default:
      switch (type) {
        case 'error':
          return <AlertCircle className={iconClass} />;
        case 'warning':
          return <AlertTriangle className={iconClass} />;
        case 'success':
          return <CheckCircle className={iconClass} />;
        default:
          return <Info className={iconClass} />;
      }
  }
};

const getNotificationStyles = (type: string) => {
  const baseStyles = "flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer hover:bg-accent";
  
  switch (type) {
    case 'error':
      return cn(baseStyles, "border-l-2 border-l-red-500 bg-red-50/50 dark:bg-red-950/20");
    case 'warning':
      return cn(baseStyles, "border-l-2 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20");
    case 'success':
      return cn(baseStyles, "border-l-2 border-l-green-500 bg-green-50/50 dark:bg-green-950/20");
    default:
      return cn(baseStyles, "border-l-2 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20");
  }
};

const getIconColor = (type: string) => {
  switch (type) {
    case 'error':
      return "text-red-500";
    case 'warning':
      return "text-amber-500";
    case 'success':
      return "text-green-500";
    default:
      return "text-blue-500";
  }
};

export default function NotificationsDropdown({ variant, className }: NotificationsDropdownProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', variant],
    queryFn: async () => {
      const result = variant === 'reseller' 
        ? await notificationsService.getResellerNotifications()
        : await notificationsService.getAdminNotifications();
      return result.success ? result.data : null;
    },
    refetchInterval: 60000});

  const notifications = data?.notifications || [];
  const highPriorityCount = notifications.filter(n => n.priority === 'high').length;

  const handleNotificationClick = (notification: Notification) => {
    if (notification.action_url) {
      router.push(notification.action_url);
      setOpen(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative h-8 w-8 sm:h-9 sm:w-9", className)}>
          <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-slate-500" />
          {highPriorityCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 sm:h-5 sm:w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <Badge 
                variant="destructive" 
                className="relative inline-flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full p-0 text-[10px] sm:text-xs"
              >
                {highPriorityCount > 9 ? '9+' : highPriorityCount}
              </Badge>
            </span>
          )}
          {highPriorityCount === 0 && notifications.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-white dark:ring-slate-950" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 sm:w-96 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold">{t('common.notifications')}</span>
          </div>
          {notifications.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {notifications.length}
            </Badge>
          )}
        </div>
        
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">{t('common.noData')}</p>
              <p className="text-xs">{t('common.completed')}</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={getNotificationStyles(notification.notification_type)}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={cn("mt-0.5", getIconColor(notification.notification_type))}>
                    {getNotificationIcon(notification.id, notification.notification_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{notification.title}</p>
                      {notification.count && notification.count > 0 && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {notification.count}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    {notification.action_url && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                        <span>{t('common.details')}</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <p className="text-xs text-muted-foreground text-center">
              {highPriorityCount > 0 
                ? `${highPriorityCount} urgent notification${highPriorityCount > 1 ? 's' : ''} require attention`
                : 'All notifications are informational'}
            </p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
