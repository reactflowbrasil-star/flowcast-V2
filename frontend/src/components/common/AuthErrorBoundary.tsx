'use client';

import React, { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import i18n from '@/lib/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isAuthError: boolean;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isAuthError: false};
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's an authentication error
    const isAuthError = error.message.includes('401') || 
                       error.message.includes('Unauthorized') ||
                       error.message.includes('Authentication failed') ||
                       error.message.includes('Token expired');

    return {
      hasError: true,
      error,
      isAuthError};
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AuthErrorBoundary caught an error:', error, errorInfo);
    
    // If it's an auth error, clear localStorage and redirect
    if (this.state.isAuthError) {
      this.clearAuthAndRedirect();
    }
  }

  clearAuthAndRedirect = () => {
    try {
      // Clear all auth-related data
      localStorage.removeItem('iptv_auth_token');
      localStorage.removeItem('iptv_user_data');
      
      // Clear cookies
      document.cookie = 'iptv_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      // Redirect to login
      window.location.href = '/login';
    } catch (err) {
      console.error('Error clearing auth data:', err);
      // Force reload as fallback
      window.location.reload();
    }
  };

  handleRetry = () => {
    if (this.state.isAuthError) {
      this.clearAuthAndRedirect();
    } else {
      // For non-auth errors, just reset the error boundary
      this.setState({
        hasError: false,
        error: null,
        isAuthError: false});
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.state.isAuthError) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-4 p-6">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {i18n.t('common.sessionExpiredDescription')}
                </AlertDescription>
              </Alert>
              
              <Button 
                onClick={this.clearAuthAndRedirect}
                className="w-full"
              >
                {i18n.t('common.goToLogin')}
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full space-y-4 p-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {i18n.t('common.somethingWentWrong')}
              </AlertDescription>
            </Alert>
            
            <Button 
              onClick={this.handleRetry}
              className="w-full"
              variant="outline"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {i18n.t('common.tryAgain')}
            </Button>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 p-4 bg-gray-100 rounded text-sm">
                <summary className="cursor-pointer font-medium">{i18n.t('common.errorDetails')}</summary>
                <pre className="mt-2 whitespace-pre-wrap">
                  {this.state.error.message}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
