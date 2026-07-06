import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BagdjaLogger } from '@bagdja/node-sdk';

export interface SendEmailOptions {
  to: string;
  template: string;
  context: Record<string, string>;
  appId?: string;
}

@Injectable()
export class MessagingService {
  private readonly apiUrl: string;
  private readonly authApiUrl: string;
  private readonly clientAppId: string;
  private readonly clientAppSecret: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: BagdjaLogger,
  ) {
    const appId = this.config.get<string>('CLIENT_APP_ID') || 'bagdja-website';
    const orgId = this.config.get<string>('BAGDJA_ORG_ID') || 'system';
    this.logger.init(appId, orgId);

    this.apiUrl =
      this.config.get<string>('BAGDJA_MESSAGE_API') ||
      this.config.get<string>('MESSAGE_SERVICE_URL') ||
      'https://messaging.bagdja.com';
    this.authApiUrl =
      this.config.get<string>('BAGDJA_AUTH_API') ||
      this.config.get<string>('AUTH_SERVICE_URL') ||
      'https://auth.bagdja.com';
    this.clientAppId = this.config.get<string>('CLIENT_APP_ID') || '';
    this.clientAppSecret = this.config.get<string>('CLIENT_APP_SECRET') || '';
  }

  get staffInvitationTemplate(): string {
    return this.config.get<string>('STAFF_INVITATION_TEMPLATE') || 'StaffInvitation';
  }

  get adminAppUrl(): string {
    return (
      this.config.get<string>('ADMIN_APP_URL') ||
      this.config.get<string>('NEXT_PUBLIC_APP_URL') ||
      'http://localhost:5004'
    ).replace(/\/$/, '');
  }

  private async getAuthToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token;
    }

    if (!this.clientAppId || !this.clientAppSecret) {
      throw new Error('CLIENT_APP_ID or CLIENT_APP_SECRET is not configured');
    }

    const url = `${this.authApiUrl.replace(/\/$/, '')}/auth/client`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.clientAppId,
        app_secret: this.clientAppSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get auth token: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { 'x-api-token': string; expires_in?: number };
    const token = data['x-api-token'];
    const expiresIn = data.expires_in || 3600;

    this.tokenCache = {
      token,
      expiresAt: now + expiresIn * 1000,
    };

    return token;
  }

  async sendEmail({ to, template, context, appId }: SendEmailOptions): Promise<boolean> {
    try {
      const token = await this.getAuthToken();
      const url = `${this.apiUrl.replace(/\/$/, '')}/messages/email/send`;

      const payload: Record<string, unknown> = { to, template, context };
      if (appId) payload.appId = appId;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': token,
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();

      if (!response.ok) {
        let message = rawText;
        try {
          const parsed = rawText ? JSON.parse(rawText) : {};
          message = parsed.message || message;
        } catch {
          /* keep rawText */
        }
        this.logger.bagdjaLog('error', 'Messaging API error', {
          data: { to, template, status: response.status, message },
          tags: ['messaging', 'email-failed'],
        });
        return false;
      }

      this.logger.bagdjaLog('info', 'Email sent via messaging service', {
        data: { to, template },
        tags: ['messaging', 'email-sent'],
      });
      return true;
    } catch (err) {
      this.logger.bagdjaLog('error', 'MessagingService error', {
        data: { error: err instanceof Error ? err.message : err, to, template },
        tags: ['messaging', 'email-error'],
      });
      return false;
    }
  }
}
