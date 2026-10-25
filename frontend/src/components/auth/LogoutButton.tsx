'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger} from '@/components/ui/alert-dialog';
import { LogOut, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoutButtonProps {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showConfirmDialog?: boolean;
  className?: string;
  children?: React.ReactNode;
}



export default function LogoutButton({
  variant = 'outline',
  size = 'sm',
  showConfirmDialog = true,
  className,
  children}: LogoutButtonProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { logout, user } = useAuth();
  const { t } = useTranslation();


  const handleLogout = async () => {
    setIsLoggingOut(true);
    // Hard fallback: force cleanup + redirect if API call hangs or fails
    const hardFallback = () => {
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('iptv_auth_token');
          localStorage.removeItem('iptv_user_data');
          sessionStorage.clear();
          document.cookie = 'iptv_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          document.cookie = 'iptv_user_data=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          window.location.href = '/login';
        }
      } catch (_) {}
    };

    const timer = setTimeout(hardFallback, 3000);
    try {
      // Attempt API logout, but don't block UI beyond the fallback window
      await Promise.race([
        logout(),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
      clearTimeout(timer);
      hardFallback();
    } catch (error) {
      console.error('Logout error:', error);
      clearTimeout(timer);
      hardFallback();
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!showConfirmDialog) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleLogout}
        disabled={isLoggingOut}
        className={className}
      >
        <LogOut className="h-4 w-4 mr-2" />
        {children || t('common.logout')}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        type="button"
        disabled={isLoggingOut}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
          variant === 'default' && "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
          variant === 'destructive' && "bg-destructive text-white shadow-xs hover:bg-destructive/90",
          variant === 'outline' && "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
          variant === 'secondary' && "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
          variant === 'ghost' && "hover:bg-accent hover:text-accent-foreground",
          variant === 'link' && "text-primary underline-offset-4 hover:underline",
          size === 'default' && "h-9 px-4 py-2",
          size === 'sm' && "h-8 rounded-md gap-1.5 px-3",
          size === 'lg' && "h-10 rounded-md px-6",
          size === 'icon' && "size-9",
          className
        )}
      >
        <LogOut className="h-4 w-4 mr-2" />
        {children || t('common.logout')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.confirmLogoutTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('common.confirmLogoutDescription', { user: user?.username })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoggingOut ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" />
            )}
            {isLoggingOut ? t('common.loggingOut') : t('common.logout')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Quick logout without confirmation
export function QuickLogoutButton(props: Omit<LogoutButtonProps, 'showConfirmDialog'>) {
  return <LogoutButton {...props} showConfirmDialog={false} />;
}

// Icon-only logout button
export function LogoutIconButton(props: Omit<LogoutButtonProps, 'size' | 'children'>) {
  return <LogoutButton {...props} size="icon" />;
}
