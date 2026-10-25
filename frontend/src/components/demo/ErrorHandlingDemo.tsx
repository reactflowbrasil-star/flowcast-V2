'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  FeedbackMessage, 
  OperationFeedback, 
  ConnectionStatus, 
  BulkOperationFeedback 
} from '@/components/feedback/UserFeedback';
import { LoadingSpinner, LoadingOverlay, Skeleton } from '@/components/ui/loading';
import { useErrorHandler, useSuccessHandler, useLoadingHandler } from '@/hooks/useErrorHandler';
import { useAsyncOperation, useBatchOperation } from '@/hooks/useAsyncOperation';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import ErrorBoundary from '@/components/error/ErrorBoundary';
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Bug,
  Zap,
  Database,
  Network
} from 'lucide-react';

export default function ErrorHandlingDemo() {
  const { t } = useTranslation();
  const [demoState, setDemoState] = useState({
    showError: false,
    showSuccess: false,
    showLoading: false,
    operationStatus: 'idle' as 'idle' | 'loading' | 'success' | 'error',
    progress: 0});

  const { handleError, handleApiError, handleValidationError } = useErrorHandler();
  const { showSuccess, showInfo, showWarning } = useSuccessHandler();
  const { showLoading, dismissLoading } = useLoadingHandler();
  const connectionStatus = useConnectionStatus();

  // Demo async operation
  const asyncDemo = useAsyncOperation(
    async (...args: unknown[]) => {
      const shouldFail = Boolean(args[0]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (shouldFail) {
        throw new Error(t('errorHandlingDemo.messages.demoOperationFailed'));
      }
      return { message: t('errorHandlingDemo.messages.operationCompletedSuccessfully') };
    },
    {
      successMessage: t('errorHandlingDemo.messages.asyncOperationCompleted'),
      loadingMessage: t('errorHandlingDemo.messages.processingAsyncOperation')}
  );

  // Demo batch operation
  const batchDemo = useBatchOperation(
    async (...args: unknown[]) => {
      const items = args[0] as string[];
      // Simulate processing each item
      return items.map(item => ({ id: item, processed: true }));
    },
    {
      batchSize: 3,
      delayBetweenBatches: 500,
      successMessage: t('errorHandlingDemo.messages.batchOperationCompleted')}
  );

  const triggerError = (type: string) => {
    switch (type) {
      case 'generic':
        handleError(new Error(t('errorHandlingDemo.messages.genericErrorMessage')), {
          toastTitle: t('errorHandlingDemo.messages.genericErrorTitle')});
        break;
      case 'api':
        handleApiError({
          response: {
            status: 422,
            data: {
              error: {
                error: 'VALIDATION_ERROR',
                details: t('errorHandlingDemo.messages.apiValidationDetails')}}}}, t('errorHandlingDemo.messages.apiDemo'));
        break;
      case 'validation':
        handleValidationError(new Error(t('errorHandlingDemo.messages.invalidEmailFormat')));
        break;
      case 'network':
        handleError(new Error(t('errorHandlingDemo.messages.networkConnectionFailed')), {
          toastTitle: t('errorHandlingDemo.messages.networkErrorTitle'),
          customMessage: t('errorHandlingDemo.messages.unableToConnectServer')});
        break;
    }
  };

  const triggerSuccess = (type: string) => {
    switch (type) {
      case 'basic':
        showSuccess(t('errorHandlingDemo.messages.operationCompletedSuccessfully'));
        break;
      case 'detailed':
        showSuccess(t('errorHandlingDemo.messages.userProfileUpdated'), {
          title: t('errorHandlingDemo.messages.profileUpdated'),
          duration: 6000,
          action: {
            label: t('errorHandlingDemo.messages.viewProfile'),
            onClick: () => console.log('Navigate to profile')}});
        break;
      case 'info':
        showInfo(t('errorHandlingDemo.messages.newFeaturesAvailable'));
        break;
      case 'warning':
        showWarning(t('errorHandlingDemo.messages.sessionExpiresSoon'));
        break;
    }
  };

  const triggerLoading = async () => {
    const loadingId = showLoading(t('errorHandlingDemo.messages.processingRequest'));
    await new Promise(resolve => setTimeout(resolve, 3000));
    dismissLoading(loadingId);
    showSuccess(t('errorHandlingDemo.messages.loadingCompleted'));
  };

  const triggerAsyncOperation = (shouldFail: boolean) => {
    asyncDemo.execute(shouldFail);
  };

  const triggerBatchOperation = () => {
    const items = Array.from({ length: 15 }, (_, i) => `item-${i + 1}`);
    batchDemo.executeBatch(items);
  };

  // Component that will throw an error for ErrorBoundary demo
  const ErrorThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
      throw new Error(t('errorHandlingDemo.messages.errorBoundaryTestError'));
    }
    return <div className="p-4 bg-green-50 rounded">{t('errorHandlingDemo.boundaries.noErrorThrown')}</div>;
  };

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">{t('errorHandlingDemo.title')}</h1>
        <p className="text-gray-600">
          {t('errorHandlingDemo.subtitle')}
        </p>
      </div>

      <Tabs defaultValue="notifications" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="notifications">{t('errorHandlingDemo.tabs.notifications')}</TabsTrigger>
          <TabsTrigger value="loading">{t('errorHandlingDemo.tabs.loading')}</TabsTrigger>
          <TabsTrigger value="operations">{t('errorHandlingDemo.tabs.operations')}</TabsTrigger>
          <TabsTrigger value="connection">{t('errorHandlingDemo.tabs.connection')}</TabsTrigger>
          <TabsTrigger value="boundaries">{t('errorHandlingDemo.tabs.boundaries')}</TabsTrigger>
          <TabsTrigger value="skeletons">{t('errorHandlingDemo.tabs.skeletons')}</TabsTrigger>
        </TabsList>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                {t('errorHandlingDemo.notifications.error.title')}
              </CardTitle>
              <CardDescription>
                {t('errorHandlingDemo.notifications.error.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button 
                  variant="destructive" 
                  onClick={() => triggerError('generic')}
                >
                  {t('errorHandlingDemo.notifications.error.buttons.generic')}
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => triggerError('api')}
                >
                  {t('errorHandlingDemo.notifications.error.buttons.api')}
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => triggerError('validation')}
                >
                  {t('errorHandlingDemo.notifications.error.buttons.validation')}
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => triggerError('network')}
                >
                  {t('errorHandlingDemo.notifications.error.buttons.network')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                {t('errorHandlingDemo.notifications.success.title')}
              </CardTitle>
              <CardDescription>
                {t('errorHandlingDemo.notifications.success.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button 
                  variant="default" 
                  onClick={() => triggerSuccess('basic')}
                >
                  {t('errorHandlingDemo.notifications.success.buttons.basic')}
                </Button>
                <Button 
                  variant="default" 
                  onClick={() => triggerSuccess('detailed')}
                >
                  {t('errorHandlingDemo.notifications.success.buttons.detailed')}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => triggerSuccess('info')}
                >
                  {t('errorHandlingDemo.notifications.success.buttons.info')}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => triggerSuccess('warning')}
                >
                  {t('errorHandlingDemo.notifications.success.buttons.warning')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Inline Feedback Messages */}
          <Card>
            <CardHeader>
              <CardTitle>{t('errorHandlingDemo.inline.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeedbackMessage
                type="success"
                title={t('common.success')}
                message={t('errorHandlingDemo.inline.successMessage')}
                action={{
                  label: t('errorHandlingDemo.inline.viewChanges'),
                  onClick: () => console.log('View changes clicked')}}
              />
              <FeedbackMessage
                type="error"
                title={t('common.error')}
                message={t('errorHandlingDemo.inline.errorMessage')}
                action={{
                  label: t('errorHandlingDemo.inline.retry'),
                  onClick: () => console.log('Retry clicked')}}
              />
              <FeedbackMessage
                type="warning"
                message={t('errorHandlingDemo.inline.warningMessage')}
              />
              <FeedbackMessage
                type="info"
                message={t('errorHandlingDemo.inline.infoMessage')}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loading States Tab */}
        <TabsContent value="loading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                {t('errorHandlingDemo.loading.spinners.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                <div>
                  <LoadingSpinner size="sm" />
                  <p className="text-sm mt-2">{t('errorHandlingDemo.loading.spinners.sizes.small')}</p>
                </div>
                <div>
                  <LoadingSpinner size="md" />
                  <p className="text-sm mt-2">{t('errorHandlingDemo.loading.spinners.sizes.medium')}</p>
                </div>
                <div>
                  <LoadingSpinner size="lg" />
                  <p className="text-sm mt-2">{t('errorHandlingDemo.loading.spinners.sizes.large')}</p>
                </div>
                <div>
                  <LoadingSpinner size="xl" />
                  <p className="text-sm mt-2">{t('errorHandlingDemo.loading.spinners.sizes.extraLarge')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-center">
                <div>
                  <LoadingSpinner variant="dots" />
                  <p className="text-sm mt-2">{t('errorHandlingDemo.loading.spinners.variants.dots')}</p>
                </div>
                <div>
                  <LoadingSpinner variant="pulse" />
                  <p className="text-sm mt-2">{t('errorHandlingDemo.loading.spinners.variants.pulse')}</p>
                </div>
                <div>
                  <LoadingSpinner variant="bounce" />
                  <p className="text-sm mt-2">{t('errorHandlingDemo.loading.spinners.variants.bounce')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('errorHandlingDemo.loading.overlay.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <LoadingOverlay 
                isLoading={demoState.showLoading} 
                message={t('errorHandlingDemo.messages.processingRequest')}
              >
                <div className="h-32 bg-gray-100 rounded flex items-center justify-center">
                  <p>{t('errorHandlingDemo.loading.overlay.content')}</p>
                </div>
              </LoadingOverlay>
              <Button 
                className="mt-4"
                onClick={() => setDemoState(prev => ({ ...prev, showLoading: !prev.showLoading }))}
              >
                {t('errorHandlingDemo.loading.overlay.toggle')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('errorHandlingDemo.loading.toast.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={triggerLoading}>
                {t('errorHandlingDemo.loading.toast.trigger')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Operations Tab */}
        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {t('errorHandlingDemo.operations.async.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Button 
                  onClick={() => triggerAsyncOperation(false)}
                  disabled={asyncDemo.isLoading}
                >
                  {t('errorHandlingDemo.operations.async.successOperation')}
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => triggerAsyncOperation(true)}
                  disabled={asyncDemo.isLoading}
                >
                  {t('errorHandlingDemo.operations.async.failingOperation')}
                </Button>
              </div>
              
              {(asyncDemo.isLoading || asyncDemo.error || asyncDemo.isSuccess) && (
                <OperationFeedback
                  operation="custom"
                  status={asyncDemo.isLoading ? 'loading' : asyncDemo.error ? 'error' : 'success'}
                  message={asyncDemo.error || (asyncDemo.isSuccess ? t('errorHandlingDemo.messages.operationCompleted') : undefined)}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                {t('errorHandlingDemo.operations.batch.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={triggerBatchOperation}
                disabled={batchDemo.isLoading}
              >
                {t('errorHandlingDemo.operations.batch.start')}
              </Button>
              
              {(batchDemo.isLoading || batchDemo.progress.total > 0) && (
                <BulkOperationFeedback
                  total={batchDemo.progress.total}
                  completed={batchDemo.progress.completed}
                  failed={0} // Demo doesn't simulate failures
                  operation="processing"
                  isActive={batchDemo.isLoading}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connection Tab */}
        <TabsContent value="connection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                {t('errorHandlingDemo.connection.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ConnectionStatus
                isOnline={connectionStatus.isOnline}
                lastSync={connectionStatus.lastSync || undefined}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">{t('errorHandlingDemo.connection.quality')}</h4>
                  <Badge variant={
                    connectionStatus.connectionQuality === 'excellent' ? 'default' :
                    connectionStatus.connectionQuality === 'good' ? 'secondary' :
                    connectionStatus.connectionQuality === 'poor' ? 'outline' : 'destructive'
                  }>
                    {connectionStatus.connectionQuality}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-medium mb-2">{t('errorHandlingDemo.connection.retryCount')}</h4>
                  <Badge variant="outline">
                    {connectionStatus.retryCount}
                  </Badge>
                </div>
              </div>

              <Button 
                onClick={connectionStatus.retryConnection}
                disabled={connectionStatus.isConnecting}
              >
                {connectionStatus.isConnecting
                  ? t('errorHandlingDemo.connection.testing')
                  : t('errorHandlingDemo.connection.testConnection')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Error Boundaries Tab */}
        <TabsContent value="boundaries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-5 w-5" />
                {t('errorHandlingDemo.boundaries.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ErrorBoundary showDetails={true}>
                <ErrorThrowingComponent shouldThrow={demoState.showError} />
              </ErrorBoundary>
              
              <Button 
                variant="destructive"
                onClick={() => setDemoState(prev => ({ ...prev, showError: !prev.showError }))}
              >
                {demoState.showError
                  ? t('errorHandlingDemo.boundaries.fixError')
                  : t('errorHandlingDemo.boundaries.triggerError')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Skeletons Tab */}
        <TabsContent value="skeletons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('errorHandlingDemo.skeletons.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-3">{t('errorHandlingDemo.skeletons.text')}</h4>
                <Skeleton variant="text" lines={3} />
              </div>
              
              <div>
                <h4 className="font-medium mb-3">{t('errorHandlingDemo.skeletons.card')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg space-y-3">
                    <Skeleton variant="rectangular" height="8rem" />
                    <Skeleton variant="text" lines={2} />
                    <div className="flex items-center space-x-2">
                      <Skeleton variant="circular" width="2rem" height="2rem" />
                      <Skeleton variant="text" width="6rem" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
