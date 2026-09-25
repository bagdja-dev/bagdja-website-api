import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WebsiteChatChannelType = 'product' | 'support' | 'order' | 'transaction';
export type WebsiteChatSenderType = 'customer' | 'admin' | 'system';
export type WebsiteUserRole = 'admin' | 'customer';

export interface WebsiteChatThreadCreatedEventPayload {
  merchantId: string;
  websiteId: string;
  appId: string;
  orgId: string;
  threadId: string;
  channelType: WebsiteChatChannelType;
  customerUserId: string;
  productId?: string | null;
  orderId?: string | null;
  assignedAdminUserId?: string | null;
  createdAt: string;
}

export interface WebsiteChatMessageCreatedEventPayload {
  merchantId: string;
  websiteId: string;
  appId: string;
  orgId: string;
  threadId: string;
  messageId: string;
  channelType: WebsiteChatChannelType;
  senderType: WebsiteChatSenderType;
  senderUserId: string;
  body: string;
  createdAt: string;
}

export interface WebsiteChatUnreadUpdatedEventPayload {
  merchantId: string;
  websiteId: string;
  appId: string;
  orgId: string;
  threadId: string;
  userId: string;
  userRole: WebsiteUserRole;
  unreadCount: number;
  updatedAt: string;
}

@Injectable()
export class WebsiteEventBroadcasterService {
  private readonly logger = new Logger(WebsiteEventBroadcasterService.name);
  private cachedToken: string | null = null;
  private tokenExpiry = 0;

  constructor(private readonly config: ConfigService) {}

  async publishChatThreadCreated(payload: WebsiteChatThreadCreatedEventPayload): Promise<void> {
    await this.broadcast('website.chat.thread.created', payload);
  }

  async publishChatMessageCreated(payload: WebsiteChatMessageCreatedEventPayload): Promise<void> {
    await this.broadcast('website.chat.message.created', payload);
  }

  async publishChatUnreadUpdated(payload: WebsiteChatUnreadUpdatedEventPayload): Promise<void> {
    await this.broadcast('website.chat.unread.updated', payload);
  }

  async publishNotificationCreated(payload: object): Promise<void> {
    await this.broadcast('website.notification.created', payload);
  }

  private async broadcast(eventName: string, data: object): Promise<void> {
    const token = await this.getApiToken();
    if (!token) {
      return;
    }

    const eventServiceUrl = (this.config.get<string>('EVENT_SERVICE_URL') ?? 'http://localhost:4085').replace(/\/$/, '');
    const orgId = this.config.get<string>('EVENT_ORG_ID') ?? this.config.get<string>('CHAT_SERVICE_ORG_ID') ?? 'bagdja';
    const appId = this.config.get<string>('EVENT_APP_ID') ?? this.config.get<string>('CLIENT_APP_ID') ?? 'bagdja-website-api';

    try {
      const response = await fetch(`${eventServiceUrl}/broadcast`, {
        method: 'POST',
        headers: {
          'x-api-key': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId,
          appId,
          eventName,
          data,
          signature: this.config.get<string>('EVENT_SIGNATURE') ?? 'mock-signature-for-dev',
        }),
      });

      if (!response.ok) {
        this.logger.error(`Website event broadcast rejected: ${response.status} ${await response.text()}`);
        return;
      }

      this.logger.debug(`Published website event ${eventName} via Event Hub`);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast ${eventName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async getApiToken(): Promise<string | null> {
    const now = Date.now();
    if (this.cachedToken && this.tokenExpiry > now + 60_000) {
      return this.cachedToken;
    }

    const authApiUrl = (this.config.get<string>('BAGDJA_AUTH_API') ?? 'http://localhost:4001').replace(/\/$/, '');
    const clientAppId = this.config.get<string>('CLIENT_APP_ID');
    const clientAppSecret = this.config.get<string>('CLIENT_APP_SECRET');

    if (!clientAppId || !clientAppSecret) {
      this.logger.warn('CLIENT_APP_ID / CLIENT_APP_SECRET missing; website event broadcast skipped');
      return null;
    }

    try {
      const response = await fetch(`${authApiUrl}/auth/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: clientAppId, app_secret: clientAppSecret }),
      });

      if (!response.ok) {
        throw new Error(`Auth failed: ${response.status}`);
      }

      const data = (await response.json()) as { 'x-api-token'?: string; expires_in?: number };
      if (!data['x-api-token']) {
        throw new Error('Auth response missing x-api-token');
      }

      this.cachedToken = data['x-api-token'];
      this.tokenExpiry = now + (data.expires_in ?? 3600) * 1000;
      return this.cachedToken;
    } catch (error) {
      this.logger.error(
        `Failed to obtain Event Hub token: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
