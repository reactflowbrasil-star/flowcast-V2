'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  AlertCircle, 
  Info, 
  AlertTriangle, 
  X, 
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
  Upload,
  Download,
  Save,
  Trash2
} from 'lucide-react';

interface FeedbackMessageProps {
  type: 'success' | 'error' | 'warning' | 'info' | 'loading';
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
  autoHide?: boolean;
  autoHideDelay?: number;
}

interface OperationFeedbackProps {
  operation: 'save' | 'delete' | 'upload' | 'download' | 'sync' | 'custom';
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  progress?: number;
  customIcon?: React.ReactNode;
  className?: string;
}

interface ConnectionStatusProps {
  isOnline: boolean;
  lastSync?: Date;
  className?: string;
}

interface FormFeedbackProps {
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
  submitError?: string;
  submitSuccess?: string;
  className?: string;
}

// Feedback Message Component
export function FeedbackMessage({
  type,
  title,
  message,
  action,
  dismissible = true,
  onDismiss,
  className,
  autoHide = false,
  autoHideDelay = 5000}: FeedbackMessageProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoHide && type !== 'loading') {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onDismiss?.();
      }, autoHideDelay);

      return () => clearTimeout(timer);
    }
  }, [autoHide, autoHideDelay, type, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'info':
        return <Info className="h-4 w-4" />;
      case 'loading':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getVariant = () => {
    switch (type) {
      case 'error':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getColorClasses = () => {
    switch (type) {
      case 'success':
        return 'border-green-200 bg-green-50 text-green-800';
      case 'error':
        return 'border-red-200 bg-red-50 text-red-800';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50 text-yellow-800';
      case 'info':
        return 'border-blue-200 bg-blue-50 text-blue-800';
      case 'loading':
        return 'border-gray-200 bg-gray-50 text-gray-800';
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800';
    }
  };

  return (
    <Alert className={cn(getColorClasses(), className)} variant={getVariant()}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          {getIcon()}
          <div className="flex-1">
            {title && (
              <h4 className="font-medium mb-1">{title}</h4>
            )}
            <AlertDescription className="text-sm">
              {message}
            </AlertDescription>
            {action && (
              <Button
                variant="outline"
                size="sm"
                onClick={action.onClick}
                className="mt-2"
              >
                {action.label}
              </Button>
            )}
          </div>
        </div>
        {dismissible && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0 hover:bg-transparent"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Alert>
  );
}

// Operation Feedback Component
export function OperationFeedback({
  operation,
  status,
  message,
  progress,
  customIcon,
  className}: OperationFeedbackProps) {
  const { t } = useTranslation();
  const getOperationIcon = () => {
    if (customIcon) return customIcon;
    
    switch (operation) {
      case 'save':
        return <Save className="h-4 w-4" />;
      case 'delete':
        return <Trash2 className="h-4 w-4" />;
      case 'upload':
        return <Upload className="h-4 w-4" />;
      case 'download':
        return <Download className="h-4 w-4" />;
      case 'sync':
        return <RefreshCw className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    if (message) return message;
    
    const operationLabels = {
      save: t('feedback.operation.saving'),
      delete: t('feedback.operation.deleting'),
      upload: t('feedback.operation.uploading'),
      download: t('feedback.operation.downloading'),
      sync: t('feedback.operation.syncing'),
      custom: t('feedback.operation.processing')};

    switch (status) {
      case 'loading':
        return t('feedback.operationStatus.loading', { operation: operationLabels[operation] });
      case 'success':
        return t('feedback.operationStatus.success', { operation: operationLabels[operation] });
      case 'error':
        return t('feedback.operationStatus.error', { operation });
      default:
        return '';
    }
  };

  if (status === 'idle') return null;

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <div className="flex items-center gap-1">
        {getOperationIcon()}
        {getStatusIcon()}
      </div>
      <span className="flex-1">{getStatusMessage()}</span>
      {status === 'loading' && progress !== undefined && (
        <div className="flex items-center gap-2 min-w-[100px]">
          <Progress value={progress} className="h-2 flex-1" />
          <span className="text-xs text-gray-500 min-w-[3ch]">
            {Math.round(progress)}%
          </span>
        </div>
      )}
    </div>
  );
}

// Connection Status Component
export function ConnectionStatus({ isOnline, lastSync, className }: ConnectionStatusProps) {
  const { t } = useTranslation();
  const formatLastSync = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return t('common.justNow');
    if (diffInMinutes < 60) return t('feedback.time.minutesAgo', { count: diffInMinutes });
    if (diffInMinutes < 1440) return t('feedback.time.hoursAgo', { count: Math.floor(diffInMinutes / 60) });
    return t('feedback.time.daysAgo', { count: Math.floor(diffInMinutes / 1440) });
  };

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4 text-green-600" />
          <span className="text-green-700">{t('feedback.connection.online')}</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 text-red-600" />
          <span className="text-red-700">{t('feedback.connection.offline')}</span>
        </>
      )}
      {lastSync && (
        <span className="text-gray-500">
          • {t('feedback.connection.lastSync')}: {formatLastSync(lastSync)}
        </span>
      )}
    </div>
  );
}

// Form Feedback Component
export function FormFeedback({
  isSubmitting,
  isValid,
  isDirty,
  submitError,
  submitSuccess,
  className}: FormFeedbackProps) {
  const { t } = useTranslation();
  if (!isDirty && !submitError && !submitSuccess) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Submission Status */}
      {isSubmitting && (
        <FeedbackMessage
          type="loading"
          message={t('feedback.form.submitting')}
          dismissible={false}
        />
      )}

      {/* Success Message */}
      {submitSuccess && !isSubmitting && (
        <FeedbackMessage
          type="success"
          message={submitSuccess}
          autoHide={true}
        />
      )}

      {/* Error Message */}
      {submitError && !isSubmitting && (
        <FeedbackMessage
          type="error"
          title={t('feedback.form.submissionFailed')}
          message={submitError}
        />
      )}

      {/* Validation Status */}
      {isDirty && !isSubmitting && !submitError && !submitSuccess && (
        <div className="flex items-center gap-2 text-sm">
          {isValid ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-green-700">{t('feedback.form.readyToSubmit')}</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-yellow-700">{t('feedback.form.fixErrors')}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Bulk Operation Feedback Component
interface BulkOperationFeedbackProps {
  total: number;
  completed: number;
  failed: number;
  operation: string;
  isActive: boolean;
  className?: string;
}

export function BulkOperationFeedback({
  total,
  completed,
  failed,
  operation,
  isActive,
  className}: BulkOperationFeedbackProps) {
  const { t } = useTranslation();
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;
  const remaining = total - completed - failed;

  if (!isActive && total === 0) return null;

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isActive && <RefreshCw className="h-4 w-4 animate-spin" />}
          {t('feedback.bulk.title', { operation })}
        </CardTitle>
        <CardDescription>
          {isActive ? t('feedback.bulk.inProgress') : t('feedback.bulk.completed')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={progress} className="h-2" />
        
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="font-medium text-gray-900">{total}</div>
            <div className="text-gray-500">{t('feedback.bulk.total')}</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-green-600">{completed}</div>
            <div className="text-gray-500">{t('feedback.bulk.completedCount')}</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-red-600">{failed}</div>
            <div className="text-gray-500">{t('feedback.bulk.failedCount')}</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-blue-600">{remaining}</div>
            <div className="text-gray-500">{t('feedback.bulk.remaining')}</div>
          </div>
        </div>

        {!isActive && (
          <div className="text-center text-sm">
            {failed > 0 ? (
              <span className="text-red-600">
                {t('feedback.bulk.completedWithErrors', { count: failed })}
              </span>
            ) : (
              <span className="text-green-600">
                {t('feedback.bulk.allProcessed')}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
