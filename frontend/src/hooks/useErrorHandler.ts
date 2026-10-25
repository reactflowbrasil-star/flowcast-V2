import { useCallback } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface HttpErrorResponse {
  data?: {
    error?: {
      details?: string;
      error?: string;
    };
  };
  statusText?: string;
}

interface ErrorWithMessage {
  message: string;
}

export interface ErrorHandlerOptions {
  showToast?: boolean;
  toastTitle?: string;
  logError?: boolean;
  throwError?: boolean;
  customMessage?: string;
  onError?: (error: Error) => void;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    error: string;
    details: string;
    timestamp: string;
  };
}

export function useErrorHandler() {
  const { t } = useTranslation();
  const handleError = useCallback((
    error: unknown,
    options: ErrorHandlerOptions = {}
  ) => {
    const {
      showToast = true,
      toastTitle = t('common.error'),
      logError = true,
      throwError = false,
      customMessage,
      onError} = options;

    let errorMessage = t('common.unexpectedErrorDescription');
    let errorDetails = '';
    let errorCode = 'UNKNOWN_ERROR';

    // Parse different error types
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      // Handle API error responses
      const apiError = error as ApiErrorResponse;
      if (apiError.error) {
        errorMessage = apiErrorMessage(apiError.error, errorMessage);
        errorCode = apiError.error.error || errorCode;
      }
      // Handle fetch/axios errors
      else if ('response' in error && error.response) {
        const response = error.response as HttpErrorResponse;
        if (response.data?.error) {
          errorMessage = apiErrorMessage(response.data.error, errorMessage);
          errorCode = response.data.error.error || errorCode;
        } else if (response.statusText) {
          errorMessage = response.statusText;
        }
      }
      // Handle network errors
      else if ('message' in error) {
        errorMessage = (error as ErrorWithMessage).message;
      }
    }

    // Use custom message if provided
    if (customMessage) {
      errorMessage = customMessage;
    }

    // Create error object
    const processedError = new Error(errorMessage);
    processedError.name = errorCode;

    // Log error if enabled
    if (logError) {
      console.group(`🚨 Error Handler - ${toastTitle}`);
      console.error('Original error:', error);
      console.error('Processed message:', errorMessage);
      console.error('Error code:', errorCode);
      if (errorDetails) {
        console.error('Stack trace:', errorDetails);
      }
      console.groupEnd();
    }

    // Show toast notification if enabled
    if (showToast) {
      toast.error(toastTitle, {
        description: errorMessage,
        duration: 5000,
        action: {
          label: t('common.dismiss'),
          onClick: () => toast.dismiss()}});
    }

    // Call custom error handler if provided
    if (onError) {
      onError(processedError);
    }

    // Throw error if requested (for error boundaries)
    if (throwError) {
      throw processedError;
    }

    return {
      message: errorMessage,
      code: errorCode,
      details: errorDetails,
      originalError: error};
  }, []);

  const handleApiError = useCallback((
    error: unknown,
    context?: string,
    options?: Omit<ErrorHandlerOptions, 'toastTitle'>
  ) => {
    const title = context
      ? t('common.operationFailedWithContext', { context })
      : t('common.operationFailedTitle');
    return handleError(error, { ...options, toastTitle: title });
  }, [handleError, t]);

  const handleValidationError = useCallback((
    error: unknown,
    options?: Omit<ErrorHandlerOptions, 'toastTitle'>
  ) => {
    return handleError(error, { ...options, toastTitle: t('common.validationErrorTitle') });
  }, [handleError, t]);

  const handleNetworkError = useCallback((
    error: unknown,
    options?: Omit<ErrorHandlerOptions, 'toastTitle' | 'customMessage'>
  ) => {
    return handleError(error, {
      ...options,
      toastTitle: t('common.networkErrorTitle'),
      customMessage: t('common.networkErrorDescription')});
  }, [handleError, t]);

  const handleAuthError = useCallback((
    error: unknown,
    options?: Omit<ErrorHandlerOptions, 'toastTitle' | 'customMessage'>
  ) => {
    return handleError(error, {
      ...options,
      toastTitle: t('common.authErrorTitle'),
      customMessage: t('common.sessionExpiredDescription')});
  }, [handleError, t]);

  const handlePermissionError = useCallback((
    error: unknown,
    options?: Omit<ErrorHandlerOptions, 'toastTitle' | 'customMessage'>
  ) => {
    return handleError(error, {
      ...options,
      toastTitle: t('common.permissionDeniedTitle'),
      customMessage: t('common.noPermission')});
  }, [handleError, t]);

  return {
    handleError,
    handleApiError,
    handleValidationError,
    handleNetworkError,
    handleAuthError,
    handlePermissionError};
}

// Success notification helper
export function useSuccessHandler() {
  const { t } = useTranslation();
  const showSuccess = useCallback((
    message: string,
    options?: {
      title?: string;
      duration?: number;
      action?: {
        label: string;
        onClick: () => void;
      };
    }
  ) => {
    const { title = t('common.success'), duration = 4000, action } = options || {};
    
    toast.success(title, {
      description: message,
      duration,
      action});
  }, [t]);

  const showInfo = useCallback((
    message: string,
    options?: {
      title?: string;
      duration?: number;
      action?: {
        label: string;
        onClick: () => void;
      };
    }
  ) => {
    const { title = t('common.info'), duration = 4000, action } = options || {};
    
    toast.info(title, {
      description: message,
      duration,
      action});
  }, [t]);

  const showWarning = useCallback((
    message: string,
    options?: {
      title?: string;
      duration?: number;
      action?: {
        label: string;
        onClick: () => void;
      };
    }
  ) => {
    const { title = t('common.warning'), duration = 5000, action } = options || {};
    
    toast.warning(title, {
      description: message,
      duration,
      action});
  }, [t]);

  return {
    showSuccess,
    showInfo,
    showWarning};
}

// Loading state helper
export function useLoadingHandler() {
  const { t } = useTranslation();
  const showLoading = useCallback((
    message?: string,
    options?: {
      duration?: number;
    }
  ) => {
    const { duration = Infinity } = options || {};
    const loadingMessage = message ?? t('common.loading');
    
    return toast.loading(loadingMessage, {
      duration});
  }, [t]);

  const updateLoading = useCallback((
    toastId: string | number,
    message: string
  ) => {
    toast.loading(message, { id: toastId });
  }, []);

  const dismissLoading = useCallback((
    toastId: string | number
  ) => {
    toast.dismiss(toastId);
  }, []);

  return {
    showLoading,
    updateLoading,
    dismissLoading};
}
