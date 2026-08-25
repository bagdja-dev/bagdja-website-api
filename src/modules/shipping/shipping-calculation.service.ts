import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { WebsiteLocation } from '../../entities/website-location.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import {
  ShippingClientService,
  ShippingCostOptionResult,
} from './shipping-client.service';

/** Default kemasan kalau produk belum diisi berat/dimensi — D2, plan/website-builder/integration-check-shipping-plan.md. */
const DEFAULT_WEIGHT_GRAMS = 250;
const DEFAULT_LENGTH_CM = 30;
const DEFAULT_WIDTH_CM = 30;
const DEFAULT_HEIGHT_CM = 5;
/** Konversi cm³ → kg volumetrik, rumus standar kurir domestik Indonesia. */
const VOLUMETRIC_DIVISOR = 6000;

/**
 * Berat efektif 1 unit produk untuk hitung ongkir: MAX(berat aktual, berat
 * volumetrik dari dimensi) — kurir menagih berdasarkan mana yang lebih besar.
 * RajaOngkir (Fase 0 riset, plan/shipping-service/overview.md) cuma terima
 * parameter `weight`, tidak ada parameter dimensi terpisah — jadi konversi
 * ke "berat efektif" ini dilakukan di sini, bukan dikirim mentah ke service.
 */
export function effectiveWeightGrams(product: {
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
}): number {
  const actual = product.weight_grams ?? DEFAULT_WEIGHT_GRAMS;
  const length = product.length_cm ?? DEFAULT_LENGTH_CM;
  const width = product.width_cm ?? DEFAULT_WIDTH_CM;
  const height = product.height_cm ?? DEFAULT_HEIGHT_CM;
  const volumetricGrams = ((length * width * height) / VOLUMETRIC_DIVISOR) * 1000;
  return Math.max(actual, volumetricGrams);
}

export interface CalculateShippingParams {
  websiteId: string;
  buyerUserId: string;
  orderIds: string[];
  locationId: string;
  destinationAreaId: string;
  courierCode?: string;
}

/**
 * Logic inti hitung ongkir — dipakai DUA tempat: `ShippingController.getCost()`
 * (preview live saat buyer masih di halaman checkout) DAN
 * `TransactionsService.createCheckout()` (validasi/hitung ULANG cost yang
 * BENAR-BENAR di-charge saat submit, supaya angka yang dibayar tidak
 * dipercaya mentah-mentah dari client — lihat plan Fase 3B).
 */
@Injectable()
export class ShippingCalculationService {
  constructor(
    private readonly shippingClient: ShippingClientService,
    @InjectRepository(WebsiteOrder)
    private readonly orderRepo: Repository<WebsiteOrder>,
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
  ) {}

  async calculate(params: CalculateShippingParams): Promise<ShippingCostOptionResult[]> {
    const orderIds = Array.from(new Set(params.orderIds));
    const orders = await this.orderRepo.find({
      where: { id: In(orderIds), buyer_user_id: params.buyerUserId },
      relations: { product: true },
    });
    if (orders.length !== orderIds.length) {
      throw new NotFoundException('One or more orders not found');
    }
    for (const order of orders) {
      if (order.website_id !== params.websiteId) {
        throw new BadRequestException(
          `Order ${order.id} does not belong to website ${params.websiteId}`,
        );
      }
      if (order.status !== 'PENDING') {
        throw new BadRequestException(
          `Order ${order.id} is not in PENDING state (current: ${order.status})`,
        );
      }
    }

    const weightGrams = Math.round(
      orders.reduce((acc, o) => acc + o.quantity * effectiveWeightGrams(o.product), 0),
    );

    const location = await this.locationRepo.findOne({
      where: { id: params.locationId, website_id: params.websiteId },
    });
    if (!location?.shipping_area_name) {
      throw new BadRequestException(
        'Lokasi asal pengiriman ini belum diatur untuk hitung ongkir',
      );
    }

    const courierCode =
      params.courierCode ??
      (location.active_couriers?.length ? location.active_couriers.join(':') : undefined);

    const originAreas = await this.shippingClient.searchArea(location.shipping_area_name);
    const originArea = originAreas[0];
    if (!originArea) {
      throw new BadGatewayException(
        `Area asal "${location.shipping_area_name}" tidak ditemukan di shipping-service`,
      );
    }

    return this.shippingClient.getCost({
      origin_area_id: originArea.providerAreaId,
      destination_area_id: params.destinationAreaId,
      weight_grams: weightGrams,
      courier_code: courierCode,
    });
  }
}
