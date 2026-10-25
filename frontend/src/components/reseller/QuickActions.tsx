'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { 
  UserPlus, 
  Smartphone, 
  CreditCard, 
  LifeBuoy, 
  Clock, 
  Users,
  ChevronRight
} from 'lucide-react';

interface QuickAction {
  label: string;
  description: string;
  icon: React.ElementType;
  action: () => void;
  color: string;
}

interface QuickActionsProps {
  onAction: (view: string) => void;
}

export default function QuickActions({ onAction }: QuickActionsProps) {
  const { t } = useTranslation('reseller');
  const actions: QuickAction[] = [
    {
      label: t('quickActions.createUser'),
      description: t('quickActions.addNewSubscriber'),
      icon: UserPlus,
      action: () => onAction('create-user'),
      color: "text-blue-600"
    },
    {
      label: t('quickActions.issueDemo'),
      description: t('quickActions.generateTrialAccount'),
      icon: Clock,
      action: () => onAction('create-demo'),
      color: "text-orange-600"
    },
    {
      label: t('quickActions.manageDevices'),
      description: t('quickActions.resetOrKillSessions'),
      icon: Smartphone,
      action: () => onAction('devices'),
      color: "text-violet-600"
    },
    {
      label: t('quickActions.userList'),
      description: t('quickActions.viewAllSubscribers'),
      icon: Users,
      action: () => onAction('users'),
      color: "text-emerald-600"
    },
    {
      label: t('quickActions.buyCredits'),
      description: t('quickActions.topUpWallet'),
      icon: CreditCard,
      action: () => onAction('credits'),
      color: "text-indigo-600"
    },
    {
      label: t('quickActions.support'),
      description: t('quickActions.openTicket'),
      icon: LifeBuoy,
      action: () => onAction('tickets'),
      color: "text-rose-600"
    }
  ];

  return (
    <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-3">
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={action.action}
          className="group relative flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-card hover:bg-accent/50 border rounded-lg sm:rounded-xl transition-all text-center sm:text-left shadow-sm hover:shadow-md"
        >
          <div className={`p-2 sm:p-3 rounded-lg bg-background shadow-sm ring-1 ring-border group-hover:ring-foreground/10 transition-all`}>
            <action.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${action.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-xs sm:text-sm truncate">{action.label}</h3>
            <p className="text-[10px] sm:text-sm text-muted-foreground hidden sm:block">{action.description}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors hidden sm:block" />
        </button>
      ))}
    </div>
  );
}
