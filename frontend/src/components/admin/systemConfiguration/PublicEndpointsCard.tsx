'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Settings } from 'lucide-react';

export type PublicEndpointsCardProps = {
  t: (key: string, options?: Record<string, any>) => string;
  config: any;
  parseBoolConfig: (val: unknown) => boolean;
  toggleConfig: (key: string, current: boolean) => void;
  isUpdating: boolean;
};

export default function PublicEndpointsCard({
  t,
  config,
  parseBoolConfig,
  toggleConfig,
  isUpdating }: PublicEndpointsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t('systemConfiguration.publicEndpointsTitle', {})}
        </CardTitle>
        <CardDescription>
          {t('systemConfiguration.publicEndpointsDescription', {})}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <Label className="text-sm font-medium">{t('systemConfiguration.publicDemoLabel', {})}</Label>
            <p className="text-xs text-muted-foreground">{t('systemConfiguration.publicDemoDescription', {})}</p>
          </div>
          <Switch
            checked={parseBoolConfig((config as any).public_demo_enabled)}
            onCheckedChange={() => toggleConfig('public_demo_enabled', parseBoolConfig((config as any).public_demo_enabled))}
            aria-label={t('systemConfiguration.publicDemoLabel')}
            disabled={isUpdating}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <Label className="text-sm font-medium">{t('systemConfiguration.publicRedeemLabel', {})}</Label>
            <p className="text-xs text-muted-foreground">{t('systemConfiguration.publicRedeemDescription', {})}</p>
          </div>
          <Switch
            checked={parseBoolConfig((config as any).public_redeem_enabled)}
            onCheckedChange={() => toggleConfig('public_redeem_enabled', parseBoolConfig((config as any).public_redeem_enabled))}
            aria-label={t('systemConfiguration.publicRedeemLabel')}
            disabled={isUpdating}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <Label className="text-sm font-medium">{t('systemConfiguration.directRegistrationLabel', { defaultValue: 'Allow Direct Registration' })}</Label>
            <p className="text-xs text-muted-foreground">{t('systemConfiguration.directRegistrationDescription', { defaultValue: 'Allow end users to create accounts directly from the login page.' })}</p>
          </div>
          <Switch
            checked={parseBoolConfig((config as any).allow_direct_registration)}
            onCheckedChange={() => toggleConfig('allow_direct_registration', parseBoolConfig((config as any).allow_direct_registration))}
            aria-label={t('systemConfiguration.directRegistrationLabel', { defaultValue: 'Allow Direct Registration' })}
            disabled={isUpdating}
          />
        </div>
      </CardContent>
    </Card>
  );
}
