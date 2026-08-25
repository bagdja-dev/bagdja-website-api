import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { GetShippingCostDto } from './dto/get-shipping-cost.dto';
import { ShippingCalculationService } from './shipping-calculation.service';

/**
 * Proxy tipis ke bagdja-shipping-service, dipanggil BUYER saat checkout
 * (bukan staff tenant) — `websiteId` di path cuma konteks toko mana yang
 * checkout, bukan scope otorisasi staff. Beda dari LocationsController/
 * TenantTransactionsController yang pakai TenantStaffGuard.
 *
 * Logic hitung ongkir ada di `ShippingCalculationService` — dipakai ulang
 * oleh `TransactionsService.createCheckout()` untuk validasi cost server-side
 * saat submit (lihat catatan di service itu).
 */
@ApiTags('Shipping')
@Controller('api/websites/:websiteId/shipping')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ShippingController {
  constructor(private readonly shippingCalculation: ShippingCalculationService) {}

  @Post('cost')
  @ApiOperation({
    summary:
      'Hitung ongkir untuk order (cart line) terpilih dari lokasi tertentu — berat digabung otomatis',
  })
  async getCost(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
    @Body() dto: GetShippingCostDto,
  ) {
    return this.shippingCalculation.calculate({
      websiteId,
      buyerUserId: authUser.userId,
      orderIds: dto.order_ids,
      locationId: dto.location_id,
      destinationAreaId: dto.destination_area_id,
      courierCode: dto.courier_code,
    });
  }
}
