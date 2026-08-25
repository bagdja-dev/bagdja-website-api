import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { Website } from '../../entities/website.entity';
import { WebsiteLocation } from '../../entities/website-location.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import { GetShippingCostDto } from './dto/get-shipping-cost.dto';
import { ShippingClientService } from './shipping-client.service';

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

/**
 * Proxy tipis ke bagdja-shipping-service, dipanggil BUYER saat checkout
 * (bukan staff tenant) — `websiteId` di path cuma konteks toko mana yang
 * checkout, bukan scope otorisasi staff. Beda dari LocationsController/
 * TenantTransactionsController yang pakai TenantStaffGuard.
 */
@ApiTags('Shipping')
@Controller('api/websites/:websiteId/shipping')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ShippingController {
  constructor(
    private readonly shippingClient: ShippingClientService,
    @InjectRepository(WebsiteOrder)
    private readonly orderRepo: Repository<WebsiteOrder>,
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
  ) {}

  @Post('cost')
  @ApiOperation({
    summary:
      'Hitung ongkir untuk order (cart line) terpilih — berat digabung, asal dari lokasi is_primary website ini',
  })
  async getCost(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
    @Body() dto: GetShippingCostDto,
  ) {
    const orderIds = Array.from(new Set(dto.order_ids));
    const orders = await this.orderRepo.find({
      where: { id: In(orderIds), buyer_user_id: authUser.userId },
      relations: { product: true },
    });
    if (orders.length !== orderIds.length) {
      throw new NotFoundException('One or more orders not found');
    }
    for (const order of orders) {
      if (order.website_id !== websiteId) {
        throw new BadRequestException(
          `Order ${order.id} does not belong to website ${websiteId}`,
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

    const website = await this.websiteRepo.findOne({ where: { id: websiteId } });
    const courierCode =
      dto.courier_code ??
      (website?.active_couriers?.length ? website.active_couriers.join(':') : undefined);

    const originLocation = await this.locationRepo.findOne({
      where: { website_id: websiteId, is_primary: true },
    });
    if (!originLocation?.shipping_area_name) {
      throw new BadRequestException(
        'Lokasi asal pengiriman belum diatur untuk website ini',
      );
    }

    const originAreas = await this.shippingClient.searchArea(
      originLocation.shipping_area_name,
    );
    const originArea = originAreas[0];
    if (!originArea) {
      throw new BadGatewayException(
        `Area asal "${originLocation.shipping_area_name}" tidak ditemukan di shipping-service`,
      );
    }

    return this.shippingClient.getCost({
      origin_area_id: originArea.providerAreaId,
      destination_area_id: dto.destination_area_id,
      weight_grams: weightGrams,
      courier_code: courierCode,
    });
  }
}
