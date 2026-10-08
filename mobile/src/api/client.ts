// mobile/src/api/client.ts
import type {
  User, Contact, ConversationSummary, Message, Attachment,
  CallRecord, AuthResponse, ApiError, UUID,
} from '@lan-comm/shared';

class ApiClient {
  private baseUrl = 'http://127.0.0.1:3000';
  private token: string | null = null;

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = (data as ApiError).error || {
        code: 'HTTP_ERROR',
        message: `Erreur ${res.status}: ${res.statusText}`,
      };
      throw new Error(error.message);
    }

    return data as T;
  }

  // Health
  async checkHealth(url?: string): Promise<{ ok: boolean; name: string; version: string }> {
    const target = (url || this.baseUrl).replace(/\/+$/, '');
    const res = await fetch(`${target}/health`);
    if (!res.ok) throw new Error('Serveur injoignable');
    return res.json();
  }

  // Auth
  async register(input: {
    username: string;
    phoneNumber: string;
    displayName: string;
    password: string;
    role?: 'admin' | 'user';
  }): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async login(usernameOrPhone: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrPhone, password }),
    });
  }

  async getMe(): Promise<User> {
    return this.request<User>('/api/v1/auth/me');
  }

  // Users & Contacts
  async getUsers(): Promise<Array<User & { online: boolean }>> {
    return this.request<Array<User & { online: boolean }>>('/api/v1/users');
  }

  async getContacts(): Promise<Array<Contact & { user: User }>> {
    return this.request<Array<Contact & { user: User }>>('/api/v1/contacts');
  }

  async addContact(contactUserId: UUID, nickname: string): Promise<Contact> {
    return this.request<Contact>('/api/v1/contacts', {
      method: 'POST',
      body: JSON.stringify({ contactUserId, nickname }),
    });
  }

  async deleteContact(contactUserId: UUID): Promise<void> {
    await this.request(`/api/v1/contacts/${contactUserId}`, { method: 'DELETE' });
  }

  // Conversations & Messages
  async getConversations(): Promise<ConversationSummary[]> {
    return this.request<ConversationSummary[]>('/api/v1/conversations');
  }

  async createConversation(userId: UUID): Promise<ConversationSummary> {
    return this.request<ConversationSummary>('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ type: 'direct', userId }),
    });
  }

  async getMessages(conversationId: UUID, beforeSeq?: number, limit = 40): Promise<Message[]> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (beforeSeq) params.set('beforeSeq', beforeSeq.toString());
    return this.request<Message[]>(`/api/v1/conversations/${conversationId}/messages?${params.toString()}`);
  }

  // Calls
  async getCalls(limit = 50): Promise<CallRecord[]> {
    return this.request<CallRecord[]>(`/api/v1/calls?limit=${limit}`);
  }

  // Files
  getFileUrl(fileId: UUID): string {
    return `${this.baseUrl}/api/v1/files/${fileId}`;
  }

  async uploadFile(formData: FormData): Promise<Attachment> {
    return this.request<Attachment>('/api/v1/files', {
      method: 'POST',
      body: formData,
    });
  }
}

export const api = new ApiClient();
