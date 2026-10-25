'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  X,
  Minimize2,
  Maximize2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Pause
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TicketChat from '@/components/chat/TicketChat';
import AdminTicketChat from '@/components/chat/AdminTicketChat';
import { useTranslation } from 'react-i18next';

interface Message {
  id: number;
  message: string;
  username: string;
  user_role: string;
  created_at: string;
  is_internal: boolean;
  is_read: boolean;
}

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
  messages: Message[];
}

interface TicketChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  loading: boolean;
  newMessage: string;
  setNewMessage: (message: string) => void;
  onSendMessage: () => void;
  sendingMessage: boolean;
  currentUserRole?: string;
  isInternalMessage?: boolean;
  setIsInternalMessage?: (internal: boolean) => void;
}

const statusConfig = {
  open: {
    icon: AlertCircle,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/20'
  },
  in_progress: {
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20'
  },
  resolved: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20'
  },
  closed: {
    icon: XCircle,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    borderColor: 'border-muted'
  },
  on_hold: {
    icon: Pause,
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20'
  }
};

const priorityConfig = {
  low: { color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  medium: { color: 'bg-yellow-500/10 text-yellow-600', dot: 'bg-yellow-600' },
  high: { color: 'bg-orange-500/10 text-orange-600', dot: 'bg-orange-600' },
  urgent: { color: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' }
};

export default function TicketChatDialog({
  isOpen,
  onClose,
  ticket,
  loading,
  newMessage,
  setNewMessage,
  onSendMessage,
  sendingMessage,
  currentUserRole = 'reseller',
  isInternalMessage = false,
  setIsInternalMessage
}: TicketChatDialogProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const { t } = useTranslation();

  // Reset states when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsMinimized(false);
      setIsMaximized(false);
    }
  }, [isOpen]);

  if (!ticket && !loading) return null;

  const status = ticket ? statusConfig[ticket.status as keyof typeof statusConfig] || statusConfig.open : null;
  const priority = ticket ? priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.medium : null;
  const StatusIcon = status?.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className={cn(
          'transition-all duration-300 ease-in-out',
          isMaximized ? '!max-w-[95vw] h-[95vh]' : '!max-w-[1400px] h-[80vh] !w-[1400px]',
          isMinimized && 'h-16 overflow-hidden'
        )}
        showCloseButton={false}
      >
        {/* Custom Header */}
        <DialogHeader className="flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="flex items-center gap-3">
            {ticket && status && StatusIcon && (
              <div className={cn('p-2 rounded-full', status.bgColor)}>
                <StatusIcon className={cn('h-4 w-4', status.color)} />
              </div>
            )}
            <div>
                <DialogTitle className="text-lg font-semibold">
                {ticket ? ticket.title : t('common.loading')}
              </DialogTitle>
              {ticket && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground font-mono">
                    #{ticket.ticket_number}
                  </span>
                  <Badge variant="outline" className={cn('text-xs', status?.color, status?.bgColor)}>
                    {t(`tickets.status.${ticket?.status ?? 'open'}`)}
                  </Badge>
                  <Badge variant="outline" className={cn('text-xs', priority?.color)}>
                    <div className={cn('w-2 h-2 rounded-full mr-1', priority?.dot)}></div>
                    {ticket.priority.toUpperCase()}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Window Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-8 w-8 p-0 hover:bg-muted"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMaximized(!isMaximized)}
              className="h-8 w-8 p-0 hover:bg-muted"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Chat Content */}
        {!isMinimized && (
          <div className="flex-1 flex flex-col min-h-0">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
                  <p className="text-muted-foreground font-medium">{t('tickets.loadingConversation')}</p>
                  <p className="text-muted-foreground/70 text-sm">{t('tickets.loadingConversationDescription')}</p>
                </div>
              </div>
            ) : ticket ? (
              currentUserRole === 'admin' ? (
                <AdminTicketChat
                  ticket={ticket}
                  newMessage={newMessage}
                  setNewMessage={setNewMessage}
                  onSendMessage={onSendMessage}
                  sendingMessage={sendingMessage}
                  isInternalMessage={isInternalMessage}
                  setIsInternalMessage={setIsInternalMessage || (() => {})}
                />
              ) : (
                <TicketChat
                  ticket={ticket}
                  newMessage={newMessage}
                  setNewMessage={setNewMessage}
                  onSendMessage={onSendMessage}
                  sendingMessage={sendingMessage}
                  currentUserRole={currentUserRole}
                />
              )
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">{t('tickets.noTicketSelected')}</p>
                  <p className="text-muted-foreground/70 text-sm">{t('tickets.selectTicketPrompt')}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Minimized State */}
        {isMinimized && ticket && (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className={cn('w-3 h-3 rounded-full', priority?.dot)}></div>
              <span className="font-medium text-sm">{ticket.title}</span>
              <Badge variant="outline" className="text-xs">
                {t(`tickets.status.${ticket?.status ?? 'open'}`)}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {sendingMessage && (
                <div className="flex items-center gap-2 text-primary">
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                  <span className="text-xs">{t('tickets.sending')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
