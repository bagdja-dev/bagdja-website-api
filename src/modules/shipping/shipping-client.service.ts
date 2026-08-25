import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BagdjaLogger } from '@bagdja/node-sdk';

export interface ShippingAreaResult {
  providerAreaId: string;
  name: string;
  type: string;
}

export interface ShippingCostRequest {
  origin_area_id: string;
  destination_area_id: string;
  weight_grams: number;
  courier_code?: string;
}

export interface ShippingCostOptionResult {
  courierCode: string;
  serviceName: string;
  cost: number;
  etdMinDays?: number;
  etdMaxDays?: number;
}

/**
 * Client proxy ke bagdja-shipping-service — cek ongkir & cari wilayah.
 * `bagdja-website-api` TIDAK memanggil RajaOngkir langsung (lihat
 * plan/shipping-service/overview.md). Pola client-credential + token cache
 * SAMA dengan `EscrowClientService` (modules/escrow/escrow-client.service.ts)
 * yang memanggil bagdja-payment-service — reuse `CLIENT_APP_ID`/
 * `CLIENT_APP_SECRET`/`BAGDJA_AUTH_API` yang sudah teregistrasi untuk
 * `website-builder`, tidak perlu identitas client-app baru.
 */
@Injectable()
export class ShippingClientService {
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
    this.logger.init(appId, 'system');

    this.apiUrl = (
      this.config.get<string>('BAGDJA_SHIPPING_API') ||
      'http://localhost:4007'
    ).replace(/\/$/, '');
    this.authApiUrl = (
      this.config.get<string>('BAGDJA_AUTH_API') || 'http://localhost:4001'
    ).replace(/\/$/, '');
    this.clientAppId = this.config.get<string>('CLIENT_APP_ID') || '';
    this.clientAppSecret = this.config.get<string>('CLIENT_APP_SECRET') || '';
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

  private async shippingFetch(
    path: string,
    init: RequestInit & { tag: string },
  ): Promise<Response> {
    let token: string;
    try {
      token = await this.getAuthToken();
    } catch (error: any) {
      this.logger.bagdjaLog(
        'error',
        `Failed to obtain client token (${init.tag})`,
        {
          data: { message: error?.message },
          tags: ['shipping-client', init.tag, 'auth-token'],
        },
      );
      throw new BadGatewayException(
        error?.message || 'Failed to authenticate with auth service',
      );
    }

    const { tag, ...fetchInit } = init;
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        ...fetchInit,
        headers: {
          ...(fetchInit.headers || {}),
          'x-api-token': token,
          'Content-Type': 'application/json',
        },
      });
    } catch (error: any) {
      this.logger.bagdjaLog('error', `Shipping API unreachable (${tag})`, {
        data: { path, message: error?.message },
        tags: ['shipping-client', tag, 'network'],
      });
      throw new BadGatewayException('Shipping service is unreachable');
    }
    return response;
  }

  async searchArea(query: string): Promise<ShippingAreaResult[]> {
    const response = await this.shippingFetch(
      `/shipping/areas?q=${encodeURIComponent(query)}`,
      { method: 'GET', tag: 'search-area' },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Shipping API error (searchArea)', {
        data: { query, status: response.status, message },
        tags: ['shipping-client', 'search-area'],
      });
      throw new BadGatewayException(message || 'Failed to search shipping area');
    }
    return (await response.json()) as ShippingAreaResult[];
  }

  async getCost(payload: ShippingCostRequest): Promise<ShippingCostOptionResult[]> {
    const response = await this.shippingFetch('/shipping/cost', {
      method: 'POST',
      tag: 'get-cost',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Shipping API error (getCost)', {
        data: { payload, status: response.status, message },
        tags: ['shipping-client', 'get-cost'],
      });
      throw new BadGatewayException(message || 'Failed to calculate shipping cost');
    }
    return (await response.json()) as ShippingCostOptionResult[];
  }
}
