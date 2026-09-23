import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  FulfillmentFlow,
  ProductUom,
  TenantStaff,
  WebsiteLocation,
  WebsiteProduct,
  WebsiteProductLocation,
  type PaymentMetaEntry,
} from '../../entities';

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
    @InjectRepository(ProductUom)
    private readonly uomRepo: Repository<ProductUom>,
    @InjectRepository(WebsiteProductLocation)
    private readonly productLocationRepo: Repository<WebsiteProductLocation>,
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
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
    const products = await this.productRepo.find({
      where: {
        website_id: websiteId,
        ...(type ? { type } : {}),
      },
      order: { sort_order: 'ASC', name: 'ASC' },
      relations: ['product_locations', 'uom'],
    });

    return products.map((product) => ({
      ...product,
      location_ids: product.product_locations?.map((row) => row.location_id) ?? [],
    }));
  }

  async findOne(productId: string) {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['product_locations', 'uom'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return {
      ...product,
      location_ids: product.product_locations?.map((row) => row.location_id) ?? [],
    };
  }

  async listUoms() {
    return this.uomRepo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC', label: 'ASC' },
    });
  }

  private async assertValidUom(uomId: string | null | undefined): Promise<void> {
    if (!uomId) return;
    const uom = await this.uomRepo.findOne({ where: { id: uomId, is_active: true } });
    if (!uom) throw new BadRequestException('UOM tidak ditemukan atau sudah tidak aktif');
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

  private async assertValidLocationSelection(websiteId: string, locationIds: string[] = []) {
    if (locationIds.length === 0) return;

    const uniqueIds = [...new Set(locationIds)];
    const foundLocations = await this.locationRepo.find({
      where: { id: In(uniqueIds), website_id: websiteId },
    });

    if (foundLocations.length !== uniqueIds.length) {
      throw new BadRequestException('Satu atau lebih lokasi tidak milik website yang sama');
    }
  }

  private async syncProductLocations(productId: string, websiteId: string, locationIds: string[] = []) {
    await this.assertValidLocationSelection(websiteId, locationIds);

    const uniqueIds = [...new Set(locationIds)];
    await this.productLocationRepo.delete({ product_id: productId });

    if (uniqueIds.length === 0) return;

    await this.productLocationRepo.save(
      uniqueIds.map((locationId) => ({
        product_id: productId,
        location_id: locationId,
        metadata: {},
      })),
    );
  }

  async create(websiteId: string, dto: CreateProductDto) {
    await this.assertValidUom(dto.uom_id);
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
    await this.assertValidLocationSelection(websiteId, dto.location_ids ?? []);

    const type = dto.type ?? 'product';
    // requires_shipping (§2.6 fulfillment-praorder-plan.md, Q10) — independen
    // dari `type`, tapi kalau admin tidak isi eksplisit saat create, turunkan
    // default yang masuk akal dari `type`: service/digital biasanya tidak
    // perlu ongkir (bisa di-override manual kapan saja lewat update).
    const requiresShipping =
      dto.requires_shipping ?? !(type === 'service' || type === 'digital');

    const product = this.productRepo.create({
      website_id: websiteId,
      type,
      requires_shipping: requiresShipping,
      category_id: dto.category_id ?? null,
      parent_product_id: dto.parent_product_id ?? null,
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      detail: dto.detail ?? null,
      price: dto.price ?? 0,
      images: dto.images ?? [],
      video_url: dto.video_url ?? null,
      model3d_url: dto.model3d_url ?? null,
      metadata: dto.metadata ?? {},
      specifications: dto.specifications ?? {},
      estimation: dto.estimation ?? [],
      payment_meta: (dto.payment_meta && dto.payment_meta.length > 0
        ? dto.payment_meta
        : ([{ payment_mode: 'ADD_TO_CART' }] as PaymentMetaEntry[])) as PaymentMetaEntry[],
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
      quotable: dto.quotable ?? false,
      uom_id: dto.uom_id ?? null,
      fulfillment_flow_id: dto.fulfillment_flow_id ?? null,
      final_release_guaranty_days: dto.final_release_guaranty_days ?? null,
      weight_grams: dto.weight_grams ?? null,
      length_cm: dto.length_cm ?? null,
      width_cm: dto.width_cm ?? null,
      height_cm: dto.height_cm ?? null,
    });
    const saved = await this.productRepo.save(product);
    await this.syncProductLocations(saved.id, websiteId, dto.location_ids ?? []);

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
    await this.assertValidUom(dto.uom_id);
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

    if (dto.location_ids !== undefined) {
      await this.syncProductLocations(productId, websiteId, dto.location_ids);
    }

    return this.findOne(productId);
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
