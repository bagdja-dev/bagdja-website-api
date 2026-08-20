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
import { Website } from '../../entities/website.entity';

export interface SellerWalletResult {
  walletId: string;
  userId: string;
}

export interface BuyerWalletResult {
  walletId: string;
}

export interface CreateEscrowPayload {
  product_id: string;
  external_item_id?: string;
  buyer_wallet_id: string;
  seller_wallet_id: string;
  amount_total: number;
  currency: string;
  idempotency_key: string;
  metadata?: Record<string, unknown>;
  milestones: Array<{
    sequence: number;
    label: string;
    description?: string;
    amount: number;
  }>;
}

export interface EscrowSummary {
  id: string;
  status: string;
  amount_held: number;
  amount_released: number;
  remaining_hold: number;
}

/**
 * Provider/payment method TIDAK dipilih di sini — buyer memilihnya di
 * halaman Pay UI (pay.bagdja.com) sendiri, bukan lewat parameter API ini.
 */
export interface InitializeEscrowPaymentPayload {
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
}

export interface InitializeEscrowPaymentResult {
  checkoutUrl: string | null;
  refNumber: string;
  /** UUID `payment_requests.id` — dipakai untuk `website_transactions
   * .payment_request_id` (kolom uuid). `refNumber` (human-readable, mis.
   * "INV-20260820-XXXXXX") BUKAN uuid — jangan dipakai untuk kolom itu. */
  paymentRequestId: string | null;
}

/**
 * PH-4 & PH-5 (plan/website-builder/cart-and-implementation-payment-escrow.md):
 * Client proxy ke bagdja-payment-service khusus escrow di Website Builder.
 *
 * - PH-4 `resolveSellerWallet`: owner tenant -> personal wallet (pola POS:
 *   owner_user_id -> GET /wallets/user/:userId/IDR, auto-create di payment-service).
 * - PH-5 `ensureEscrowProductForWebsite`: auto-provision Escrow Product
 *   canonical di payment-service, satu per WEBSITE (bukan per produk lagi —
 *   lihat migration `20260820000001_add_websites_escrow_product_id.sql`),
 *   dipakai untuk semua produk website itu saat checkout. Idempotent via
 *   `websites.escrow_product_id`.
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
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
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

  // ─── PH-5: auto-provision Escrow Product canonical (per website) ────

  /**
   * Pastikan Escrow Product ada di payment-service (tabel dedicated
   * `escrow_products` — lihat plan/payment-service/escrow-milestone-decision.md
   * §3.0, catatan "superseded 2026-08-19") untuk sebuah WEBSITE (satu Escrow
   * Product dipakai untuk SEMUA produk website itu saat checkout — bukan
   * per-produk lagi, supaya konsisten dengan Escrow Fee Config yang juga
   * di-scope per product_id). Idempotent: kalau `websites.escrow_product_id`
   * sudah ada, tidak provision ulang.
   *
   * `name` = nama website (bukan nama produk) supaya gampang dicari di
   * console — tidak ada fallback/default bersama lintas website.
   */
  async ensureEscrowProductForWebsite(websiteId: string): Promise<string> {
    const website = await this.websiteRepo.findOne({ where: { id: websiteId } });
    if (!website) {
      throw new NotFoundException('Website not found — cannot ensure escrow product');
    }
    if (website.escrow_product_id) {
      return website.escrow_product_id;
    }

    const response = await this.paymentFetch('/escrow-products', {
      method: 'POST',
      tag: 'ensure-escrow-product',
      body: JSON.stringify({
        appId: this.clientAppId || 'website-builder',
        name: website.name,
        isDynamic: true,
        releaseMode: 'buyer_confirmation',
        milestoneRequired: true,
        allowPartialMilestoneRelease: false,
        disputeEnabled: true,
        releaseWindowEnforced: false,
        fullPaymentRequired: true,
        metadata: {
          website_id: website.id,
        },
      }),
    });
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (ensureEscrowProductForWebsite)', {
        data: { websiteId: website.id, status: response.status, message },
        tags: ['escrow-client', 'ensure-escrow-product'],
      });
      throw new BadGatewayException(message || 'Failed to provision escrow product');
    }

    const created = (await response.json()) as { id: string };
    if (!created?.id) {
      throw new BadGatewayException('Escrow product response missing id');
    }

    website.escrow_product_id = created.id;
    await this.websiteRepo.save(website);

    this.logger.bagdjaLog('info', 'Escrow product provisioned', {
      data: { websiteId: website.id, escrowProductId: created.id },
      tags: ['escrow-client', 'ensure-escrow-product', 'success'],
    });

    return created.id;
  }

  // ─── W2: resolve buyer wallet ────────────────────────────────────────

  /** Personal wallet buyer yang login (GET /wallets/user/:userId/IDR — auto-create). */
  async resolveBuyerWallet(userId: string): Promise<BuyerWalletResult> {
    const response = await this.paymentFetch(
      `/wallets/user/${encodeURIComponent(userId)}/IDR`,
      { method: 'GET', tag: 'resolve-buyer-wallet' },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (resolveBuyerWallet)', {
        data: { userId, status: response.status, message },
        tags: ['escrow-client', 'resolve-buyer-wallet'],
      });
      throw new BadGatewayException(message || 'Failed to resolve buyer wallet');
    }

    const wallet = (await response.json()) as { id: string };
    if (!wallet?.id) {
      throw new BadGatewayException('Buyer wallet response missing id');
    }
    return { walletId: wallet.id };
  }

  // ─── W2: create escrow (1 order = 1 escrow) ──────────────────────────

  async createEscrow(dto: CreateEscrowPayload): Promise<{ id: string; status: string }> {
    const response = await this.paymentFetch('/escrow', {
      method: 'POST',
      tag: 'create-escrow',
      body: JSON.stringify(dto),
    });
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (createEscrow)', {
        data: { status: response.status, message },
        tags: ['escrow-client', 'create-escrow'],
      });
      throw new BadGatewayException(message || 'Failed to create escrow');
    }
    const created = (await response.json()) as { id: string; status: string };
    if (!created?.id) {
      throw new BadGatewayException('Create escrow response missing id');
    }
    return created;
  }

  // ─── W2: initialize payment untuk escrow ─────────────────────────────

  async initializeEscrowPayment(
    escrowId: string,
    dto: InitializeEscrowPaymentPayload,
  ): Promise<InitializeEscrowPaymentResult> {
    const response = await this.paymentFetch(
      `/escrow/${encodeURIComponent(escrowId)}/initialize-payment`,
      { method: 'POST', tag: 'initialize-escrow-payment', body: JSON.stringify(dto) },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog(
        'error',
        'Payment API error (initializeEscrowPayment)',
        {
          data: { escrowId, status: response.status, message },
          tags: ['escrow-client', 'initialize-escrow-payment'],
        },
      );
      throw new BadGatewayException(
        message || 'Failed to initialize escrow payment',
      );
    }
    const result = (await response.json()) as {
      checkoutUrl: string | null;
      refNumber: string;
      payment_request_id?: string | null;
    };
    return {
      checkoutUrl: result.checkoutUrl ?? null,
      refNumber: result.refNumber,
      paymentRequestId: result.payment_request_id ?? null,
    };
  }

  // ─── W2: baca status escrow (sinkronisasi order, PH-6 pull/polling) ──

  async getEscrow(escrowId: string): Promise<EscrowSummary> {
    const response = await this.paymentFetch(
      `/escrow/${encodeURIComponent(escrowId)}`,
      { method: 'GET', tag: 'get-escrow' },
    );
    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Payment API error (getEscrow)', {
        data: { escrowId, status: response.status, message },
        tags: ['escrow-client', 'get-escrow'],
      });
      throw new BadGatewayException(message || 'Failed to get escrow');
    }
    const escrow = (await response.json()) as {
      id: string;
      status: string;
      amount_held: number;
      amount_released: number;
      remaining_hold: number;
    };
    return {
      id: escrow.id,
      status: escrow.status,
      amount_held: escrow.amount_held,
      amount_released: escrow.amount_released,
      remaining_hold: escrow.remaining_hold,
    };
  }
}
