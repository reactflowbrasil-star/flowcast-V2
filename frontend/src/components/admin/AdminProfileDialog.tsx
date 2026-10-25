'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, Save, ShieldCheck, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { userService, authService } from '@/services';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import TwoFactorSettings from '@/components/user/TwoFactorSettings';
import type { User } from '@/types';

interface AdminProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

export default function AdminProfileDialog({ open, onOpenChange, user }: AdminProfileDialogProps) {
  const [email, setEmail] = useState(user.email ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { refreshUser } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    if (open) {
      setEmail(user.email ?? '');
      setUsername(user.username ?? '');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, user.email, user.username]);

  const profileHasChanges = useMemo(() => {
    const originalEmail = user.email ?? '';
    const originalUsername = user.username ?? '';
    const emailChanged = email.trim() !== originalEmail.trim();
    const usernameChanged = username.trim() !== originalUsername.trim();
    return emailChanged || usernameChanged;
  }, [email, username, user.email, user.username]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const payload: { email?: string; username?: string } = {};
      if (email.trim() !== (user.email ?? '').trim()) {
        payload.email = email.trim();
      }
      if (username.trim() !== (user.username ?? '').trim()) {
        payload.username = username.trim();
      }
      return userService.updateUser(user.id, payload);
    },
      onSuccess: async (result) => {
      if (!result.success || !result.data) {
        toast.error(result.error?.details ?? t('profile.updateFailed'));
        return;
      }

      toast.success(t('profile.updated'));
      const storedUser = authService.getStoredUser();
      const updatedUser = storedUser ? { ...storedUser, ...result.data } : result.data;
      authService.setStoredUser(updatedUser);
      await refreshUser();
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('profile.updateFailed');
      toast.error(message);
    }});

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 8) {
        throw new Error(t('profile.passwordTooShort'));
      }
      return userService.resetUserPassword(user.id, newPassword);
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error?.details ?? t('profile.updatePasswordFailed'));
        return;
      }
      toast.success(t('profile.passwordUpdated'));
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('profile.updatePasswordFailed');
      toast.error(message);
    }});

  const handleProfileSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileHasChanges || updateProfileMutation.isPending) return;
    updateProfileMutation.mutate();
  };

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (resetPasswordMutation.isPending) return;

    if (!newPassword || !confirmPassword) {
      toast.error(t('profile.enterAndConfirmPassword'));
      return;
    }
      if (newPassword !== confirmPassword) {
      toast.error(t('profile.passwordsDoNotMatch'));
      return;
    }
    resetPasswordMutation.mutate();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (updateProfileMutation.isPending || resetPasswordMutation.isPending)) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('profile.title')}</DialogTitle>
          <DialogDescription>{t('profile.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* First Row: Contact Info + Change Password */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <form onSubmit={handleProfileSubmit}>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Mail className="h-4 w-4" />
                    {t('profile.contactInformation')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-username">{t('common.username')}</Label>
                    <Input
                      id="admin-username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder={t('common.username')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-email">{t('common.email')}</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t('profile.emailPlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('profile.contactInfoNote')}
                    </p>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!profileHasChanges || updateProfileMutation.isPending}
                    className="mt-2"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t('profile.saveChanges')}
                  </Button>
                </CardContent>
              </Card>
            </form>

            <form onSubmit={handlePasswordSubmit}>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lock className="h-4 w-4" />
                    {t('profile.changePassword')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">{t('profile.newPasswordLabel')}</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder={t('profile.newPasswordPlaceholder')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">{t('profile.confirmPasswordLabel')}</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder={t('profile.confirmPasswordPlaceholder')}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('profile.passwordHelp')}
                  </p>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={resetPasswordMutation.isPending}
                    className="mt-2"
                  >
                    {resetPasswordMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-2 h-4 w-4" />
                    )}
                    {t('profile.updatePassword')}
                  </Button>
                </CardContent>
              </Card>
            </form>
          </div>

          {/* Second Row: Two-Factor Authentication (full width) */}
          <TwoFactorSettings />
        </div>
      </DialogContent>
    </Dialog>
  );
}
