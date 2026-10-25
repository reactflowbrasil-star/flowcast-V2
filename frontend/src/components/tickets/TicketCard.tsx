'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MessageSquare, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Pause,
  Calendar,
  Hash,
  Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface Ticket {
  id: number;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  creator_username: string;
  created_at: string;
  updated_at: string;
  has_unread: boolean;
  unread_count: number;
}

interface TicketCardProps {
  ticket: Ticket;
  onOpenChat: (ticketId: number) => void;
  className?: string;
}

const statusConfig = {
  open: {
    icon: AlertCircle,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/20',
    labelKey: 'tickets.status.open'
  },
  in_progress: {
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    labelKey: 'tickets.status.in_progress'
  },
  resolved: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    labelKey: 'tickets.status.resolved'
  },
  closed: {
    icon: XCircle,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    borderColor: 'border-muted',
    labelKey: 'tickets.status.closed'
  },
  on_hold: {
    icon: Pause,
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    labelKey: 'tickets.status.on_hold'
  }
};

const priorityConfig = {
  low: {
    color: 'bg-muted text-muted-foreground border-muted',
    icon: '●',
    iconColor: 'text-muted-foreground'
  },
  medium: {
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    icon: '●',
    iconColor: 'text-yellow-600'
  },
  high: {
    color: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    icon: '●',
    iconColor: 'text-orange-600'
  },
  urgent: {
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    icon: '●',
    iconColor: 'text-destructive'
  }
};

export default function TicketCard({ ticket, onOpenChat, className }: TicketCardProps) {
  const { t } = useTranslation();
  const status = statusConfig[ticket.status as keyof typeof statusConfig] || statusConfig.open;
  const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const StatusIcon = status.icon;

  const getUserInitials = (username: string) => {
    return username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return t('ticketCard.justNow');
    if (diffInMinutes < 60) return t('feedback.time.minutesAgo', { count: diffInMinutes });
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return t('feedback.time.hoursAgo', { count: diffInHours });
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return t('feedback.time.daysAgo', { count: diffInDays });
    
    return date.toLocaleDateString();
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Card className={cn(
      'group hover:shadow-md transition-all duration-200 cursor-pointer border-l-4',
      status.borderColor,
      ticket.has_unread && 'ring-2 ring-primary/20',
      className
    )}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-full', status.bgColor)}>
              <StatusIcon className={cn('h-4 w-4', status.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm text-muted-foreground flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {ticket.ticket_number}
                </span>
                {ticket.has_unread && (
                  <div className="relative">
                    <Bell className="h-4 w-4 text-destructive animate-pulse" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full"></div>
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {truncateText(ticket.title, 50)}
              </h3>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-xs border', status.color, status.bgColor)}>
              {t(status.labelKey)}
            </Badge>
            <Badge variant="outline" className={cn('text-xs border', priority.color)}>
              <span className={cn('mr-1', priority.iconColor)}>{priority.icon}</span>
              {t(`ticketCard.priority.${ticket.priority}`, { defaultValue: ticket.priority.toUpperCase() })}
            </Badge>
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
          {truncateText(ticket.description, 120)}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                  {getUserInitials(ticket.creator_username)}
                </AvatarFallback>
              </Avatar>
              <span>{ticket.creator_username}</span>
            </div>
            
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{formatTimeAgo(ticket.created_at)}</span>
            </div>

            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{t('ticketCard.updatedAt', { time: formatTimeAgo(ticket.updated_at) })}</span>
            </div>
          </div>

          <Button
            onClick={() => onOpenChat(ticket.id)}
            variant={ticket.has_unread ? "default" : "outline"}
            size="sm"
            className={cn(
              'transition-all duration-200',
              ticket.has_unread && 'bg-primary hover:bg-primary/90 text-primary-foreground animate-pulse shadow-lg'
            )}
          >
            <div className="relative flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {ticket.has_unread ? (
                <>
                  <span className="font-medium">{t('ticketCard.newCount', { count: ticket.unread_count })}</span>
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary-foreground rounded-full"></div>
                </>
              ) : (
                <span>{t('ticketCard.chat')}</span>
              )}
            </div>
          </Button>
        </div>

        {/* Unread indicator bar */}
        {ticket.has_unread && (
          <div className="mt-4 pt-4 border-t border-primary/20">
            <div className="flex items-center gap-2 text-primary">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <span className="text-xs font-medium">
                {ticket.unread_count === 1
                  ? t('ticketCard.unreadMessageSingle', { count: ticket.unread_count })
                  : t('ticketCard.unreadMessagePlural', { count: ticket.unread_count })}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
