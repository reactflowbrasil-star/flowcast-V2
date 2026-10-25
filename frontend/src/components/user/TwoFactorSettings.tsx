'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Loader2,
  Copy,
  CheckCircle,
  AlertTriangle} from 'lucide-react';
import { apiClient } from '@/services/api';
import { API_ENDPOINTS } from '@/constants/api';

interface TwoFactorStatus {
  enabled: boolean;
  has_backup_codes: boolean;
}

interface SetupResponse {
  secret: string;
  qr_code: string;
  backup_codes: string[];
}

export default function TwoFactorSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await apiClient.get<TwoFactorStatus>(API_ENDPOINTS.AUTH.TWO_FACTOR_STATUS);
      if (response.success && response.data) {
        setStatus(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch 2FA status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startSetup = async () => {
    setIsSettingUp(true);
    setError('');
    
    try {
      const response = await apiClient.post<SetupResponse>(API_ENDPOINTS.AUTH.TWO_FACTOR_SETUP, {});
      
      if (response.success && response.data) {
        setSetupData(response.data);
      } else {
        throw new Error(response.error?.details || t('profile.twoFactor.errors.setupFailed'));
      }
    } catch (err: any) {
      setError(err.message || t('profile.twoFactor.errors.setupFailed'));
    } finally {
      setIsSettingUp(false);
    }
  };

  const verifyAndEnable = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError(t('profile.twoFactor.errors.invalidCode'));
      return;
    }
    
    setIsVerifying(true);
    setError('');
    
    try {
      const response = await apiClient.post<{ success: boolean; message: string }>(
        API_ENDPOINTS.AUTH.TWO_FACTOR_VERIFY,
        { code: verificationCode }
      );
      
      if (response.success && response.data?.success) {
        setSuccess(t('profile.twoFactor.enabled'));
        setBackupCodes(setupData?.backup_codes || []);
        setShowBackupCodes(true);
        setSetupData(null);
        setVerificationCode('');
        fetchStatus();
      } else {
        setError(response.data?.message || t('profile.twoFactor.errors.verifyFailed'));
      }
    } catch (err: any) {
      setError(err.message || t('profile.twoFactor.errors.verifyFailed'));
    } finally {
      setIsVerifying(false);
    }
  };

  const disable2FA = async () => {
    if (!disableCode || disableCode.length < 6) {
      setError(t('profile.twoFactor.errors.invalidCode'));
      return;
    }
    
    setIsDisabling(true);
    setError('');
    
    try {
      const response = await apiClient.post<{ success: boolean; message: string }>(
        API_ENDPOINTS.AUTH.TWO_FACTOR_DISABLE,
        { code: disableCode }
      );
      
      if (response.success && response.data?.success) {
        setSuccess(t('profile.twoFactor.disabled'));
        setShowDisableForm(false);
        setDisableCode('');
        fetchStatus();
      } else {
        setError(response.data?.message || t('profile.twoFactor.errors.disableFailed'));
      }
    } catch (err: any) {
      setError(err.message || t('profile.twoFactor.errors.disableFailed'));
    } finally {
      setIsDisabling(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {status?.enabled ? (
            <ShieldCheck className="h-4 w-4 text-green-500" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          {t('profile.twoFactor.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status description */}
        <p className="text-sm text-muted-foreground">
          {status?.enabled ? t('profile.twoFactor.enabled') : t('profile.twoFactor.description')}
        </p>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}
        
        {success && !showBackupCodes && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md">
            <p className="text-green-600 dark:text-green-400 text-sm">{success}</p>
          </div>
        )}

        {/* Backup Codes Display */}
        {showBackupCodes && backupCodes.length > 0 && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-md">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-1">
                  {t('profile.twoFactor.backupCodes.title')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t('profile.twoFactor.backupCodes.description')}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {backupCodes.map((code, index) => (
                <div key={index} className="bg-muted px-3 py-2 rounded font-mono text-sm">
                  {code}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                copyToClipboard(backupCodes.join('\n'));
                setShowBackupCodes(false);
                setSuccess('');
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              {t('profile.twoFactor.backupCodes.copy')}
            </Button>
          </div>
        )}

        {/* 2FA Enabled State */}
        {status?.enabled && !showDisableForm && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>{t('profile.twoFactor.enabled')}</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowDisableForm(true)}
              className="text-destructive hover:text-destructive"
            >
              <ShieldOff className="w-4 h-4 mr-2" />
              {t('profile.twoFactor.disable')}
            </Button>
          </div>
        )}

        {/* Disable Form */}
        {showDisableForm && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('profile.twoFactor.disableDescription')}
            </p>
            <div className="space-y-2">
              <Label htmlFor="disable-code">{t('profile.twoFactor.code')}</Label>
              <div className="flex gap-3">
                <Input
                  id="disable-code"
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('profile.twoFactor.placeholder')}
                  maxLength={8}
                />
                <Button onClick={disable2FA} disabled={isDisabling} variant="destructive">
                  {isDisabling ? <Loader2 className="w-4 h-4 animate-spin" /> : t('profile.twoFactor.disable')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDisableForm(false);
                    setDisableCode('');
                    setError('');
                  }}
                >
                  {t('profile.twoFactor.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Setup Flow - Not started */}
        {!status?.enabled && !setupData && (
          <Button onClick={startSetup} disabled={isSettingUp} variant="secondary">
            {isSettingUp ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('profile.twoFactor.verifying')}
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                {t('profile.twoFactor.enable')}
              </>
            )}
          </Button>
        )}

        {/* QR Code and Verification */}
        {setupData && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                {t('profile.twoFactor.scanQR')}
              </p>
              <div className="inline-block p-4 bg-white rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setupData.qr_code} alt={t('profile.twoFactor.qrAlt')} className="w-40 h-40" />
              </div>
            </div>

            {/* Manual Entry */}
            <div className="bg-muted rounded-md p-3">
              <p className="text-xs text-muted-foreground mb-2">
                {t('profile.twoFactor.manualEntry')}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-sm break-all">
                  {setupData.secret}
                </code>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(setupData.secret)}>
                  {copiedSecret ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Verification */}
            <div className="space-y-2">
              <Label htmlFor="verify-code">{t('profile.twoFactor.verifyCode')}</Label>
              <div className="flex gap-3">
                <Input
                  id="verify-code"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('profile.twoFactor.placeholder')}
                  maxLength={6}
                  className="text-center font-mono text-lg tracking-widest"
                />
                <Button onClick={verifyAndEnable} disabled={isVerifying || verificationCode.length !== 6}>
                  {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('profile.twoFactor.verify')}
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setSetupData(null);
                setVerificationCode('');
                setError('');
              }}
            >
              {t('profile.twoFactor.cancel')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
