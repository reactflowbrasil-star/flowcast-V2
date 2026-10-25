'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, Save, ShieldCheck, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/services/api';
import { API_ENDPOINTS } from '@/constants/api';
import { useTranslation } from 'react-i18next';
import TwoFactorSettings from '@/components/user/TwoFactorSettings';
import type { User } from '@/types';

interface ResellerProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

export default function ResellerProfileDialog({ open, onOpenChange, user }: ResellerProfileDialogProps) {
  const [email, setEmail] = useState(user.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { t } = useTranslation();

  useEffect(() => {
    if (open) {
      setEmail(user.email ?? '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, user.email]);

  const emailHasChanges = email.trim() !== (user.email ?? '').trim();

  const updateEmailMutation = useMutation({
    mutationFn: async () => {
      return apiClient.put<User>(API_ENDPOINTS.USER_PROFILE.UPDATE, { email: email.trim() });
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error?.details ?? t('profile.updateFailed'));
        return;
      }
      toast.success(t('profile.updated'));
      onOpenChange(false);
    },
    onError: () => {
      toast.error(t('profile.updateFailed'));
    }});

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 8) {
        throw new Error(t('profile.passwordTooShort'));
      }
      return apiClient.put<{ success: boolean }>(API_ENDPOINTS.USER_PROFILE.CHANGE_PASSWORD, {
        current_password: currentPassword,
        new_password: newPassword});
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error?.details ?? t('profile.updatePasswordFailed'));
        return;
      }
      toast.success(t('profile.passwordUpdated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('profile.updatePasswordFailed');
      toast.error(message);
    }});

  const handleEmailSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!emailHasChanges || updateEmailMutation.isPending) return;
    updateEmailMutation.mutate();
  };

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (changePasswordMutation.isPending) return;

    if (!currentPassword) {
      toast.error(t('profile.currentPasswordRequired'));
      return;
    }
    if (!newPassword || !confirmPassword) {
      toast.error(t('profile.enterAndConfirmPassword'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('profile.passwordsDoNotMatch'));
      return;
    }
    changePasswordMutation.mutate();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (updateEmailMutation.isPending || changePasswordMutation.isPending)) {
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
            <form onSubmit={handleEmailSubmit}>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Mail className="h-4 w-4" />
                    {t('profile.contactInformation')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{t('common.username')}</Label>
                    <p className="text-sm py-2 px-3 bg-muted rounded-md">{user.username}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reseller-email">{t('common.email')}</Label>
                    <Input
                      id="reseller-email"
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
                    disabled={!emailHasChanges || updateEmailMutation.isPending}
                    className="mt-2"
                  >
                    {updateEmailMutation.isPending ? (
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
                    <Label htmlFor="current-password">{t('profile.currentPasswordLabel')}</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder={t('profile.currentPasswordPlaceholder')}
                    />
                  </div>
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
                    disabled={changePasswordMutation.isPending}
                    className="mt-2"
                  >
                    {changePasswordMutation.isPending ? (
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
