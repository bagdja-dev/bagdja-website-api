import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatTopicResponse {
  id: string;
  appId: string;
  orgId: string;
  type: string;
}

export interface ChatMessageResponse {
  id: string;
  topicId: string;
  senderUserId: string;
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  body: string;
  parentMessageId: string | null;
  threadRootMessageId: string;
  replyCount: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface ChatMessageListResponse {
  items: ChatMessageResponse[];
  total: number;
}

export interface ChatDirectTopicResponse {
  id: string;
  appId: string;
  orgId: string;
  type: string;
  accessMode: string;
  dmKey: string;
}

export interface ChatReadStateItem {
  topicId: string;
  lastReadMessageId: string | null;
  unreadCount: number;
}

@Injectable()
export class ChatServiceClient {
  private readonly logger = new Logger(ChatServiceClient.name);
  private readonly baseUrl: string;
  private readonly authApiUrl: string;
  private readonly clientAppId: string;
  private readonly clientAppSecret: string;
  private readonly appId: string;
  private readonly orgId: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (config.get<string>('CHAT_SERVICE_URL') ?? 'http://localhost:3008').replace(/\/$/, '');
    this.authApiUrl = (config.get<string>('BAGDJA_AUTH_API') ?? 'http://localhost:4001').replace(/\/$/, '');
    this.clientAppId = config.get<string>('CLIENT_APP_ID') ?? '';
    this.clientAppSecret = config.get<string>('CLIENT_APP_SECRET') ?? '';
    this.appId = config.get<string>('CLIENT_APP_ID', 'bagdja-website');
    this.orgId = config.get<string>('CHAT_SERVICE_ORG_ID', 'bagdja');
  }

  private async getAuthToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token;
    }

    if (!this.clientAppId || !this.clientAppSecret) {
      throw new BadGatewayException('CLIENT_APP_ID or CLIENT_APP_SECRET is not configured');
    }

    const response = await fetch(`${this.authApiUrl}/auth/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.clientAppId, app_secret: this.clientAppSecret }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadGatewayException(`Failed to get auth token: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { 'x-api-token': string; expires_in?: number };
    const token = data['x-api-token'];
    const expiresIn = data.expires_in || 3600;
    this.tokenCache = { token, expiresAt: now + expiresIn * 1000 };
    return token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let token: string;
    try {
      token = await this.getAuthToken();
    } catch (error) {
      this.logger.error('Failed to obtain client token for chat-service', error);
      throw new BadGatewayException('Failed to authenticate with auth service');
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': token,
          ...(options.headers ?? {}),
        },
      });

      const body = await response.text();
      let parsed: unknown = null;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        this.logger.error(`Chat service ${options.method ?? 'GET'} ${path} failed with ${response.status}`);
        throw new BadGatewayException('Chat service request failed');
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
      this.logger.error(
        `Chat service ${options.method ?? 'GET'} ${path} failed: ${error instanceof Error ? error.message : String(error)}${cause ? ` | cause: ${cause instanceof Error ? cause.message : String(cause)}` : ''}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException('Chat service is unavailable');
    }
  }

  async createTopic(input: {
    type: string;
    accessMode?: 'invite';
    createdByUserId: string;
  }): Promise<ChatTopicResponse> {
    return this.request<ChatTopicResponse>('/topics', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async createDirectTopic(input: {
    dmKey: string;
    participantUserIds: string[];
    name?: string;
    createdByUserId: string;
  }): Promise<ChatDirectTopicResponse> {
    return this.request<ChatDirectTopicResponse>('/topics/direct', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listMessages(topicId: string, limit = 20, offset = 0): Promise<ChatMessageListResponse> {
    return this.request<ChatMessageListResponse>(
      `/topics/${encodeURIComponent(topicId)}/messages?limit=${limit}&offset=${offset}`,
    );
  }

  async createMessage(
    topicId: string,
    input: {
      senderUserId: string;
      senderDisplayName?: string | null;
      senderAvatarUrl?: string | null;
      body: string;
      parentMessageId?: string | null;
    },
  ): Promise<ChatMessageResponse> {
    return this.request<ChatMessageResponse>(`/topics/${encodeURIComponent(topicId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async markTopicRead(topicId: string, userId: string): Promise<{ topicId: string; lastReadMessageId: string | null }> {
    return this.request(`/topics/${encodeURIComponent(topicId)}/read`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async getReadState(userId: string, topicIds: string[]): Promise<ChatReadStateItem[]> {
    if (topicIds.length === 0) {
      return [];
    }

    return this.request<ChatReadStateItem[]>('/topics/read-state', {
      method: 'POST',
      body: JSON.stringify({ userId, topicIds }),
    });
  }

  async getRealtimeWsToken(): Promise<{ access_token: string; expires_in: number; channels: string[] }> {
    const token = await this.getAuthToken();
    const eventServiceUrl = (this.config.get<string>('EVENT_SERVICE_URL') ?? 'http://localhost:4085').replace(/\/$/, '');
    const response = await fetch(`${eventServiceUrl}/subscriptions/token`, {
      method: 'POST',
      headers: { 'x-api-key': token, 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadGatewayException(`Failed to get realtime token: ${response.status} ${errorText}`);
    }

    return (await response.json()) as { access_token: string; expires_in: number; channels: string[] };
  }
}
