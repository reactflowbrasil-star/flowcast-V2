'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';

interface StorageData {
  token: string | null;
  userData: string | null;
  refreshToken: string | null;
  expiration: string | null;
  allKeys?: string[];
}

export default function AuthDebug() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [storageData, setStorageData] = useState<StorageData>({
    token: null,
    userData: null,
    refreshToken: null,
    expiration: null,
    allKeys: []});

  useEffect(() => {
    const updateStorageData = () => {
      if (typeof window !== 'undefined') {
        setStorageData({
          token: localStorage.getItem('iptv_auth_token'),
          userData: localStorage.getItem('iptv_user_data'),
          refreshToken: localStorage.getItem('iptv_refresh_token'),
          expiration: localStorage.getItem('iptv_token_expiration'),
          allKeys: Object.keys(localStorage)});
      }
    };

    updateStorageData();
    
    // Update every second to see changes
    const interval = setInterval(updateStorageData, 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-md z-50">
      <h3 className="font-bold mb-2">Auth Debug</h3>
      <div className="space-y-1">
        <div>Loading: {isLoading ? 'true' : 'false'}</div>
        <div>Authenticated: {isAuthenticated ? 'true' : 'false'}</div>
        <div>User: {user ? JSON.stringify(user, null, 2) : 'null'}</div>
        <div>Token: {storageData.token ? 'exists' : 'null'}</div>
        <div>UserData: {storageData.userData ? 'exists' : 'null'}</div>
        <div>All Keys: {storageData.allKeys?.join(', ')}</div>
      </div>
    </div>
  );
}
