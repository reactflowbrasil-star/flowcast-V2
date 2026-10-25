'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings } from 'lucide-react';

export type ContentDisplayCardProps = {
  t: (key: string, options?: Record<string, any>) => string;
  config: any;
  parseBoolConfig: (val: unknown) => boolean;
  isUpdating: boolean;
  onToggleHideEmpty: () => void;
};

export default function ContentDisplayCard({
  t,
  config,
  parseBoolConfig,
  isUpdating,
  onToggleHideEmpty}: ContentDisplayCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t('systemConfiguration.contentDisplayTitle', {})}
        </CardTitle>
        <CardDescription>
          {t('systemConfiguration.contentDisplayDescription', {})}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <Label className="text-sm font-medium">{t('systemConfiguration.hideEmptyEpisodesLabel', {})}</Label>
            <p className="text-xs text-muted-foreground">{t('systemConfiguration.hideEmptyEpisodesDescription', {})}</p>
          </div>
          <Switch
            checked={parseBoolConfig((config as any).hide_empty_episodes) === false ? false : (config as any).hide_empty_episodes === 'true'}
            onCheckedChange={onToggleHideEmpty}
            aria-label={t('systemConfiguration.hideEmptyEpisodesLabel')}
            disabled={isUpdating}
          />
        </div>
      </CardContent>
    </Card>
  );
}
