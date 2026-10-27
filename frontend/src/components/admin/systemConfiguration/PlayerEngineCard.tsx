'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Video, Save } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '@/services/api';
import { DEFAULT_PLAYER_ENGINE, notifyPlayerEngineUpdated, PLAYER_ENGINES, type PlayerEngine } from '@/lib/playerEngine';

type Props = { t: (key: string, options?: any) => string };

export default function PlayerEngineCard({ t }: Props) {
  const [engine, setEngine] = useState<PlayerEngine>(DEFAULT_PLAYER_ENGINE);
  const [savedEngine, setSavedEngine] = useState<PlayerEngine>(DEFAULT_PLAYER_ENGINE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiService.get<Record<string, string>>('/api/admin/config').then((result) => {
      if (!active) return;
      const configured = result.success ? result.data?.player_engine : undefined;
      if (PLAYER_ENGINES.includes(configured as PlayerEngine)) {
        setEngine(configured as PlayerEngine);
        setSavedEngine(configured as PlayerEngine);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    const result = await apiService.put('/api/admin/config', { key: 'player_engine', value: engine });
    setSaving(false);
    if (!result.success) {
      toast.error(t('systemConfiguration.playerSaveFailed'));
      return;
    }
    setSavedEngine(engine);
    notifyPlayerEngineUpdated(engine);
    toast.success(t('systemConfiguration.playerSaved'));
  };

  const optionKeys: Record<PlayerEngine, string> = {
    auto: 'playerOptions.auto',
    hlsjs: 'playerOptions.hlsjs',
    shaka: 'playerOptions.shaka',
    videojs: 'playerOptions.videojs',
    native: 'playerOptions.native',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          {t('systemConfiguration.playerTitle')}
        </CardTitle>
        <CardDescription>{t('systemConfiguration.playerDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="preferred-player">{t('systemConfiguration.playerSelectLabel')}</Label>
          <Select value={engine} onValueChange={(value) => setEngine(value as PlayerEngine)} disabled={loading || saving}>
            <SelectTrigger id="preferred-player" aria-label={t('systemConfiguration.playerSelectLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAYER_ENGINES.map((value) => (
                <SelectItem key={value} value={value}>{t(`systemConfiguration.${optionKeys[value]}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('systemConfiguration.playerHelp')}</p>
        </div>
        <Button onClick={save} disabled={loading || saving || engine === savedEngine}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? t('systemConfiguration.playerSaving') : t('systemConfiguration.playerSave')}
        </Button>
      </CardContent>
    </Card>
  );
}
