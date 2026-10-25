'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
   Gift,
   Sparkles,
   Repeat2,
   Loader2,
   ShieldCheck,
   ArrowRight,
   User,
   Lock,
   Mail
} from 'lucide-react';

import giftCodesService, { GiftCodeValidation } from '@/services/giftCodes';
import apiService from '@/services/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { UsernameValidator } from '@/components/ui/username-validator';
import { useUsernameValidation } from '@/hooks/useUsernameValidation';
import { APP_NAME } from '@/constants/app';
import { changeLanguageWithPreload } from '@/lib/i18n';

type RedeemAction = 'create' | 'extend';

interface ResultState {
   message: string;
   tone: 'success' | 'error';
}

const formatDateTime = (value?: string | null) => {
   if (!value) return '—';
   const parsed = new Date(value);
   if (Number.isNaN(parsed.getTime())) {
      return value;
   }
   return parsed.toLocaleString();
};

export default function RedeemPage() {
   const { t, i18n } = useTranslation();
   const [lang, setLang] = useState(i18n.language || 'en');

   const [step, setStep] = useState<number>(1);
   const [code, setCode] = useState('');
   const [validation, setValidation] = useState<GiftCodeValidation | null>(null);
   const [action, setAction] = useState<RedeemAction>('create');

   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const [email, setEmail] = useState('');
   const usernameCheck = useUsernameValidation(username, { debounceMs: 300 });

   const [loading, setLoading] = useState(false);
   const [result, setResult] = useState<ResultState | null>(null);

   // Categories for selection on create flow
   interface Category {
      id: number;
      name: string;
      category_type?: string;
   }
   const [categories, setCategories] = useState<Category[]>([]);
   const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);

   useEffect(() => {
      // When we reach step 2, load public categories so user can pick allowed ones
      if (step === 2 && categories.length === 0) {
         apiService
            .get<Category[]>('/api/public/content/categories')
            .then((res: any) => {
               if (res?.success && Array.isArray(res.data)) {
                  setCategories(res.data);
               } else if (Array.isArray(res)) {
                  // Fallback in case apiService returns raw array
                  setCategories(res as unknown as Category[]);
               }
            })
            .catch(() => {
               // non-blocking
            });
      }
   }, [step, categories.length]);

   const actionOptions = useMemo(
      () => [
         {
            value: 'create' as RedeemAction,
            label: t('redeem.action.create'),
            description: t('redeem.action.create_description'),
            icon: Sparkles
         },
         {
            value: 'extend' as RedeemAction,
            label: t('redeem.action.extend'),
            description: t('redeem.action.extend_description'),
            icon: Repeat2
         },
      ],
      [t],
   );

   const changeLanguage = (nextLang: string) => {
      setLang(nextLang);
      changeLanguageWithPreload(nextLang).catch(() => { });
   };

   const resetSensitiveFields = () => {
      setUsername('');
      setPassword('');
      setEmail('');
   };

   const handleVerify = async () => {
      if (!code.trim()) {
         toast.error(t('redeem.form.emptyCode'));
         return;
      }

      setLoading(true);
      setResult(null);

      try {
         const res = await giftCodesService.validateCode({ code: code.trim() });
         if (res.success && res.data) {
            setValidation(res.data);
            setAction('create');
            resetSensitiveFields();
            setStep(2);
            toast.success(t('redeem.validCode'));
         } else {
            const err = res.error?.details || res.error?.error || t('redeem.invalidCode');
            toast.error(err);
            setResult({ message: err, tone: 'error' });
         }
      } catch (err: any) {
         const message = err?.message || t('redeem.error.generic');
         toast.error(message);
         setResult({ message, tone: 'error' });
      } finally {
         setLoading(false);
      }
   };

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setResult(null);

      if (action === 'create') {
         if (!username || !password) {
            const message = t('redeem.form.createMissing');
            toast.error(message);
            setResult({ message, tone: 'error' });
            return;
         }
      } else if (!username) {
         const message = t('redeem.form.extendMissing');
         toast.error(message);
         setResult({ message, tone: 'error' });
         return;
      }

      setLoading(true);

      try {
         const payload: Record<string, unknown> = {
            action,
            code: code.trim(),
            username: username.trim()
         };
         if (action === 'create') {
            payload.password = password;
            payload.email = email ? email.trim() : undefined;
            if (selectedCategoryIds.length > 0) {
               payload.category_ids = selectedCategoryIds;
            }
         }

         const res = await giftCodesService.redeem(payload as any);
         if (res.success && res.data) {
            const message = res.data.message || t('redeem.success');
            toast.success(message);
            setResult({ message, tone: 'success' });

            resetSensitiveFields();
            setCode('');
            setValidation(null);
            setAction('create');
            setStep(1);
         } else {
            const err = res.error?.details || res.error?.error || t('redeem.error.submit');
            toast.error(err);
            setResult({ message: err, tone: 'error' });
         }
      } catch (err: any) {
         const message = err?.message || t('redeem.error.submit');
         toast.error(message);
         setResult({ message, tone: 'error' });
      } finally {
         setLoading(false);
      }
   };

   return (
      <div className="min-h-screen w-full bg-[#0b0e14] text-white flex overflow-hidden font-sans">

         {/* Left Side - Premium Gift Showcase */}
         <div className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center overflow-hidden bg-[#05070a]">
            {/* Ambient Background */}
            <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] bg-cyan-600/20 rounded-full blur-[120px] animate-pulse delay-1000 pointer-events-none" />

            {/* Floating Particles */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#0b0e14_100%)] opacity-80"></div>

            {/* 3D Floating Gift Card */}
            <div className="relative z-10 perspective-1000 group">
               <div className="relative w-[380px] h-[580px] transition-transform duration-700 ease-out transform group-hover:rotate-y-12 group-hover:rotate-x-6 preserve-3d">
                  {/* Card Glow */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-blue-600 rounded-[32px] blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>

                  {/* Main Card Body */}
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[30px] shadow-2xl flex flex-col items-center justify-between p-10 overflow-hidden">
                     {/* Internal Shine */}
                     <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50 pointer-events-none"></div>

                     {/* Top Decoration */}
                     <div className="w-full flex justify-between items-center opacity-50">
                        <Sparkles className="w-8 h-8 text-cyan-300" />
                        <div className="text-xs font-mono tracking-widest text-cyan-200/70">{t('redeem.badge')}</div>
                     </div>

                     {/* Central Icon */}
                     <div className="relative">
                        <div className="absolute inset-0 bg-cyan-500/30 blur-[60px] rounded-full"></div>
                        <Gift className="relative w-32 h-32 text-white drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]" strokeWidth={1} />
                     </div>

                     {/* Bottom Info */}
                     <div className="w-full space-y-4 text-center z-10">
                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                        <div>
                           <h2 className="text-2xl font-bold text-white tracking-tight">{t('redeem.title')}</h2>
                           <p className="text-cyan-200/60 text-sm mt-2">{t('redeem.description')}</p>
                        </div>
                        <div className="flex justify-center gap-2 pt-2">
                           <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                           <div className="w-2 h-2 rounded-full bg-white/20"></div>
                           <div className="w-2 h-2 rounded-full bg-white/20"></div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            <div className="absolute bottom-12 left-0 w-full text-center z-20">
               <p className="text-white/30 text-xs tracking-[0.2em] uppercase">{APP_NAME} Entertainment</p>
            </div>
         </div>

         {/* Right Side - Redemption Form */}
         <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-12 relative z-10 bg-[#0b0e14]/95">
            <div className="w-full max-w-[480px] space-y-8">

               {/* Header */}
               <div className="space-y-2 text-center lg:text-left">
                  <div className="flex items-center justify-center lg:justify-start gap-3 mb-6">
                     <div className="p-2.5 rounded-xl bg-cyan-950/50 border border-cyan-800/50">
                        <Gift className="w-6 h-6 text-cyan-400" />
                     </div>
                     <h1 className="text-2xl font-bold text-white tracking-tight">{t('redeem.title')}</h1>
                  </div>

                  {step === 1 ? (
                     <p className="text-gray-400 text-lg">
                        {t('redeem.step1.helper')}
                     </p>
                  ) : (
                     <p className="text-gray-400 text-lg">
                        {t('redeem.step2.subtitle')}
                     </p>
                  )}
               </div>

               {/* Main Content */}
               <div className="space-y-6">
                  {step === 1 && (
                     <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                        <div className="space-y-2">
                           <Label htmlFor="code" className="text-gray-300 text-xs uppercase tracking-wider font-semibold ml-1">
                              {t('redeem.form.codeLabel')}
                           </Label>
                           <div className="relative group">
                              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                 <ShieldCheck className="h-5 w-5 text-gray-500 group-focus-within:text-cyan-400 transition-colors" />
                              </div>
                              <Input
                                 id="code"
                                 value={code}
                                 onChange={(e) => setCode(e.target.value)}
                                 placeholder={t('redeem.form.codePlaceholder')}
                                 className="pl-12 h-14 bg-white/5 border-white/10 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 text-white placeholder:text-gray-600 rounded-xl text-lg tracking-wide font-mono transition-all"
                                 autoComplete="off"
                                 autoFocus
                              />
                           </div>
                        </div>

                        <Button
                           onClick={handleVerify}
                           disabled={loading || !code}
                           className="w-full h-14 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 transition-all"
                        >
                           {loading ? (
                              <div className="flex items-center gap-2">
                                 <Loader2 className="h-5 w-5 animate-spin" />
                                 <span>{t('redeem.checking')}</span>
                              </div>
                           ) : (
                              <div className="flex items-center gap-2">
                                 <span>{t('redeem.verify')}</span>
                                 <ArrowRight className="h-5 w-5" />
                              </div>
                           )}
                        </Button>
                     </div>
                  )}

                  {step === 2 && validation && (
                     <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">

                        {/* Code Details Card */}
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                           <div className="flex items-center justify-between border-b border-white/10 pb-4">
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                                    <Gift className="w-5 h-5" />
                                 </div>
                                 <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{t('redeem.detail.duration_days')}</p>
                                    <p className="text-white font-medium">{validation.duration_days}</p>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{t('redeem.detail.expires_at')}</p>
                                 <p className="text-white font-medium">{formatDateTime(validation.expires_at)}</p>
                              </div>
                           </div>

                           <div className="grid grid-cols-2 gap-3">
                              {actionOptions.map((opt) => (
                                 <button
                                    key={opt.value}
                                    onClick={() => setAction(opt.value)}
                                    className={cn(
                                       "p-3 rounded-xl border text-left transition-all",
                                       action === opt.value
                                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                                          : "border-white/5 bg-transparent text-gray-400 hover:bg-white/5"
                                    )}
                                 >
                                    <div className="flex items-center gap-2 mb-1">
                                       <opt.icon className={cn("w-4 h-4", action === opt.value ? "text-cyan-400" : "text-gray-500")} />
                                       <span className="text-sm font-medium">{opt.label}</span>
                                    </div>
                                 </button>
                              ))}
                           </div>
                        </div>

                        {/* Form Fields */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                           {action === 'create' ? (
                              <>
                                 <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                       <div className="space-y-2">
                                          <Label className="text-gray-300 ml-1 text-xs uppercase tracking-wider">{t('redeem.form.username')}</Label>
                                          <div className="relative">
                                             <User className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                                             <Input
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                className="pl-10 bg-white/5 border-white/10 h-11 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                                                placeholder={t('redeem.form.usernamePlaceholder')}
                                             />
                                          </div>
                                          <UsernameValidator validation={usernameCheck} />
                                       </div>
                                       <div className="space-y-2">
                                          <Label className="text-gray-300 ml-1 text-xs uppercase tracking-wider">{t('redeem.form.password')}</Label>
                                          <div className="relative">
                                             <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                                             <Input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="pl-10 bg-white/5 border-white/10 h-11 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                                                placeholder={t('redeem.form.passwordPlaceholder')}
                                             />
                                          </div>
                                       </div>
                                    </div>
                                    <div className="space-y-2">
                                       <Label className="text-gray-300 ml-1 text-xs uppercase tracking-wider">{t('redeem.form.emailOptional')}</Label>
                                       <div className="relative">
                                          <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                                          <Input
                                             type="email"
                                             value={email}
                                             onChange={(e) => setEmail(e.target.value)}
                                             className="pl-10 bg-white/5 border-white/10 h-11 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                                             placeholder={t('redeem.form.emailPlaceholder')}
                                          />
                                       </div>
                                    </div>
                                 </div>

                                 {/* Categories */}
                                 {categories.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                       <Label className="text-gray-300 ml-1 text-xs uppercase tracking-wider">{t('redeem.form.categories')}</Label>
                                       <div className="flex flex-wrap gap-2">
                                          {categories.map((cat) => (
                                             <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setSelectedCategoryIds(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id])}
                                                className={cn(
                                                   "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                                   selectedCategoryIds.includes(cat.id)
                                                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                                                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                                                )}
                                             >
                                                {cat.name}
                                             </button>
                                          ))}
                                       </div>
                                    </div>
                                 )}
                              </>
                           ) : (
                              <div className="space-y-2">
                                 <Label className="text-gray-300 ml-1 text-xs uppercase tracking-wider">{t('redeem.form.existingUsername')}</Label>
                                 <div className="relative">
                                    <User className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                                    <Input
                                       value={username}
                                       onChange={(e) => setUsername(e.target.value)}
                                       className="pl-10 bg-white/5 border-white/10 h-11 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                                       placeholder={t('redeem.form.existingUsername')}
                                    />
                                 </div>
                              </div>
                           )}

                           <div className="flex gap-3 pt-4">
                              <Button
                                 type="button"
                                 variant="ghost"
                                 onClick={() => setStep(1)}
                                 className="flex-1 h-12 border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl"
                              >
                                 {t('common.back')}
                              </Button>
                              <Button
                                 type="submit"
                                 disabled={loading || (action === 'create' && !usernameCheck.isValid)}
                                 className="flex-[2] h-12 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-900/20"
                              >
                                 {loading ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                 ) : (
                                    <span className="flex items-center gap-2">
                                       <Sparkles className="w-4 h-4" />
                                       {t('redeem.title')}
                                    </span>
                                 )}
                              </Button>
                           </div>
                        </form>
                     </div>
                  )}

                  {result && (
                     <Alert variant={result.tone === 'error' ? 'destructive' : 'default'} className={cn("border-l-4 mt-6", result.tone === 'error' ? "border-l-red-500 border-white/10 bg-red-500/10" : "border-l-emerald-500 border-white/10 bg-emerald-500/10")}>
                        <AlertTitle className={cn(result.tone === 'error' ? "text-red-400" : "text-emerald-400")}>
                           {result.tone === 'error'
                              ? t('redeem.result.errorTitle')
                              : t('redeem.result.successTitle')}
                        </AlertTitle>
                        <AlertDescription className={cn(result.tone === 'error' ? "text-red-200/80" : "text-emerald-200/80")}>{result.message}</AlertDescription>
                     </Alert>
                  )}

                  {/* Language Selector Footer */}
                  <div className="pt-8 flex justify-center">
                     <Select value={lang} onValueChange={changeLanguage}>
                        <SelectTrigger className="w-[140px] h-9 border-white/10 bg-white/5 text-xs text-gray-400 rounded-full">
                           <SelectValue placeholder={t('common.language')} />
                        </SelectTrigger>
                        <SelectContent align="center" className="border-white/10 bg-[#0b0e14] text-gray-300">
                           <SelectItem value="en">{t('languages.english')}</SelectItem>
                           <SelectItem value="es">{t('languages.spanish')}</SelectItem>
                           <SelectItem value="fr">{t('languages.french')}</SelectItem>
                           <SelectItem value="pt">{t('languages.portuguese')}</SelectItem>
                           <SelectItem value="ru">{t('languages.russian')}</SelectItem>
                           <SelectItem value="tr">{t('languages.turkish')}</SelectItem>
                           <SelectItem value="sk">{t('languages.slovak')}</SelectItem>
                           <SelectItem value="zh">{t('languages.chinese')}</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
}
