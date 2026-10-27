'use client';

import { useEffect } from 'react';

export default function PWARegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const serviceWorkerUrl = `${appBasePath}/service-worker.js`;
    const scope = `${appBasePath}/` || '/';

    navigator.serviceWorker.register(serviceWorkerUrl, { scope }).catch((error) => {
      console.warn('PWA service worker registration failed:', error);
    });
  }, []);

  return null;
}
