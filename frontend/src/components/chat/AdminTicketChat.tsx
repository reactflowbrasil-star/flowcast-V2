'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Send,
  User,
  Shield,
  CheckCheck,
  Paperclip,
  Smile,
  MoreVertical,
  Eye,
  EyeOff,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  title: string;
  description: string;
  status: string;
  priority: string;
  creator_username: string;
  created_at: string;
  messages: Message[];
}

interface AdminTicketChatProps {
  ticket: Ticket;
  newMessage: string;
  setNewMessage: (message: string) => void;
  onSendMessage: () => void;
  sendingMessage: boolean;
  isInternalMessage: boolean;
  setIsInternalMessage: (internal: boolean) => void;
}

export default function AdminTicketChat({ 
  ticket, 
  newMessage, 
  setNewMessage, 
  onSendMessage, 
  sendingMessage,
  isInternalMessage,
  setIsInternalMessage
}: AdminTicketChatProps) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showInternalMessages, setShowInternalMessages] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket.messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (newMessage.trim()) {
        onSendMessage();
      }
    }
  };

  const getUserInitials = (username: string) => {
    return username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-3 w-3 text-green-600" />;
      case 'reseller':
        return <User className="h-3 w-3 text-primary" />;
      default:
        return <User className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getMessageBubbleStyle = (message: Message) => {
    const isAdmin = message.user_role === 'admin';
    const isInternal = message.is_internal;

    if (isInternal) {
      return 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 border-dashed ml-8';
    } else if (isAdmin) {
      return 'bg-green-500/10 text-green-600 border border-green-500/20 ml-12';
    } else {
      return 'bg-muted text-muted-foreground border border-muted mr-12';
    }
  };

  const filteredMessages = showInternalMessages 
    ? ticket.messages 
    : ticket.messages.filter(msg => !msg.is_internal);

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header with Controls */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {getUserInitials(ticket.creator_username)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-sm text-foreground">{ticket.title}</h3>
            <p className="text-xs text-muted-foreground">
              {t('chat.ticket.createdBy', { username: ticket.creator_username })} • {formatTime(ticket.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInternalMessages(!showInternalMessages)}
            className={cn(
              "text-xs",
              showInternalMessages ? "bg-yellow-500/10 text-yellow-600" : "text-muted-foreground"
            )}
          >
            {showInternalMessages ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
            {t('chat.admin.internalNotes')}
          </Button>
          <Badge variant="outline" className="text-xs">
            {ticket.status.replace('_', ' ')}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {ticket.priority}
          </Badge>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/50">
        {/* Initial Ticket Description */}
        <Card className="border-l-4 border-l-primary bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getUserInitials(ticket.creator_username)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-primary text-sm">{ticket.creator_username}</span>
              <Badge className="bg-primary/10 text-primary text-xs">{t('chat.ticket.initialRequest')}</Badge>
              <span className="text-xs text-primary ml-auto">
                {formatTime(ticket.created_at)}
              </span>
            </div>
            <p className="text-primary text-sm leading-relaxed">{ticket.description}</p>
          </CardContent>
        </Card>

        {/* Chat Messages */}
        {filteredMessages.map((message) => {
          const isAdmin = message.user_role === 'admin';
          const isInternal = message.is_internal;

          return (
            <div key={message.id} className="flex gap-3 group">
              <Avatar className="h-8 w-8 mt-1">
                <AvatarFallback className={cn(
                  'text-xs',
                  isAdmin ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
                )}>
                  {getUserInitials(message.username)}
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground">{message.username}</span>
                  {getRoleIcon(message.user_role)}
                  <Badge variant="outline" className={cn(
                    'text-xs',
                    isAdmin ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
                  )}>
                    {isAdmin ? t('chat.ticket.supportRole') : t('chat.ticket.customerRole')}
                  </Badge>
                  {isInternal && (
                    <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600">
                      <Lock className="h-3 w-3 mr-1" />
                      {t('chat.ticket.internal')}
                    </Badge>
                  )}
                </div>

                <div className={cn(
                  'rounded-2xl px-4 py-2 shadow-sm',
                  getMessageBubbleStyle(message)
                )}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.message}</p>
                </div>

                <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-muted-foreground">{formatTime(message.created_at)}</span>
                  {message.is_read && (
                    <CheckCheck className="h-3 w-3 text-green-600" />
                  )}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="border-t border-border bg-card p-4">
        {/* Internal Message Toggle */}
        <div className="flex items-center gap-2 mb-3">
          <Checkbox
            id="internal-message"
            checked={isInternalMessage}
            onCheckedChange={(checked) => setIsInternalMessage(checked as boolean)}
          />
          <Label htmlFor="internal-message" className="text-sm text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" />
            {t('chat.admin.sendAsInternalNote')}
          </Label>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder={isInternalMessage ? t('chat.admin.internalMessagePlaceholder') : t('chat.admin.adminResponsePlaceholder')}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className={cn(
                "min-h-[44px] max-h-32 resize-none pr-12 rounded-2xl focus:border-primary focus:ring-primary/20",
                isInternalMessage ? "border-yellow-500/50 bg-yellow-500/5" : "border-border"
              )}
              rows={1}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Smile className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <Button
            onClick={onSendMessage}
            disabled={!newMessage.trim() || sendingMessage}
            className={cn(
              "h-11 w-11 rounded-full disabled:opacity-50",
              isInternalMessage
                ? "bg-yellow-600 hover:bg-yellow-700"
                : "bg-green-600 hover:bg-green-700"
            )}
            size="sm"
          >
            {sendingMessage ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>
            {isInternalMessage ? t('chat.admin.internalVisibilityHint') : t('chat.ticket.sendHint')}
          </span>
          <span>{newMessage.length}/1000</span>
        </div>
      </div>
    </div>
  );
}
