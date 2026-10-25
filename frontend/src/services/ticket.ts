// Ticket service

import { apiService } from './api';
import { ApiResult } from '@/types';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface Ticket {
  id: number;
  ticket_number: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'waiting_response' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'technical' | 'billing' | 'account' | 'content' | 'other';
  created_by: number;
  assigned_to?: number;
  created_at: string;
  updated_at: string;
  creator_username: string;
  assignee_username?: string;
  message_count: number;
  unread_count: number;
  has_unread: boolean;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'technical' | 'billing' | 'account' | 'content' | 'other';
}

export interface CreateAdminTicketRequest {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'technical' | 'billing' | 'account' | 'content' | 'other';
  reseller_id: number;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  user_id: number;
  message: string;
  is_internal: boolean;
  created_at: string;
  username: string;
  user_role: string;
  is_read: boolean;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

export interface UpdateTicketRequest {
  status?: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: number;
}

export interface AddMessageRequest {
  message: string;
  is_internal?: boolean;
}



export interface UnreadCountResponse {
  total_unread: number;
}

export interface TicketStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
}

class TicketService {
  /**
   * Get tickets list for admin users
   */
  async getAdminTickets(): Promise<ApiResult<Ticket[]>> {
    try {
      const result = await apiService.get<{ success: boolean; data: { data: Ticket[], pagination: PaginationInfo } }>('/api/admin/tickets');

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data.data // Extract the tickets array from the paginated response
        };
      } else {
        return {
          success: false,
          error: !result.success ? result.error : {
            error: 'Admin Tickets Fetch Failed',
            details: 'Failed to fetch admin tickets',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Admin Tickets Fetch Failed',
          details: 'Network error while fetching admin tickets',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get tickets list for reseller users
   */
  async getResellerTickets(): Promise<ApiResult<Ticket[]>> {
    try {
      const result = await apiService.get<{ success: boolean; data: { data: Ticket[]; pagination: PaginationInfo } }>('/api/reseller/tickets');

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data.data || []
        };
      } else {
        return {
          success: false,
          error: !result.success ? result.error : {
            error: 'Reseller Tickets Fetch Failed',
            details: 'Failed to fetch reseller tickets',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Reseller Tickets Fetch Failed',
          details: 'Network error while fetching reseller tickets',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create a new ticket (Admin)
   */
  async createAdminTicket(request: CreateAdminTicketRequest): Promise<ApiResult<Ticket>> {
    try {
      const result = await apiService.post<{ success: boolean; data: Ticket }>('/api/admin/tickets', request);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Admin Ticket Creation Failed',
            details: 'Failed to create admin ticket',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Admin Ticket Creation Failed',
          details: 'Failed to create admin ticket',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Create a new ticket (Reseller only)
   */
  async createTicket(request: CreateTicketRequest): Promise<ApiResult<Ticket>> {
    try {
      const result = await apiService.post<{ success: boolean; data: Ticket }>('/api/reseller/tickets', request);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: !result.success ? result.error : {
            error: 'Ticket Creation Failed',
            details: 'Failed to create ticket',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Ticket Creation Failed',
          details: 'Failed to create ticket',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get ticket detail with messages
   */
  async getTicketDetail(ticketId: number): Promise<ApiResult<TicketDetail>> {
    try {
      const result = await apiService.get<{ success: boolean; data: { ticket: Ticket; messages: TicketMessage[] } }>(
        `/api/admin/tickets/${ticketId}/messages`
      );

      if (result.success && result.data.success) {
        const detail: TicketDetail = {
          ...result.data.data.ticket,
          messages: result.data.data.messages
        };
        return { success: true, data: detail };
      }

      return {
        success: false,
        error: {
          error: 'Ticket Detail Fetch Failed',
          details: 'Failed to fetch ticket detail',
          timestamp: new Date().toISOString()}
      };
    } catch {
      return {
        success: false,
        error: {
          error: 'Ticket Detail Fetch Failed',
          details: 'Failed to fetch ticket detail',
          timestamp: new Date().toISOString()}
      };
    }
  }



  /**
   * Add message to ticket
   */
  async addMessage(ticketId: number, request: AddMessageRequest): Promise<ApiResult<TicketMessage>> {
    try {
      const result = await apiService.post<{ success: boolean; data: TicketMessage }>(
        `/api/admin/tickets/${ticketId}/messages`,
        request
      );

      if (result.success && result.data.success) {
        return { success: true, data: result.data.data };
      }

      return {
        success: false,
        error: {
          error: 'Message Add Failed',
          details: 'Failed to add message',
          timestamp: new Date().toISOString()}
      };
    } catch {
      return {
        success: false,
        error: {
          error: 'Message Add Failed',
          details: 'Failed to add message',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get ticket statistics
   */
  async getTicketStats(): Promise<ApiResult<TicketStats>> {
    try {
      const ticketsResult = await this.getAdminTickets();
      if (!ticketsResult.success) {
        return {
          success: false,
          error: ticketsResult.error || {
            error: 'Ticket Stats Fetch Failed',
            details: 'Failed to fetch tickets for statistics',
            timestamp: new Date().toISOString()}
        };
      }

      const tickets = ticketsResult.data || [];
      const stats: TicketStats = {
        total: tickets.length,
        open: tickets.filter(t => t.status === 'open').length,
        in_progress: tickets.filter(t => t.status === 'in_progress').length,
        resolved: tickets.filter(t => t.status === 'resolved').length,
        closed: tickets.filter(t => t.status === 'closed').length};

      return { success: true, data: stats };
    } catch {
      return {
        success: false,
        error: {
          error: 'Ticket Stats Fetch Failed',
          details: 'Failed to fetch ticket statistics',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get ticket messages
   */
  async getTicketMessages(ticketId: number): Promise<ApiResult<{ ticket: any; messages: TicketMessage[]; unread_count: number }>> {
    try {
      const endpoint = `/api/admin/tickets/${ticketId}/messages`;
      const result = await apiService.get<{ success: boolean; data: { ticket: any; messages: TicketMessage[]; unread_count: number } }>(endpoint);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Messages Fetch Failed',
            details: 'Failed to fetch ticket messages',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Messages Fetch Failed',
          details: 'Failed to fetch ticket messages',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Add message to ticket (new endpoint)
   */
  async addTicketMessage(ticketId: number, request: AddMessageRequest): Promise<ApiResult<TicketMessage>> {
    try {
      const endpoint = `/api/admin/tickets/${ticketId}/messages`;
      const result = await apiService.post<{ success: boolean; data: TicketMessage }>(endpoint, request);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Message Add Failed',
            details: 'Failed to add message',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Message Add Failed',
          details: 'Failed to add message',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Mark ticket messages as read
   */
  async markTicketMessagesRead(ticketId: number): Promise<ApiResult<{ success: boolean }>> {
    try {
      const endpoint = `/api/admin/tickets/${ticketId}/read`;
      const result = await apiService.post<{ success: boolean; data: { success: boolean } }>(endpoint, {});

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Mark Read Failed',
            details: 'Failed to mark messages as read',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Mark Read Failed',
          details: 'Failed to mark messages as read',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Update ticket (Admin only)
   */
  async updateTicket(ticketId: number, request: UpdateTicketRequest): Promise<ApiResult<Ticket>> {
    try {
      const result = await apiService.put<{ success: boolean; data: Ticket }>(`/api/admin/tickets/${ticketId}`, request);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Ticket Update Failed',
            details: 'Failed to update ticket',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Ticket Update Failed',
          details: 'Failed to update ticket',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Assign ticket to self (Admin only)
   */
  async assignTicketToSelf(ticketId: number): Promise<ApiResult<{ success: boolean; assigned_to: number }>> {
    try {
      const result = await apiService.post<{ success: boolean; data: { success: boolean; assigned_to: number } }>(`/api/admin/tickets/${ticketId}/assign`, {});

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Ticket Assignment Failed',
            details: 'Failed to assign ticket',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Ticket Assignment Failed',
          details: 'Failed to assign ticket',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Delete ticket (Admin only)
   */
  async deleteTicket(ticketId: number): Promise<ApiResult<any>> {
    try {
      const result = await apiService.delete<{ success: boolean; data: any }>(`/api/admin/tickets/${ticketId}`);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Ticket Deletion Failed',
            details: 'Failed to delete ticket',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Ticket Deletion Failed',
          details: 'Failed to delete ticket',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Get total unread count
   */
  async getUnreadCount(): Promise<ApiResult<UnreadCountResponse>> {
    try {
      const endpoint = '/api/admin/tickets/unread-count';
      const result = await apiService.get<{ success: boolean; data: UnreadCountResponse }>(endpoint);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Unread Count Fetch Failed',
            details: 'Failed to fetch unread count',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Unread Count Fetch Failed',
          details: 'Failed to fetch unread count',
          timestamp: new Date().toISOString()}
      };
    }
  }

  /**
   * Reseller methods for ticket messages
   */
  async getResellerTicketMessages(ticketId: number): Promise<ApiResult<{ ticket: any; messages: TicketMessage[]; unread_count: number }>> {
    try {
      const endpoint = `/api/reseller/tickets/${ticketId}/messages`;
      const result = await apiService.get<{ success: boolean; data: { ticket: any; messages: TicketMessage[]; unread_count: number } }>(endpoint);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Messages Fetch Failed',
            details: 'Failed to fetch ticket messages',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Messages Fetch Failed',
          details: 'Failed to fetch ticket messages',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async addResellerTicketMessage(ticketId: number, request: AddMessageRequest): Promise<ApiResult<TicketMessage>> {
    try {
      const endpoint = `/api/reseller/tickets/${ticketId}/messages`;
      const result = await apiService.post<{ success: boolean; data: TicketMessage }>(endpoint, request);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Message Add Failed',
            details: 'Failed to add message',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Message Add Failed',
          details: 'Failed to add message',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async markResellerTicketMessagesRead(ticketId: number): Promise<ApiResult<{ success: boolean }>> {
    try {
      const endpoint = `/api/reseller/tickets/${ticketId}/read`;
      const result = await apiService.post<{ success: boolean; data: { success: boolean } }>(endpoint, {});

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Mark Read Failed',
            details: 'Failed to mark messages as read',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Mark Read Failed',
          details: 'Failed to mark messages as read',
          timestamp: new Date().toISOString()}
      };
    }
  }

  async getResellerUnreadCount(): Promise<ApiResult<UnreadCountResponse>> {
    try {
      const endpoint = '/api/reseller/tickets/unread-count';
      const result = await apiService.get<{ success: boolean; data: UnreadCountResponse }>(endpoint);

      if (result.success && result.data.success) {
        return {
          success: true,
          data: result.data.data
        };
      } else {
        return {
          success: false,
          error: {
            error: 'Unread Count Fetch Failed',
            details: 'Failed to fetch unread count',
            timestamp: new Date().toISOString()}
        };
      }
    } catch {
      return {
        success: false,
        error: {
          error: 'Unread Count Fetch Failed',
          details: 'Failed to fetch unread count',
          timestamp: new Date().toISOString()}
      };
    }
  }
}

export const ticketService = new TicketService();
