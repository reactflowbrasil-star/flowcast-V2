'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  Shield,
  Eye,
  Clock,
  MapPin,
  Monitor,
  Bell,
  X
} from 'lucide-react';
import { userActivityService } from '@/services/userActivity';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { useTranslation } from 'react-i18next';

interface SecurityAlertData {
  username?: string;
  deviceCount?: number;
  ip?: string;
  failedAttempts?: number;
  activityCount?: number;
  [key: string]: unknown;
}

interface SecurityAlert {
  id: string;
  type: 'multiple_failed_logins' | 'unusual_device' | 'high_activity' | 'suspicious_ip';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  timestamp: string;
  data: SecurityAlertData;
  dismissed: boolean;
}

export default function SecurityAlerts() {
  useLoadNamespace('admin/securityAlerts');
  const { t } = useTranslation('admin/securityAlerts');
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [newAlertsCount, setNewAlertsCount] = useState(0);

  const { data: loginHistory } = useQuery({
    queryKey: ['login-history-alerts'],
    queryFn: async () => {
      const result = await userActivityService.getLoginHistory({ limit: 100 });
      if (result.success) {
        return result.data;
      }
      return null;
    },
    refetchInterval: 30000, // Check every 30 seconds
  });

  const { data: viewingHistory } = useQuery({
    queryKey: ['viewing-history-alerts'],
    queryFn: async () => {
      const result = await userActivityService.getViewingHistory({ limit: 100 });
      if (result.success) {
        return result.data;
      }
      return null;
    },
    refetchInterval: 30000});

  // Analyze data for security alerts
  useEffect(() => {
    if (!loginHistory?.logs) return;

    const newAlerts: SecurityAlert[] = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check for multiple failed logins from same IP
    const failedLogins = loginHistory.logs.filter(log => 
      !log.success && new Date(log.login_timestamp) > oneHourAgo
    );

    const ipFailures = failedLogins.reduce((acc, log) => {
      const ip = log.ip_address || t('securityAlerts.values.unknown');
      acc[ip] = (acc[ip] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(ipFailures).forEach(([ip, count]) => {
      if (count >= 5) {
        newAlerts.push({
          id: `failed-logins-${ip}-${Date.now()}`,
          type: 'multiple_failed_logins',
          severity: count >= 10 ? 'high' : 'medium',
          title: t('securityAlerts.alerts.multipleFailedLogins.title'),
          description: t('securityAlerts.alerts.multipleFailedLogins.description', { count, ip }),
          timestamp: new Date().toISOString(),
          data: { ip, count },
          dismissed: false});
      }
    });

    // Check for users with unusual number of devices
    const userDevices = loginHistory.logs
      .filter(log => log.success && new Date(log.login_timestamp) > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
      .reduce((acc, log) => {
        const key = `${log.user_id}-${log.username}`;
        if (!acc[key]) {
          acc[key] = { username: log.username, devices: new Set() };
        }
        if (log.device_info) {
          acc[key].devices.add(log.device_info);
        }
        return acc;
      }, {} as Record<string, { username: string; devices: Set<string> }>);

    Object.entries(userDevices).forEach(([key, data]) => {
      if (data.devices.size >= 4) {
        newAlerts.push({
          id: `unusual-devices-${key}-${Date.now()}`,
          type: 'unusual_device',
          severity: 'medium',
          title: t('securityAlerts.alerts.unusualDevices.title'),
          description: t('securityAlerts.alerts.unusualDevices.description', { username: data.username, deviceCount: data.devices.size }),
          timestamp: new Date().toISOString(),
          data: { username: data.username, deviceCount: data.devices.size },
          dismissed: false});
      }
    });

    // Check for high activity periods
    if (viewingHistory?.logs) {
      const recentViews = viewingHistory.logs.filter(log => 
        new Date(log.start_timestamp) > oneHourAgo
      );

      if (recentViews.length >= 20) {
        newAlerts.push({
          id: `high-activity-${Date.now()}`,
          type: 'high_activity',
          severity: 'low',
          title: t('securityAlerts.alerts.highActivity.title'),
          description: t('securityAlerts.alerts.highActivity.description', { viewCount: recentViews.length }),
          timestamp: new Date().toISOString(),
          data: { viewCount: recentViews.length },
          dismissed: false});
      }
    }

    // Update alerts and count new ones
    setAlerts(prevAlerts => {
      const existingIds = new Set(prevAlerts.map(a => a.id));
      const reallyNewAlerts = newAlerts.filter(a => !existingIds.has(a.id));
      
      if (reallyNewAlerts.length > 0) {
        setNewAlertsCount(prev => prev + reallyNewAlerts.length);
        
        // Show browser notification if permission granted
        if (Notification.permission === 'granted') {
          reallyNewAlerts.forEach(alert => {
            new Notification(t('securityAlerts.browserNotification.title', { title: alert.title }), {
              body: alert.description,
              icon: '/favicon.ico'
            });
          });
        }
      }

      return [...prevAlerts.filter(a => !a.dismissed), ...reallyNewAlerts];
    });
  }, [loginHistory, viewingHistory]);

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, dismissed: true } : alert
    ));
    setNewAlertsCount(prev => Math.max(0, prev - 1));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSeverityIcon = (type: string) => {
    switch (type) {
      case 'multiple_failed_logins': return <Shield className="h-4 w-4" />;
      case 'unusual_device': return <Monitor className="h-4 w-4" />;
      case 'high_activity': return <Eye className="h-4 w-4" />;
      case 'suspicious_ip': return <MapPin className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const activeAlerts = alerts.filter(alert => !alert.dismissed);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('securityAlerts.title')}
          {newAlertsCount > 0 && (
            <Badge className="bg-red-500 text-white">
              {newAlertsCount} {t('securityAlerts.newLabel')}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeAlerts.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              {t('securityAlerts.noAlerts')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeAlerts.slice(0, 10).map((alert) => (
              <Alert key={alert.id} className={getSeverityColor(alert.severity)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(alert.type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{alert.title}</h4>
                        <Badge variant="outline" className="text-xs">
                          {t(`securityAlerts.severity.${alert.severity}`)}
                        </Badge>
                      </div>
                      <AlertDescription className="text-sm">
                        {alert.description}
                      </AlertDescription>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissAlert(alert.id)}
                    className="h-6 w-6 p-0"
                    aria-label={t('securityAlerts.dismiss')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Alert>
            ))}
            
            {activeAlerts.length > 10 && (
              <p className="text-sm text-muted-foreground text-center">
                {t('securityAlerts.moreAlerts', { count: activeAlerts.length - 10 })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
