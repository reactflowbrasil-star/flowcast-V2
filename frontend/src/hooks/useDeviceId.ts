import { useEffect, useState } from 'react';

const DEVICE_ID_KEY = 'streamcore_device_id';
const DEVICE_NAME_KEY = 'streamcore_device_name';

/**
 * Generate a unique device ID based on browser fingerprint
 */
function generateDeviceId(): string {
  const navigator = window.navigator;
  const screen = window.screen;
  
  // Collect browser fingerprint data
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
  ].join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Add random component for uniqueness
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  
  return `web_${Math.abs(hash).toString(36)}_${timestamp}_${random}`;
}

/**
 * Hook to manage device ID in localStorage
 * Returns the device ID and a function to check if device is registered
 */
export function useDeviceId() {
  const [deviceId, setDeviceId] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');
  const [isRegistered, setIsRegistered] = useState<boolean>(false);

  useEffect(() => {
    // Try to get existing device ID from localStorage
    let storedDeviceId = localStorage.getItem(DEVICE_ID_KEY);
    let storedDeviceName = localStorage.getItem(DEVICE_NAME_KEY);

    // If no device ID exists, generate a new one
    if (!storedDeviceId) {
      storedDeviceId = generateDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, storedDeviceId);
    }

    // If no device name exists, use browser info
    if (!storedDeviceName) {
      const browserName = getBrowserName();
      const osName = getOSName();
      storedDeviceName = `${browserName} on ${osName}`;
      localStorage.setItem(DEVICE_NAME_KEY, storedDeviceName);
    }

    setDeviceId(storedDeviceId);
    setDeviceName(storedDeviceName);
    
    // Check if this device ID is registered (we'll verify with backend)
    const registered = localStorage.getItem(`${DEVICE_ID_KEY}_registered`) === 'true';
    setIsRegistered(registered);
  }, []);

  const markAsRegistered = () => {
    localStorage.setItem(`${DEVICE_ID_KEY}_registered`, 'true');
    setIsRegistered(true);
  };

  const updateDeviceName = (newName: string) => {
    localStorage.setItem(DEVICE_NAME_KEY, newName);
    setDeviceName(newName);
  };

  const clearDeviceData = () => {
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_NAME_KEY);
    localStorage.removeItem(`${DEVICE_ID_KEY}_registered`);
    setDeviceId('');
    setDeviceName('');
    setIsRegistered(false);
  };

  return {
    deviceId,
    deviceName,
    isRegistered,
    markAsRegistered,
    updateDeviceName,
    clearDeviceData};
}

/**
 * Get browser name from user agent
 */
function getBrowserName(): string {
  const userAgent = navigator.userAgent;
  
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  
  return 'Browser';
}

/**
 * Get OS name from user agent
 */
function getOSName(): string {
  const userAgent = navigator.userAgent;
  
  if (userAgent.includes('Win')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  
  return 'Unknown OS';
}

