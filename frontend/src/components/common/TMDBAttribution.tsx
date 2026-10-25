'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface TMDBAttributionProps {
  className?: string;
}

export default function TMDBAttribution({ className }: TMDBAttributionProps) {
  const { t } = useTranslation();

  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      {t('common.tmdbAttribution', {
      })}
    </p>
  );
}
