import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';

import {
  WebsiteOrder,
  WebsiteProduct,
  WebsiteTransaction,
  WebsiteTransactionItem,
} from '../../entities';
import type { AuthUser } from '../../common/auth';
import { EscrowClientService } from '../escrow/escrow-client.service';
import { CreateTransactionCheckoutDto } from './dto/create-transaction-checkout.dto';

const CHECKOUT_MODES = new Set(['ADD_TO_CART', 'ESCROW']);

/** Status yang masih relevan untuk pull sync status dari escrow (PH-6). */
const SYNCABLE_STATUSES = new Set(['PENDING_PAYMENT', 'HELD', 'DISPUTED']);

/**
 * Website transaction — W2.8. Pemisahan cart (website_orders) vs transaksi:
 * - Cart: order PENDING (transaction_id IS NULL).
 * - Checkout: buat website_transactions + website_transaction_items (item =
 *   id order), set order.transaction_id → order lepas dari cart.
 * - Bayar: escrow + payment DI LEVEL TRANSAKSI (1 transaksi = 1 escrow,
 *   amount = sum item). Status transaksi jadi sumber kebenaran.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(WebsiteTransaction)
    private readonly transactionRepo: Repository<WebsiteTransaction>,
    @InjectRepository(WebsiteTransactionItem)
    private readonly itemRepo: Repository<WebsiteTransactionItem>,
    @InjectRepository(WebsiteOrder)
    private readonly orderRepo: Repository<WebsiteOrder>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    private readonly escrowClient: EscrowClientService,
  ) {}

  private get siteAppUrl(): string {
    return (
      this.config.get<string>('SITE_APP_URL') || 'http://localhost:5005'
    ).replace(/\/$/, '');
  }

  async createCheckout(
    authUser: AuthUser,
    dto: CreateTransactionCheckoutDto,
  ): Promise<WebsiteTransaction> {
    const orderIds = Array.from(new Set(dto.order_ids));

    const orders = await this.orderRepo.find({
      where: { id: In(orderIds), buyer_user_id: authUser.userId },
      relations: { product: true },
    });
    if (orders.length !== orderIds.length) {
      throw new NotFoundException('One or more orders not found');
    }

    for (const order of orders) {
      if (order.status !== 'PENDING') {
        throw new BadRequestException(
          `Order ${order.id} is not in PENDING state (current: ${order.status})`,
        );
      }
      if (order.transaction_id) {
        throw new BadRequestException(
          `Order ${order.id} is already in a transaction`,
        );
      }
    }

    // Semua order harus dari website & payment_mode yang sama (1 checkout).
    const websiteId = orders[0].website_id;
    const paymentMode = orders[0].payment_mode as 'ADD_TO_CART' | 'ESCROW';
    if (
      orders.some((o) => o.website_id !== websiteId || o.payment_mode !== paymentMode)
    ) {
      throw new BadRequestException(
        'All orders must belong to the same website and payment mode',
      );
    }

    const totalAmount = orders.reduce(
      (acc, o) => acc + Number(o.unit_price) * o.quantity,
      0,
    );

    const transaction = await this.transactionRepo.save(
      this.transactionRepo.create({
        website_id: websiteId,
        buyer_user_id: authUser.userId,
        buyer_identifier: authUser.email ?? authUser.username ?? null,
        recipient_name: dto.shipping_address?.recipient_name ?? null,
        phone: dto.shipping_address?.phone ?? null,
        address: dto.shipping_address?.address ?? null,
        city: dto.shipping_address?.city ?? null,
        district: dto.shipping_address?.district ?? null,
        postal_code: dto.shipping_address?.postal_code ?? null,
        courier: dto.courier ?? null,
        total_amount: totalAmount,
        currency: 'IDR',
        payment_mode: paymentMode,
        status: 'PENDING_PAYMENT',
      }),
    );

    // Item = snapshot order (harga terkunci saat checkout) + link order.
    for (const order of orders) {
      await this.itemRepo.save(
        this.itemRepo.create({
          transaction_id: transaction.id,
          order_id: order.id,
          product_id: order.product_id,
          quantity: order.quantity,
          unit_price: Number(order.unit_price),
          total_amount: Number(order.unit_price) * order.quantity,
        }),
      );
    }

    // Order di-claim transaksi → lepas dari cart (filter PENDING && !transaction_id).
    for (const order of orders) {
      order.transaction_id = transaction.id;
      await this.orderRepo.save(order);
    }

    try {
      return await this.runCheckoutPayment(authUser, transaction);
    } catch (error) {
      // Tetap PENDING_PAYMENT (bukan CANCELLED) — transaksi sudah dibuat,
      // order sudah ter-claim ke sini, jadi biarkan buyer retry lewat
      // `retryCheckout()` alih-alih jadi dead-end.
      transaction.metadata = {
        ...(transaction.metadata ?? {}),
        error: error instanceof Error ? error.message : 'checkout_failed',
      };
      await this.transactionRepo.save(transaction);
      throw error;
    }
  }

  /**
   * Retry inisialisasi pembayaran untuk transaksi yang masih PENDING_PAYMENT
   * (mis. gagal di tengah jalan — escrow/payment-service error). Idempotent
   * lewat sisi payment-service sendiri: `createEscrow` (idempotency_key per
   * transaksi) & `initializeEscrowPayment` (payment_request_id sudah ada →
   * kembalikan checkoutUrl yang sama) aman dipanggil ulang.
   *
   * - `checkout_url` sudah ada → langsung kembalikan transaksi apa adanya
   *   (tidak perlu panggil payment-service lagi).
   * - Belum ada → jalankan ulang `runCheckoutPayment`.
   */
  async retryCheckout(
    transactionId: string,
    authUser: AuthUser,
  ): Promise<WebsiteTransaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });
    if (!transaction || transaction.buyer_user_id !== authUser.userId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }
    if (transaction.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(
        `Transaction is not awaiting payment (current: ${transaction.status})`,
      );
    }
    if (transaction.checkout_url) {
      return transaction;
    }

    try {
      return await this.runCheckoutPayment(authUser, transaction);
    } catch (error) {
      transaction.metadata = {
        ...(transaction.metadata ?? {}),
        error: error instanceof Error ? error.message : 'checkout_failed',
      };
      await this.transactionRepo.save(transaction);
      throw error;
    }
  }

  /** Escrow + payment di level transaksi (1 transaksi = 1 escrow). */
  private async runCheckoutPayment(
    authUser: AuthUser,
    transaction: WebsiteTransaction,
  ): Promise<WebsiteTransaction> {
    const items = await this.itemRepo.find({
      where: { transaction_id: transaction.id },
      relations: { order: { product: true } },
    });
    const firstProduct = items[0]?.order?.product;
    if (!firstProduct) {
      throw new BadRequestException('Transaction has no product items');
    }

    // Escrow Product satu per website (bukan per produk) — konsisten walau
    // transaksi berisi beberapa produk berbeda dari website yang sama.
    const escrowProductId = await this.escrowClient.ensureEscrowProductForWebsite(
      transaction.website_id,
    );
    const seller = await this.escrowClient.resolveSellerWallet(transaction.website_id);
    const buyer = await this.escrowClient.resolveBuyerWallet(authUser.userId);

    const escrow = await this.escrowClient.createEscrow({
      product_id: escrowProductId,
      external_item_id: transaction.id,
      buyer_wallet_id: buyer.walletId,
      seller_wallet_id: seller.walletId,
      amount_total: Number(transaction.total_amount),
      currency: transaction.currency || 'IDR',
      idempotency_key: `website-transaction:${transaction.id}`,
      milestones: [
        {
          sequence: 1,
          label: 'Pembayaran penuh',
          amount: Number(transaction.total_amount),
        },
      ],
    });

    const payment = await this.escrowClient.initializeEscrowPayment(escrow.id, {
      successRedirectUrl: `${this.siteAppUrl}/order/${transaction.id}?status=success`,
      failureRedirectUrl: `${this.siteAppUrl}/order/${transaction.id}?status=failed`,
    });

    transaction.escrow_id = escrow.id;
    // payment_request_id kolomnya uuid — payment.refNumber itu ref manusiawi
    // (mis. "INV-20260820-XXXXXX"), BUKAN uuid. Pakai paymentRequestId.
    transaction.payment_request_id = payment.paymentRequestId ?? null;
    transaction.checkout_url = payment.checkoutUrl;
    return this.transactionRepo.save(transaction);
  }

  /**
   * List transaksi milik buyer (halaman `/orders` — "Daftar Transaksi").
   * Menggantikan `GET /api/orders` yang menampilkan `website_orders` mentah
   * (status/checkout_url basi setelah order diklaim ke transaksi, sejak
   * W2.8 sumber kebenarannya di level transaksi, bukan order).
   */
  async listTransactions(
    buyerUserId: string,
    query: { page?: number; size?: number },
  ): Promise<{ data: WebsiteTransaction[]; meta: Record<string, number> }> {
    const page = Math.max(1, Number(query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(query.size) || 20));

    const [data, total] = await this.transactionRepo.findAndCount({
      where: { buyer_user_id: buyerUserId },
      relations: { items: { order: { product: true } } },
      order: { created_at: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    return {
      data,
      meta: { page, size, total, totalPages: Math.ceil(total / size) },
    };
  }

  async getTransaction(
    transactionId: string,
    buyerUserId: string,
  ): Promise<WebsiteTransaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
      relations: {
        items: { order: { product: true } },
      },
    });
    if (!transaction || transaction.buyer_user_id !== buyerUserId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }

    if (transaction.escrow_id && SYNCABLE_STATUSES.has(transaction.status)) {
      const escrow = await this.escrowClient.getEscrow(transaction.escrow_id);
      if (escrow.status !== transaction.status) {
        transaction.status = escrow.status;
        await this.transactionRepo.save(transaction);
      }
    }
    return transaction;
  }
}
