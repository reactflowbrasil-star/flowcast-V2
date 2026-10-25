'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTokenManager } from '@/hooks/useTokenManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Clock, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';


interface SessionStatusProps {
  showDetails?: boolean;
  className?: string;
}

export default function SessionStatus({ showDetails = false, className }: SessionStatusProps) {
  const { t } = useTranslation();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const { getTimeUntilExpiry, isTokenExpiringSoon, validateToken } = useTokenManager();
  const [timeUntilExpiry, setTimeUntilExpiry] = useState<number>(0);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const updateTokenStatus = () => {
      const token = localStorage.getItem('iptv_auth_token');
      if (token) {
        const timeLeft = getTimeUntilExpiry(token);
        const expiringSoon = isTokenExpiringSoon(token);
        
        setTimeUntilExpiry(timeLeft);
        setIsExpiringSoon(expiringSoon);
      }
    };

    // Update immediately
    updateTokenStatus();

    // Update every minute
    const interval = setInterval(updateTokenStatus, 60000);

    return () => clearInterval(interval);
  }, [isAuthenticated, getTimeUntilExpiry, isTokenExpiringSoon]);

  const handleValidateSession = async () => {
    setIsValidating(true);
    try {
      await validateToken();
      await refreshUser();
    } catch (error) {
      console.error('Session validation error:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return t('common.expired');
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${Math.floor(seconds)}s`;
    }
  };

  const getStatusColor = (): 'destructive' | 'outline' | 'secondary' | 'default' => {
    if (!isAuthenticated) return 'destructive';
    if (timeUntilExpiry <= 0) return 'destructive';
    if (isExpiringSoon) return 'outline';
    return 'default';
  };

  const getStatusIcon = () => {
    if (!isAuthenticated) return <AlertTriangle className="h-4 w-4" />;
    if (timeUntilExpiry <= 0) return <AlertTriangle className="h-4 w-4" />;
    if (isExpiringSoon) return <Clock className="h-4 w-4" />;
    return <CheckCircle className="h-4 w-4" />;
  };

  const getStatusText = (): string => {
    if (!isAuthenticated) return t('auth.session.notAuthenticated');
    if (timeUntilExpiry <= 0) return t('auth.session.sessionExpired');
    if (isExpiringSoon) return t('auth.session.sessionExpiringSoon');
    return t('auth.session.sessionActive');
  };

  if (!showDetails && isAuthenticated && !isExpiringSoon) {
    return null; // Don't show anything if session is healthy and details not requested
  }

  return (
    <div className={className}>
      {showDetails ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" />
              {t('auth.session.title')}
            </CardTitle>
            <CardDescription>
              {t('auth.session.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('auth.session.status')}</span>
              <Badge variant={getStatusColor()} className="flex items-center gap-1">
                {getStatusIcon()}
                {getStatusText()}
              </Badge>
            </div>
            
            {isAuthenticated && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('auth.session.user')}</span>
                  <span className="text-sm">{user?.username}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('auth.session.role')}</span>
                  <Badge variant="outline">{user?.role}</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('auth.session.expiresIn')}</span>
                  <span className={`text-sm font-mono ${isExpiringSoon ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatTimeRemaining(timeUntilExpiry)}
                  </span>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidateSession}
                  disabled={isValidating}
                  className="w-full"
                >
                  {isValidating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      {t('auth.session.validating')}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t('auth.session.validateSession')}
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        // Compact alert for expiring sessions
        isExpiringSoon && (
          <Alert variant="destructive">
            <Clock className="h-4 w-4" />
            <AlertDescription>
              {t('auth.session.willExpireIn')} {formatTimeRemaining(timeUntilExpiry)}. 
              <Button
                variant="link"
                size="sm"
                onClick={handleValidateSession}
                disabled={isValidating}
                className="p-0 h-auto ml-2"
              >
                {t('auth.session.refreshSession')}
              </Button>
            </AlertDescription>
          </Alert>
        )
      )}
    </div>
  );
}

// Compact session indicator for headers/navbars
export function SessionIndicator() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { isTokenExpiringSoon } = useTokenManager();
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const checkExpiry = () => {
      const token = localStorage.getItem('iptv_auth_token');
      if (token) {
        setIsExpiringSoon(isTokenExpiringSoon(token));
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated, isTokenExpiringSoon]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex items-center">
      <div className={`w-2 h-2 rounded-full ${isExpiringSoon ? 'bg-orange-500' : 'bg-green-500'}`} />
      <span className="ml-2 text-xs text-gray-600">
        {isExpiringSoon 
          ? t('auth.session.sessionExpiringCompact') 
          : t('auth.session.sessionActiveCompact')}
      </span>
    </div>
  );
}
