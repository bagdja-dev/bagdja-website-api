import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BagdjaLogger } from '@bagdja/node-sdk';

@Injectable()
export class SubscriptionsService {
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

  /** App slug untuk scope plan (`GET /subscription-plans/active?appId=`). */
  get appId(): string {
    return this.clientAppId || 'bagdja-website';
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
      const parsed = JSON.parse(rawText) as { message?: string | string[] };
      if (Array.isArray(parsed.message)) return parsed.message.join(', ');
      return parsed.message || rawText;
    } catch {
      return rawText;
    }
  }

  private async withToken(): Promise<string> {
    try {
      return await this.getAuthToken();
    } catch (error: any) {
      this.logger.bagdjaLog(
        'error',
        'Failed to obtain client token (subscriptions)',
        {
          data: { message: error?.message },
          tags: ['subscriptions', 'auth-token'],
        },
      );
      throw new BadGatewayException(
        error?.message || 'Failed to authenticate with auth service',
      );
    }
  }

  private async paymentFetch(
    path: string,
    init: RequestInit & { tag: string },
  ): Promise<Response> {
    const token = await this.withToken();
    const { tag, ...fetchInit } = init;
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        ...fetchInit,
        headers: {
          ...(fetchInit.headers || {}),
          'x-api-token': token,
        },
      });
    } catch (error: any) {
      this.logger.bagdjaLog(
        'error',
        `Payment API unreachable (${tag})`,
        {
          data: { path, message: error?.message },
          tags: ['subscriptions', tag, 'network'],
        },
      );
      throw new BadGatewayException('Payment service is unreachable');
    }
    return response;
  }

  async listActivePlans(): Promise<unknown[]> {
    const response = await this.paymentFetch(
      `/subscription-plans/active?appId=${encodeURIComponent(this.appId)}`,
      { method: 'GET', tag: 'list-plans' },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog(
        'error',
        'Payment API error (listActivePlans)',
        {
          data: { status: response.status, message },
          tags: ['subscriptions', 'list-plans'],
        },
      );
      throw new BadGatewayException(message || 'Failed to list subscription plans');
    }
    return response.json();
  }

  async findMy(userId: string): Promise<unknown[]> {
    const response = await this.paymentFetch(
      `/subscriptions/my?userId=${encodeURIComponent(userId)}`,
      { method: 'GET', tag: 'find-my' },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (findMy)', {
        data: { userId, status: response.status, message },
        tags: ['subscriptions', 'find-my'],
      });
      throw new BadGatewayException(message || 'Failed to fetch subscriptions');
    }
    return response.json();
  }

  async subscribe(userId: string, planId: string): Promise<unknown> {
    const response = await this.paymentFetch('/subscriptions/subscribe', {
      method: 'POST',
      tag: 'subscribe',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, userId }),
    });
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (subscribe)', {
        data: { userId, planId, status: response.status, message },
        tags: ['subscriptions', 'subscribe'],
      });
      throw new BadGatewayException(message || 'Failed to subscribe');
    }
    return response.json();
  }

  async getBillingHistory(subscriptionId: string): Promise<unknown[]> {
    const response = await this.paymentFetch(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/billing-history`,
      { method: 'GET', tag: 'billing-history' },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog(
        'error',
        'Payment API error (billingHistory)',
        {
          data: { subscriptionId, status: response.status, message },
          tags: ['subscriptions', 'billing-history'],
        },
      );
      throw new BadGatewayException(message || 'Failed to fetch billing history');
    }
    return response.json();
  }

  async cancel(
    subscriptionId: string,
    cancelAtPeriodEnd = true,
  ): Promise<unknown> {
    const response = await this.paymentFetch(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      {
        method: 'POST',
        tag: 'cancel',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelAtPeriodEnd }),
      },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (cancel)', {
        data: {
          subscriptionId,
          cancelAtPeriodEnd,
          status: response.status,
          message,
        },
        tags: ['subscriptions', 'cancel'],
      });
      throw new BadGatewayException(message || 'Failed to cancel subscription');
    }
    return response.json();
  }

  async getFreePlan(): Promise<any | null> {
    try {
      const plans = await this.listActivePlans();
      if (!Array.isArray(plans)) {
        return null;
      }

      const freePlan = plans.find(
        (p: any) => p.code === 'free' || Number(p.price) === 0,
      );

      if (!freePlan) {
        this.logger.bagdjaLog('warn', 'No free plan found', {
          tags: ['subscriptions', 'auto-subscribe', 'no-free-plan'],
        });
      }

      return freePlan || null;
    } catch (error: any) {
      this.logger.bagdjaLog('error', 'Failed to get free plan', {
        data: { message: error?.message },
        tags: ['subscriptions', 'auto-subscribe', 'get-free-plan-error'],
      });
      return null;
    }
  }

  async autoSubscribeFreeIfEligible(userId: string): Promise<{
    autoSubscribed: boolean;
    subscription?: any;
    reason?: string;
    error?: string;
  }> {
    try {
      const existing = await this.findMy(userId);
      if (Array.isArray(existing) && existing.length > 0) {
        this.logger.bagdjaLog(
          'info',
          'User already has subscription(s), skipping auto-subscribe',
          {
            data: { userId, subscriptionCount: existing.length },
            tags: ['subscriptions', 'auto-subscribe', 'already-subscribed'],
          },
        );
        return {
          autoSubscribed: false,
          reason: 'already_subscribed',
        };
      }

      const freePlan = await this.getFreePlan();
      if (!freePlan) {
        this.logger.bagdjaLog(
          'warn',
          'Cannot auto-subscribe: free plan not found',
          {
            data: { userId },
            tags: ['subscriptions', 'auto-subscribe', 'no-free-plan'],
          },
        );
        return {
          autoSubscribed: false,
          reason: 'no_free_plan',
        };
      }

      const subscription = await this.subscribe(userId, freePlan.id);

      this.logger.bagdjaLog(
        'info',
        'User auto-subscribed to free plan',
        {
          data: {
            userId,
            planId: freePlan.id,
            planCode: freePlan.code,
            planName: freePlan.name,
          },
          tags: ['subscriptions', 'auto-subscribe', 'success'],
        },
      );

      return {
        autoSubscribed: true,
        subscription,
      };
    } catch (error: any) {
      this.logger.bagdjaLog(
        'error',
        'Auto-subscribe to free plan failed',
        {
          data: {
            userId,
            message: error?.message,
            errorType: error?.constructor?.name,
          },
          tags: ['subscriptions', 'auto-subscribe', 'error'],
        },
      );
      return {
        autoSubscribed: false,
        reason: 'error',
        error: error?.message || 'Unknown error during auto-subscribe',
      };
    }
  }

  async changePlan(subscriptionId: string, newPlanId: string): Promise<unknown> {
    const response = await this.paymentFetch(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/change-plan`,
      {
        method: 'POST',
        tag: 'change-plan',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlanId }),
      },
    );

    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (changePlan)', {
        data: {
          subscriptionId,
          newPlanId,
          status: response.status,
          message,
        },
        tags: ['subscriptions', 'change-plan'],
      });
      throw new BadGatewayException(
        message || 'Failed to change subscription plan',
      );
    }

    this.logger.bagdjaLog('info', 'Subscription plan changed successfully', {
      data: { subscriptionId, newPlanId },
      tags: ['subscriptions', 'change-plan', 'success'],
    });

    return response.json();
  }
}
