'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Sparkles,
  Clock,
  CheckCircle2,
  Loader2,
  ArrowRight,
  User,
  Lock,
  Mail
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { changeLanguageWithPreload } from '@/lib/i18n';
import { contentService } from '@/services/content';
import type { Category } from '@/types';

type ResultTone = 'success' | 'error';

interface ResultMessage {
  tone: ResultTone;
  message: string;
}

const createInitialState = () => ({
  username: '',
  password: '',
  email: ''
});

export default function DemoSignup() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [lang, setLang] = useState(i18n.language || 'en');

  useEffect(() => {
    setLang(i18n.language || 'en');
  }, [i18n.language]);

  const changeLanguage = (nextLang: string) => {
    setLang(nextLang);
    changeLanguageWithPreload(nextLang)
      .then(() => {
        try {
          localStorage.setItem('iptv_language', nextLang);
        } catch {
          // Ignore storage errors
        }
      })
      .catch(() => { });
  };

  const [form, setForm] = useState(createInitialState);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [result, setResult] = useState<ResultMessage | null>(null);
  const [demoConfig, setDemoConfig] = useState<{ demo_enabled: boolean; duration_hours: number }>({ demo_enabled: true, duration_hours: 12 });

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/demo/status');
        if (res.ok) {
          const data = await res.json();
          setDemoConfig({
            demo_enabled: data.demo_enabled,
            duration_hours: data.duration_hours || 12
          });
        }
      } catch {
        // Use defaults
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoadingCategories(true);
      try {
        const res = await contentService.getCategories();
        if (res.success && res.data) {
          setCategories(res.data);
          setSelectedCategories((prev) =>
            prev.filter((id) => res.data.some((category) => category.id === id)),
          );
        }
      } catch {
        // Ignore errors
      } finally {
        setLoadingCategories(false);
      }
    };

    load();
  }, []);

  const toggleCategory = (id: number) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const categorySummary = useMemo(() => {
    if (!selectedCategories.length) {
      return t('demo.categoriesAll');
    }
    return t('demo.categoriesSelected', {
      count: selectedCategories.length
    });
  }, [selectedCategories, t]);

  async function submitDemo(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const payload = {
        username: form.username,
        password: form.password,
        email: form.email || undefined,
        category_ids: selectedCategories.length ? selectedCategories : undefined
      };

      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 201) {
        const successMessage = t('demo.successMessage');

        toast.success(successMessage);
        setResult({ tone: 'success', message: successMessage });
        setForm(createInitialState());
        setSelectedCategories([]);

        setTimeout(() => {
          router.push('/login');
        }, 1000);
      } else {
        const txt = await res.text();
        const message = txt || t('demo.failedCreate');
        toast.error(message);
        setResult({ tone: 'error', message });
      }
    } catch (err) {
      const message = String(err);
      toast.error(message);
      setResult({ tone: 'error', message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dark relative min-h-screen w-full overflow-hidden bg-[#0b0e14] text-white font-sans flex flex-col items-center justify-center p-4">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px] animate-pulse delay-700 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#0b0e14_90%)] pointer-events-none" />

      <div className="relative z-10 w-full max-w-4xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cyan-400 backdrop-blur-sm">
            <Sparkles className="size-3.5" />
            {t('demo.badge')}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl">
            {t('demo.signupTitle')}
          </h1>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
            {t('demo.signupSubtitle', {
              hours: demoConfig.duration_hours
            })}
          </p>
        </div>

        <Card className="border border-white/10 bg-black/20 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-4 border-b border-white/10 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-semibold text-white">
                  {t('demo.formTitle')}
                </CardTitle>
                <CardDescription className="text-gray-400">
                  {t('demo.formSubtitle')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Select value={lang} onValueChange={changeLanguage}>
                  <SelectTrigger className="w-[130px] h-9 border-white/10 bg-white/5 text-xs text-gray-300">
                    <SelectValue placeholder={t('common.language')} />
                  </SelectTrigger>
                  <SelectContent align="end" className="border-white/10 bg-[#0b0e14] text-gray-300">
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

                <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
                  <Clock className="size-3.5" />
                  {t('demo.durationValue', { hours: demoConfig.duration_hours })}
                </div>
              </div>
            </div>

            <div className="hidden sm:block mt-2 rounded-xl border border-dashed border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-400">
                    <CheckCircle2 className="size-4" />
                  </div>
                  <p className="text-sm text-gray-300">
                    {t('demo.durationExplanation', { hours: demoConfig.duration_hours })}
                  </p>
                </div>
                {selectedCategories.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCategories([])}
                    className="h-8 text-xs text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    {t('demo.clearCategories')}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <form onSubmit={submitDemo}>
            <CardContent className="space-y-8 p-6 sm:p-8">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="demo-username" className="text-gray-300 ml-1">{t('common.username')}</Label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <Input
                          id="demo-username"
                          value={form.username}
                          onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                          className="pl-10 h-11 border-white/10 bg-white/5 text-white placeholder:text-gray-600 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                          placeholder={t('login.usernamePlaceholder')}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-password" className="text-gray-300 ml-1">{t('common.password')}</Label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock className="h-4 w-4 text-gray-500" />
                        </div>
                        <Input
                          id="demo-password"
                          type="password"
                          value={form.password}
                          onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                          className="pl-10 h-11 border-white/10 bg-white/5 text-white placeholder:text-gray-600 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                          placeholder={t('login.passwordPlaceholder')}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-email" className="text-gray-300 ml-1">
                        {t('common.email')}{' '}
                        <span className="text-gray-600 text-xs font-normal">
                          ({t('common.optional')})
                        </span>
                      </Label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Mail className="h-4 w-4 text-gray-500" />
                        </div>
                        <Input
                          id="demo-email"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                          className="pl-10 h-11 border-white/10 bg-white/5 text-white placeholder:text-gray-600 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                          placeholder={t('demo.emailPlaceholder')}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium text-gray-200">
                        {t('demo.categoriesLabel')}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">{categorySummary}</p>
                    </div>
                    <Badge variant="secondary" className="bg-white/10 text-gray-300 hover:bg-white/20">{selectedCategories.length}</Badge>
                  </div>

                  <div className="h-[250px] overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {loadingCategories ? (
                      <div className="flex h-full items-center justify-center text-sm text-gray-500">
                        <span className="flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          {t('common.loading')}
                        </span>
                      </div>
                    ) : categories.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-gray-500">
                        {t('demo.noCategories')}
                      </div>
                    ) : (
                      categories.map((cat) => {
                        const selected = selectedCategories.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => toggleCategory(cat.id)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-all',
                              selected
                                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                                : 'border-white/5 bg-black/20 text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-gray-300',
                            )}
                          >
                            <span className="truncate">{cat.name}</span>
                            {selected && <CheckCircle2 className="size-4 text-cyan-400" />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <p className="text-[10px] text-gray-600 text-center">
                    {t('demo.categoriesHelp')}
                  </p>
                </div>
              </div>

              {result && (
                <Alert variant={result.tone === 'error' ? 'destructive' : 'default'} className={cn("border-l-4", result.tone === 'error' ? "border-l-red-500 border-white/10 bg-red-500/10" : "border-l-emerald-500 border-white/10 bg-emerald-500/10")}>
                  <AlertTitle className={cn(result.tone === 'error' ? "text-red-400" : "text-emerald-400")}>
                    {result.tone === 'error'
                      ? t('demo.errorTitle')
                      : t('demo.successTitle')}
                  </AlertTitle>
                  <AlertDescription className={cn(result.tone === 'error' ? "text-red-200/80" : "text-emerald-200/80")}>{result.message}</AlertDescription>
                </Alert>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4 border-t border-white/10 bg-white/5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-gray-500 sm:max-w-xs">
                {t('demo.footerNote')}
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all hover:shadow-blue-900/40"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {t('demo.creating')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-4" />
                    {t('demo.createButton')}
                    <ArrowRight className="size-4" />
                  </span>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
