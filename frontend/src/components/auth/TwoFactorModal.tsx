'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Key, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TwoFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (code: string) => Promise<void>;
  error?: string;
  isLoading?: boolean;
}

type InputMode = 'totp' | 'backup';

export function TwoFactorModal({
  isOpen,
  onClose,
  onVerify,
  error,
  isLoading = false}: TwoFactorModalProps) {
  const { t } = useTranslation();
  const [inputMode, setInputMode] = useState<InputMode>('totp');
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens or mode changes
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, inputMode]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTotpCode('');
      setBackupCode('');
      setInputMode('totp');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = inputMode === 'totp' ? totpCode : backupCode;
    if (code.length > 0) {
      await onVerify(code);
    }
  };

  const handleTotpChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(cleaned);
  };

  const handleBackupChange = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setBackupCode(cleaned);
  };

  const isValidCode = inputMode === 'totp' 
    ? totpCode.length === 6 
    : backupCode.length === 8;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="bg-gray-900 border-gray-700 text-white sm:max-w-md"
        showCloseButton={!isLoading}
      >
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-4 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full blur-xl opacity-50 animate-pulse" />
            <div className="relative bg-gray-800 p-4 rounded-full">
              <Shield className="h-8 w-8 text-emerald-400" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold text-white">
            {t('auth.twoFactorModal.title')}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {inputMode === 'totp' 
              ? t('auth.twoFactorModal.totpDescription')
              : t('auth.twoFactorModal.backupDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {inputMode === 'totp' ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                {t('auth.twoFactorModal.authenticationCode')}
              </label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => handleTotpChange(e.target.value)}
                  className="pl-10 bg-gray-800 border-gray-600 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder:text-gray-500 placeholder:tracking-normal placeholder:text-base focus:border-emerald-400 focus:ring-emerald-400/20"
                  placeholder={t('auth.twoFactorModal.totpPlaceholder')}
                  disabled={isLoading}
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInputMode('totp')}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <label className="block text-sm font-medium text-gray-300">
                  {t('auth.twoFactorModal.backupCode')}
                </label>
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  ref={inputRef}
                  type="text"
                  value={backupCode}
                  onChange={(e) => handleBackupChange(e.target.value)}
                  className="pl-10 bg-gray-800 border-gray-600 text-white text-center text-xl font-mono tracking-widest placeholder:text-gray-500 placeholder:tracking-normal placeholder:text-base focus:border-amber-400 focus:ring-amber-400/20"
                  placeholder={t('auth.twoFactorModal.backupPlaceholder')}
                  disabled={isLoading}
                  maxLength={8}
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-gray-500">
                {t('auth.twoFactorModal.backupHint')}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !isValidCode}
            className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-semibold py-3 transition-all duration-300 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('auth.twoFactorModal.verifying')}
              </span>
            ) : (
              t('auth.twoFactorModal.verifyAndSignIn')
            )}
          </Button>

          {inputMode === 'totp' && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setInputMode('backup')}
                className="text-sm text-gray-400 hover:text-cyan-400 transition-colors inline-flex items-center gap-1"
              >
                <Key className="h-3 w-3" />
                {t('auth.twoFactorModal.useBackupCode')}
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 text-center">
              {t('auth.twoFactorModal.lostAccessHelp')}
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
