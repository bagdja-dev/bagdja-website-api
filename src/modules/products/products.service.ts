import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FulfillmentFlow, TenantStaff, WebsiteProduct, type PaymentMetaEntry } from '../../entities';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PlanLimitService } from '../subscriptions/plan-limit.service';
import { EscrowClientService } from '../escrow/escrow-client.service';

/** Mode pembayaran yang memakai flow internal escrow (PH-2): dana ke tenant via escrow. */
const ESCROW_PAYMENT_MODES = new Set(['ESCROW', 'ADD_TO_CART']);

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(FulfillmentFlow)
    private readonly fulfillmentFlowRepo: Repository<FulfillmentFlow>,
    private readonly planLimitService: PlanLimitService,
    private readonly escrowClientService: EscrowClientService,
  ) {}

  /** Order Handling Phase 3 — flow harus milik website yang sama (anti cross-tenant). */
  private async assertValidFulfillmentFlow(websiteId: string, flowId: string): Promise<void> {
    const flow = await this.fulfillmentFlowRepo.findOne({ where: { id: flowId } });
    if (!flow) throw new NotFoundException('Fulfillment flow tidak ditemukan');
    if (flow.website_id !== websiteId) {
      throw new BadRequestException('Fulfillment flow harus berada di website yang sama');
    }
  }

  /**
   * Bulk assign/lepas fulfillment flow untuk SEMUA produk dengan `type`
   * tertentu di website ini sekaligus — mempermudah setup awal (seller
   * tidak perlu edit tiap produk satu-satu), dipakai modal "Kelola Flow"
   * di halaman Produk (bagdja-website-admin).
   */
  async assignFulfillmentFlowByType(
    websiteId: string,
    type: string,
    fulfillmentFlowId: string | null,
  ): Promise<{ updated: number }> {
    if (fulfillmentFlowId) {
      await this.assertValidFulfillmentFlow(websiteId, fulfillmentFlowId);
    }
    const result = await this.productRepo.update(
      { website_id: websiteId, type },
      { fulfillment_flow_id: fulfillmentFlowId },
    );
    return { updated: result.affected ?? 0 };
  }

  async findAll(websiteId: string, type?: string) {
    return this.productRepo.find({
      where: {
        website_id: websiteId,
        ...(type ? { type } : {}),
      },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(productId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async assertSlugAvailable(websiteId: string, slug: string, excludeId?: string) {
    const existing = await this.productRepo.findOne({ where: { website_id: websiteId, slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug "${slug}" already exists in this website`);
    }
  }

  /**
   * Batasi hierarki varian maksimal 1 level (parent → children, tidak boleh
   * ada cucu). Dicek dari sisi target: target harus produk top-level
   * (`parent_product_id IS NULL`) dan berada di website yang sama.
   */
  private async assertValidParent(websiteId: string, parentProductId: string, excludeId?: string) {
    if (parentProductId === excludeId) {
      throw new BadRequestException('Produk tidak bisa dijadikan varian dari dirinya sendiri');
    }

    const parent = await this.productRepo.findOne({ where: { id: parentProductId } });
    if (!parent) throw new NotFoundException('Produk induk tidak ditemukan');
    if (parent.website_id !== websiteId) {
      throw new BadRequestException('Produk induk harus berada di website yang sama');
    }
    if (parent.parent_product_id !== null) {
      throw new BadRequestException(
        'Produk ini sudah menjadi varian dari produk lain — pilih produk top-level sebagai induk',
      );
    }
  }

  /**
   * Sisi sebaliknya dari `assertValidParent`: produk yang SUDAH punya
   * varian sendiri tidak boleh diubah jadi varian dari produk lain (akan
   * membuat hierarki 2 level / cucu).
   */
  private async assertNoExistingChildren(productId: string) {
    const childCount = await this.productRepo.count({ where: { parent_product_id: productId } });
    if (childCount > 0) {
      throw new BadRequestException(
        'Produk ini sudah punya varian sendiri — tidak bisa dijadikan varian dari produk lain',
      );
    }
  }

  async create(websiteId: string, dto: CreateProductDto) {
    // Plan limit enforcement (Fase 3): cek jumlah produk website vs plan
    // pemilik sebelum menambah baru.
    await this.assertWithinProductLimit(websiteId);

    await this.assertSlugAvailable(websiteId, dto.slug);
    if (dto.parent_product_id) {
      await this.assertValidParent(websiteId, dto.parent_product_id);
    }
    if (dto.fulfillment_flow_id) {
      await this.assertValidFulfillmentFlow(websiteId, dto.fulfillment_flow_id);
    }

    const product = this.productRepo.create({
      website_id: websiteId,
      type: dto.type ?? 'product',
      category_id: dto.category_id ?? null,
      parent_product_id: dto.parent_product_id ?? null,
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      detail: dto.detail ?? null,
      price: dto.price ?? 0,
      images: dto.images ?? [],
      metadata: dto.metadata ?? {},
      payment_meta: (dto.payment_meta && dto.payment_meta.length > 0
        ? dto.payment_meta
        : ([{ payment_mode: 'ADD_TO_CART' }] as PaymentMetaEntry[])) as PaymentMetaEntry[],
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
      fulfillment_flow_id: dto.fulfillment_flow_id ?? null,
      final_release_guaranty_days: dto.final_release_guaranty_days ?? null,
      weight_grams: dto.weight_grams ?? null,
      length_cm: dto.length_cm ?? null,
      width_cm: dto.width_cm ?? null,
      height_cm: dto.height_cm ?? null,
    });
    const saved = await this.productRepo.save(product);

    // PH-5: auto-provision Escrow Product canonical di payment-service (satu
    // per website, dipakai semua produknya) kalau produk ini pakai mode
    // ESCROW/ADD_TO_CART (idempotent via websites.escrow_product_id).
    if (this.hasEscrowPaymentMode(dto.payment_meta)) {
      await this.escrowClientService.ensureEscrowProductForWebsite(websiteId);
    }

    return saved;
  }

  /** Resolve owner user dari website, lalu cek batas produk vs plan pemilik. */
  private async assertWithinProductLimit(websiteId: string): Promise<void> {
    const owner = await this.staffRepo.findOne({
      where: { website_id: websiteId, role: 'owner', is_active: true },
    });
    if (!owner) return; // tidak ada owner → jangan blok (defensif)

    const currentProducts = await this.productRepo.count({ where: { website_id: websiteId } });
    await this.planLimitService.checkCanAddProduct(owner.user_id, currentProducts);
  }

  async update(productId: string, websiteId: string, dto: UpdateProductDto) {
    const product = await this.findOne(productId);

    if (dto.slug && dto.slug !== product.slug) {
      await this.assertSlugAvailable(websiteId, dto.slug, productId);
    }

    if (dto.parent_product_id && dto.parent_product_id !== product.parent_product_id) {
      await this.assertValidParent(websiteId, dto.parent_product_id, productId);
      await this.assertNoExistingChildren(productId);
    }
    if (dto.fulfillment_flow_id) {
      await this.assertValidFulfillmentFlow(websiteId, dto.fulfillment_flow_id);
    }

    if (dto.payment_meta !== undefined && dto.payment_meta.length === 0) {
      // Kosongkan eksplisit = reset ke default cart (ADD_TO_CART)
      product.payment_meta = [{ payment_mode: 'ADD_TO_CART' }] as PaymentMetaEntry[];
    } else if (dto.payment_meta === undefined && (!product.payment_meta || product.payment_meta.length === 0)) {
      // Produk lama tanpa payment_meta (belum ke-backfill migration) → default cart
      product.payment_meta = [{ payment_mode: 'ADD_TO_CART' }] as PaymentMetaEntry[];
    }

    Object.assign(product, dto);
    const saved = await this.productRepo.save(product);

    // PH-5: auto-provision Escrow Product canonical per website (idempotent).
    // Dipanggil juga saat update supaya website ikut ter-provision begitu ada
    // produknya yang diubah ke mode escrow.
    if (dto.payment_meta !== undefined && this.hasEscrowPaymentMode(dto.payment_meta)) {
      await this.escrowClientService.ensureEscrowProductForWebsite(websiteId);
    }

    return saved;
  }

  /** True kalau payment_meta mengandung mode yang memakai flow internal escrow. */
  private hasEscrowPaymentMode(
    paymentMeta: Array<{ payment_mode?: string }> | undefined,
  ): boolean {
    if (!Array.isArray(paymentMeta)) return false;
    return paymentMeta.some((entry) =>
      ESCROW_PAYMENT_MODES.has(entry?.payment_mode ?? ''),
    );
  }

  async remove(productId: string) {
    const product = await this.findOne(productId);
    await this.productRepo.remove(product);
    return { deleted: true };
  }
}
