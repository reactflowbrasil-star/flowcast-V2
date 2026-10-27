'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, ArrowLeft, Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { API_ENDPOINTS } from '@/constants/api';

function ResetPasswordForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [username, setUsername] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsVerifying(false);
        return;
      }

      try {
        const response = await fetch(API_ENDPOINTS.AUTH.VERIFY_RESET_TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })});

        const data = await response.json();
        setTokenValid(data.valid);
        if (data.username) {
          setUsername(data.username);
        }
      } catch (err) {
        setTokenValid(false);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.resetPasswordFlow.passwordsDoNotMatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.resetPasswordFlow.passwordMinLength'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password })});

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('auth.resetPasswordFlow.resetFailed'));
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || t('auth.resetPasswordFlow.genericError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className="text-slate-400">{t('auth.resetPasswordFlow.verifyingLink')}</p>
        </div>
      </div>
    );
  }

  // Invalid token
  if (!token || !tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">{t('auth.resetPasswordFlow.invalidOrExpiredTitle')}</h1>
            <p className="text-slate-400 mb-6">
              {t('auth.resetPasswordFlow.invalidOrExpiredDescription')}
            </p>
            <Link href="/forgot-password">
              <Button className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500">
                {t('auth.resetPasswordFlow.requestNewLink')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">{t('auth.resetPasswordFlow.successTitle')}</h1>
            <p className="text-slate-400 mb-6">
              {t('auth.resetPasswordFlow.successDescription')}
            </p>
            <Link href="/login">
              <Button className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500">
                {t('auth.resetPasswordFlow.goToLogin')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-purple-600 rounded-2xl blur-xl opacity-75 animate-pulse"></div>
              <div className="relative flex h-20 w-52 items-center justify-center bg-slate-800/80 backdrop-blur-md p-3 rounded-2xl">
                <Image
                  src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/flowcast-logo.png`}
                  alt="Flowcast"
                  width={192}
                  height={64}
                  className="h-auto w-full object-contain"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">
              {t('auth.resetPasswordFlow.resetYourPassword')}
            </h1>
            {username && (
              <p className="text-slate-400">
                {t('auth.resetPasswordFlow.createNewPasswordFor')} <span className="text-indigo-400 font-medium">{username}</span>
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                {t('auth.resetPasswordFlow.newPasswordLabel')}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.resetPasswordFlow.newPasswordPlaceholder')}
                  required
                  minLength={6}
                  className="pl-12 pr-12 h-14 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-indigo-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                {t('auth.resetPasswordFlow.confirmPasswordLabel')}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.resetPasswordFlow.confirmPasswordPlaceholder')}
                  required
                  minLength={6}
                  className="pl-12 h-14 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !password || !confirmPassword}
              className="w-full h-14 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/25"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {t('auth.resetPasswordFlow.resetting')}
                </>
              ) : (
                t('auth.resetPasswordFlow.resetPasswordButton')
              )}
            </Button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('auth.resetPasswordFlow.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
