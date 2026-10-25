'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save, Settings } from 'lucide-react';

export type LoginBackdropsCardProps = {
  t: (key: string, options?: Record<string, any>) => string;
  loginSeriesBackdrops: string;
  setLoginSeriesBackdrops: (value: string) => void;
  loginMoviesBackdrops: string;
  setLoginMoviesBackdrops: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
};

export default function LoginBackdropsCard({
  t,
  loginSeriesBackdrops,
  setLoginSeriesBackdrops,
  loginMoviesBackdrops,
  setLoginMoviesBackdrops,
  onSave,
  isSaving}: LoginBackdropsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t('systemConfiguration.forms.loginBackdropsTitle', {})}
        </CardTitle>
        <CardDescription>
          {t('systemConfiguration.forms.loginBackdropsDescription', {})}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-series-backdrops">
            {t('systemConfiguration.forms.loginSeriesBackdropsLabel', {})}
          </Label>
          <Textarea
            id="login-series-backdrops"
            value={loginSeriesBackdrops}
            onChange={(e) => setLoginSeriesBackdrops(e.target.value)}
            placeholder="/backdrops/backdrop-1.png,\n/backdrops/backdrop-2.png"
            className="min-h-28"
          />
          <p className="text-xs text-muted-foreground">
            {t('systemConfiguration.forms.loginBackdropsHelp', {})}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-movies-backdrops">
            {t('systemConfiguration.forms.loginMoviesBackdropsLabel', {})}
          </Label>
          <Textarea
            id="login-movies-backdrops"
            value={loginMoviesBackdrops}
            onChange={(e) => setLoginMoviesBackdrops(e.target.value)}
            placeholder="/backdrops/backdrop-3.png,\n/backdrops/backdrop-4.png"
            className="min-h-28"
          />
        </div>

        <Button onClick={onSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving
            ? t('common.saving', {})
            : t('systemConfiguration.forms.saveLoginBackdrops', {})}
        </Button>
      </CardContent>
    </Card>
  );
}
