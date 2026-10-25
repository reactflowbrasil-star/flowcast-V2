'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mail,
  Server,
  Shield,
  Send,
  Check,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Globe,
  Building2,
  AlertCircle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { API_ENDPOINTS } from '@/constants/api';
import { APP_NAME } from '@/constants/app';
import { AdminSectionHeader } from './AdminSectionHeader';

interface SmtpConfig {
  enabled: boolean;
  host: string | null;
  port: number;
  username: string | null;
  has_password: boolean;
  from_name: string;
  from_email: string | null;
  use_tls: boolean;
  frontend_url: string;
  app_name: string;
}

interface TestResult {
  success: boolean;
  message: string;
}

const SMTP_PRESETS = [
  { id: 'gmail', host: 'smtp.gmail.com', port: 587, tls: true },
  { id: 'outlook', host: 'smtp-mail.outlook.com', port: 587, tls: true },
  { id: 'sendgrid', host: 'smtp.sendgrid.net', port: 587, tls: true },
  { id: 'mailgun', host: 'smtp.mailgun.org', port: 587, tls: true },
  { id: 'amazonSes', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, tls: true },
  { id: 'zoho', host: 'smtp.zoho.com', port: 587, tls: true },
  { id: 'custom', host: '', port: 587, tls: true },
] as const;

export default function EmailSettings() {
  const { t } = useTranslation(['admin', 'translation']);

  const [config, setConfig] = useState<SmtpConfig>({
    enabled: false,
    host: '',
    port: 587,
    username: '',
    has_password: false,
    from_name: APP_NAME,
    from_email: '',
    use_tls: true,
    frontend_url: 'http://localhost:5000',
    app_name: APP_NAME});

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('custom');

  const getPresetLabel = (presetId: string) =>
    t(`admin:email.server.presets.${presetId}`);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<SmtpConfig>(API_ENDPOINTS.ADMIN.SMTP.GET);

      if (response.success && response.data) {
        setConfig(response.data);
        const preset = SMTP_PRESETS.find(p => p.host === response.data.host);
        setSelectedPresetId(preset?.id || 'custom');
      }
    } catch (err) {
      console.error('Failed to fetch SMTP config:', err);
      setError(t('admin:email.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = SMTP_PRESETS.find(p => p.id === presetId);
    if (preset && preset.id !== 'custom') {
      setConfig(prev => ({
        ...prev,
        host: preset.host,
        port: preset.port,
        use_tls: preset.tls}));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const payload: Record<string, unknown> = {
        enabled: config.enabled,
        host: config.host || null,
        port: config.port,
        username: config.username || null,
        from_name: config.from_name,
        from_email: config.from_email || null,
        use_tls: config.use_tls,
        frontend_url: config.frontend_url,
        app_name: config.app_name};

      if (password) {
        payload.password = password;
      }

      const response = await apiClient.put<SmtpConfig>(API_ENDPOINTS.ADMIN.SMTP.UPDATE, payload);

      if (response.success && response.data) {
        setConfig(response.data);
        setPassword('');
        setSuccess(t('admin:email.success.saved'));
      } else {
        setError(response.error?.details || t('admin:email.errors.saveFailed'));
      }
    } catch (err) {
      console.error('Failed to save SMTP config:', err);
      setError(t('admin:email.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) return;

    try {
      setTesting(true);
      setTestResult(null);

      const response = await apiClient.post<TestResult>(API_ENDPOINTS.ADMIN.SMTP.TEST, { test_email: testEmail });

      if (response.success && response.data) {
        setTestResult(response.data);
      } else {
        setTestResult({ success: false, message: response.error?.details || t('admin:email.errors.testFailed') });
      }
    } catch (err) {
      console.error('Failed to test SMTP:', err);
      setTestResult({ success: false, message: t('admin:email.errors.testFailed') });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={Mail}
        title={t('admin:email.title')}
        description={t('admin:email.description')}
        actions={(
          <Button variant="outline" onClick={fetchConfig} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        )}
      />

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-500/10 border-green-500/50 text-green-500">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            {t('admin:email.tabs.settings')}
          </TabsTrigger>
          <TabsTrigger value="test" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            {t('admin:email.tabs.test')}
          </TabsTrigger>
          <TabsTrigger value="info" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            {t('admin:email.tabs.guide')}
          </TabsTrigger>
        </TabsList>

        {/* SMTP Configuration Tab */}
        <TabsContent value="config" className="space-y-6">
          {/* Enable/Disable Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-500" />
                    {t('admin:email.status.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('admin:email.status.description')}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${config.enabled ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {config.enabled ? t('common.enabled') : t('common.disabled')}
                  </span>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* SMTP Server Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-purple-500" />
                {t('admin:email.server.title')}
              </CardTitle>
              <CardDescription>
                {t('admin:email.server.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Presets */}
              <div className="space-y-2">
                <Label>{t('admin:email.server.preset')}</Label>
                <div className="flex flex-wrap gap-2">
                  {SMTP_PRESETS.map(preset => (
                    <Button
                      key={preset.id}
                      variant={selectedPresetId === preset.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePresetChange(preset.id)}
                    >
                      {getPresetLabel(preset.id)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">{t('admin:email.server.host')}</Label>
                  <Input
                    id="host"
                    placeholder={t('admin:email.server.host')}
                    value={config.host || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, host: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">{t('admin:email.server.port')}</Label>
                  <Input
                    id="port"
                    type="number"
                    placeholder="587"
                    value={config.port}
                    onChange={(e) => setConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 587 }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">{t('admin:email.server.username')}</Label>
                  <Input
                    id="username"
                    placeholder={t('admin:email.server.username')}
                    value={config.username || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">
                    {t('admin:email.server.password')}
                    {config.has_password && (
                      <span className="ml-2 text-xs text-green-500">({t('common.saved')})</span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={config.has_password ? '••••••••' : t('admin:email.server.enterPassword')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="tls"
                  checked={config.use_tls}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, use_tls: checked }))}
                />
                <Label htmlFor="tls" className="cursor-pointer">
                  {t('admin:email.server.tls')}
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Email Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-orange-500" />
                {t('admin:email.identity.title')}
              </CardTitle>
              <CardDescription>
                {t('admin:email.identity.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from_name">{t('admin:email.identity.fromName')}</Label>
                  <Input
                    id="from_name"
                    placeholder={APP_NAME}
                    value={config.from_name}
                    onChange={(e) => setConfig(prev => ({ ...prev, from_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from_email">{t('admin:email.identity.fromEmail')}</Label>
                  <Input
                    id="from_email"
                    placeholder={t('admin:email.identity.fromEmail')}
                    value={config.from_email || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, from_email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="app_name">{t('admin:email.identity.appName')}</Label>
                  <Input
                    id="app_name"
                    placeholder={APP_NAME}
                    value={config.app_name}
                    onChange={(e) => setConfig(prev => ({ ...prev, app_name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('admin:email.identity.appNameHint')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frontend_url">{t('admin:email.identity.frontendUrl')}</Label>
                  <Input
                    id="frontend_url"
                    placeholder={t('admin:email.identity.frontendUrl')}
                    value={config.frontend_url}
                    onChange={(e) => setConfig(prev => ({ ...prev, frontend_url: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('admin:email.identity.frontendUrlHint')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {t('admin:email.actions.save')}
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* Test Email Tab */}
        <TabsContent value="test" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-green-500" />
                {t('admin:email.test.title')}
              </CardTitle>
              <CardDescription>
                {t('admin:email.test.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!config.enabled && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('admin:email.test.disabled')}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="test_email">{t('admin:email.test.recipient')}</Label>
                  <Input
                    id="test_email"
                    type="email"
                    placeholder={t('admin:email.test.recipient')}
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleTest}
                    disabled={testing || !testEmail || !config.enabled}
                  >
                    {testing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('admin:email.test.sending')}
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        {t('admin:email.test.send')}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {testResult && (
                <Alert className={testResult.success ? 'bg-green-500/10 border-green-500/50' : 'bg-red-500/10 border-red-500/50'}>
                  <CheckCircle2 className={`h-4 w-4 ${testResult.success ? 'text-green-500' : 'text-red-500'}`} />
                  <AlertDescription className={testResult.success ? 'text-green-500' : 'text-red-500'}>
                    {testResult.message}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Provider Guide Tab */}
        <TabsContent value="info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" />
                {t('admin:email.guide.title')}
              </CardTitle>
              <CardDescription>
                {t('admin:email.guide.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Gmail */}
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4 text-red-500" />
                  {t('admin:email.guide.providers.gmail.title')}
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>{t('admin:email.guide.providers.gmail.steps.1')}</li>
                  <li>{t('admin:email.guide.providers.gmail.steps.2')}</li>
                  <li>{t('admin:email.guide.providers.gmail.steps.3')}</li>
                  <li>{t('admin:email.guide.providers.gmail.steps.4')}</li>
                  <li>{t('admin:email.guide.providers.gmail.steps.5')}</li>
                </ol>
                <div className="text-xs bg-background p-2 rounded font-mono">
                  {t('admin:email.guide.providers.gmail.example')}
                </div>
              </div>

              {/* SendGrid */}
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-500" />
                  {t('admin:email.guide.providers.sendgrid.title')}
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>{t('admin:email.guide.providers.sendgrid.steps.1')}</li>
                  <li>{t('admin:email.guide.providers.sendgrid.steps.2')}</li>
                  <li>{t('admin:email.guide.providers.sendgrid.steps.3')}</li>
                  <li>{t('admin:email.guide.providers.sendgrid.steps.4')}</li>
                  <li>{t('admin:email.guide.providers.sendgrid.steps.5')}</li>
                </ol>
                <div className="text-xs bg-background p-2 rounded font-mono">
                  {t('admin:email.guide.providers.sendgrid.example')}
                </div>
              </div>

              {/* Amazon SES */}
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4 text-orange-500" />
                  {t('admin:email.guide.providers.amazonSes.title')}
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>{t('admin:email.guide.providers.amazonSes.steps.1')}</li>
                  <li>{t('admin:email.guide.providers.amazonSes.steps.2')}</li>
                  <li>{t('admin:email.guide.providers.amazonSes.steps.3')}</li>
                  <li>{t('admin:email.guide.providers.amazonSes.steps.4')}</li>
                </ol>
                <div className="text-xs bg-background p-2 rounded font-mono">
                  {t('admin:email.guide.providers.amazonSes.example')}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
