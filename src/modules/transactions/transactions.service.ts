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
  WebsiteOrderTermin,
  type WebsiteOrderTerminStatus,
  WebsiteProduct,
  WebsiteTransaction,
  WebsiteTransactionFulfillmentLog,
  WebsiteTransactionItem,
} from '../../entities';
import type { AuthUser } from '../../common/auth';
import { EscrowClientService, type EscrowSummary } from '../escrow/escrow-client.service';
import { ShippingCalculationService } from '../shipping/shipping-calculation.service';
import { CreateTransactionCheckoutDto } from './dto/create-transaction-checkout.dto';
import type { ListTerminsQueryDto } from './dto/list-termins-query.dto';
import { TerminListItemDto, TerminListResponseDto } from './dto/termin-list-item.dto';
import { SYSTEM_ORDER_DESCRIPTION_STEP, SYSTEM_QUOTATION_STEP } from './system-steps';

const CHECKOUT_MODES = new Set(['ADD_TO_CART', 'ESCROW']);

/** Status yang masih relevan untuk pull sync status dari escrow (PH-6). */
const SYNCABLE_STATUSES = new Set(['PENDING_PAYMENT', 'HELD', 'DISPUTED']);

/**
 * `WebsiteTransaction.status` yang berarti transaksi CHECKOUT PERTAMA
 * (DP/Termin 1) order induk sudah SUKSES dibayar. Termin 2..N (`website_order_termins`)
 * dibuat begitu admin "Atur Termin" saat set Harga Final (`setDraftQuote`)
 * — SEBELUM order itu sendiri di-checkout/dibayar buyer sama sekali (order
 * masih draft, `transaction_id` masih null). Kalau halaman "Invoice" tidak
 * memfilter ini, Termin 2..N nongol duluan padahal DP-nya sendiri belum
 * (atau gagal) dibayar. `PENDING`/`PENDING_PAYMENT` (belum dibayar) dan
 * `CANCELLED`/`REFUNDED`/`CLOSED` (batal) sengaja TIDAK termasuk di sini.
 */
const PAID_ORDER_TRANSACTION_STATUSES = ['HELD', 'COMPLETED', 'DISPUTED'];

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
  /** fulfillment-praorder-plan.md §2.1 — PRAORDER (sebelum checkout) atau PASCAORDER (existing, setelah bayar). */
  phase: 'PRAORDER' | 'PASCAORDER';
  /** Siapa yang menyelesaikan step ini — admin (endpoint tenant) atau buyer (endpoint buyer-scoped terpisah, §2.1). */
  filledBy: 'admin' | 'buyer';
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

/** 1 Termin (§2.4) diringkas untuk timeline — dipakai FE buat interleave di posisi `anchorStepName`. */
export interface TerminSummary {
  id: string;
  sequence: number;
  label: string;
  amount: number;
  anchorStepName: string | null;
  status: WebsiteOrderTerminStatus;
  transactionId: string | null;
}

export interface OrderFulfillmentProgress {
  flowName: string;
  steps: OrderFulfillmentStepProgress[];
  /** Termin 2..N + Tagihan Tambahan (§2.4/§2.4.1) — selalu [] untuk progres Praorder (belum checkout, belum relevan). */
  termins: TerminSummary[];
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
    @InjectRepository(WebsiteOrderTermin)
    private readonly terminRepo: Repository<WebsiteOrderTermin>,
    private readonly escrowClient: EscrowClientService,
    private readonly shippingCalculation: ShippingCalculationService,
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
      if (Number(order.total_amount) <= 0) {
        throw new BadRequestException(
          `Order ${order.id} belum memiliki harga final quotation`,
        );
      }
      if (order.product?.quotable && order.quoted_total_amount == null) {
        throw new BadRequestException(
          `Order ${order.id} belum memiliki quotation seller`,
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

    // Ongkir: HANYA pilihan (location_id/destination/courier_code) dipercaya
    // dari client — nominal `cost` yang benar-benar di-charge dihitung ULANG
    // di sini lewat shipping-service, supaya buyer tidak bisa manipulasi
    // harga ongkir dari client (lihat CheckoutShippingSelectionDto).
    let shippingCost = 0;
    let resolvedCourierServiceName: string | null = null;
    if (dto.shipping) {
      const options = await this.shippingCalculation.calculate({
        websiteId,
        buyerUserId: authUser.userId,
        orderIds,
        locationId: dto.shipping.location_id,
        destinationAreaId: dto.shipping.destination_area_id,
        courierCode: dto.shipping.courier_code,
      });
      const resolved = options.find((o) => o.courierCode === dto.shipping!.courier_code);
      if (!resolved) {
        throw new BadRequestException(
          'Kurir yang dipilih tidak lagi tersedia untuk tujuan ini — hitung ulang ongkir',
        );
      }
      shippingCost = resolved.cost;
      resolvedCourierServiceName = resolved.serviceName;
    }

    const totalAmount =
      orders.reduce((acc, o) => acc + Number(o.unit_price) * o.quantity, 0) + shippingCost;

    const transaction = await this.transactionRepo.save(
      this.transactionRepo.create({
        website_id: websiteId,
        buyer_user_id: authUser.userId,
        buyer_identifier: authUser.email ?? authUser.username ?? null,
        recipient_name: dto.shipping_address?.recipient_name ?? null,
        phone: dto.shipping_address?.phone ?? null,
        address: dto.shipping_address?.address ?? null,
        city: dto.shipping_address?.city ?? dto.shipping?.destination_area_name ?? null,
        district: dto.shipping_address?.district ?? null,
        postal_code: dto.shipping_address?.postal_code ?? null,
        courier: dto.shipping?.courier_code ?? dto.courier ?? null,
        shipping_cost: shippingCost,
        total_amount: totalAmount,
        currency: 'IDR',
        payment_mode: paymentMode,
        status: 'PENDING_PAYMENT',
        metadata: dto.shipping
          ? { shipping: { ...dto.shipping, resolved_service: resolvedCourierServiceName } }
          : null,
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
      return await this.runCheckoutPayment(authUser, transaction, dto.redirect_transaction_id);
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
    redirectTransactionId?: string,
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
    const paymentRedirectId = redirectTransactionId ?? transaction.id;
    const payment = await this.escrowClient.initializeEscrowPayment(escrow.id, {
      successRedirectUrl: `${siteAppUrl}/order/${paymentRedirectId}?status=success`,
      failureRedirectUrl: `${siteAppUrl}/order/${paymentRedirectId}?status=failed`,
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
    query: { page?: number; size?: number; websiteId?: string },
  ): Promise<{ data: WebsiteTransaction[]; meta: Record<string, number> }> {
    const page = Math.max(1, Number(query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(query.size) || 20));

    // Transaksi pembayaran Termin/Tagihan (§2.5) sengaja disembunyikan dari
    // list — sudah tampil sebagai baris "Termin" di detail order induknya
    // (getOrderFulfillmentProgress), jadi tidak perlu muncul lagi sebagai
    // "order" terpisah yang membingungkan (seolah beli produk yang sama 2x).
    //
    // Pola sama `listTenantTransactions` di bawah — paginasi ID dulu TANPA
    // join (relasi `items` one-to-many bikin baris hasil SQL terduplikasi
    // sebelum skip/take kalau join dipakai bersamaan), filter metadata pakai
    // raw SQL langsung di queryBuilder (bukan operator `Raw()` di `find()` —
    // alias yang dibentuknya tidak konsisten dengan FROM clause TypeORM
    // 0.3.x, sempat bikin error runtime "missing FROM-clause entry").
    const idQb = this.transactionRepo
      .createQueryBuilder('t')
      .select('t.id')
      .where('t.buyer_user_id = :buyerUserId', { buyerUserId })
      .andWhere("t.metadata->>'termin_id' IS NULL");
    if (query.websiteId) {
      idQb.andWhere('t.website_id = :websiteId', { websiteId: query.websiteId });
    }

    const total = await idQb.getCount();
    const idRows = await idQb
      .orderBy('t.created_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getMany();
    const ids = idRows.map((row) => row.id);

    const unordered = ids.length
      ? await this.transactionRepo.find({
          where: { id: In(ids) },
          relations: { items: { order: { product: { uom: true } } } },
        })
      : [];
    const byId = new Map(unordered.map((t) => [t.id, t]));
    const data = ids.map((id) => byId.get(id)).filter((t): t is WebsiteTransaction => Boolean(t));

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
        if (normalized === 'HELD') {
          await this.maybeAutoReleaseTermin(transaction);
        }
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
    websiteId?: string,
  ): Promise<WebsiteTransaction & {
    fulfillment: Record<string, OrderFulfillmentProgress>;
    parent_transaction_id: string | null;
  }> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, ...(websiteId ? { website_id: websiteId } : {}) },
      relations: {
        items: { order: { product: { uom: true } } },
      },
    });
    if (!transaction || transaction.buyer_user_id !== buyerUserId) {
      throw new NotFoundException('Transaction not found'); // anti-leak
    }

    if (SYNCABLE_STATUSES.has(transaction.status)) {
      await this.syncStatusFromEscrow(transaction);
    }
    const fulfillment = await this.buildFulfillmentMap(transaction.items ?? []);
    const terminId = transaction.metadata?.termin_id as string | undefined;
    const parentTransactionId = terminId
      ? (await this.terminRepo.findOne({
          where: { id: terminId },
          relations: { source_order: true },
        }))?.source_order?.transaction_id ?? null
      : null;
    return { ...transaction, fulfillment, parent_transaction_id: parentTransactionId };
  }

  /**
   * List transaksi milik SATU WEBSITE (bukan milik buyer) — dipakai
   * bagdja-website-admin untuk lihat pesanan masuk ke toko. Tidak sync
   * status escrow per baris (N+1 call ke payment-service) — kalau perlu
   * status paling fresh, buka detail (`getTenantTransaction`) yang sync.
   */
  async listTenantTransactions(
    websiteId: string,
    query: { page?: number; size?: number; status?: string; vendorId?: string },
  ): Promise<{ data: WebsiteTransaction[]; meta: Record<string, number> }> {
    const page = Math.max(1, Number(query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(query.size) || 20));

    // §2.5 bisnis-with-vendor-availibility-plan.md (D5) — filter by Vendor
    // untuk rekonsiliasi manual. `vendor_id` ada di `website_orders`, bukan
    // di transaksi langsung, jadi filter butuh subquery — TAPI sengaja
    // dipisah dari query yang mengambil relasi `items` (one-to-many): kalau
    // join dipakai bersamaan dengan skip/take di level transaksi, LIMIT SQL
    // kena baris hasil join yang terduplikasi, bukan transaksi distinct-nya
    // (bug pagination+join TypeORM yang sama seperti yang diperbaiki di
    // public.service.ts) — jadi di sini ID dipaginasi dulu TANPA join,
    // relasinya baru diambil terpisah untuk ID hasil halaman itu saja.
    const idQb = this.transactionRepo
      .createQueryBuilder('t')
      .select('t.id')
      .where('t.website_id = :websiteId', { websiteId })
      // Sama seperti listTransactions (buyer) — transaksi pembayaran
      // Termin/Tagihan disembunyikan dari list, sudah tampil di detail order induknya.
      .andWhere("t.metadata->>'termin_id' IS NULL");

    if (query.status) {
      // Dukung multi-status ("HELD,DISPUTED") supaya frontend bisa
      // mengelompokkan tab (mis. "Diproses") tanpa N request terpisah.
      const statuses = query.status.split(',').map((s) => s.trim()).filter(Boolean);
      idQb.andWhere(statuses.length > 1 ? 't.status IN (:...statuses)' : 't.status = :status', {
        statuses,
        status: statuses[0],
      });
    }
    if (query.vendorId) {
      idQb.andWhere(
        `t.id IN (
          SELECT ti.transaction_id FROM website_transaction_items ti
          INNER JOIN website_orders o ON o.id = ti.order_id
          WHERE o.vendor_id = :vendorId
        )`,
        { vendorId: query.vendorId },
      );
    }

    const total = await idQb.getCount();
    const idRows = await idQb
      .orderBy('t.created_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getMany();
    const ids = idRows.map((row) => row.id);

    const unordered = ids.length
      ? await this.transactionRepo.find({
          where: { id: In(ids) },
          relations: { items: { order: { product: { uom: true }, vendor: true } } },
        })
      : [];
    const byId = new Map(unordered.map((t) => [t.id, t]));
    const data = ids.map((id) => byId.get(id)).filter((t): t is WebsiteTransaction => Boolean(t));

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
      relations: { items: { order: { product: { uom: true }, vendor: true } } },
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
      // `releasePartial` return `escrowStatus` (camelCase), BUKAN `status`
      // seperti EscrowSummary — pakai field yang salah bikin `undefined`,
      // dan TypeORM diam-diam skip kolom `status` saat save (dana tetap
      // sukses dirilis tapi transaction.status kelihatan tidak berubah).
      transaction.status = normalizeEscrowStatus(updated.escrowStatus);
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

  /**
   * Flow milik produk order ini, dengan step sistem quotable yang membungkus
   * step custom: deskripsi buyer di awal dan quotation seller di akhir praorder.
   */
  private async getOrderProductFlow(order: WebsiteOrder): Promise<FulfillmentFlow | null> {
    const product = order?.product;
    let flow: FulfillmentFlow | null = null;
    if (product?.fulfillment_flow_id) {
      flow = await this.flowRepo.findOne({
        where: { id: product.fulfillment_flow_id },
        relations: { steps: true },
      });
    }

    if (!product?.quotable) {
      if (!flow) return null;
      flow.steps = this.sortSteps(flow);
      return flow;
    }

    const customSteps = flow ? this.sortSteps(flow) : [];
    const praorderSteps = customSteps.filter((step) => step.phase === 'PRAORDER');
    const postorderSteps = customSteps.filter((step) => step.phase === 'PASCAORDER');
    const systemStep = (statusName: string, filledBy: 'admin' | 'buyer', formSchema: FulfillmentStepFormField[] | null) => ({
      id: statusName,
      flow_id: flow?.id ?? 'system',
      sequence: 0,
      phase: 'PRAORDER' as const,
      filled_by: filledBy,
      status_name: statusName,
      description: null,
      process_day: null,
      form_schema: formSchema,
      release_percentage: null,
      guaranty_days: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const descriptionStep = systemStep(SYSTEM_ORDER_DESCRIPTION_STEP, 'buyer', [
      { key: 'description', label: 'Deskripsi Pesanan', type: 'textarea', required: true },
    ]);
    const quotationStep = systemStep(SYSTEM_QUOTATION_STEP, 'admin', null);

    return {
      ...(flow ?? { id: 'system', website_id: product.website_id, name: 'Quotation', description: null, is_active: true }),
      name: flow?.name ?? 'Quotation',
      steps: [descriptionStep, ...praorderSteps, quotationStep, ...postorderSteps].map((step, index) => ({
        ...step,
        sequence: index + 1,
      })),
    } as FulfillmentFlow;
  }

  private async isOrderFullyStepped(orderId: string, flow: FulfillmentFlow): Promise<boolean> {
    if (flow.steps.length === 0) return true;
    const logs = await this.fulfillmentLogRepo.find({
      where: { order_id: orderId },
    });
    const completedNames = new Set(
      logs
        .filter((log) => log.event_type === 'STEP_COMPLETED' || log.event_type === 'QUOTE_SET')
        .map((log) => log.step_name),
    );
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

  /**
   * Validasi semua field `required` di form_schema terisi. TIDAK lagi
   * menyaring per-field `filled_by` (field.filled_by di FulfillmentStepFormField
   * sengaja dibiarkan ada tapi tidak dipakai sebagai sumber kebenaran) —
   * kepemilikan sekarang di level STEP (`FulfillmentFlowStep.filled_by`,
   * fulfillment-praorder-plan.md §2.1), digate di `assertStepFilledBy` SEBELUM
   * fungsi ini dipanggil. Begitu step lolos gate itu, siapa pun aktor yang
   * berhak (seller ATAU buyer) tetap wajib mengisi SEMUA field required-nya.
   */
  private validateFormData(
    schema: FulfillmentStepFormField[] | null,
    formData: Record<string, unknown> | undefined,
  ): void {
    for (const field of schema ?? []) {
      const value = formData?.[field.key];
      if (field.required && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
        throw new BadRequestException(`Field "${field.label}" wajib diisi`);
      }
      if (Array.isArray(value) && field.max_files != null && value.length > field.max_files) {
        throw new BadRequestException(`Field "${field.label}" maksimal ${field.max_files} file`);
      }
    }
  }

  private validateDraftMediaLimits(
    schema: FulfillmentStepFormField[] | null,
    formData: Record<string, unknown> | undefined,
  ): void {
    for (const field of schema ?? []) {
      const value = formData?.[field.key];
      if (Array.isArray(value) && field.max_files != null && value.length > field.max_files) {
        throw new BadRequestException(`Field "${field.label}" maksimal ${field.max_files} file`);
      }
    }
  }

  async savePraorderStepDraftAsBuyer(
    orderId: string,
    dto: { step_name: string; form_data?: Record<string, unknown> },
    buyerUserId: string,
  ): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId, buyer_user_id: buyerUserId }, relations: { product: true } });
    if (!order) throw new NotFoundException('Order not found');
    const { step } = await this.resolvePraorderStepOrThrow(order, dto.step_name);
    this.assertStepFilledBy(step, 'buyer');
    this.validateDraftMediaLimits(step.form_schema, dto.form_data);
    await this.fulfillmentLogRepo.save(this.fulfillmentLogRepo.create({
      transaction_id: null,
      order_id: orderId,
      event_type: 'STEP_DRAFT',
      step_name: step.status_name,
      form_data: dto.form_data ?? null,
    }));
  }

  async savePraorderStepDraftAsAdmin(
    websiteId: string,
    orderId: string,
    dto: { step_name: string; form_data?: Record<string, unknown> },
  ): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId, website_id: websiteId }, relations: { product: true } });
    if (!order) throw new NotFoundException('Order not found for this website');
    const { step } = await this.resolvePraorderStepOrThrow(order, dto.step_name);
    this.assertStepFilledBy(step, 'admin');
    this.validateDraftMediaLimits(step.form_schema, dto.form_data);
    await this.fulfillmentLogRepo.save(this.fulfillmentLogRepo.create({ transaction_id: null, order_id: orderId, event_type: 'STEP_DRAFT', step_name: step.status_name, form_data: dto.form_data ?? null }));
  }

  async saveFulfillmentStepDraftAsBuyer(
    transactionId: string,
    orderId: string,
    dto: { step_name: string; form_data?: Record<string, unknown> },
    buyerUserId: string,
  ): Promise<void> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction || transaction.buyer_user_id !== buyerUserId) throw new NotFoundException('Transaction not found');
    const item = await this.loadTransactionItemOrThrow(transactionId, orderId);
    const flow = await this.getOrderProductFlow(item.order);
    if (!flow) throw new BadRequestException('Produk ini tidak punya fulfillment flow');
    const step = flow.steps.find((candidate) => candidate.status_name === dto.step_name);
    if (!step) throw new BadRequestException('Step tidak ditemukan di flow produk ini');
    this.assertStepFilledBy(step, 'buyer');
    this.validateDraftMediaLimits(step.form_schema, dto.form_data);
    await this.fulfillmentLogRepo.save(this.fulfillmentLogRepo.create({ transaction_id: transactionId, order_id: orderId, event_type: 'STEP_DRAFT', step_name: step.status_name, form_data: dto.form_data ?? null }));
  }

  async saveFulfillmentStepDraftAsAdmin(
    websiteId: string,
    transactionId: string,
    orderId: string,
    dto: { step_name: string; form_data?: Record<string, unknown> },
  ): Promise<void> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId, website_id: websiteId } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    const item = await this.loadTransactionItemOrThrow(transactionId, orderId);
    const flow = await this.getOrderProductFlow(item.order);
    if (!flow) throw new BadRequestException('Produk ini tidak punya fulfillment flow');
    const step = flow.steps.find((candidate) => candidate.status_name === dto.step_name);
    if (!step) throw new BadRequestException('Step tidak ditemukan di flow produk ini');
    this.assertStepFilledBy(step, 'admin');
    this.validateDraftMediaLimits(step.form_schema, dto.form_data);
    await this.fulfillmentLogRepo.save(this.fulfillmentLogRepo.create({ transaction_id: transactionId, order_id: orderId, event_type: 'STEP_DRAFT', step_name: step.status_name, form_data: dto.form_data ?? null }));
  }

  /**
   * Gerbang step-level (fulfillment-praorder-plan.md §2.1) — step
   * `filled_by:'buyer'` HANYA boleh diselesaikan lewat
   * `completeFulfillmentStepAsBuyer`, step `filled_by:'admin'` (default)
   * HANYA lewat `completeFulfillmentStep` (seller). Tanpa gate ini, seller
   * bisa "menyelesaikan" step yang sebenarnya tugas buyer (mis. "No Resi"
   * pengiriman balik pada flow reparasi) dengan form_data kosong.
   */
  private assertStepFilledBy(step: { filled_by: 'admin' | 'buyer'; status_name: string }, expected: 'admin' | 'buyer'): void {
    if (step.filled_by !== expected) {
      throw new BadRequestException(
        expected === 'buyer'
          ? `Step "${step.status_name}" ini tugas admin/seller, bukan buyer`
          : `Step "${step.status_name}" ini wajib diselesaikan buyer, bukan admin/seller`,
      );
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
      logs
        .filter((l) => l.event_type === 'STEP_COMPLETED' || l.event_type === 'QUOTE_SET')
        .map((l) => l.step_name),
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
      await this.assertNoUnpaidTerminGate(orderId, prevStep.status_name);
    }

    this.assertStepFilledBy(step, 'admin');
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

  /**
   * Buyer menandai 1 step fulfillment selesai — pasangan `completeFulfillmentStep`
   * di atas, dipakai untuk step yang field-nya (sebagian/semua) `filled_by:'buyer'`
   * (mis. "No Resi" pengiriman balik pada flow reparasi, lihat
   * fulfillment-praorder-plan.md §2.1/Q11). Validasi urutan step SAMA persis
   * dengan sisi seller — siapa pun aktornya, step tetap harus berurutan.
   */
  async completeFulfillmentStepAsBuyer(
    transactionId: string,
    orderId: string,
    dto: { step_name: string; form_data?: Record<string, unknown> },
    buyerUserId: string,
  ): Promise<void> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction || transaction.buyer_user_id !== buyerUserId) {
      throw new NotFoundException('Transaction not found'); // anti-leak, pola sama approveStepRelease
    }

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
      logs
        .filter((l) => l.event_type === 'STEP_COMPLETED' || l.event_type === 'QUOTE_SET')
        .map((l) => l.step_name),
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
      await this.assertNoUnpaidTerminGate(orderId, prevStep.status_name);
    }

    this.assertStepFilledBy(step, 'buyer');
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

  /**
   * Progres step PRAORDER untuk 1 order (fulfillment-praorder-plan.md §2.1)
   * — order masih `PENDING`, BELUM ada transaksi sama sekali. Dipakai buyer
   * (halaman "Progres Penawaran") maupun admin. `null` kalau produk tidak
   * punya flow, atau flow-nya tidak punya step Praorder sama sekali.
   */
  async getOrderPraorderProgress(order: WebsiteOrder): Promise<OrderFulfillmentProgress | null> {
    const flow = await this.getOrderProductFlow(order);
    if (!flow) return null;
    const praorderSteps = flow.steps.filter((s) => s.phase === 'PRAORDER');
    if (praorderSteps.length === 0) return null;

    const logs = await this.fulfillmentLogRepo.find({ where: { order_id: order.id } });
    const steps: OrderFulfillmentStepProgress[] = praorderSteps.map((step) => {
      const completedLog = logs.find(
        (l) => l.step_name === step.status_name && (
          l.event_type === 'STEP_COMPLETED' ||
          (step.status_name === SYSTEM_QUOTATION_STEP && l.event_type === 'QUOTE_SET')
        ),
      );
      const draftLog = logs
        .filter((l) => l.step_name === step.status_name && l.event_type === 'STEP_DRAFT')
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
      return {
        stepName: step.status_name,
        phase: step.phase,
        filledBy: step.filled_by,
        description: step.description,
        processDay: step.process_day,
        releasePercentage: null, // tidak relevan pra-checkout, belum ada dana apapun
        guarantyDays: null,
        formSchema: step.form_schema,
        completed: Boolean(completedLog),
        formData: completedLog?.form_data ?? draftLog?.form_data ?? null,
        releaseApproved: false,
        releaseAmount: null,
        releaseApprovedBy: null,
        disputed: false,
      };
    });

    return { flowName: flow.name, steps, termins: [] };
  }

  /** Validasi bersama sebelum tulis log STEP_COMPLETED Praorder — dipakai admin & buyer. */
  private async resolvePraorderStepOrThrow(
    order: WebsiteOrder,
    stepName: string,
  ): Promise<{ step: FulfillmentFlow['steps'][number]; logs: WebsiteTransactionFulfillmentLog[] }> {
    if (order.transaction_id) {
      throw new BadRequestException('Order ini sudah checkout — gunakan endpoint step Pascaorder');
    }
    const flow = await this.getOrderProductFlow(order);
    if (!flow) throw new BadRequestException('Produk ini tidak punya fulfillment flow');
    const praorderSteps = flow.steps.filter((s) => s.phase === 'PRAORDER');
    const stepIndex = praorderSteps.findIndex((s) => s.status_name === stepName);
    if (stepIndex === -1) {
      throw new BadRequestException('Step Praorder tidak ditemukan di flow produk ini');
    }
    const step = praorderSteps[stepIndex];

    const logs = await this.fulfillmentLogRepo.find({ where: { order_id: order.id } });
    const completedNames = new Set(
      logs.filter((l) => l.event_type === 'STEP_COMPLETED').map((l) => l.step_name),
    );
    if (completedNames.has(step.status_name)) {
      throw new BadRequestException('Step ini sudah ditandai selesai');
    }
    if (stepIndex > 0) {
      const prevStep = praorderSteps[stepIndex - 1];
      if (!completedNames.has(prevStep.status_name)) {
        throw new BadRequestException(`Step "${prevStep.status_name}" harus diselesaikan lebih dulu`);
      }
    }
    return { step, logs };
  }

  /** Admin/tenant menyelesaikan 1 step Praorder — order belum checkout, jadi TANPA transactionId sama sekali. */
  async completePraorderStepAsAdmin(
    websiteId: string,
    orderId: string,
    dto: { step_name: string; form_data?: Record<string, unknown> },
  ): Promise<void> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, website_id: websiteId },
      relations: { product: true },
    });
    if (!order) throw new NotFoundException('Order not found for this website');

    const { step } = await this.resolvePraorderStepOrThrow(order, dto.step_name);
    this.assertStepFilledBy(step, 'admin');
    this.validateFormData(step.form_schema, dto.form_data);

    await this.fulfillmentLogRepo.save(
      this.fulfillmentLogRepo.create({
        transaction_id: null,
        order_id: orderId,
        event_type: 'STEP_COMPLETED',
        step_name: step.status_name,
        form_data: dto.form_data ?? null,
      }),
    );
  }

  /** Buyer menyelesaikan 1 step Praorder miliknya sendiri — order belum checkout. */
  async completePraorderStepAsBuyer(
    orderId: string,
    dto: { step_name: string; form_data?: Record<string, unknown> },
    buyerUserId: string,
  ): Promise<void> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, buyer_user_id: buyerUserId },
      relations: { product: true },
    });
    if (!order) throw new NotFoundException('Order not found'); // anti-leak

    const { step } = await this.resolvePraorderStepOrThrow(order, dto.step_name);
    this.assertStepFilledBy(step, 'buyer');
    this.validateFormData(step.form_schema, dto.form_data);

    await this.fulfillmentLogRepo.save(
      this.fulfillmentLogRepo.create({
        transaction_id: null,
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
      const completedLog = stepLogs.find(
        (l) =>
          l.event_type === 'STEP_COMPLETED' ||
          (step.status_name === SYSTEM_QUOTATION_STEP && l.event_type === 'QUOTE_SET'),
      );
      const draftLog = stepLogs
        .filter((l) => l.event_type === 'STEP_DRAFT')
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
      const releaseLog = stepLogs.find((l) => l.event_type === 'RELEASE_APPROVED');
      return {
        stepName: step.status_name,
        phase: step.phase,
        filledBy: step.filled_by,
        description: step.description,
        processDay: step.process_day,
        releasePercentage: step.release_percentage,
        guarantyDays: step.guaranty_days,
        formSchema: step.form_schema,
        completed: Boolean(completedLog),
        formData: completedLog?.form_data ?? draftLog?.form_data ?? null,
        releaseApproved: Boolean(releaseLog),
        releaseAmount: releaseLog?.release_amount ?? null,
        releaseApprovedBy: releaseLog?.release_approved_by ?? null,
        disputed: this.isStepDisputedUnresolved(logs, step.status_name),
      };
    });

    const termins = await this.terminRepo.find({
      where: { source_order_id: order.id },
      order: { sequence: 'ASC' },
    });

    return {
      flowName: flow.name,
      steps,
      termins: termins.map((t) => ({
        id: t.id,
        sequence: t.sequence,
        label: t.label,
        amount: Number(t.amount),
        anchorStepName: t.anchor_step_name,
        status: t.status,
        transactionId: t.transaction_id,
      })),
    };
  }

  /** §2.4 "gerbang urutan" — step Pascaorder yang datang SETELAH step ber-anchor tidak bisa ditandai selesai sampai Termin itu `PAID` (atau `CANCELLED`, batal terikat). */
  private async assertNoUnpaidTerminGate(orderId: string, precedingStepName: string): Promise<void> {
    const blocking = await this.terminRepo.findOne({
      where: { source_order_id: orderId, anchor_step_name: precedingStepName },
    });
    if (blocking && blocking.status !== 'PAID' && blocking.status !== 'CANCELLED') {
      throw new BadRequestException(
        `Termin "${blocking.label}" (Rp ${Number(blocking.amount).toLocaleString('id-ID')}) harus dibayar dulu sebelum step berikutnya bisa dilanjutkan`,
      );
    }
  }

  /**
   * Admin "Terbitkan" — buka Termin yang dijadwalkan (SCHEDULED, dibuat
   * lewat "Atur Termin" saat Harga Final) supaya buyer bisa bayar (§2.4).
   * Aksi manual, bukan otomatis begitu step anchor-nya selesai (Q1/§5).
   */
  async issueTermin(
    websiteId: string,
    transactionId: string,
    orderId: string,
    terminId: string,
  ): Promise<WebsiteOrderTermin> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, website_id: websiteId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    await this.loadTransactionItemOrThrow(transactionId, orderId);

    const termin = await this.terminRepo.findOne({
      where: { id: terminId, source_order_id: orderId, website_id: websiteId },
    });
    if (!termin) throw new NotFoundException('Termin not found');
    if (termin.status !== 'SCHEDULED') {
      throw new BadRequestException(`Termin ini sudah berstatus ${termin.status}, tidak bisa diterbitkan lagi`);
    }

    termin.status = 'ISSUED';
    termin.issued_at = new Date();
    return this.terminRepo.save(termin);
  }

  /**
   * Tagihan Tambahan ad-hoc (§2.4.1, Q12) — beda dari Termin rencana:
   * dibuat kapan saja selama Pascaorder (bukan cuma saat Harga Final),
   * TIDAK ikut validasi SUM=100%, dan langsung `ISSUED` (bukan `SCHEDULED`).
   */
  async addAdhocTermin(
    websiteId: string,
    transactionId: string,
    orderId: string,
    dto: { label: string; amount: number; anchor_step_name?: string },
  ): Promise<WebsiteOrderTermin> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, website_id: websiteId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    await this.loadTransactionItemOrThrow(transactionId, orderId);

    const existing = await this.terminRepo.find({ where: { source_order_id: orderId } });
    const nextSequence = existing.length > 0 ? Math.max(...existing.map((t) => t.sequence)) + 1 : 2;

    const termin = this.terminRepo.create({
      website_id: websiteId,
      source_order_id: orderId,
      sequence: nextSequence,
      label: dto.label,
      amount: dto.amount,
      anchor_step_name: dto.anchor_step_name ?? null,
      status: 'ISSUED',
      issued_at: new Date(),
    });
    return this.terminRepo.save(termin);
  }

  /**
   * Buyer bayar 1 Termin/Tagihan (§2.4) — bikin `website_orders` baru
   * (produk sama dengan order asal, harga = nominal Termin) lalu reuse
   * 100% `createCheckout()` yang sudah ada (escrow + payment-service).
   * `payment_mode` dipaksa `ADD_TO_CART` karena Tagihan memang direct-pay
   * (§2.5) — begitu escrow-nya `HELD`, `syncStatusFromEscrow` otomatis
   * merilis penuh tanpa tombol manual (lihat `maybeAutoReleaseTermin`).
   */
  async payTermin(authUser: AuthUser, terminId: string): Promise<WebsiteTransaction> {
    const termin = await this.terminRepo.findOne({
      where: { id: terminId },
      relations: { source_order: true },
    });
    if (!termin || termin.source_order?.buyer_user_id !== authUser.userId) {
      throw new NotFoundException('Termin not found'); // anti-leak
    }
    if (termin.status !== 'ISSUED') {
      throw new BadRequestException(`Termin ini berstatus ${termin.status}, belum/tidak bisa dibayar`);
    }

    const sourceOrder = termin.source_order;
    const payOrder = await this.orderRepo.save(
      this.orderRepo.create({
        website_id: termin.website_id,
        product_id: sourceOrder.product_id,
        buyer_user_id: authUser.userId,
        buyer_identifier: authUser.email ?? authUser.username ?? null,
        quantity: 1,
        unit_price: Number(termin.amount),
        total_amount: Number(termin.amount),
        // Harga termin ini sudah final (bagian dari quotation seller di
        // sourceOrder) — isi juga di sini supaya lolos guard `createCheckout`
        // yang mensyaratkan quoted_total_amount untuk produk quotable.
        quoted_total_amount: Number(termin.amount),
        currency: sourceOrder.currency,
        payment_mode: 'ADD_TO_CART',
        status: 'PENDING',
        metadata: { termin_id: termin.id, termin_label: termin.label },
      }),
    );

    const transaction = await this.createCheckout(authUser, {
      order_ids: [payOrder.id],
      redirect_transaction_id: sourceOrder.transaction_id ?? undefined,
    });
    transaction.metadata = { ...(transaction.metadata ?? {}), termin_id: termin.id };
    await this.transactionRepo.save(transaction);

    termin.transaction_id = transaction.id;
    await this.terminRepo.save(termin);

    return transaction;
  }

  /** Map 1 baris `WebsiteOrderTermin` (relasi `source_order`+`source_order.product` wajib sudah di-load) ke DTO halaman "Invoice". */
  private toTerminListItem(
    termin: WebsiteOrderTermin,
    opts: { includeBuyer: boolean },
  ): TerminListItemDto {
    const order = termin.source_order;
    return {
      id: termin.id,
      sequence: termin.sequence,
      label: termin.label,
      amount: Number(termin.amount),
      status: termin.status,
      anchorStepName: termin.anchor_step_name,
      orderId: termin.source_order_id,
      orderTransactionId: order?.transaction_id ?? null,
      productName: order?.product?.name ?? null,
      buyerIdentifier: opts.includeBuyer ? order?.buyer_identifier ?? null : null,
      transactionId: termin.transaction_id,
      createdAt: termin.created_at,
      issuedAt: termin.issued_at,
    };
  }

  /**
   * List Termin lintas-order milik SATU WEBSITE (halaman "Invoice" seller).
   * `website_id` sudah kolom langsung di `website_order_termins`, jadi tidak
   * perlu join ke `website_orders` untuk scope-nya (beda dari versi buyer).
   */
  async listWebsiteTermins(
    websiteId: string,
    query: ListTerminsQueryDto,
  ): Promise<TerminListResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(query.size) || 20));

    const qb = this.terminRepo
      .createQueryBuilder('termin')
      .innerJoinAndSelect('termin.source_order', 'source_order')
      .leftJoinAndSelect('source_order.product', 'product')
      .leftJoin(WebsiteTransaction, 'source_tx', 'source_tx.id = source_order.transaction_id')
      .where('termin.website_id = :websiteId', { websiteId })
      .andWhere('source_tx.status IN (:...paidStatuses)', {
        paidStatuses: PAID_ORDER_TRANSACTION_STATUSES,
      });

    if (query.status) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) qb.andWhere('termin.status IN (:...statuses)', { statuses });
    }

    const [rows, total] = await qb
      .orderBy('termin.created_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return {
      data: rows.map((t) => this.toTerminListItem(t, { includeBuyer: true })),
      meta: { page, size, total, totalPages: Math.ceil(total / size) },
    };
  }

  /** Badge count untuk sidebar seller — default dipakai dengan `status=SCHEDULED`. */
  async countWebsiteTermins(websiteId: string, status?: string): Promise<number> {
    const qb = this.terminRepo
      .createQueryBuilder('termin')
      .innerJoin('termin.source_order', 'source_order')
      .leftJoin(WebsiteTransaction, 'source_tx', 'source_tx.id = source_order.transaction_id')
      .where('termin.website_id = :websiteId', { websiteId })
      .andWhere('source_tx.status IN (:...paidStatuses)', {
        paidStatuses: PAID_ORDER_TRANSACTION_STATUSES,
      });

    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) qb.andWhere('termin.status IN (:...statuses)', { statuses });
    }
    return qb.getCount();
  }

  /**
   * List Termin lintas-order milik BUYER yang login (halaman "Invoice"
   * buyer). `buyer_user_id` cuma ada di `source_order`, bukan kolom
   * langsung di termin — beda dari versi seller, di sini WAJIB join.
   */
  async listBuyerTermins(
    buyerUserId: string,
    query: ListTerminsQueryDto,
    websiteId?: string,
  ): Promise<TerminListResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(query.size) || 20));

    const qb = this.terminRepo
      .createQueryBuilder('termin')
      .innerJoinAndSelect('termin.source_order', 'source_order')
      .leftJoinAndSelect('source_order.product', 'product')
      .leftJoin(WebsiteTransaction, 'source_tx', 'source_tx.id = source_order.transaction_id')
      .where('source_order.buyer_user_id = :buyerUserId', { buyerUserId })
      .andWhere('source_tx.status IN (:...paidStatuses)', {
        paidStatuses: PAID_ORDER_TRANSACTION_STATUSES,
      });
    if (websiteId) qb.andWhere('source_order.website_id = :websiteId', { websiteId });

    if (query.status) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) qb.andWhere('termin.status IN (:...statuses)', { statuses });
    }

    const [rows, total] = await qb
      .orderBy('termin.created_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return {
      data: rows.map((t) => this.toTerminListItem(t, { includeBuyer: false })),
      meta: { page, size, total, totalPages: Math.ceil(total / size) },
    };
  }

  /** Badge count untuk header buyer — default dipakai dengan `status=ISSUED`. */
  async countBuyerTermins(buyerUserId: string, status?: string, websiteId?: string): Promise<number> {
    const qb = this.terminRepo
      .createQueryBuilder('termin')
      .innerJoin('termin.source_order', 'source_order')
      .leftJoin(WebsiteTransaction, 'source_tx', 'source_tx.id = source_order.transaction_id')
      .where('source_order.buyer_user_id = :buyerUserId', { buyerUserId })
      .andWhere('source_tx.status IN (:...paidStatuses)', {
        paidStatuses: PAID_ORDER_TRANSACTION_STATUSES,
      });
    if (websiteId) qb.andWhere('source_order.website_id = :websiteId', { websiteId });

    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) qb.andWhere('termin.status IN (:...statuses)', { statuses });
    }

    return qb.getCount();
  }

  /**
   * §2.5 — Tagihan (Termin 2..N) TIDAK menunggu tombol final "Selesai —
   * Terima Barang" seperti Termin 1: begitu escrow transaksi Termin ini
   * `HELD` (baru saja disinkronkan dari `syncStatusFromEscrow`), langsung
   * rilis 100% ke tenant. Plot Hole PH-2 (§3) — kenapa harus direct-pay,
   * bukan escrow bertahan.
   */
  private async maybeAutoReleaseTermin(transaction: WebsiteTransaction): Promise<void> {
    const terminId = transaction.metadata?.termin_id as string | undefined;
    if (!terminId || !transaction.escrow_id) return;
    const termin = await this.terminRepo.findOne({ where: { id: terminId } });
    if (!termin || termin.status === 'PAID') return;

    const escrow = await this.escrowClient.getEscrow(transaction.escrow_id);
    const remainingHold = Number(escrow.remaining_hold);
    if (remainingHold > 0.001) {
      const updated = await this.escrowClient.releasePartial(
        transaction.escrow_id,
        remainingHold,
        `termin:${termin.id}:auto-release`,
      );
      transaction.status = normalizeEscrowStatus(updated.escrowStatus);
      await this.transactionRepo.save(transaction);
    }

    termin.status = 'PAID';
    termin.transaction_id = transaction.id;
    await this.terminRepo.save(termin);
  }
}
