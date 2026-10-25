/**
 * Utility functions for cleaning up authentication state
 * This helps prevent infinite refresh loops and auth errors
 */

export const authCleanup = {
  /**
   * Clear all authentication data from localStorage and cookies
   */
  clearAllAuthData(): void {
    if (typeof window === 'undefined') return;

    try {
      // Clear localStorage
      localStorage.removeItem('iptv_auth_token');
      localStorage.removeItem('iptv_user_data');
      // Also clear any legacy keys if present
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      
      // Clear sessionStorage as well
      sessionStorage.removeItem('iptv_auth_token');
      sessionStorage.removeItem('iptv_user_data');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('user_data');
      
      // Clear cookies
      const cookieNames = ['iptv_auth_token', 'iptv_user_data', 'auth_token', 'user_data'];
      const paths = ['/', '/admin', '/reseller'];
      for (const name of cookieNames) {
        // Standard root-path removal
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        // Defensive: attempt to clear cookies that might have been set on sub-paths
        for (const p of paths) {
          document.cookie = `${name}=; path=${p}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      }
      
      // Auth data cleared successfully
    } catch {
      // Error clearing auth data - silently ignore
    }
  },

  /**
   * Check if token exists but is malformed
   */
  isTokenCorrupted(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const token = localStorage.getItem('iptv_auth_token');
      if (!token) return false;

      // Check if token has proper JWT structure (3 parts separated by dots)
      const parts = token.split('.');
      if (parts.length !== 3) return true;

      // Try to decode the payload
      try {
        const payload = JSON.parse(atob(parts[1]));
        // Check if payload has required fields
        if (!payload.exp || !payload.iat || !payload.sub) return true;
        
        return false;
      } catch {
        return true;
      }
    } catch {
      return true;
    }
  },

  /**
   * Check if user data exists but is malformed
   */
  isUserDataCorrupted(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const userData = localStorage.getItem('iptv_user_data');
      if (!userData) return false;

      const user = JSON.parse(userData);
      // Check if user has required fields
      if (!user.id || !user.username || !user.role) return true;
      
      return false;
    } catch {
      return true;
    }
  },

  /**
   * Perform a complete auth state check and cleanup if needed
   */
  performHealthCheck(): boolean {
    if (typeof window === 'undefined') return true;

    const tokenCorrupted = this.isTokenCorrupted();
    const userDataCorrupted = this.isUserDataCorrupted();

    if (tokenCorrupted || userDataCorrupted) {
      this.clearAllAuthData();
      return false;
    }

    return true;
  },

  /**
   * Safe redirect to login page
   */
  redirectToLogin(_reason?: string): void {
    if (typeof window === 'undefined') return;
    
    // Clear auth data first
    this.clearAllAuthData();
    
    // Use replace to avoid back button issues
    const currentPath = window.location.pathname;
    const sanitizedPath = sanitizeRedirectPath(currentPath) ?? '/';
    const redirectParam = sanitizedPath !== '/login' ? `?redirect=${encodeURIComponent(sanitizedPath)}` : '';
    
    window.location.replace(`/login${redirectParam}`);
  },

  /**
   * Initialize auth cleanup on page load
   */
  initialize(): void {
    if (typeof window === 'undefined') return;

    // Perform health check on load
    const isHealthy = this.performHealthCheck();
    
    if (!isHealthy) {
      // If auth data was corrupted, redirect to login after a short delay
      setTimeout(() => {
        this.redirectToLogin('Corrupted auth data detected');
      }, 100);
    }

    // Listen for storage events from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key === 'iptv_auth_token' && !e.newValue) {
        // Token was removed in another tab
        this.clearAllAuthData();
        this.redirectToLogin('Logged out from another tab');
      }
    });

    // Listen for unhandled promise rejections that might be auth-related
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;
      if (error?.response?.status === 401 || 
          error?.message?.includes('401') ||
          error?.message?.includes('Unauthorized')) {
        this.redirectToLogin('Authentication error');
      }
    });
  }
};

// Auto-initialize when module is loaded
if (typeof window !== 'undefined') {
  // Use setTimeout to ensure DOM is ready
  setTimeout(() => {
    authCleanup.initialize();
  }, 0);
}
import { sanitizeRedirectPath } from './routes';
