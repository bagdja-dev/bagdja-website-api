import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BagdjaLogger } from '@bagdja/node-sdk';

export interface WalletBalance {
  id: string;
  org_id: string | null;
  user_id: string | null;
  currency_code: string;
  provider: string;
  balance: number;
  held_balance: number;
  is_active: boolean;
  activated_at: string | null;
  updated_at: string | null;
}

export interface TopupResult {
  success: boolean;
  checkoutUrl: string;
  refNumber: string;
  [key: string]: unknown;
}

@Injectable()
export class WalletService {
  private readonly apiUrl: string;
  private readonly authApiUrl: string;
  private readonly clientAppId: string;
  private readonly clientAppSecret: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: BagdjaLogger,
  ) {
    const appId =
      this.config.get<string>('CLIENT_APP_ID') || 'bagdja-website';
    this.logger.init(appId, 'system');

    this.apiUrl = (
      this.config.get<string>('BAGDJA_PAYMENT_API') || 'http://localhost:4006'
    ).replace(/\/$/, '');
    this.authApiUrl = (
      this.config.get<string>('BAGDJA_AUTH_API') || 'http://localhost:4001'
    ).replace(/\/$/, '');
    this.clientAppId = this.config.get<string>('CLIENT_APP_ID') || '';
    this.clientAppSecret = this.config.get<string>('CLIENT_APP_SECRET') || '';
  }

  get adminAppUrl(): string {
    return (
      this.config.get<string>('ADMIN_APP_URL') || 'http://localhost:5004'
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

    const response = await fetch(`${this.authApiUrl}/auth/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.clientAppId,
        app_secret: this.clientAppSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get auth token: ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      'x-api-token': string;
      expires_in?: number;
    };
    const token = data['x-api-token'];
    const expiresIn = data.expires_in || 3600;

    this.tokenCache = { token, expiresAt: now + expiresIn * 1000 };
    return token;
  }

  private async parseErrorMessage(response: Response): Promise<string> {
    const rawText = await response.text();
    try {
      return JSON.parse(rawText).message || rawText;
    } catch {
      return rawText;
    }
  }

  async getBalance(userId: string, currency = 'IDR'): Promise<WalletBalance> {
    let token: string;
    try {
      token = await this.getAuthToken();
    } catch (error: any) {
      this.logger.bagdjaLog(
        'error',
        'Failed to obtain client token (getBalance)',
        {
          data: { userId, currency, message: error?.message },
          tags: ['wallet', 'balance-failed', 'auth-token'],
        },
      );
      throw new BadGatewayException(
        error?.message || 'Failed to authenticate with auth service',
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${this.apiUrl}/wallets/user/${encodeURIComponent(userId)}/${encodeURIComponent(
          currency,
        )}`,
        { headers: { 'x-api-token': token } },
      );
    } catch (error: any) {
      this.logger.bagdjaLog('error', 'Payment API unreachable (getBalance)', {
        data: { userId, currency, message: error?.message },
        tags: ['wallet', 'balance-failed', 'network'],
      });
      throw new BadGatewayException('Payment service is unreachable');
    }

    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (getBalance)', {
        data: { userId, currency, status: response.status, message },
        tags: ['wallet', 'balance-failed'],
      });
      throw new BadGatewayException(
        message || 'Failed to fetch wallet balance',
      );
    }

    return response.json();
  }

  async topup(
    userId: string,
    amount: number,
    currency: string,
    successRedirectUrl: string,
    failureRedirectUrl?: string,
  ): Promise<TopupResult> {
    let token: string;
    try {
      token = await this.getAuthToken();
    } catch (error: any) {
      this.logger.bagdjaLog(
        'error',
        'Failed to obtain client token (topup)',
        {
          data: { userId, amount, currency, message: error?.message },
          tags: ['wallet', 'topup-failed', 'auth-token'],
        },
      );
      throw new BadGatewayException(
        error?.message || 'Failed to authenticate with auth service',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/topup/personal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': token,
        },
        body: JSON.stringify({
          userId,
          amount,
          currency,
          successRedirectUrl,
          failureRedirectUrl,
        }),
      });
    } catch (error: any) {
      this.logger.bagdjaLog('error', 'Payment API unreachable (topup)', {
        data: { userId, amount, currency, message: error?.message },
        tags: ['wallet', 'topup-failed', 'network'],
      });
      throw new BadGatewayException('Payment service is unreachable');
    }

    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (topup)', {
        data: { userId, amount, currency, status: response.status, message },
        tags: ['wallet', 'topup-failed'],
      });
      throw new BadGatewayException(message || 'Failed to initialize topup');
    }

    return response.json();
  }
}
