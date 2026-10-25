'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  MessageSquare,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Plus,
  Trash2,
  RefreshCw,
  SortDesc,
  UserCheck,
  Edit,
  Calendar,
  User
} from 'lucide-react';
import { ticketService, Ticket, TicketDetail, TicketMessage, AddMessageRequest, userService } from '@/services';
import { UserRole } from '@/types';
import TicketCard from '@/components/tickets/TicketCard';
import TicketChatDialog from '@/components/tickets/TicketChatDialog';
import { AdminSectionHeader } from './AdminSectionHeader';

// Remove local interface since we're importing it from services

const statusColors = {
  open: 'bg-primary/10 text-primary',
  in_progress: 'bg-yellow-500/10 text-yellow-600',
  waiting_response: 'bg-purple-500/10 text-purple-600',
  resolved: 'bg-green-500/10 text-green-600',
  closed: 'bg-muted text-muted-foreground'
};


export default function TicketManagement() {
  useLoadNamespace('admin/tickets');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [unreadFilter, setUnreadFilter] = useState<string>('all');
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);

  // Chat modal states
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isInternalMessage, setIsInternalMessage] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [updatingTicket, setUpdatingTicket] = useState(false);
  const { t } = useTranslation(['admin/tickets', 'admin', 'translation']);
  const [error, setError] = useState<string | null>(null);

  // Create ticket modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createTicketData, setCreateTicketData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    category: 'technical' as 'technical' | 'billing' | 'account' | 'content' | 'other',
    reseller_id: '' // ID del reseller seleccionado
  });
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [resellers, setResellers] = useState<Array<{ id: number, username: string }>>([]);

  // Advanced filter modal states
  const [isAdvancedFilterModalOpen, setIsAdvancedFilterModalOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    dateFrom: '',
    dateTo: ''
  });

  // Sort options modal states
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [sortOption, setSortOption] = useState<'newest' | 'oldest' | 'priority' | 'status' | 'unread'>('newest');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Fetch tickets and unread count using the ticket service
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ticketsResult, unreadResult, resellersResult] = await Promise.all([
          ticketService.getAdminTickets(),
          ticketService.getUnreadCount(),
          userService.getUsers({ role: UserRole.RESELLER })
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

        if (resellersResult.success) {
          setResellers(resellersResult.data.map(user => ({
            id: user.id,
            username: user.username
          })));
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

  // Open chat modal and load ticket details with messages
  const handleOpenChat = async (ticketId: number) => {
    setChatLoading(true);
    setIsChatModalOpen(true);

    try {
      const result = await ticketService.getTicketMessages(ticketId);

      if (result.success) {
        setSelectedTicket({
          ...result.data.ticket,
          messages: result.data.messages
        });

        // Mark messages as read
        await ticketService.markTicketMessagesRead(ticketId);

        // Refresh tickets list to update unread counts
        const ticketsResult = await ticketService.getAdminTickets();
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
      const result = await ticketService.addTicketMessage(selectedTicket.id, {
        message: newMessage.trim(),
        is_internal: isInternalMessage
      } as AddMessageRequest);

      if (result.success) {
        // Add the new message to the chat
        setSelectedTicket(prev => prev ? {
          ...prev,
          messages: [...prev.messages, result.data]
        } : null);

        // Clear the input
        setNewMessage('');
        setIsInternalMessage(false);

        // Refresh tickets list to update counts
        const ticketsResult = await ticketService.getAdminTickets();
        if (ticketsResult.success) {
          setTickets(ticketsResult.data || []);
        }
      } else {
        setError(result.error?.details || t('tickets.errors.sendMessage'));
        console.error('Error sending message:', result.error);
      }
    } catch (error) {
      setError(t('tickets.errors.sendMessageRetry'));
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
    setIsInternalMessage(false);
  };

  // Assign ticket to self
  const handleAssignToSelf = async (ticketId: number) => {
    if (updatingTicket) return;

    setUpdatingTicket(true);
    setError(null);

    try {
      const result = await ticketService.assignTicketToSelf(ticketId);

      if (result.success) {
        // Refresh ticket data
        const ticketResult = await ticketService.getTicketMessages(ticketId);
        if (ticketResult.success) {
          setSelectedTicket({
            ...ticketResult.data.ticket,
            messages: ticketResult.data.messages
          });
        }

        // Refresh tickets list
        const ticketsResult = await ticketService.getAdminTickets();
        if (ticketsResult.success) {
          setTickets(ticketsResult.data || []);
        }
      } else {
        setError(result.error?.details || t('tickets.errors.assign'));
        console.error('Error assigning ticket:', result.error);
      }
    } catch (error) {
      setError(t('tickets.errors.assignRetry'));
      console.error('Error assigning ticket:', error);
    } finally {
      setUpdatingTicket(false);
    }
  };

  const handleDeleteTicket = async (ticketId: number) => {
    if (!confirm(t('tickets.confirm.delete'))) {
      return;
    }

    setUpdatingTicket(true);
    setError(null);

    try {
      const result = await ticketService.deleteTicket(ticketId);

      if (result.success) {
        // Close chat if the deleted ticket was selected
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket(null);
          setIsChatModalOpen(false);
        }

        // Refresh tickets list
        const ticketsResult = await ticketService.getAdminTickets();
        if (ticketsResult.success) {
          setTickets(ticketsResult.data || []);
        }
      } else {
        setError(result.error?.details || t('tickets.errors.delete'));
        console.error('Error deleting ticket:', result.error);
      }
    } catch (error) {
      setError(t('tickets.errors.deleteRetry'));
      console.error('Error deleting ticket:', error);
    } finally {
      setUpdatingTicket(false);
    }
  };

  // Change ticket status
  const handleStatusChange = async (ticketId: number, newStatus: string) => {
    if (updatingTicket) return;

    setUpdatingTicket(true);
    setError(null);

    try {
      const result = await ticketService.updateTicket(ticketId, { status: newStatus as 'open' | 'in_progress' | 'resolved' | 'closed' });

      if (result.success) {
        // Update selected ticket
        setSelectedTicket(prev => prev ? {
          ...prev,
          status: newStatus as 'open' | 'in_progress' | 'resolved' | 'closed'
        } : null);

        // Refresh tickets list
        const ticketsResult = await ticketService.getAdminTickets();
        if (ticketsResult.success) {
          setTickets(ticketsResult.data || []);
        }
      } else {
        setError(result.error?.details || t('tickets.errors.updateStatus'));
        console.error('Error updating ticket status:', result.error);
      }
    } catch (error) {
      setError(t('tickets.errors.updateStatusRetry'));
      console.error('Error updating ticket status:', error);
    } finally {
      setUpdatingTicket(false);
    }
  };

  // Handle create ticket
  const handleCreateTicket = async () => {
    if (!createTicketData.title.trim() || !createTicketData.description.trim()) {
      setError(t('tickets.errors.validation.titleDescriptionRequired'));
      return;
    }

    if (!createTicketData.reseller_id) {
      setError(t('tickets.errors.validation.resellerRequired'));
      return;
    }

    setCreatingTicket(true);
    setError(null);

    try {
      const ticketData = {
        ...createTicketData,
        reseller_id: parseInt(createTicketData.reseller_id)
      };

      const result = await ticketService.createAdminTicket(ticketData);

      if (result.success) {
        // Reset form
        setCreateTicketData({
          title: '',
          description: '',
          priority: 'medium',
          category: 'technical',
          reseller_id: ''
        });
        setIsCreateModalOpen(false);

        // Refresh tickets list
        const ticketsResult = await ticketService.getAdminTickets();
        if (ticketsResult.success) {
          setTickets(ticketsResult.data || []);
        }
      } else {
        setError(result.error?.details || t('tickets.errors.create'));
        console.error('Error creating ticket:', result.error);
      }
    } catch (error) {
      setError(t('tickets.errors.createRetry'));
      console.error('Error creating ticket:', error);
    } finally {
      setCreatingTicket(false);
    }
  };

  // Safety check to ensure tickets is an array
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  const filteredTickets = safeTickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.ticket_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.creator_username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;
    const matchesUnread = unreadFilter === 'all' ||
      (unreadFilter === 'unread' && ticket.has_unread) ||
      (unreadFilter === 'read' && !ticket.has_unread);

    // Advanced filters (simplified for now - date filters only)
    const matchesDateFrom = !advancedFilters.dateFrom || new Date(ticket.created_at) >= new Date(advancedFilters.dateFrom);
    const matchesDateTo = !advancedFilters.dateTo || new Date(ticket.created_at) <= new Date(advancedFilters.dateTo + 'T23:59:59');

    return matchesSearch && matchesStatus && matchesPriority && matchesUnread &&
      matchesDateFrom && matchesDateTo;
  });

  // Sort tickets based on selected options
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    let comparison = 0;

    switch (sortOption) {
      case 'newest':
        comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        break;
      case 'oldest':
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'priority':
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        comparison = priorityOrder[b.priority] - priorityOrder[a.priority];
        break;
      case 'status':
        const statusOrder = { open: 4, in_progress: 3, waiting_response: 2, resolved: 1, closed: 0 };
        comparison = statusOrder[b.status] - statusOrder[a.status];
        break;
      case 'unread':
        comparison = (b.has_unread ? 1 : 0) - (a.has_unread ? 1 : 0);
        break;
      default:
        comparison = 0;
    }

    return sortDirection === 'desc' ? comparison : -comparison;
  });

  const getTicketStats = () => {
    const safeTickets = Array.isArray(tickets) ? tickets : [];
    return {
      total: safeTickets.length,
      open: safeTickets.filter(t => t.status === 'open').length,
      in_progress: safeTickets.filter(t => t.status === 'in_progress').length,
      resolved: safeTickets.filter(t => t.status === 'resolved').length,
      closed: safeTickets.filter(t => t.status === 'closed').length
    };
  };

  const stats = getTicketStats();

  if (loading) {
    return (
      <div className="p-6">
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
    <div className="space-y-6 max-w-[1400px] mx-auto w-full">
      <AdminSectionHeader
        icon={MessageSquare}
        title={t('uiBulk.supportTickets.title')}
        description={t('uiBulk.supportTickets.subtitle')}
        actions={(
          <Button
            className="flex items-center gap-2"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t('uiBulk.createTicket')}
          </Button>
        )}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('tickets.stats.total')}</p>
                <p className="text-xl font-bold text-foreground">{stats.total}</p>
              </div>
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('tickets.status.open')}</p>
                <p className="text-xl font-bold text-primary">{stats.open}</p>
              </div>
              <Clock className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('tickets.status.in_progress')}</p>
                <p className="text-xl font-bold text-yellow-600">{stats.in_progress}</p>
              </div>
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('tickets.status.resolved')}</p>
                <p className="text-xl font-bold text-green-600">{stats.resolved}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('tickets.status.closed')}</p>
                <p className="text-xl font-bold text-muted-foreground">{stats.closed}</p>
              </div>
              <XCircle className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('tickets.unreadMessages')}</p>
                <p className="text-xl font-bold text-destructive">{totalUnreadCount}</p>
              </div>
              <MessageSquare className="h-6 w-6 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder={t('uiBulk.searchTicketsPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder={t('tickets.placeholders.filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tickets.filters.status.all')}</SelectItem>
                <SelectItem value="open">{t('tickets.status.open')}</SelectItem>
                <SelectItem value="in_progress">{t('tickets.status.in_progress')}</SelectItem>
                <SelectItem value="waiting_response">{t('tickets.status.waiting_response')}</SelectItem>
                <SelectItem value="resolved">{t('tickets.status.resolved')}</SelectItem>
                <SelectItem value="closed">{t('tickets.status.closed')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder={t('tickets.placeholders.filterByPriority')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tickets.filters.priority.all')}</SelectItem>
                <SelectItem value="low">{t('tickets.priority.low')}</SelectItem>
                <SelectItem value="medium">{t('tickets.priority.medium')}</SelectItem>
                <SelectItem value="high">{t('tickets.priority.high')}</SelectItem>
                <SelectItem value="urgent">{t('tickets.priority.urgent')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={unreadFilter} onValueChange={setUnreadFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder={t('tickets.placeholders.filterByReadStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tickets.filters.unread.all')}</SelectItem>
                <SelectItem value="unread">{t('tickets.filters.unread.unread')}</SelectItem>
                <SelectItem value="read">{t('tickets.filters.unread.read')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Tickets List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t('uiBulk.supportTickets.title')}</h2>
            <p className="text-muted-foreground">
              {sortedTickets.length === 0 ? t('uiBulk.noTicketsFound') : t('uiBulk.ticketsFound', { count: sortedTickets.length })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAdvancedFilterModalOpen(true)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {t('uiBulk.advancedFilter')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSortModalOpen(true)}
            >
              <SortDesc className="h-4 w-4 mr-2" />
              {t('uiBulk.sortOptions')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const [ticketsResult, unreadResult] = await Promise.all([
                    ticketService.getAdminTickets(),
                    ticketService.getUnreadCount()
                  ]);

                  if (ticketsResult.success) {
                    setTickets(ticketsResult.data || []);
                  }

                  if (unreadResult.success) {
                    setTotalUnreadCount(unreadResult.data.total_unread);
                  }
                } catch (error) {
                  console.error('Error refreshing tickets:', error);
                }
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.refresh')}
            </Button>
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('uiBulk.createTicket')}
            </Button>
          </div>
        </div>

        {sortedTickets.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-foreground mb-2">{t('uiBulk.noTicketsFoundTitle')}</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {t('uiBulk.noTicketsDescription')}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setPriorityFilter('all');
                      setUnreadFilter('all');
                    }}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    {t('uiBulk.clearFilters')}
                  </Button>
                  <Button onClick={() => setIsCreateModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('uiBulk.createTicketButton')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {sortedTickets.map((ticket) => (
              <div key={ticket.id} className="relative">
                <TicketCard
                  ticket={ticket}
                  onOpenChat={handleOpenChat}
                />
                {/* Admin Actions Overlay */}
                <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="bg-card shadow-sm">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTicket(ticket.id)}
                    className="bg-card shadow-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={updatingTicket}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enhanced Admin Chat Dialog */}
      <TicketChatDialog
        isOpen={isChatModalOpen}
        onClose={handleCloseChat}
        ticket={selectedTicket}
        loading={chatLoading}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        onSendMessage={handleSendMessage}
        sendingMessage={sendingMessage}
        currentUserRole="admin"
        isInternalMessage={isInternalMessage}
        setIsInternalMessage={setIsInternalMessage}
      />

      {/* Admin Actions Panel - Floating when chat is open */}
      {selectedTicket && isChatModalOpen && (
        <div className="fixed top-20 right-6 z-50 bg-card rounded-lg shadow-lg border border-border p-4 space-y-3 w-80">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            {t('tickets.actions.panelTitle')}
          </h3>

          {/* Error Display */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Assignment */}
          {!selectedTicket.assigned_to && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAssignToSelf(selectedTicket.id)}
              disabled={updatingTicket}
              className="w-full"
            >
              {updatingTicket ? t('tickets.actions.assigning') : t('tickets.actions.assignToMe')}
            </Button>
          )}

          {/* Status Change */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('tickets.actions.changeStatus')}</Label>
            <Select
              value={selectedTicket.status}
              onValueChange={(value) => handleStatusChange(selectedTicket.id, value)}
              disabled={updatingTicket}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t('tickets.status.open')}</SelectItem>
                <SelectItem value="in_progress">{t('tickets.status.in_progress')}</SelectItem>
                <SelectItem value="waiting_response">{t('tickets.status.waiting_response')}</SelectItem>
                <SelectItem value="resolved">{t('tickets.status.resolved')}</SelectItem>
                <SelectItem value="closed">{t('tickets.status.closed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Internal Message Toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="internal-message"
              checked={isInternalMessage}
              onCheckedChange={(checked) => setIsInternalMessage(checked as boolean)}
            />
            <Label htmlFor="internal-message" className="text-sm text-muted-foreground">
              {t('tickets.actions.internalMessage')}
            </Label>
          </div>

          {/* Quick Actions */}
          <div className="pt-2 border-t space-y-2">
            <Button variant="outline" size="sm" className="w-full">
              <Calendar className="h-4 w-4 mr-2" />
              {t('tickets.actions.scheduleFollowUp')}
            </Button>
            <Button variant="outline" size="sm" className="w-full">
              <User className="h-4 w-4 mr-2" />
              {t('tickets.actions.reassignTicket')}
            </Button>
          </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('tickets.create.title')}</DialogTitle>
            <DialogDescription>
              {t('tickets.create.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div>
              <Label htmlFor="title">{t('tickets.create.labels.title')}</Label>
              <Input
                id="title"
                value={createTicketData.title}
                onChange={(e) => setCreateTicketData(prev => ({ ...prev, title: e.target.value }))}
                placeholder={t('tickets.create.placeholders.title')}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">{t('tickets.create.labels.description')}</Label>
              <Textarea
                id="description"
                value={createTicketData.description}
                onChange={(e) => setCreateTicketData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('tickets.create.placeholders.description')}
                className="mt-1"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="reseller">{t('tickets.create.labels.reseller')}</Label>
              <Select
                value={createTicketData.reseller_id}
                onValueChange={(value) =>
                  setCreateTicketData(prev => ({ ...prev, reseller_id: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('tickets.create.placeholders.reseller')} />
                </SelectTrigger>
                <SelectContent>
                  {resellers.map((reseller) => (
                    <SelectItem key={reseller.id} value={reseller.id.toString()}>
                      {reseller.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">{t('tickets.create.labels.priority')}</Label>
                <Select
                  value={createTicketData.priority}
                  onValueChange={(value: 'low' | 'medium' | 'high' | 'urgent') =>
                    setCreateTicketData(prev => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('tickets.priority.low')}</SelectItem>
                    <SelectItem value="medium">{t('tickets.priority.medium')}</SelectItem>
                    <SelectItem value="high">{t('tickets.priority.high')}</SelectItem>
                    <SelectItem value="urgent">{t('tickets.priority.urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">{t('tickets.create.labels.category')}</Label>
                <Select
                  value={createTicketData.category}
                  onValueChange={(value: 'technical' | 'billing' | 'account' | 'content' | 'other') =>
                    setCreateTicketData(prev => ({ ...prev, category: value }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technical">{t('tickets.category.technical')}</SelectItem>
                    <SelectItem value="billing">{t('tickets.category.billing')}</SelectItem>
                    <SelectItem value="account">{t('tickets.category.account')}</SelectItem>
                    <SelectItem value="content">{t('tickets.category.content')}</SelectItem>
                    <SelectItem value="other">{t('tickets.category.other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={creatingTicket}
            >
              {t('tickets.common.cancel')}
            </Button>
            <Button
              onClick={handleCreateTicket}
              disabled={creatingTicket || !createTicketData.title.trim() || !createTicketData.description.trim() || !createTicketData.reseller_id}
            >
              {creatingTicket ? t('tickets.create.submitting') : t('tickets.create.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advanced Filter Modal */}
      <Dialog open={isAdvancedFilterModalOpen} onOpenChange={setIsAdvancedFilterModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('tickets.advanced.title')}</DialogTitle>
            <DialogDescription>
              {t('tickets.advanced.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date-from">{t('tickets.advanced.labels.dateFrom')}</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={advancedFilters.dateFrom}
                  onChange={(e) => setAdvancedFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="date-to">{t('tickets.advanced.labels.dateTo')}</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={advancedFilters.dateTo}
                  onChange={(e) => setAdvancedFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {t('tickets.advanced.helper')}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAdvancedFilters({
                  dateFrom: '',
                  dateTo: ''
                });
              }}
            >
              {t('tickets.advanced.clear')}
            </Button>
            <Button
              onClick={() => setIsAdvancedFilterModalOpen(false)}
            >
              {t('tickets.advanced.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sort Options Modal */}
      <Dialog open={isSortModalOpen} onOpenChange={setIsSortModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('tickets.sort.title')}</DialogTitle>
            <DialogDescription>
              {t('tickets.sort.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('tickets.sort.labels.sortBy')}</Label>
              <Select
                value={sortOption}
                onValueChange={(value: 'newest' | 'oldest' | 'priority' | 'status' | 'unread') => setSortOption(value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t('tickets.sort.options.newestFirst')}</SelectItem>
                  <SelectItem value="oldest">{t('tickets.sort.options.oldestFirst')}</SelectItem>
                  <SelectItem value="priority">{t('tickets.sort.options.priority')}</SelectItem>
                  <SelectItem value="status">{t('tickets.sort.options.status')}</SelectItem>
                  <SelectItem value="unread">{t('tickets.sort.options.unreadFirst')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('tickets.sort.labels.direction')}</Label>
              <Select
                value={sortDirection}
                onValueChange={(value: 'asc' | 'desc') => setSortDirection(value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">{t('tickets.sort.direction.descending')}</SelectItem>
                  <SelectItem value="asc">{t('tickets.sort.direction.ascending')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSortOption('newest');
                setSortDirection('desc');
              }}
            >
              {t('tickets.sort.reset')}
            </Button>
            <Button
              onClick={() => setIsSortModalOpen(false)}
            >
              {t('tickets.sort.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
