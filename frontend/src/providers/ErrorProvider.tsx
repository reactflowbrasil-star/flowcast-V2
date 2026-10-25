'use client';

import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { Toaster } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { authCleanup } from '@/utils/authCleanup';

interface ApiError {
  response?: {
    status: number;
    data?: {
      error?: string;
      message?: string;
      details?: string;
    };
  };
  message?: string;
  code?: string;
}

interface ErrorContextType {
  reportError: (error: Error, context?: string) => void;
  handleApiError: (error: ApiError | Error | unknown, context?: string) => void;
  handleAuthError: () => void;
  handleNetworkError: () => void;
  clearErrors: () => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

interface ErrorProviderProps {
  children: React.ReactNode;
}

export function ErrorProvider({ children }: ErrorProviderProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { t } = useTranslation();

  // Global error reporting function
  const reportError = useCallback((error: Error, context?: string) => {
    console.group('🚨 Global Error Report');
    console.error('Context:', context || 'Unknown');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error('Timestamp:', new Date().toISOString());
    console.groupEnd();

    // In production, send to error monitoring service
    // Example: Sentry.captureException(error, { tags: { context } });
  }, []);

  // Handle authentication errors
  const handleAuthError = useCallback(() => {
    // Clear all cached data
    queryClient.clear();
    
    // Clear auth-related data consistently
    authCleanup.clearAllAuthData();
    
    // Show logout message
    toast.error(t('common.sessionExpiredTitle'), {
      description: t('common.sessionExpiredDescription'),
      duration: 4000});

    // Redirect to login
    setTimeout(() => {
      router.push('/login');
    }, 1000);
  }, [queryClient, router]);

  // Handle API errors with specific logic
  const handleApiError = useCallback((error: ApiError | Error | unknown, context?: string) => {
    let errorMessage = t('common.somethingWentWrong');
    let shouldLogout = false;
    let shouldRetry = false;

    // Parse error response (safely)
    const maybeResp = (error as any)?.response;
    if (maybeResp) {
      const status = typeof maybeResp.status === 'number' ? maybeResp.status : undefined;
      const data = maybeResp.data as any;

      if (typeof status === 'number') {
        switch (status) {
          case 401:
            errorMessage = t('common.sessionExpiredDescription');
            shouldLogout = true;
            break;
          case 403:
            errorMessage = t('common.noPermission');
            break;
          case 404:
            errorMessage = t('common.notFound');
            break;
          case 422:
            errorMessage = data?.error?.details || t('common.invalidData');
            break;
          case 429:
            errorMessage = t('common.tooManyRequests');
            shouldRetry = true;
            break;
          case 500:
            errorMessage = t('common.serverError');
            shouldRetry = true;
            break;
          case 503:
            errorMessage = t('common.serviceUnavailable');
            shouldRetry = true;
            break;
          default:
            errorMessage = data?.error?.details || data?.message || errorMessage;
        }
      }
    } else if ((error as any)?.message) {
      errorMessage = String((error as any).message);
    }

    // Show appropriate toast
    toast.error(context ? `${context} ${t('common.failed')}` : t('common.error'), {
      description: errorMessage,
      duration: shouldRetry ? 6000 : 5000,
      action: shouldRetry ? {
        label: t('common.tryAgain'),
        onClick: () => {
          // Retry logic would be handled by the calling component
          toast.info(t('common.tryAgain'));
        }} : undefined});

    // Handle logout if needed
    if (shouldLogout) {
      setTimeout(() => {
        handleAuthError();
      }, 2000);
    }

    // Report error
    reportError(new Error(errorMessage), context);
  }, [reportError, handleAuthError]);

  // Handle network errors
  const handleNetworkError = useCallback(() => {
    toast.error(t('common.networkErrorTitle'), {
      description: t('common.networkErrorDescription'),
      duration: 6000,
      action: {
        label: t('common.tryAgain'),
        onClick: () => {
          window.location.reload();
        }}});
  }, []);

  // Clear all errors
  const clearErrors = useCallback(() => {
    toast.dismiss();
  }, []);

  // Global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      reportError(
        new Error(event.reason?.message || 'Unhandled promise rejection'),
        'Unhandled Promise'
      );
      
      // Prevent the default browser behavior
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      reportError(
        event.error || new Error(event.message),
        'Global Error'
      );
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, [reportError]);

  // React Query global error handler
  useEffect(() => {
    queryClient.setDefaultOptions({
      queries: {
        retry: (failureCount, error: ApiError | Error | unknown) => {
          // Don't retry on 4xx errors (client errors) - check status safely
          const status = (error as any)?.response?.status;
          if (typeof status === 'number' && status >= 400 && status < 500) {
            return false;
          }
          // Retry up to 3 times for other errors
          return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // onError is deprecated in newer versions of React Query
        // Error handling is now done in individual queries or mutations
      },
      mutations: {
        // onError is deprecated in newer versions of React Query
        // Error handling is now done in individual mutations
      }});
  }, [queryClient, handleAuthError, handleNetworkError]);

  const value: ErrorContextType = {
    reportError,
    handleApiError,
    handleAuthError,
    handleNetworkError,
    clearErrors};

  return (
    <ErrorContext.Provider value={value}>
      {children}
      <Toaster
        position="top-right"
        expand={true}
        richColors={true}
        closeButton={true}
        toastOptions={{
          duration: 4000,
          style: {
            background: 'white',
            border: '1px solid #e5e7eb',
            color: '#374151'},
          className: 'toast'}}
      />
    </ErrorContext.Provider>
  );
}

export function useError() {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
}

// Higher-order component to wrap components with error handling
export function withErrorHandling<P extends object>(
  Component: React.ComponentType<P>,
  errorFallback?: React.ComponentType<{ error: Error; retry: () => void }>
) {
  return function WrappedComponent(props: P) {
    const { reportError } = useError();

    const handleError = useCallback((error: Error, _errorInfo: React.ErrorInfo) => {
      reportError(error, `Component: ${Component.displayName || Component.name}`);
    }, [reportError]);

    return (
      <ErrorBoundary onError={handleError} fallback={errorFallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

 // Simple error boundary for the HOC
 type ErrorBoundaryProps = {
   children: React.ReactNode;
   onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
   fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
 };

 class ErrorBoundary extends React.Component<
   ErrorBoundaryProps,
   { hasError: boolean; error: Error | null }
 > {
   constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent
            error={this.state.error}
            retry={() => this.setState({ hasError: false, error: null })}
          />
        );
      }

      return (
        <div className="p-4 border border-red-200 rounded-lg bg-red-50">
          <h3 className="text-red-800 font-medium">{i18n.t('common.somethingWentWrong')}</h3>
          <p className="text-red-600 text-sm mt-1">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
          >
            {i18n.t('common.tryAgain')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
