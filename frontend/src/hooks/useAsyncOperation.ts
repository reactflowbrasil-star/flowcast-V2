import { useState, useCallback } from 'react';
import { useErrorHandler, useSuccessHandler, useLoadingHandler } from './useErrorHandler';

export interface AsyncOperationState<T = unknown> {
  isLoading: boolean;
  error: string | null;
  isSuccess: boolean;
  data: T;
}

export interface AsyncOperationOptions<T = unknown> {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  showLoadingToast?: boolean;
  successMessage?: string;
  errorMessage?: string;
  loadingMessage?: string;
  onSuccess?: (data: T) => void;
  onError?: (error: Error | unknown) => void;
  resetOnSuccess?: boolean;
  resetDelay?: number;
}

export function useAsyncOperation<T = unknown>(
  operation: (...args: unknown[]) => Promise<T>,
  options: AsyncOperationOptions<T> = {}
) {
  const {
    showSuccessToast = true,
    showErrorToast = true,
    showLoadingToast = false,
    successMessage = 'Operation completed successfully',
    errorMessage,
    loadingMessage = 'Processing...',
    onSuccess,
    onError,
    resetOnSuccess = false,
    resetDelay = 2000} = options;

  const [state, setState] = useState<AsyncOperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
    data: null});

  const { handleError } = useErrorHandler();
  const { showSuccess } = useSuccessHandler();
  const { showLoading, dismissLoading } = useLoadingHandler();

  const execute = useCallback(async (...args: unknown[]) => {
    let loadingToastId: string | number | undefined;

    try {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        isSuccess: false}));

      if (showLoadingToast) {
        loadingToastId = showLoading(loadingMessage);
      }

      const result = await operation(...args);

      setState(prev => ({
        ...prev,
        isLoading: false,
        isSuccess: true,
        data: result}));

      if (showSuccessToast) {
        showSuccess(successMessage);
      }

      if (onSuccess) {
        onSuccess(result);
      }

      if (resetOnSuccess) {
        setTimeout(() => {
          setState(prev => ({
            ...prev,
            isSuccess: false,
            data: null}));
        }, resetDelay);
      }

      return result;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'An error occurred'}));

      if (showErrorToast) {
        handleError(error, {
          customMessage: errorMessage,
          showToast: true});
      }

      if (onError) {
        onError(error);
      }

      throw error;
    } finally {
      if (loadingToastId) {
        dismissLoading(loadingToastId);
      }
    }
  }, [
    operation,
    showSuccessToast,
    showErrorToast,
    showLoadingToast,
    successMessage,
    errorMessage,
    loadingMessage,
    onSuccess,
    onError,
    resetOnSuccess,
    resetDelay,
    handleError,
    showSuccess,
    showLoading,
    dismissLoading,
  ]);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      isSuccess: false,
      data: null});
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null}));
  }, []);

  return {
    ...state,
    execute,
    reset,
    clearError};
}

// Specialized hook for form submissions
export function useFormSubmission<T = unknown, D = unknown>(
  submitFunction: (data: D) => Promise<T>,
  options: AsyncOperationOptions<T> & {
    resetFormOnSuccess?: boolean;
    resetForm?: () => void;
  } = {}
) {
  const {
    resetFormOnSuccess = false,
    resetForm,
    ...asyncOptions
  } = options;

  const asyncOperation = useAsyncOperation(async (...args: unknown[]) => {
    const data = args[0] as D;
    return submitFunction(data);
  }, {
    ...asyncOptions,
    successMessage: asyncOptions.successMessage || 'Form submitted successfully',
    onSuccess: (data) => {
      if (resetFormOnSuccess && resetForm) {
        resetForm();
      }
      if (asyncOptions.onSuccess) {
        asyncOptions.onSuccess(data);
      }
    }});

  return {
    ...asyncOperation,
    submit: asyncOperation.execute};
}

// Hook for API calls with retry functionality
export function useApiCall<T = unknown>(
  apiFunction: (...args: unknown[]) => Promise<T>,
  options: AsyncOperationOptions<T> & {
    maxRetries?: number;
    retryDelay?: number;
  } = {}
) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    ...asyncOptions
  } = options;

  const [retryCount, setRetryCount] = useState(0);

  const retryableOperation = useCallback(async (...args: unknown[]) => {
    let lastError: Error | unknown;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiFunction(...args);
        setRetryCount(0); // Reset on success
        return result;
      } catch (error) {
        lastError = error;
        setRetryCount(attempt + 1);
        
        if (attempt < maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }
    
    throw lastError;
  }, [apiFunction, maxRetries, retryDelay]);

  const asyncOperation = useAsyncOperation(retryableOperation, asyncOptions);

  return {
    ...asyncOperation,
    retryCount,
    maxRetries,
    call: asyncOperation.execute};
}

// Hook for batch operations
export function useBatchOperation<T = unknown, I = unknown>(
  batchFunction: (items: I[]) => Promise<T[]>,
  options: AsyncOperationOptions<T[]> & {
    batchSize?: number;
    delayBetweenBatches?: number;
  } = {}
) {
  const {
    batchSize = 10,
    delayBetweenBatches = 100,
    ...asyncOptions
  } = options;

  const [progress, setProgress] = useState({
    total: 0,
    completed: 0,
    percentage: 0});

  const batchOperation = useCallback(async (items: I[]) => {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    setProgress({
      total: items.length,
      completed: 0,
      percentage: 0});

    const results: T[] = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResults = await batchFunction(batch);
      results.push(...batchResults);
      
      const completed = Math.min((i + 1) * batchSize, items.length);
      const percentage = Math.round((completed / items.length) * 100);
      
      setProgress({
        total: items.length,
        completed,
        percentage});

      // Delay between batches (except for the last one)
      if (i < batches.length - 1 && delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }, [batchFunction, batchSize, delayBetweenBatches]);

  const asyncOperation = useAsyncOperation(async (...args: unknown[]) => {
    const items = args[0] as I[];
    return batchOperation(items);
  }, {
    ...asyncOptions,
    successMessage: asyncOptions.successMessage || 'Batch operation completed successfully'});

  return {
    ...asyncOperation,
    progress,
    executeBatch: asyncOperation.execute};
}
