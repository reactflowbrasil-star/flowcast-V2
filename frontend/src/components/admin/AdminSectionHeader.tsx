'use client';

import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminSectionHeaderProps {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function AdminSectionHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
  bodyClassName
}: AdminSectionHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="space-y-1">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className={cn('space-y-1', bodyClassName)}>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
            {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
          </div>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
