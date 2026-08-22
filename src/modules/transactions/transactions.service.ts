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
  FulfillmentFlow,
  type FulfillmentStepFormField,
  Website,
  WebsiteOrder,
  WebsiteProduct,
  WebsiteTransaction,
  WebsiteTransactionFulfillmentLog,
  WebsiteTransactionItem,
} from '../../entities';
import type { AuthUser } from '../../common/auth';
import { EscrowClientService, type EscrowSummary } from '../escrow/escrow-client.service';
import { CreateTransactionCheckoutDto } from './dto/create-transaction-checkout.dto';

const CHECKOUT_MODES = new Set(['ADD_TO_CART', 'ESCROW']);

/** Status yang masih relevan untuk pull sync status dari escrow (PH-6). */
const SYNCABLE_STATUSES = new Set(['PENDING_PAYMENT', 'HELD', 'DISPUTED']);

/**
 * `EscrowStatus` (bagdja-payment-service) mulai dari `PENDING`, sementara
 * `WebsiteTransaction.status` mulai dari `PENDING_PAYMENT` — dua vocabulary
 * berbeda untuk kondisi yang sama (belum dibayar). Normalisasi di SATU
 * tempat ini supaya `transaction.status` konsisten pakai vocabulary sendiri
 * kapan pun ditulis dari status escrow (sync baca, release, dispute).
 */
function normalizeEscrowStatus(escrowStatus: string): string {
  return escrowStatus === 'PENDING' ? 'PENDING_PAYMENT' : escrowStatus;
}

/** Order Handling Phase 3 (§3.0.1) — progress 1 step dalam flow fulfillment 1 order_id. */
export interface OrderFulfillmentStepProgress {
  stepName: string;
  description: string | null;
  processDay: number | null;
  releasePercentage: number | null;
  guarantyDays: number | null;
  formSchema: FulfillmentStepFormField[] | null;
  completed: boolean;
  formData: Record<string, unknown> | null;
  releaseApproved: boolean;
  releaseAmount: number | null;
  releaseApprovedBy: string | null;
  disputed: boolean;
}

export interface OrderFulfillmentProgress {
  flowName: string;
  steps: OrderFulfillmentStepProgress[];
}

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
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(FulfillmentFlow)
    private readonly flowRepo: Repository<FulfillmentFlow>,
    @InjectRepository(WebsiteTransactionFulfillmentLog)
    private readonly fulfillmentLogRepo: Repository<WebsiteTransactionFulfillmentLog>,
    private readonly escrowClient: EscrowClientService,
  ) {}

  /**
   * Base URL publik website (bukan `SITE_APP_URL` tunggal — sistem ini
   * multi-tenant, satu deployment renderer melayani banyak subdomain/custom
   * domain sekaligus). Custom domain terverifikasi diprioritaskan; kalau
   * tidak ada, pakai wildcard subdomain `{slug}.{PLATFORM_HOST}`, konsisten
   * dengan `resolveTenantLinkBase` di bagdja-website.
   */
  private async resolveWebsiteAppUrl(websiteId: string): Promise<string> {
    const website = await this.websiteRepo.findOne({ where: { id: websiteId } });
    if (website?.domain && website.domain_verified_at) {
      return `https://${website.domain}`;
    }
    const platformHost = (
      this.config.get<string>('PLATFORM_HOST') || 'sites.bagdja.com'
    ).replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (website?.slug) {
      return `https://${website.slug}.${platformHost}`;
    }
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

    const siteAppUrl = await this.resolveWebsiteAppUrl(transaction.website_id);
    const payment = await this.escrowClient.initializeEscrowPayment(escrow.id, {
      successRedirectUrl: `${siteAppUrl}/order/${transaction.id}?status=success`,
      failureRedirectUrl: `${siteAppUrl}/order/${transaction.id}?status=failed`,
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

  /**
   * Sync `transaction.status` dari escrow kalau masih di status yang relevan
   * (PH-6, pull/polling). Dipakai buyer's `getTransaction` maupun tenant's
   * `getTenantTransaction` — satu sumber kebenaran untuk logic sync ini.
   * Return escrow summary kalau escrow_id ada (buat ditampilkan di admin),
   * null kalau transaksi belum punya escrow sama sekali.
   */
  private async syncStatusFromEscrow(
    transaction: WebsiteTransaction,
  ): Promise<EscrowSummary | null> {
    if (!transaction.escrow_id) return null;
    const escrow = await this.escrowClient.getEscrow(transaction.escrow_id);
    if (SYNCABLE_STATUSES.has(transaction.status)) {
      const normalized = normalizeEscrowStatus(escrow.status);
      if (normalized !== transaction.status) {
        transaction.status = normalized;
        // §3.0.2 — baseline hitung mundur masa garansi force-complete.
        if (normalized === 'HELD' && !transaction.held_at) {
          transaction.held_at = new Date();
        }
        await this.transactionRepo.save(transaction);
      }
    }
    return escrow;
  }

  /** `{ order_id: progress }` untuk semua item transaksi yang produknya pakai fulfillment flow (E1: produk tanpa flow tidak masuk map). */
  private async buildFulfillmentMap(
    items: WebsiteTransactionItem[],
  ): Promise<Record<string, OrderFulfillmentProgress>> {
    const map: Record<string, OrderFulfillmentProgress> = {};
    for (const item of items) {
      const progress = await this.getOrderFulfillmentProgress(item.order);
      if (progress) map[item.order_id] = progress;
    }
    return map;
  }

  async getTransaction(
    transactionId: string,
    buyerUserId: string,
  ): Promise<WebsiteTransaction & { fulfillment: Record<string, OrderFulfillmentProgress> }> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
      relations: {
        items: { order: { product: true } },
      },
    });
    if (!transaction || transaction.buyer_user_id !== buyerUserId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }

    if (SYNCABLE_STATUSES.has(transaction.status)) {
      await this.syncStatusFromEscrow(transaction);
    }
    const fulfillment = await this.buildFulfillmentMap(transaction.items ?? []);
    return { ...transaction, fulfillment };
  }

  /**
   * List transaksi milik SATU WEBSITE (bukan milik buyer) — dipakai
   * bagdja-website-admin untuk lihat pesanan masuk ke toko. Tidak sync
   * status escrow per baris (N+1 call ke payment-service) — kalau perlu
   * status paling fresh, buka detail (`getTenantTransaction`) yang sync.
   */
  async listTenantTransactions(
    websiteId: string,
    query: { page?: number; size?: number; status?: string },
  ): Promise<{ data: WebsiteTransaction[]; meta: Record<string, number> }> {
    const page = Math.max(1, Number(query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(query.size) || 20));

    const where: Record<string, unknown> = { website_id: websiteId };
    if (query.status) {
      // Dukung multi-status ("HELD,DISPUTED") supaya frontend bisa
      // mengelompokkan tab (mis. "Diproses") tanpa N request terpisah.
      const statuses = query.status.split(',').map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length > 1 ? In(statuses) : statuses[0];
    }

    const [data, total] = await this.transactionRepo.findAndCount({
      where,
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

  /**
   * Detail 1 transaksi milik SATU WEBSITE — dipakai admin. Sync status dari
   * escrow (sama seperti sisi buyer) + sertakan ringkasan escrow
   * (amount_held/released) yang tidak tersimpan di `website_transactions`.
   */
  async getTenantTransaction(
    websiteId: string,
    transactionId: string,
  ): Promise<
    WebsiteTransaction & { escrow: EscrowSummary | null; fulfillment: Record<string, OrderFulfillmentProgress> }
  > {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, website_id: websiteId },
      relations: { items: { order: { product: true } } },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const escrow = await this.syncStatusFromEscrow(transaction);
    const fulfillment = await this.buildFulfillmentMap(transaction.items ?? []);
    return { ...transaction, escrow, fulfillment };
  }

  /**
   * Order Handling Phase 2 (plan/website-builder/order-hanlde-plan.md) —
   * seller me-refund pembeli, dipakai untuk menyelesaikan dispute (buyer
   * "menang" komplain) maupun refund sukarela di luar dispute (mis. barang
   * habis). HARUS status `DISPUTED` atau `HELD` — di luar itu tidak ada dana
   * ter-hold lagi untuk direfund. Cabut dispute TANPA refund (unfreeze)
   * SENGAJA tidak ada di sini — itu keputusan platform/CS lewat
   * bagdja-console, bukan hak sepihak tenant (lihat §2 D1 plan).
   */
  async refundTenantTransaction(
    websiteId: string,
    transactionId: string,
  ): Promise<WebsiteTransaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, website_id: websiteId },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    if (!transaction.escrow_id || !['HELD', 'DISPUTED'].includes(transaction.status)) {
      throw new BadRequestException(
        `Pesanan tidak dalam status yang bisa direfund (status: ${transaction.status})`,
      );
    }

    const updated = await this.escrowClient.refund(transaction.escrow_id);
    transaction.status = normalizeEscrowStatus(updated.status);
    await this.transactionRepo.save(transaction);
    return transaction;
  }

  /**
   * Buyer membatalkan pesanan SEBELUM diproses (belum dibayar). Order yang
   * ter-claim dilepas kembali (`transaction_id = NULL`) supaya muncul lagi
   * di keranjang (konsisten dengan semantik "in cart" = transaction_id IS
   * NULL, lihat `orders.service.ts` `createDraftOrder`).
   */
  async cancelTransaction(
    transactionId: string,
    authUser: AuthUser,
  ): Promise<WebsiteTransaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });
    if (!transaction || transaction.buyer_user_id !== authUser.userId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }

    if (transaction.escrow_id) {
      const escrow = await this.escrowClient.getEscrow(transaction.escrow_id);
      const normalized = normalizeEscrowStatus(escrow.status);
      if (normalized !== transaction.status) {
        transaction.status = normalized;
        await this.transactionRepo.save(transaction);
      }
    }
    if (transaction.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(
        `Pesanan sudah diproses, tidak bisa dibatalkan (status: ${transaction.status})`,
      );
    }

    transaction.status = 'CANCELLED';
    await this.transactionRepo.save(transaction);

    const items = await this.itemRepo.find({ where: { transaction_id: transactionId } });
    const orderIds = items.map((item) => item.order_id);
    if (orderIds.length > 0) {
      await this.orderRepo.update({ id: In(orderIds) }, { transaction_id: null });
    }

    return transaction;
  }

  /**
   * Buyer konfirmasi terima barang → cairkan SISA dana yang belum dirilis
   * (Order Handling Phase 3 §3.0.1 — sebagian mungkin sudah dirilis lewat
   * approve-release per step). Digate: SEMUA step di flow tiap order_id
   * berflow dalam transaksi ini harus sudah `STEP_COMPLETED` dulu — buyer
   * tidak boleh konfirmasi terima barang sebelum seller sendiri bilang
   * prosesnya (pengemasan/pengiriman/dst) tuntas.
   */
  async completeTransaction(
    transactionId: string,
    authUser: AuthUser,
  ): Promise<WebsiteTransaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });
    if (!transaction || transaction.buyer_user_id !== authUser.userId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }
    if (transaction.status !== 'HELD' || !transaction.escrow_id) {
      throw new BadRequestException(
        `Pesanan belum dalam status dana ditahan (status: ${transaction.status})`,
      );
    }

    const items = await this.itemRepo.find({
      where: { transaction_id: transactionId },
      relations: { order: { product: true } },
    });
    for (const item of items) {
      const flow = await this.getOrderProductFlow(item.order);
      if (!flow) continue; // E1: produk tanpa flow otomatis lolos
      const fullyStepped = await this.isOrderFullyStepped(item.order_id, flow);
      if (!fullyStepped) {
        throw new BadRequestException(
          `Belum semua tahap fulfillment selesai untuk item "${item.order?.product?.name ?? item.order_id}"`,
        );
      }
    }

    return this.releaseFinalAndMarkDelivered(transaction, items);
  }

  /** Rilis SISA dana escrow + tandai semua order_id transaksi `DELIVERED` — dipakai buyer (`completeTransaction`) maupun seller (`forceCompleteTransaction`, §3.0.2). */
  private async releaseFinalAndMarkDelivered(
    transaction: WebsiteTransaction,
    items: WebsiteTransactionItem[],
  ): Promise<WebsiteTransaction> {
    const escrow = await this.escrowClient.getEscrow(transaction.escrow_id!);
    const remainingHold = Number(escrow.remaining_hold);
    if (remainingHold > 0.001) {
      const updated = await this.escrowClient.releasePartial(
        transaction.escrow_id!,
        remainingHold,
        `transaction:${transaction.id}:final`,
      );
      transaction.status = normalizeEscrowStatus(updated.status);
    } else {
      transaction.status = normalizeEscrowStatus(escrow.status);
    }

    for (const item of items) {
      await this.fulfillmentLogRepo.save(
        this.fulfillmentLogRepo.create({
          transaction_id: transaction.id,
          order_id: item.order_id,
          event_type: 'DELIVERED',
        }),
      );
    }
    transaction.fulfillment_status = 'DELIVERED';
    await this.transactionRepo.save(transaction);
    return transaction;
  }

  /**
   * Seller force-complete transaksi (§3.0.2) — rilis SISA dana tanpa
   * konfirmasi buyer, kalau buyer tidak pernah klik "Selesai — Terima
   * Barang". Digate KETAT:
   * - Semua step fulfillment (kalau ada flow) tetap harus sudah selesai —
   *   sama seperti gate `completeTransaction` buyer, force-complete cuma
   *   soal buyer yang diam, BUKAN jalan pintas lewati proses pengiriman.
   * - SEMUA produk dalam transaksi ini harus sudah diatur
   *   `final_release_guaranty_days`-nya — kalau ada satu saja yang belum,
   *   force-complete tidak tersedia sama sekali (safety default, lihat
   *   migration 20260823000002).
   * - Masa garansi dihitung dari yang PALING BARU: transaksi jadi HELD
   *   (`held_at`), atau step terakhir tiap item berflow selesai — dan
   *   pakai `guaranty_days` TERBESAR di antara produk-produk itemnya
   *   (paling konservatif kalau produk beda-beda pengaturan).
   */
  async forceCompleteTransaction(websiteId: string, transactionId: string): Promise<WebsiteTransaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, website_id: websiteId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.status !== 'HELD' || !transaction.escrow_id) {
      throw new BadRequestException(
        `Pesanan belum dalam status dana ditahan (status: ${transaction.status})`,
      );
    }

    const items = await this.itemRepo.find({
      where: { transaction_id: transactionId },
      relations: { order: { product: true } },
    });

    let readySince = transaction.held_at ?? transaction.created_at;
    let guarantyDays: number | null = null;

    for (const item of items) {
      const product = item.order?.product;
      if (!product?.final_release_guaranty_days) {
        throw new BadRequestException(
          `Produk "${product?.name ?? item.order_id}" belum diatur masa garansi konfirmasi penerimaan — force-complete tidak tersedia untuk transaksi ini`,
        );
      }
      guarantyDays =
        guarantyDays == null
          ? product.final_release_guaranty_days
          : Math.max(guarantyDays, product.final_release_guaranty_days);

      const flow = await this.getOrderProductFlow(item.order);
      if (!flow) continue;
      const fullyStepped = await this.isOrderFullyStepped(item.order_id, flow);
      if (!fullyStepped) {
        throw new BadRequestException(
          `Belum semua tahap fulfillment selesai untuk item "${product?.name ?? item.order_id}"`,
        );
      }
      const logs = await this.fulfillmentLogRepo.find({
        where: { order_id: item.order_id, event_type: 'STEP_COMPLETED' },
      });
      for (const log of logs) {
        if (log.created_at > readySince) readySince = log.created_at;
      }
    }

    if (!guarantyDays) {
      throw new BadRequestException('Tidak ada produk dengan pengaturan masa garansi di transaksi ini');
    }

    const elapsedDays = (Date.now() - readySince.getTime()) / (1000 * 60 * 60 * 24);
    if (elapsedDays < guarantyDays) {
      throw new BadRequestException(
        `Masa garansi belum lewat (sisa ${Math.ceil(guarantyDays - elapsedDays)} hari)`,
      );
    }

    return this.releaseFinalAndMarkDelivered(transaction, items);
  }

  /**
   * Buyer mengajukan komplain → buka dispute (freeze escrow). Hanya bisa
   * dilakukan selama dana masih ditahan (HELD) — sebelum buyer konfirmasi
   * terima barang.
   */
  async openDisputeForTransaction(
    transactionId: string,
    authUser: AuthUser,
  ): Promise<WebsiteTransaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });
    if (!transaction || transaction.buyer_user_id !== authUser.userId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }
    if (transaction.status !== 'HELD' || !transaction.escrow_id) {
      throw new BadRequestException(
        `Pesanan belum dalam status dana ditahan (status: ${transaction.status})`,
      );
    }

    const updated = await this.escrowClient.openDispute(transaction.escrow_id);
    transaction.status = normalizeEscrowStatus(updated.status);
    await this.transactionRepo.save(transaction);
    return transaction;
  }

  // ─── Order Handling Phase 3 — Fulfillment Flow ──────────────────────
  // plan/website-builder/order-hanlde-plan.md §3.0/§3.0.1/§3.2

  private sortSteps(flow: FulfillmentFlow): FulfillmentFlow['steps'] {
    return [...flow.steps].sort((a, b) => a.sequence - b.sequence);
  }

  /** Flow milik produk order ini, dengan steps ter-urut — null kalau produk tidak pakai flow (E1). */
  private async getOrderProductFlow(order: WebsiteOrder): Promise<FulfillmentFlow | null> {
    if (!order?.product?.fulfillment_flow_id) return null;
    const flow = await this.flowRepo.findOne({
      where: { id: order.product.fulfillment_flow_id },
      relations: { steps: true },
    });
    if (!flow) return null;
    flow.steps = this.sortSteps(flow);
    return flow;
  }

  private async isOrderFullyStepped(orderId: string, flow: FulfillmentFlow): Promise<boolean> {
    if (flow.steps.length === 0) return true;
    const logs = await this.fulfillmentLogRepo.find({
      where: { order_id: orderId, event_type: 'STEP_COMPLETED' },
    });
    const completedNames = new Set(logs.map((l) => l.step_name));
    return flow.steps.every((s) => completedNames.has(s.status_name));
  }

  /**
   * Kalau `STEP_DISPUTED` untuk step ini belum "diselesaikan" (belum ada
   * `RELEASE_APPROVED` sesudahnya) — dicek dari log TERBARU untuk step itu.
   */
  private isStepDisputedUnresolved(
    logs: WebsiteTransactionFulfillmentLog[],
    stepName: string,
  ): boolean {
    const relevant = logs
      .filter((l) => l.step_name === stepName && (l.event_type === 'STEP_DISPUTED' || l.event_type === 'RELEASE_APPROVED'))
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const latest = relevant[relevant.length - 1];
    return latest?.event_type === 'STEP_DISPUTED';
  }

  private validateFormData(
    schema: FulfillmentStepFormField[] | null,
    formData?: Record<string, unknown>,
  ): void {
    if (!schema || schema.length === 0) return;
    for (const field of schema) {
      const value = formData?.[field.key];
      if (field.required && (value === undefined || value === null || value === '')) {
        throw new BadRequestException(`Field "${field.label}" wajib diisi`);
      }
    }
  }

  /** Total amount item-item dalam transaksi yang produknya pakai flow ini — dasar hitung release_percentage (F1). */
  private async computeGroupTotal(transactionId: string, flowId: string): Promise<number> {
    const items = await this.itemRepo.find({
      where: { transaction_id: transactionId },
      relations: { order: { product: true } },
    });
    return items
      .filter((i) => i.order?.product?.fulfillment_flow_id === flowId)
      .reduce((sum, i) => sum + Number(i.total_amount), 0);
  }

  private async loadTransactionItemOrThrow(
    transactionId: string,
    orderId: string,
  ): Promise<WebsiteTransactionItem> {
    const item = await this.itemRepo.findOne({
      where: { transaction_id: transactionId, order_id: orderId },
      relations: { order: { product: true } },
    });
    if (!item) throw new NotFoundException('Order item not found in this transaction');
    return item;
  }

  /**
   * Seller menandai 1 step selesai (tenant-scoped). Validasi urutan (step
   * sebelumnya harus sudah selesai, dan kalau step sebelumnya ber-
   * `release_percentage`, tidak boleh masih `STEP_DISPUTED` aktif) +
   * `form_data` sesuai `form_schema`.
   */
  async completeFulfillmentStep(
    websiteId: string,
    transactionId: string,
    orderId: string,
    dto: { step_name: string; form_data?: Record<string, unknown> },
  ): Promise<void> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, website_id: websiteId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    const item = await this.loadTransactionItemOrThrow(transactionId, orderId);
    const flow = await this.getOrderProductFlow(item.order);
    if (!flow) throw new BadRequestException('Produk ini tidak punya fulfillment flow');

    const stepIndex = flow.steps.findIndex((s) => s.status_name === dto.step_name);
    if (stepIndex === -1) {
      throw new BadRequestException('Step tidak ditemukan di flow produk ini');
    }
    const step = flow.steps[stepIndex];

    const logs = await this.fulfillmentLogRepo.find({ where: { order_id: orderId } });
    const completedNames = new Set(
      logs.filter((l) => l.event_type === 'STEP_COMPLETED').map((l) => l.step_name),
    );
    if (completedNames.has(step.status_name)) {
      throw new BadRequestException('Step ini sudah ditandai selesai');
    }

    if (stepIndex > 0) {
      const prevStep = flow.steps[stepIndex - 1];
      if (!completedNames.has(prevStep.status_name)) {
        throw new BadRequestException(`Step "${prevStep.status_name}" harus diselesaikan lebih dulu`);
      }
      if (prevStep.release_percentage && this.isStepDisputedUnresolved(logs, prevStep.status_name)) {
        throw new BadRequestException(
          `Step "${prevStep.status_name}" sedang dalam komplain buyer, belum bisa lanjut`,
        );
      }
    }

    this.validateFormData(step.form_schema, dto.form_data);

    await this.fulfillmentLogRepo.save(
      this.fulfillmentLogRepo.create({
        transaction_id: transactionId,
        order_id: orderId,
        event_type: 'STEP_COMPLETED',
        step_name: step.status_name,
        form_data: dto.form_data ?? null,
      }),
    );
  }

  /** Buyer approve pelepasan dana sebagian untuk 1 step (buyer-scoped). */
  async approveStepRelease(
    transactionId: string,
    orderId: string,
    stepName: string,
    buyerUserId: string,
  ): Promise<void> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction || transaction.buyer_user_id !== buyerUserId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }
    if (!transaction.escrow_id) {
      throw new BadRequestException('Transaksi belum punya escrow');
    }

    const item = await this.loadTransactionItemOrThrow(transactionId, orderId);
    const flow = await this.getOrderProductFlow(item.order);
    const step = flow?.steps.find((s) => s.status_name === stepName);
    if (!flow || !step?.release_percentage) {
      throw new BadRequestException('Step ini tidak punya pengaturan pelepasan dana');
    }

    const logs = await this.fulfillmentLogRepo.find({ where: { order_id: orderId, step_name: stepName } });
    if (!logs.some((l) => l.event_type === 'STEP_COMPLETED')) {
      throw new BadRequestException('Step ini belum ditandai selesai oleh seller');
    }
    if (logs.some((l) => l.event_type === 'RELEASE_APPROVED')) {
      throw new BadRequestException('Dana untuk step ini sudah dirilis');
    }

    const groupTotal = await this.computeGroupTotal(transactionId, flow.id);
    const amount = (Number(step.release_percentage) / 100) * groupTotal;
    const reference = `transaction:${transactionId}:order:${orderId}:step:${stepName}`;
    await this.escrowClient.releasePartial(transaction.escrow_id, amount, reference);

    await this.fulfillmentLogRepo.save(
      this.fulfillmentLogRepo.create({
        transaction_id: transactionId,
        order_id: orderId,
        event_type: 'RELEASE_APPROVED',
        step_name: stepName,
        release_amount: amount,
        release_approved_by: 'buyer',
      }),
    );
  }

  /**
   * Buyer mengajukan komplain untuk 1 step (buyer-scoped). TIDAK memanggil
   * payment-service sama sekali — dana untuk step ini memang belum pernah
   * dipindahkan (buyer belum approve), jadi tidak ada apa-apa untuk
   * di-freeze. Efeknya cuma gate lokal: blokir seller lanjut ke step
   * berikutnya & blokir force-release untuk step ini (lihat §3.0.1).
   */
  async disputeStep(
    transactionId: string,
    orderId: string,
    stepName: string,
    buyerUserId: string,
  ): Promise<void> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction || transaction.buyer_user_id !== buyerUserId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }

    const item = await this.loadTransactionItemOrThrow(transactionId, orderId);
    const flow = await this.getOrderProductFlow(item.order);
    const step = flow?.steps.find((s) => s.status_name === stepName);
    if (!step?.release_percentage) {
      throw new BadRequestException('Step ini tidak mendukung komplain (tidak punya pengaturan pelepasan dana)');
    }

    const logs = await this.fulfillmentLogRepo.find({ where: { order_id: orderId, step_name: stepName } });
    if (!logs.some((l) => l.event_type === 'STEP_COMPLETED')) {
      throw new BadRequestException('Step ini belum ditandai selesai oleh seller');
    }
    if (logs.some((l) => l.event_type === 'RELEASE_APPROVED')) {
      throw new BadRequestException('Dana untuk step ini sudah dirilis, tidak bisa dikomplain lagi');
    }

    await this.fulfillmentLogRepo.save(
      this.fulfillmentLogRepo.create({
        transaction_id: transactionId,
        order_id: orderId,
        event_type: 'STEP_DISPUTED',
        step_name: stepName,
      }),
    );
  }

  /**
   * Seller force-release dana step setelah `guaranty_days` lewat tanpa
   * approval buyer (tenant-scoped, editor+). Diblokir kalau masih ada
   * `STEP_DISPUTED` aktif untuk step ini — komplain buyer tidak boleh
   * dilewati begitu saja lewat guaranty.
   */
  async forceReleaseStep(
    websiteId: string,
    transactionId: string,
    orderId: string,
    stepName: string,
  ): Promise<void> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, website_id: websiteId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (!transaction.escrow_id) {
      throw new BadRequestException('Transaksi belum punya escrow');
    }

    const item = await this.loadTransactionItemOrThrow(transactionId, orderId);
    const flow = await this.getOrderProductFlow(item.order);
    const step = flow?.steps.find((s) => s.status_name === stepName);
    if (!flow || !step?.release_percentage || !step.guaranty_days) {
      throw new BadRequestException('Step ini tidak mendukung force-release');
    }

    const logs = await this.fulfillmentLogRepo.find({ where: { order_id: orderId, step_name: stepName } });
    const completedLog = logs.find((l) => l.event_type === 'STEP_COMPLETED');
    if (!completedLog) {
      throw new BadRequestException('Step ini belum ditandai selesai');
    }
    if (logs.some((l) => l.event_type === 'RELEASE_APPROVED')) {
      throw new BadRequestException('Dana untuk step ini sudah dirilis');
    }
    if (this.isStepDisputedUnresolved(logs, stepName)) {
      throw new BadRequestException('Step ini sedang dalam komplain buyer, tidak bisa force-release');
    }

    const elapsedDays = (Date.now() - completedLog.created_at.getTime()) / (1000 * 60 * 60 * 24);
    if (elapsedDays < step.guaranty_days) {
      throw new BadRequestException(
        `Masa garansi belum lewat (sisa ${Math.ceil(step.guaranty_days - elapsedDays)} hari)`,
      );
    }

    const groupTotal = await this.computeGroupTotal(transactionId, flow.id);
    const amount = (Number(step.release_percentage) / 100) * groupTotal;
    const reference = `transaction:${transactionId}:order:${orderId}:step:${stepName}`;
    await this.escrowClient.releasePartial(transaction.escrow_id, amount, reference);

    await this.fulfillmentLogRepo.save(
      this.fulfillmentLogRepo.create({
        transaction_id: transactionId,
        order_id: orderId,
        event_type: 'RELEASE_APPROVED',
        step_name: stepName,
        release_amount: amount,
        release_approved_by: 'seller_guaranty',
      }),
    );
  }

  /** Progress fulfillment 1 order_id — dipakai untuk ditampilkan di response transaksi (admin & buyer). */
  async getOrderFulfillmentProgress(order: WebsiteOrder): Promise<OrderFulfillmentProgress | null> {
    const flow = await this.getOrderProductFlow(order);
    if (!flow) return null;

    const logs = await this.fulfillmentLogRepo.find({ where: { order_id: order.id } });
    const steps = flow.steps.map((step) => {
      const stepLogs = logs.filter((l) => l.step_name === step.status_name);
      const completedLog = stepLogs.find((l) => l.event_type === 'STEP_COMPLETED');
      const releaseLog = stepLogs.find((l) => l.event_type === 'RELEASE_APPROVED');
      return {
        stepName: step.status_name,
        description: step.description,
        processDay: step.process_day,
        releasePercentage: step.release_percentage,
        guarantyDays: step.guaranty_days,
        formSchema: step.form_schema,
        completed: Boolean(completedLog),
        formData: completedLog?.form_data ?? null,
        releaseApproved: Boolean(releaseLog),
        releaseAmount: releaseLog?.release_amount ?? null,
        releaseApprovedBy: releaseLog?.release_approved_by ?? null,
        disputed: this.isStepDisputedUnresolved(logs, step.status_name),
      };
    });

    return { flowName: flow.name, steps };
  }
}
