import { useState, useEffect, useCallback } from 'react';
import { useErrorHandler, useSuccessHandler } from './useErrorHandler';
import i18n from '@/lib/i18n';

export interface ConnectionState {
  isOnline: boolean;
  isConnecting: boolean;
  lastOnline: Date | null;
  lastSync: Date | null;
  retryCount: number;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
}

export interface SyncState {
  isSyncing: boolean;
  lastSyncAttempt: Date | null;
  syncError: string | null;
  pendingChanges: number;
}

export function useConnectionStatus() {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isConnecting: false,
    lastOnline: null,
    lastSync: null,
    retryCount: 0,
    connectionQuality: 'excellent'});

  const { handleNetworkError } = useErrorHandler();
  const { showSuccess, showWarning } = useSuccessHandler();

  // Test connection quality
  const testConnectionQuality = useCallback(async (): Promise<'excellent' | 'good' | 'poor' | 'offline'> => {
    if (!navigator.onLine) return 'offline';

    try {
      const start = performance.now();
      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache'});
      const end = performance.now();
      const latency = end - start;

      if (!response.ok) return 'poor';
      if (latency < 100) return 'excellent';
      if (latency < 300) return 'good';
      return 'poor';
    } catch {
      return 'offline';
    }
  }, []);

  // Update connection state
  const updateConnectionState = useCallback(async () => {
    const isOnline = navigator.onLine;
    const quality = await testConnectionQuality();
    
    setConnectionState(prev => ({
      ...prev,
      isOnline,
      connectionQuality: quality,
      lastOnline: isOnline ? new Date() : prev.lastOnline,
      retryCount: isOnline ? 0 : prev.retryCount}));
  }, [testConnectionQuality]);

  // Handle connection events
  useEffect(() => {
    const handleOnline = () => {
      setConnectionState(prev => ({
        ...prev,
        isOnline: true,
        lastOnline: new Date(),
        retryCount: 0}));
      
      showSuccess('Connection restored', {
        title: 'Back Online',
        duration: 3000});
      
      // Test quality after coming back online
      updateConnectionState();
    };

    const handleOffline = () => {
      setConnectionState(prev => ({
        ...prev,
        isOnline: false,
        connectionQuality: 'offline'}));
      
      showWarning('Connection lost', {
        title: 'Offline',
        duration: 5000});
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial connection test
    updateConnectionState();

    // Periodic connection quality checks
    const qualityCheckInterval = setInterval(updateConnectionState, 30000); // Every 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(qualityCheckInterval);
    };
  }, [updateConnectionState, showSuccess, showWarning]);

  // Retry connection
  const retryConnection = useCallback(async () => {
    setConnectionState(prev => ({
      ...prev,
      isConnecting: true,
      retryCount: prev.retryCount + 1}));

    try {
      await updateConnectionState();
    } catch (_error) {
      handleNetworkError(_error);
    } finally {
      setConnectionState(prev => ({
        ...prev,
        isConnecting: false}));
    }
  }, [updateConnectionState, handleNetworkError]);

  return {
    ...connectionState,
    retryConnection,
    updateConnectionState};
}

export function useSyncStatus() {
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncAttempt: null,
    syncError: null,
    pendingChanges: 0});

  const { handleApiError } = useErrorHandler();
  const { showSuccess } = useSuccessHandler();

  // Sync function
  const sync = useCallback(async (syncFunction: () => Promise<void>) => {
    setSyncState(prev => ({
      ...prev,
      isSyncing: true,
      lastSyncAttempt: new Date(),
      syncError: null}));

    try {
      await syncFunction();
      
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        pendingChanges: 0,
        syncError: null}));

      showSuccess('Data synchronized successfully', {
        title: 'Sync Complete',
        duration: 3000});
    } catch (_error) {
      const errorMessage = _error instanceof Error ? _error.message : 'Sync failed';
      
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        syncError: errorMessage}));

      handleApiError(_error, 'Sync');
    }
  }, [handleApiError, showSuccess]);

  // Add pending change
  const addPendingChange = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      pendingChanges: prev.pendingChanges + 1}));
  }, []);

  // Clear pending changes
  const clearPendingChanges = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      pendingChanges: 0}));
  }, []);

  // Auto-sync when coming back online
  const { isOnline } = useConnectionStatus();
  
  useEffect(() => {
    if (isOnline && syncState.pendingChanges > 0 && !syncState.isSyncing) {
      // Auto-sync after a short delay when coming back online
      const autoSyncTimer = setTimeout(() => {
        // This would trigger auto-sync if implemented
        console.log('Auto-sync triggered due to pending changes');
      }, 2000);

      return () => clearTimeout(autoSyncTimer);
    }
  }, [isOnline, syncState.pendingChanges, syncState.isSyncing]);

  return {
    ...syncState,
    sync,
    addPendingChange,
    clearPendingChanges};
}

// Hook for offline-first data management
/* eslint-disable @typescript-eslint/no-unused-vars */
export function useOfflineData<T>(
  key: string,
  fetchFunction: () => Promise<T>,
  options: {
    syncOnReconnect?: boolean;
    maxAge?: number; // in milliseconds
  } = {}
) {
  const { syncOnReconnect = true, maxAge = 5 * 60 * 1000 } = options; // 5 minutes default
  
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  
  const { isOnline } = useConnectionStatus();
  const { handleApiError } = useErrorHandler();

  // Load data from localStorage
  const loadFromCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(`offline_${key}`);
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        if (age < maxAge) {
          setData(cachedData);
          setLastFetch(new Date(timestamp));
          return true;
        }
      }
    } catch (_error) {
    }
    return false;
  }, [key, maxAge]);

  // Save data to localStorage
  const saveToCache = useCallback((data: T) => {
    try {
      localStorage.setItem(`offline_${key}`, JSON.stringify({
        data,
        timestamp: Date.now()}));
    } catch (_error) {
    }
  }, [key]);

  // Fetch fresh data
  const fetchData = useCallback(async (force = false) => {
    if (!isOnline && !force) {
      return loadFromCache();
    }

    setIsLoading(true);
    setError(null);

    try {
      const freshData = await fetchFunction();
      setData(freshData);
      setLastFetch(new Date());
      saveToCache(freshData);
      return true;
    } catch (_error) {
      const errorMessage = _error instanceof Error ? _error.message : i18n.t('common.serverError');
      setError(errorMessage);
      handleApiError(_error, `Fetch ${key}`);
      
      // Fall back to cache if available
      return loadFromCache();
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, fetchFunction, loadFromCache, saveToCache, handleApiError, key]);

  // Initial load
  useEffect(() => {
    if (!data) {
      fetchData();
    }
  }, [data, fetchData]);

  // Sync when coming back online
  useEffect(() => {
    if (isOnline && syncOnReconnect && data && lastFetch) {
      const age = Date.now() - lastFetch.getTime();
      if (age > maxAge) {
        fetchData();
      }
    }
  }, [isOnline, syncOnReconnect, data, lastFetch, maxAge, fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return {
    data,
    isLoading,
    error,
    lastFetch,
    isStale: lastFetch ? (Date.now() - lastFetch.getTime()) > maxAge : true,
    refresh,
    isOnline};
}
