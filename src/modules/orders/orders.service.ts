import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { WebsiteOrder } from '../../entities/website-order.entity';
import { WebsiteProduct, type PaymentMetaEntry } from '../../entities/website-product.entity';
import type { AuthUser } from '../../common/auth';
import { EscrowClientService } from '../escrow/escrow-client.service';
import { CreateOrderDto } from './dto/create-order.dto';

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
    private readonly escrowClient: EscrowClientService,
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
        status: 'PENDING',
        transaction_id: IsNull(),
      },
    });
    if (existing) {
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

    if (order.escrow_id && this.isSyncable(order.status)) {
      const escrow = await this.escrowClient.getEscrow(order.escrow_id);
      if (escrow.status !== order.status) {
        order.status = escrow.status;
        await this.orderRepo.save(order);
      }
    }

    return order;
  }

  async listOrders(
    buyerUserId: string,
    query: { page?: number; size?: number },
  ): Promise<{ data: WebsiteOrder[]; meta: Record<string, number> }> {
    const page = Math.max(1, Number(query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(query.size) || 20));

    const [data, total] = await this.orderRepo.findAndCount({
      where: { buyer_user_id: buyerUserId },
      relations: { product: true },
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
    };
    return this.orderRepo.save(order);
  }

  private async assertOwned(
    orderId: string,
    buyerUserId: string,
  ): Promise<WebsiteOrder> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { product: true },
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
