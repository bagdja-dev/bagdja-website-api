import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { FulfillmentFlow } from '../../entities/fulfillment-flow.entity';
import { WebsiteLocation } from '../../entities/website-location.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import { WebsiteOrderTermin } from '../../entities/website-order-termin.entity';
import { WebsiteProduct, type PaymentMetaEntry } from '../../entities/website-product.entity';
import { WebsiteProductLocation } from '../../entities/website-product-location.entity';
import { WebsiteVendor } from '../../entities/website-vendor.entity';
import { WebsiteVendorLocation } from '../../entities/website-vendor-location.entity';
import { WebsiteTransactionFulfillmentLog } from '../../entities/website-transaction-fulfillment-log.entity';
import type { AuthUser } from '../../common/auth';
import { EscrowClientService } from '../escrow/escrow-client.service';
import { StorageClientService } from '../storage/storage-client.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { SYSTEM_ORDER_DESCRIPTION_STEP, SYSTEM_QUOTATION_STEP } from '../transactions/system-steps';

const CHECKOUT_MODES = new Set(['ADD_TO_CART', 'ESCROW']);

/**
 * Order & checkout (W2) — plan/website-builder/cart-and-implementation-payment-escrow.md.
 * Model: `order:escrow = 1:1` — escrow terikat ke ORDER, bukan ke produk
 * (produk sendiri terikat ke escrow_product_id, template reusable).
 * MVP: 1 order = 1 produk.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(WebsiteOrder)
    private readonly orderRepo: Repository<WebsiteOrder>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
    @InjectRepository(WebsiteProductLocation)
    private readonly productLocationRepo: Repository<WebsiteProductLocation>,
    @InjectRepository(WebsiteVendor)
    private readonly vendorRepo: Repository<WebsiteVendor>,
    @InjectRepository(WebsiteVendorLocation)
    private readonly vendorLocationRepo: Repository<WebsiteVendorLocation>,
    @InjectRepository(WebsiteOrderTermin)
    private readonly terminRepo: Repository<WebsiteOrderTermin>,
    @InjectRepository(FulfillmentFlow)
    private readonly flowRepo: Repository<FulfillmentFlow>,
    @InjectRepository(WebsiteTransactionFulfillmentLog)
    private readonly fulfillmentLogRepo: Repository<WebsiteTransactionFulfillmentLog>,
    private readonly escrowClient: EscrowClientService,
    @Optional() private readonly storage?: StorageClientService,
  ) {}

  /**
   * createDraftOrder — buat order draft (status PENDING) tanpa escrow/payment.
   * Dipanggil tombol "+ Keranjang" di renderer (W1b/W2, cart server-side).
   * Gabung per produk: kalau sudah ada order PENDING utk produk yang sama
   * (buyer+website), qty di-update (bukan bikin order baru menumpuk).
   */
  async createDraftOrder(authUser: AuthUser, dto: CreateOrderDto): Promise<WebsiteOrder> {
    const product = await this.productRepo.findOne({
      where: { id: dto.product_id, website_id: dto.website_id },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.is_active) {
      throw new BadRequestException('Product is not active');
    }

    if (dto.location_id) {
      const location = await this.locationRepo.findOne({
        where: { id: dto.location_id, website_id: dto.website_id, is_active: true },
      });
      if (!location) throw new BadRequestException('Selected location is not available for this website');
    }

    const assignedLocations = await this.productLocationRepo.find({
      where: { product_id: product.id },
      select: { location_id: true },
    });
    if (assignedLocations.length > 0 && (!dto.location_id || !assignedLocations.some((row) => row.location_id === dto.location_id))) {
      throw new BadRequestException('Product is not available at the selected location');
    }

    const checkoutMeta = (product.payment_meta ?? []).find(
      (entry: PaymentMetaEntry) => CHECKOUT_MODES.has(entry.payment_mode),
    );
    if (!checkoutMeta) {
      throw new BadRequestException(
        'Product does not support Bagdja checkout (ADD_TO_CART/ESCROW)',
      );
    }

    const quantity = Math.max(1, dto.quantity ?? 1);
    const unitPrice = Number(product.price);
    const totalAmount = unitPrice * quantity;
    const paymentMode = checkoutMeta.payment_mode as 'ADD_TO_CART' | 'ESCROW';

    // Gabung: cari draft PENDING existing utk produk yang sama (buyer+website).
    // WAJIB transaction_id IS NULL — order yang sudah diklaim ke transaksi
    // (checkout, termasuk yang gagal/CANCELLED) tetap berstatus PENDING
    // selamanya, cuma transaction_id-nya yang keisi. Tanpa guard ini, add-to-
    // cart ulang produk yang sama akan menggabung ke order lama yang sudah
    // "terkubur" di transaksi mati itu — nambah qty di tempat yang tidak
    // pernah muncul di /cart (filter cart selalu `!transaction_id`).
    const existing = await this.orderRepo.findOne({
      where: {
        buyer_user_id: authUser.userId,
        website_id: dto.website_id,
        product_id: dto.product_id,
        location_id: dto.location_id ? dto.location_id : IsNull(),
        status: 'PENDING',
        transaction_id: IsNull(),
      },
    });
    if (existing && !(product.quotable && existing.quoted_total_amount != null)) {
      const alreadyQuoted = Boolean((existing.metadata as Record<string, unknown> | null)?.['preorder']);
      if (alreadyQuoted || existing.quoted_total_amount != null) {
        throw new BadRequestException(
          'Quantity tidak dapat diubah setelah quotation dibuat; minta quotation ulang dari seller',
        );
      }
      // Draft yang belum di-quote masih boleh menggabungkan quantity dari
      // tombol Pesan di halaman detail produk.
      existing.quantity = existing.quantity + quantity;
      existing.total_amount = unitPrice * existing.quantity;
      existing.metadata = {
        ...(existing.metadata ?? {}),
        updated_by: 'add_to_cart',
        updated_at: new Date().toISOString(),
      };
      return this.orderRepo.save(existing);
    }

    return this.orderRepo.save(
      this.orderRepo.create({
        website_id: dto.website_id,
        product_id: dto.product_id,
        location_id: dto.location_id ?? null,
        buyer_user_id: authUser.userId,
        buyer_identifier: authUser.email ?? authUser.username ?? null,
        quantity,
        unit_price: unitPrice,
        total_amount: totalAmount,
        currency: 'IDR',
        payment_mode: paymentMode,
        status: 'PENDING',
        metadata: { source: 'add_to_cart' },
      }),
    );
  }

  async getOrder(orderId: string, buyerUserId: string): Promise<WebsiteOrder> {
    const order = await this.assertOwned(orderId, buyerUserId);

    const quoteTermins = await this.terminRepo.find({
      where: { source_order_id: order.id },
      order: { sequence: 'ASC' },
    });
    const firstTerminLabel = (order.metadata as { quote_first_termin_label?: string } | null)?.quote_first_termin_label;
    (order as WebsiteOrder & { quoteTermins?: unknown[] }).quoteTermins = [
      {
        sequence: 1,
        label: firstTerminLabel || 'Termin 1',
        amount: Number(order.unit_price) * order.quantity,
        status: order.transaction_id ? 'PAID' : 'SCHEDULED',
      },
      ...quoteTermins.map((termin) => ({
        sequence: termin.sequence,
        label: termin.label,
        amount: Number(termin.amount),
        status: termin.status,
      })),
    ];

    if (order.escrow_id && this.isSyncable(order.status)) {
      const escrow = await this.escrowClient.getEscrow(order.escrow_id);
      if (escrow.status !== order.status) {
        order.status = escrow.status;
        await this.orderRepo.save(order);
      }
    }

    return order;
  }

  async uploadBuyerFulfillmentAsset(
    orderId: string,
    buyerUserId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; path: string }> {
    const order = await this.assertOwned(orderId, buyerUserId);
    if (!this.storage) throw new BadRequestException('Storage service belum tersedia');
    return this.storage.uploadFile(file.buffer, file.mimetype, file.originalname, `fulfillment/${order.website_id}`);
  }

  async listVendorCandidates(websiteId: string, locationId: string) {
    const location = await this.locationRepo.findOne({ where: { id: locationId, website_id: websiteId, is_active: true } });
    if (!location) throw new NotFoundException('Location not found for this website');

    return this.vendorRepo
      .createQueryBuilder('vendor')
      .innerJoin('vendor.vendor_locations', 'coverage', 'coverage.location_id = :locationId', { locationId })
      .where('vendor.website_id = :websiteId', { websiteId })
      .andWhere('vendor.status = :status', { status: 'active' })
      .orderBy('vendor.name', 'ASC')
      .getMany();
  }

  async listTenantDraftOrders(websiteId: string) {
    return this.orderRepo.find({
      where: {
        website_id: websiteId,
        status: 'PENDING',
        transaction_id: IsNull(),
      },
      relations: { product: true, location: true, vendor: true },
      order: { created_at: 'DESC' },
    });
  }

  /** Badge sidebar "Penawaran" — cuma hitung draft yang BELUM di-quote sama sekali (butuh aksi seller). Draft yang sudah di-quote ["Siap checkout"] tidak dihitung karena bola sudah di tangan buyer. */
  async countDraftOrdersAwaitingQuotation(websiteId: string): Promise<number> {
    return this.orderRepo.count({
      where: {
        website_id: websiteId,
        status: 'PENDING',
        transaction_id: IsNull(),
        quoted_total_amount: IsNull(),
      },
    });
  }

  async listTenantCancelledPreorders(websiteId: string) {
    return this.orderRepo.find({
      where: {
        website_id: websiteId,
        status: 'CANCELLED',
        product: { quotable: true },
      },
      relations: { product: true, location: true, vendor: true },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Seller batalkan draft praorder (tombol "Batalkan" di halaman Penawaran).
   * Beda dari `cancelDraft` (buyer) cuma soal kepemilikan (scope website,
   * bukan buyer) dan `cancelled_by`/`cancellation_reason`.
   */
  async cancelDraftAsAdmin(websiteId: string, orderId: string, reason?: string): Promise<WebsiteOrder> {
    const order = await this.orderRepo.findOne({ where: { id: orderId, website_id: websiteId } });
    if (!order) throw new NotFoundException('Order not found for this website');
    if (order.status !== 'PENDING') {
      throw new BadRequestException(`Order is not in PENDING state (current: ${order.status})`);
    }
    if (order.transaction_id) {
      throw new BadRequestException('Order is already in a transaction');
    }
    order.status = 'CANCELLED';
    order.metadata = {
      ...(order.metadata ?? {}),
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'admin',
      cancellation_reason: reason?.trim() || 'Dibatalkan oleh penjual',
    };
    return this.orderRepo.save(order);
  }

  async assignVendor(websiteId: string, orderId: string, vendorId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, website_id: websiteId } });
    if (!order) throw new NotFoundException('Order not found for this website');
    if (!order.location_id) throw new BadRequestException('Order must have a service location before vendor assignment');

    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId, website_id: websiteId, status: 'active' } });
    if (!vendor) throw new BadRequestException('Vendor is not active or does not belong to this website');

    const coverage = await this.vendorLocationRepo.findOne({
      where: { vendor_id: vendorId, location_id: order.location_id },
    });
    if (!coverage) throw new BadRequestException('Vendor does not cover the order location');

    order.vendor_id = vendorId;
    return this.orderRepo.save(order);
  }

  /**
   * Set harga final quotation (§2.2) — opsional sertakan "Atur Termin"
   * (§2.3): kalau `termins` diisi, index 0 = Termin 1 (DP, langsung jadi
   * `total_amount` order ini seperti biasa) dan sisanya (index 1..N) jadi
   * baris `website_order_termins` baru berstatus `SCHEDULED` (§2.4) —
   * BELUM bisa dibayar buyer sampai admin "Terbitkan" (`issueTermin`).
   */
  async setDraftQuote(
    websiteId: string,
    orderId: string,
    finalPrice: number,
    termins?: { label: string; amount: number; anchor_step_name?: string }[],
  ) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, website_id: websiteId },
      relations: { product: { uom: true } },
    });
    if (!order) throw new NotFoundException('Order not found for this website');
    if (order.status !== 'PENDING' || order.transaction_id) {
      throw new BadRequestException('Only an unclaimed PENDING draft can receive a quotation');
    }
    await this.assertQuotationStepReady(order);

    const price = Number(finalPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException('Final quotation price must be greater than zero');
    }

    if (termins && termins.length > 0) {
      const sum = termins.reduce((acc, t) => acc + Number(t.amount), 0);
      // Toleransi pembulatan kecil (rupiah, integer) — bukan floating point ketat.
      if (Math.abs(sum - price) > 1) {
        throw new BadRequestException(
          `Total Termin (Rp ${sum.toLocaleString('id-ID')}) harus persis sama dengan Harga Final (Rp ${price.toLocaleString('id-ID')})`,
        );
      }
      // Termin lama (kalau ini revisi ulang Harga Final, Q2) dibuang & dibuat ulang dari daftar terbaru.
      await this.terminRepo.delete({ source_order_id: orderId });
      order.quoted_total_amount = price;
      order.unit_price = Number(termins[0].amount) / order.quantity;
      order.total_amount = Number(termins[0].amount);

      const rest = termins.slice(1);
      for (let i = 0; i < rest.length; i += 1) {
        await this.terminRepo.save(
          this.terminRepo.create({
            website_id: websiteId,
            source_order_id: orderId,
            sequence: i + 2,
            label: rest[i].label,
            amount: rest[i].amount,
            anchor_step_name: rest[i].anchor_step_name ?? null,
            status: 'SCHEDULED',
          }),
        );
      }
    } else {
      await this.terminRepo.delete({ source_order_id: orderId });
      order.quoted_total_amount = price;
      order.unit_price = price / order.quantity;
      order.total_amount = price;
    }

    order.metadata = {
      ...(order.metadata ?? {}),
      preorder: true,
      quoted_at: new Date().toISOString(),
      quoted_by: 'tenant_staff',
      ...(termins && termins.length > 0 ? { quote_first_termin_label: termins[0].label } : {}),
    };

    const savedOrder = await this.orderRepo.save(order);
    await this.fulfillmentLogRepo.save(
      this.fulfillmentLogRepo.create({
        transaction_id: savedOrder.transaction_id ?? null,
        order_id: savedOrder.id,
        event_type: 'QUOTE_SET',
        step_name: SYSTEM_QUOTATION_STEP,
        form_data: {
          final_price: price,
          termins: termins?.map((term) => ({
            label: term.label,
            amount: Number(term.amount),
            anchor_step_name: term.anchor_step_name ?? null,
          })) ?? [],
        },
      }),
    );

    return savedOrder;
  }

  private async assertQuotationStepReady(order: WebsiteOrder): Promise<void> {
    if (!order.product?.quotable) return;

    const logs = await this.fulfillmentLogRepo.find({ where: { order_id: order.id } });
    const completed = new Set(
      logs.filter((log) => log.event_type === 'STEP_COMPLETED').map((log) => log.step_name),
    );
    const flow = order.product.fulfillment_flow_id
      ? await this.flowRepo.findOne({
          where: { id: order.product.fulfillment_flow_id },
          relations: { steps: true },
        })
      : null;
    const requiredSteps = [
      SYSTEM_ORDER_DESCRIPTION_STEP,
      ...(flow?.steps ?? [])
        .filter((step) => step.phase === 'PRAORDER')
        .sort((a, b) => a.sequence - b.sequence)
        .map((step) => step.status_name),
    ];
    const incomplete = requiredSteps.find((stepName) => !completed.has(stepName));
    if (incomplete) {
      throw new BadRequestException(`Step "${incomplete}" harus diselesaikan sebelum quotation`);
    }
  }

  async listOrders(
    buyerUserId: string,
    query: { page?: number; size?: number; cartOnly?: boolean; websiteId?: string },
  ): Promise<{ data: WebsiteOrder[]; meta: Record<string, number> }> {
    const page = Math.max(1, Number(query.page) || 1);
    // Cart biasanya sedikit baris — beri langit-langit lebih longgar daripada
    // riwayat order biasa supaya cart tidak diam-diam terpotong.
    const size = query.cartOnly
      ? Math.min(200, Math.max(1, Number(query.size) || 200))
      : Math.min(100, Math.max(1, Number(query.size) || 20));

    // `cart=true` — filter "keranjang aktif" (PENDING & belum di-claim
    // transaksi) SEKALI di sini, jadi setiap konsumen (badge/cart/checkout
    // di bagdja-website) tinggal percaya respons API apa adanya tanpa
    // menduplikasi filter atau memelihara salinan lokal yang bisa basi.
    const where: Record<string, unknown> = { buyer_user_id: buyerUserId };
    if (query.websiteId) where.website_id = query.websiteId;
    if (query.cartOnly) {
      where.status = 'PENDING';
      where.transaction_id = IsNull();
    }

    const [data, total] = await this.orderRepo.findAndCount({
      where,
      relations: { product: { uom: true } },
      order: { created_at: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    const quoteOrderIds = data
      .filter((order) => order.quoted_total_amount != null)
      .map((order) => order.id);
    const quoteTermins = quoteOrderIds.length
      ? await this.terminRepo.find({
          where: quoteOrderIds.map((source_order_id) => ({ source_order_id })),
          order: { sequence: 'ASC' },
        })
      : [];
    const terminsByOrderId = new Map<string, Array<{ sequence: number; label: string; amount: number }>>();
    for (const termin of quoteTermins) {
      const termins = terminsByOrderId.get(termin.source_order_id) ?? [];
      termins.push({ sequence: termin.sequence, label: termin.label, amount: Number(termin.amount) });
      terminsByOrderId.set(termin.source_order_id, termins);
    }
    const dataWithTermins = data.map((order) => {
      if (order.quoted_total_amount == null) return order;
      const firstTerminLabel = (order.metadata as { quote_first_termin_label?: string } | null)?.quote_first_termin_label;
      return {
        ...order,
        quoteTermins: [
          { sequence: 1, label: firstTerminLabel || 'Termin 1', amount: Number(order.unit_price) * order.quantity },
          ...(terminsByOrderId.get(order.id) ?? []),
        ],
      };
    });

    return {
      data: dataWithTermins,
      meta: { page, size, total, totalPages: Math.ceil(total / size) },
    };
  }

  async listCancelledPreorders(buyerUserId: string): Promise<WebsiteOrder[]> {
    return this.orderRepo.find({
      where: {
        buyer_user_id: buyerUserId,
        status: 'CANCELLED',
        product: { quotable: true },
      },
      relations: { product: true, location: true, vendor: true },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Update qty draft PENDING milik buyer (halaman /cart, stepper −/+).
   * Recompute total_amount dari unit_price × qty baru.
   */
  async updateDraftQuantity(
    orderId: string,
    buyerUserId: string,
    quantity: number,
  ): Promise<WebsiteOrder> {
    const order = await this.assertOwned(orderId, buyerUserId);
    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `Order is not in PENDING state (current: ${order.status})`,
      );
    }
    if (order.transaction_id) {
      throw new BadRequestException('Order is already in a transaction');
    }
    if (order.product?.quotable && order.quoted_total_amount != null) {
      throw new BadRequestException('Quantity tidak dapat diubah setelah quotation dibuat; minta quotation ulang dari seller');
    }
    const qty = Math.max(1, Math.floor(quantity || 1));
    order.quantity = qty;
    order.total_amount = Number(order.unit_price) * qty;
    return this.orderRepo.save(order);
  }

  /**
   * Hapus/cancel draft PENDING milik buyer (tombol hapus di /cart).
   * Draft yang sudah checkout (bukan PENDING) ditolak.
   */
  async cancelDraft(orderId: string, buyerUserId: string): Promise<WebsiteOrder> {
    const order = await this.assertOwned(orderId, buyerUserId);
    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `Order is not in PENDING state (current: ${order.status})`,
      );
    }
    if (order.transaction_id) {
      throw new BadRequestException('Order is already in a transaction');
    }
    order.status = 'CANCELLED';
    order.metadata = {
      ...(order.metadata ?? {}),
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'buyer',
      cancellation_reason: 'Dibatalkan oleh buyer',
    };
    return this.orderRepo.save(order);
  }

  private async assertOwned(
    orderId: string,
    buyerUserId: string,
  ): Promise<WebsiteOrder> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { product: { uom: true } },
    });
    if (!order || order.buyer_user_id !== buyerUserId) {
      throw new NotFoundException('Order not found'); // anti-leak
    }
    return order;
  }

  /** Belum status terminal — masih relevan untuk pull sync (PH-6). */
  private isSyncable(status: string): boolean {
    return ['PENDING', 'HELD', 'DISPUTED'].includes(status);
  }
}
