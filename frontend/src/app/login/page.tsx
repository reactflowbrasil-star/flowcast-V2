'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TwoFactorModal } from '@/components/auth/TwoFactorModal';
import { User, Lock, Loader2, Eye, EyeOff, Shield, Sparkles, ArrowRight } from 'lucide-react';
import { UserRole } from '@/types';
import { normalizeRole } from '@/utils/auth';
import { ROUTES, APP_NAME } from '@/constants/app';
import { sanitizeRedirectPath } from '@/utils';
import { MOVIES_BACKDROPS, SERIES_BACKDROPS } from '@/constants/backdrops';

function getDefaultRouteForRole(role: string | UserRole): string {
  const normalized = normalizeRole(role as any);
  switch (normalized) {
    case UserRole.ADMIN:
      return ROUTES.ADMIN.BASE;
    case UserRole.RESELLER:
      return ROUTES.RESELLER.BASE;
    case UserRole.END_USER:
      return ROUTES.USER.BASE;
    default:
      return ROUTES.HOME;
  }
}

function LoginForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, login, user } = useAuth();

  // Form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // UI state
  const [mounted, setMounted] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [seriesBackdrops, setSeriesBackdrops] = useState<string[]>(SERIES_BACKDROPS);
  const [moviesBackdrops, setMoviesBackdrops] = useState<string[]>(MOVIES_BACKDROPS);

  // 2FA state
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState('');
  const [is2FAVerifying, setIs2FAVerifying] = useState(false);

  useEffect(() => {
    setMounted(true);
    const loadDemoStatus = async () => {
      try {
        const res = await fetch('/api/demo/status');
        if (!res.ok) {
          setDemoEnabled(true);
          return;
        }
        const data = await res.json();
        setDemoEnabled(data.demo_enabled ?? true);
      } catch (err) {
        console.error('Failed to load demo status:', err);
        setDemoEnabled(true);
      }
    };
    loadDemoStatus();

    const loadUiConfig = async () => {
      try {
        const res = await fetch('/api/public/config/ui');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.login_series_backdrops) && data.login_series_backdrops.length > 0) {
          setSeriesBackdrops(data.login_series_backdrops);
        }
        if (Array.isArray(data?.login_movies_backdrops) && data.login_movies_backdrops.length > 0) {
          setMoviesBackdrops(data.login_movies_backdrops);
        }
        if (data?.allow_direct_registration) {
          setRegistrationEnabled(true);
        }
      } catch {
        // ignore
      }
    };
    loadUiConfig();
  }, []);

  const searchParams = useSearchParams();
  const redirectParam = useMemo(
    () => sanitizeRedirectPath(searchParams?.get?.('redirect')),
    [searchParams]
  );
  const sessionExpired = searchParams?.get?.('session') === 'expired';

  // Redirect if already authenticated
  useEffect(() => {
    if (isSubmitting || show2FAModal) return;

    if (!isLoading && isAuthenticated && user) {
      const norm = normalizeRole(user.role as any);
      if (norm === UserRole.END_USER) {
        router.push(ROUTES.USER.BASE);
      } else if (redirectParam) {
        router.push(redirectParam);
      } else {
        router.push(getDefaultRouteForRole(user.role));
      }
    }
  }, [isAuthenticated, isLoading, user, router, redirectParam, isSubmitting, show2FAModal]);

  const handleLoginSuccess = useCallback((userData: any) => {
    if (!userData.active) {
      router.push('/banned');
      return;
    }

    const normRole = normalizeRole(userData.role as any);
    if (normRole === UserRole.END_USER) {
      // Direct-registered users without a package go to plan selection
      const hasSubscription = userData.subscribed_categories && userData.subscribed_categories.length > 0;
      if (userData.subscription_source === 'direct' && !hasSubscription) {
        router.push('/plans');
      } else {
        router.push(ROUTES.USER.BASE);
      }
    } else {
      router.push(redirectParam ?? getDefaultRouteForRole(userData.role));
    }
  }, [router, redirectParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const result = await login({ username, password });

      if (result.success && result.user) {
        handleLoginSuccess(result.user);
      } else if (!result.success) {
        const errorMsg = result.error || '';
        if (errorMsg.toLowerCase().includes('two-factor') || errorMsg.toLowerCase().includes('2fa')) {
          setShow2FAModal(true);
          setTwoFactorError('');
        } else {
          setError(errorMsg || t('login.loginFailed'));
        }
      }
    } catch {
      setError(t('login.unexpectedError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FAVerify = async (code: string) => {
    setIs2FAVerifying(true);
    setTwoFactorError('');

    try {
      const result = await login({ username, password, totp_code: code });

      if (result.success && result.user) {
        setShow2FAModal(false);
        handleLoginSuccess(result.user);
      } else {
        setTwoFactorError(result.error || t('profile.twoFactor.errors.invalidCode'));
      }
    } catch {
      setTwoFactorError(t('login.unexpectedError'));
    } finally {
      setIs2FAVerifying(false);
    }
  };

  const handle2FAClose = () => {
    setShow2FAModal(false);
    setTwoFactorError('');
  };

  // Show loading only for initial auth check
  if (isLoading && !isSubmitting && !show2FAModal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0e14]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 blur-xl opacity-75 animate-pulse" />
          <Loader2 className="relative h-12 w-12 animate-spin text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0b0e14] text-white flex overflow-hidden font-sans">
      {/* 2FA Modal */}
      <TwoFactorModal
        isOpen={show2FAModal}
        onClose={handle2FAClose}
        onVerify={handle2FAVerify}
        error={twoFactorError}
        isLoading={is2FAVerifying}
      />

      {/* Left Side - Poster Wall Background */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center overflow-hidden bg-black">

        {/* Animated Poster Wall */}
        <div className="absolute inset-0 flex opacity-95 transform-gpu -rotate-[15deg] scale-125 -translate-x-10">
          {/* Column 1 - Series (Scroll Up) */}
          <div className="w-1/2 flex flex-col animate-scroll-y" style={{ animationDuration: '80s' }}>
            {[...seriesBackdrops, ...seriesBackdrops, ...seriesBackdrops].map((src, i) => (
              <div key={`col1-${i}`} className="relative w-full h-[200px] shrink-0 overflow-hidden bg-slate-900">
                <Image
                  src={src}
                  alt=""
                  fill
                  className="object-cover brightness-125 contrast-125 saturate-125"
                  sizes="50vw"
                  priority={i < 4}
                />
              </div>
            ))}
          </div>
          {/* Column 2 - Movies (Scroll Down) */}
          <div className="w-1/2 flex flex-col animate-scroll-y" style={{ animationDirection: 'reverse', animationDuration: '100s' }}>
            {[...moviesBackdrops, ...moviesBackdrops, ...moviesBackdrops].map((src, i) => (
              <div key={`col2-${i}`} className="relative w-full h-[200px] shrink-0 overflow-hidden bg-slate-900">
                <Image
                  src={src}
                  alt=""
                  fill
                  className="object-cover brightness-125 contrast-125 saturate-125"
                  sizes="50vw"
                  priority={i < 4}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Overlay Gradient - Lighter to let images show through */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-[#0b0e14]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#0b0e14_82%)]"></div>

        {/* Glass Card Content */}
        <div className="relative z-10 p-12 max-w-2xl w-full mx-auto">
          <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-[2rem] p-12 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-purple-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

            <div className="relative z-10 flex flex-col items-center text-center space-y-8">
              <div className="relative w-[250px] h-24">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full blur-3xl opacity-30 animate-pulse"></div>
                <Image
                  src="/login-logo.png"
                  alt={t('login.hero.mainLogoAlt')}
                  fill
                  className="object-contain drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                  priority
                />
              </div>

              <div className="space-y-4">
                <p className="text-xl text-gray-300 font-light max-w-md mx-auto leading-relaxed tracking-wide">
                  {t('login.subtitle')}
                </p>
              </div>

              {/* Refined Features - Simple & Elegant */}
              <div className="flex items-center justify-center gap-8 pt-6 w-full border-t border-white/5 mt-4">
                <div className="flex items-center gap-3 group/f">
                  <div className="p-2 rounded-lg bg-white/5 group-hover/f:bg-white/10 transition-colors">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">4K HDR</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">{t('login.hero.ultraHd')}</p>
                  </div>
                </div>
                <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
                <div className="flex items-center gap-3 group/f">
                  <div className="p-2 rounded-lg bg-white/5 group-hover/f:bg-white/10 transition-colors">
                    <Shield className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">{t('login.hero.secure')}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">{t('login.hero.encrypted')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-12 bg-[#0b0e14] relative overflow-hidden">
        {/* Dynamic Background Elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[100px] animate-pulse delay-700"></div>

        {/* Mobile Background Effect */}
        <div className="lg:hidden absolute inset-0 bg-gradient-to-b from-blue-900/20 to-black pointer-events-none"></div>

        <div className="w-full max-w-[440px] space-y-10 relative z-10">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <Image src="/login-logo.png" alt={t('login.hero.mobileLogoAlt')} width={180} height={64} className="mb-4 drop-shadow-lg" />
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-4xl font-bold tracking-tight text-white">
              {t('login.title')}
            </h2>
            <p className="text-gray-400 text-lg">
              {t('login.enterCredentials')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-5">
              {/* Username Input */}
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-gray-300 ml-1">
                  {t('login.username')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-500 group-focus-within:text-cyan-400 transition-colors duration-300" />
                  </div>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-12 h-12 bg-white/5 border-white/10 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 text-white placeholder:text-gray-600 rounded-xl transition-all duration-300"
                    placeholder={t('login.usernamePlaceholder')}
                    disabled={isSubmitting}
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-gray-300 ml-1">
                    {t('login.password')}
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    {t('login.forgotPassword')}
                  </Link>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors duration-300" />
                  </div>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 pr-12 h-12 bg-white/5 border-white/10 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 text-white placeholder:text-gray-600 rounded-xl transition-all duration-300"
                    placeholder={t('login.passwordPlaceholder')}
                    disabled={isSubmitting}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications */}
            {sessionExpired && !error && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3 text-amber-200">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-sm">{t('auth.session.sessionExpired')}</span>
              </div>
            )}

            {error && (
              <div className="animate-shake bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-200">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isSubmitting || !username || !password}
              className="w-full h-12 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t('login.authenticating')}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 group">
                  <span>{t('login.accessSystem')}</span>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </Button>
          </form>

          {/* Footer Actions */}
          <div className="space-y-6 pt-4">
            {demoEnabled && (
              <Link
                href="/demo"
                className="block w-full group"
              >
                <div className="relative overflow-hidden rounded-xl bg-white/5 border border-white/10 p-4 transition-all duration-300 hover:bg-white/10 hover:border-white/20">
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-600/20 flex items-center justify-center border border-emerald-500/20">
                        <Sparkles className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-white">{t('login.trialAccountCta')}</p>
                        <p className="text-xs text-gray-400">{t('login.trialAccountDescription')}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            )}

            <div className="text-center">
              <p className="text-sm text-gray-500">
                {t('login.noAccountPrompt')}{' '}
                {registrationEnabled ? (
                  <Link href="/register" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                    {t('login.createAccount', { defaultValue: 'Create an account' })}
                  </Link>
                ) : (
                  <span className="text-gray-400 font-medium">
                    {t('login.contactAdmin')}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="absolute bottom-6 left-0 w-full text-center">
          <p className="text-xs text-gray-600 font-medium">{t('login.footer')}</p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-black text-slate-400">{t('common.loading')}</div>}>
      <LoginForm />
    </Suspense>
  );
}
