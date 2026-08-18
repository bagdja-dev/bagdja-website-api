import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BagdjaLogger } from '@bagdja/node-sdk';

import { TenantStaff } from '../../entities/tenant-staff.entity';
import { WebsiteProduct } from '../../entities/website-product.entity';

export interface SellerWalletResult {
  walletId: string;
  userId: string;
}

/**
 * PH-4 & PH-5 (plan/website-builder/cart-and-implementation-payment-escrow.md):
 * Client proxy ke bagdja-payment-service khusus escrow di Website Builder.
 *
 * - PH-4 `resolveSellerWallet`: owner tenant -> personal wallet (pola POS:
 *   owner_user_id -> GET /wallets/user/:userId/IDR, auto-create di payment-service).
 * - PH-5 `ensureEscrowProduct`: auto-provision `products.type='ESCROW'`
 *   canonical di payment-service, simpan `escrow_product_id` di metadata
 *   website product (idempotent — tidak double-provision).
 *
 * Pola client credential + token cache sama dgn SubscriptionsService/WalletService.
 */
@Injectable()
export class EscrowClientService {
  private readonly apiUrl: string;
  private readonly authApiUrl: string;
  private readonly clientAppId: string;
  private readonly clientAppSecret: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: BagdjaLogger,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
  ) {
    const appId = this.config.get<string>('CLIENT_APP_ID') || 'bagdja-website';
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

  private async paymentFetch(
    path: string,
    init: RequestInit & { tag: string },
  ): Promise<Response> {
    let token: string;
    try {
      token = await this.getAuthToken();
    } catch (error: any) {
      this.logger.bagdjaLog('error', `Failed to obtain client token (${init.tag})`, {
        data: { message: error?.message },
        tags: ['escrow-client', init.tag, 'auth-token'],
      });
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
      this.logger.bagdjaLog('error', `Payment API unreachable (${tag})`, {
        data: { path, message: error?.message },
        tags: ['escrow-client', tag, 'network'],
      });
      throw new BadGatewayException('Payment service is unreachable');
    }
    return response;
  }

  // ─── PH-4: resolve seller wallet dari owner tenant ──────────────────

  /**
   * Resolve wallet penjual (seller_wallet_id untuk escrow) dari owner website.
   * Owner = tenant_staff role 'owner' is_active -> user_id -> personal wallet
   * (GET /wallets/user/:userId/IDR — auto-create di payment-service).
   */
  async resolveSellerWallet(websiteId: string): Promise<SellerWalletResult> {
    const owner = await this.staffRepo.findOne({
      where: { website_id: websiteId, role: 'owner', is_active: true },
    });
    if (!owner) {
      throw new NotFoundException(
        'Website owner not found — cannot resolve seller wallet',
      );
    }

    const response = await this.paymentFetch(
      `/wallets/user/${encodeURIComponent(owner.user_id)}/IDR`,
      { method: 'GET', tag: 'resolve-seller-wallet' },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (resolveSellerWallet)', {
        data: { websiteId, userId: owner.user_id, status: response.status, message },
        tags: ['escrow-client', 'resolve-seller-wallet'],
      });
      throw new BadGatewayException(message || 'Failed to resolve seller wallet');
    }

    const wallet = (await response.json()) as { id: string };
    if (!wallet?.id) {
      throw new BadGatewayException('Seller wallet response missing id');
    }

    return { walletId: wallet.id, userId: owner.user_id };
  }

  // ─── PH-5: auto-provision Escrow Product canonical ──────────────────

  /**
   * Pastikan product ESCROW canonical ada di payment-service untuk sebuah
   * website product (mode ADD_TO_CART/ESCROW). Idempotent: kalau
   * `metadata.escrow_product_id` sudah ada, tidak provision ulang.
   * Simpan escrow_product_id di metadata produk website.
   */
  async ensureEscrowProduct(product: WebsiteProduct): Promise<string> {
    const existing = product.metadata?.escrow_product_id;
    if (typeof existing === 'string' && existing) {
      return existing;
    }

    const response = await this.paymentFetch('/products', {
      method: 'POST',
      tag: 'ensure-escrow-product',
      body: JSON.stringify({
        appId: this.clientAppId || 'website-builder',
        name: `Escrow: ${product.name}`,
        type: 'ESCROW',
        isDynamic: true,
        metadata: {
          website_product_id: product.id,
          escrow_policy: {
            release_mode: 'buyer_confirmation',
            milestone_required: true,
            allow_partial_milestone_release: false,
            dispute_enabled: true,
            release_window_enforced: false,
          },
          payment_policy: {
            full_payment_required: true,
          },
        },
      }),
    });
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (ensureEscrowProduct)', {
        data: { websiteProductId: product.id, status: response.status, message },
        tags: ['escrow-client', 'ensure-escrow-product'],
      });
      throw new BadGatewayException(message || 'Failed to provision escrow product');
    }

    const created = (await response.json()) as { id: string };
    if (!created?.id) {
      throw new BadGatewayException('Escrow product response missing id');
    }

    // Simpan escrow_product_id di metadata website product (persist)
    product.metadata = { ...(product.metadata ?? {}), escrow_product_id: created.id };
    await this.productRepo.save(product);

    this.logger.bagdjaLog('info', 'Escrow product provisioned', {
      data: { websiteProductId: product.id, escrowProductId: created.id },
      tags: ['escrow-client', 'ensure-escrow-product', 'success'],
    });

    return created.id;
  }
}
