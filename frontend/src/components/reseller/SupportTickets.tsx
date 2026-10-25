'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  MessageSquare,
  Clock,
  AlertCircle,
  CheckCircle,
  Plus,
  Send,
  Filter,
  SortDesc,
  RefreshCw
} from 'lucide-react';
import { ticketService, Ticket, CreateTicketRequest, TicketDetail, AddMessageRequest } from '@/services';
import TicketCard from '@/components/tickets/TicketCard';
import TicketChatDialog from '@/components/tickets/TicketChatDialog';

// Remove local interface since we're importing it from services

interface SupportTicketsProps {
  className?: string;
}

export default function SupportTickets({ className }: SupportTicketsProps) {
  const { t } = useTranslation('reseller');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'technical'
  });

  // Chat modal states
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch tickets and unread count using the ticket service
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ticketsResult, unreadResult] = await Promise.all([
          ticketService.getResellerTickets(),
          ticketService.getResellerUnreadCount()
        ]);

        if (ticketsResult.success) {
          setTickets(ticketsResult.data || []);
        } else {
          console.error('API returned error:', ticketsResult.error);
          setTickets([]);
        }

        if (unreadResult.success) {
          setTotalUnreadCount(unreadResult.data.total_unread);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setTickets([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCreateTicket = async () => {
    if (creatingTicket) return;

    setCreatingTicket(true);
    setError(null);

    try {
      const result = await ticketService.createTicket(newTicket as CreateTicketRequest);

      if (result.success) {
        // Add the new ticket to the list without reloading
        setTickets(prev => [result.data, ...prev]);

        // Reset form and close dialog
        setNewTicket({
          title: '',
          description: '',
          priority: 'medium',
          category: 'technical'
        });
        setIsCreateDialogOpen(false);
      } else {
        setError(result.error?.details || t('supportTickets.errors.createFailed'));
        console.error('Error creating ticket:', result.error);
      }
    } catch (error) {
      setError(t('supportTickets.errors.createFailedRetry'));
      console.error('Error creating ticket:', error);
    } finally {
      setCreatingTicket(false);
    }
  };

  // Open chat modal and load ticket details with messages
  const handleOpenChat = async (ticketId: number) => {
    setChatLoading(true);
    setIsChatModalOpen(true);

    try {
      const result = await ticketService.getResellerTicketMessages(ticketId);

      if (result.success) {
        setSelectedTicket({
          ...result.data.ticket,
          messages: result.data.messages
        });

        // Mark messages as read
        await ticketService.markResellerTicketMessagesRead(ticketId);

        // Refresh tickets list to update unread counts
        const ticketsResult = await ticketService.getResellerTickets();
        if (ticketsResult.success) {
          setTickets(ticketsResult.data || []);
        }
      } else {
        console.error('Error loading ticket details:', result.error);
      }
    } catch (error) {
      console.error('Error loading ticket details:', error);
    } finally {
      setChatLoading(false);
    }
  };

  // Send new message
  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim() || sendingMessage) return;

    setSendingMessage(true);
    setError(null);

    try {
      const result = await ticketService.addResellerTicketMessage(selectedTicket.id, {
        message: newMessage.trim()
      } as AddMessageRequest);

      if (result.success) {
        // Add the new message to the chat
        setSelectedTicket(prev => prev ? {
          ...prev,
          messages: [...prev.messages, result.data]
        } : null);

        // Clear the input
        setNewMessage('');

        // Refresh tickets list to update counts
        const ticketsResult = await ticketService.getResellerTickets();
        if (ticketsResult.success) {
          setTickets(ticketsResult.data || []);
        }
      } else {
        setError(result.error?.details || t('supportTickets.errors.sendFailed'));
        console.error('Error sending message:', result.error);
      }
    } catch (error) {
      setError(t('supportTickets.errors.sendFailedRetry'));
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  // Close chat modal
  const handleCloseChat = () => {
    setIsChatModalOpen(false);
    setSelectedTicket(null);
    setNewMessage('');
  };

  const getTicketStats = () => {
    return {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      in_progress: tickets.filter(t => t.status === 'in_progress').length,
      resolved: tickets.filter(t => t.status === 'resolved').length};
  };

  const stats = getTicketStats();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('supportTickets.header.title')}</h2>
          <p className="text-muted-foreground">{t('supportTickets.header.description')}</p>
          {totalUnreadCount > 0 && (
            <p className="text-sm text-destructive font-medium">
              {totalUnreadCount === 1
                ? t('supportTickets.header.unreadSingle', { count: totalUnreadCount })
                : t('supportTickets.header.unreadPlural', { count: totalUnreadCount })}
            </p>
          )}
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {t('supportTickets.header.createTicket')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>{t('supportTickets.createDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('supportTickets.createDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">{t('supportTickets.createDialog.titleLabel')}</Label>
                <Input
                  id="title"
                  placeholder={t('supportTickets.createDialog.titlePlaceholder')}
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({...newTicket, title: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">{t('supportTickets.createDialog.categoryLabel')}</Label>
                <Select value={newTicket.category} onValueChange={(value) => setNewTicket({...newTicket, category: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technical">{t('supportTickets.categories.technical')}</SelectItem>
                    <SelectItem value="billing">{t('supportTickets.categories.billing')}</SelectItem>
                    <SelectItem value="account">{t('supportTickets.categories.account')}</SelectItem>
                    <SelectItem value="content">{t('supportTickets.categories.content')}</SelectItem>
                    <SelectItem value="other">{t('supportTickets.categories.other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">{t('supportTickets.createDialog.priorityLabel')}</Label>
                <Select value={newTicket.priority} onValueChange={(value) => setNewTicket({...newTicket, priority: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('supportTickets.priorities.low')}</SelectItem>
                    <SelectItem value="medium">{t('supportTickets.priorities.medium')}</SelectItem>
                    <SelectItem value="high">{t('supportTickets.priorities.high')}</SelectItem>
                    <SelectItem value="urgent">{t('supportTickets.priorities.urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">{t('supportTickets.createDialog.descriptionLabel')}</Label>
                <Textarea
                  id="description"
                  placeholder={t('supportTickets.createDialog.descriptionPlaceholder')}
                  className="min-h-[100px]"
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({...newTicket, description: e.target.value})}
                />
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 rounded-md text-sm">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                {t('supportTickets.createDialog.cancel')}
              </Button>
              <Button
                onClick={handleCreateTicket}
                disabled={!newTicket.title || !newTicket.description || creatingTicket}
              >
                {creatingTicket ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {creatingTicket ? t('supportTickets.createDialog.creating') : t('supportTickets.createDialog.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={className}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('supportTickets.stats.total')}</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('supportTickets.stats.open')}</p>
                <p className="text-2xl font-bold text-primary">{stats.open}</p>
              </div>
              <Clock className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('supportTickets.stats.inProgress')}</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.in_progress}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className={className}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('supportTickets.stats.resolved')}</p>
                <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tickets List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t('supportTickets.list.title')}</h2>
            <p className="text-muted-foreground">
              {tickets.length === 0
                ? t('supportTickets.list.empty')
                : tickets.length === 1
                  ? t('supportTickets.list.countSingle', { count: tickets.length })
                  : t('supportTickets.list.countPlural', { count: tickets.length })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              {t('supportTickets.list.filter')}
            </Button>
            <Button variant="outline" size="sm">
              <SortDesc className="h-4 w-4 mr-2" />
              {t('supportTickets.list.sort')}
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('supportTickets.list.refresh')}
            </Button>
          </div>
        </div>

        {tickets.length === 0 ? (
          <Card className={className}>
            <CardContent className="py-16">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-foreground mb-2">{t('supportTickets.empty.title')}</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {t('supportTickets.empty.description')}
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)} size="lg">
                  <Plus className="h-5 w-5 mr-2" />
                  {t('supportTickets.empty.createFirst')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onOpenChat={handleOpenChat}
                className={className} // Assuming TicketCard accepts className, if not I need to check it
              />
            ))}
          </div>
        )}
      </div>

      {/* Enhanced Chat Dialog */}
      <TicketChatDialog
        isOpen={isChatModalOpen}
        onClose={handleCloseChat}
        ticket={selectedTicket}
        loading={chatLoading}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        onSendMessage={handleSendMessage}
        sendingMessage={sendingMessage}
        currentUserRole="reseller"
      />
    </div>
  );
}
