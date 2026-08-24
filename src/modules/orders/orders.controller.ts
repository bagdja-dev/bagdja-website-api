import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderQuantityDto } from './dto/update-order-quantity.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('api/orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('draft')
  @ApiOperation({
    summary: 'Buat order draft (PENDING) tanpa escrow/payment — tombol "+ Keranjang"',
  })
  async createDraft(@CurrentUser() authUser: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createDraftOrder(authUser, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List order milik buyer yang login — pakai ?cart=true untuk cuma dapat "keranjang aktif" (PENDING & belum di-claim transaksi), difilter di server supaya klien tidak perlu memelihara salinan/filter sendiri',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiQuery({ name: 'cart', required: false, type: Boolean })
  async list(
    @CurrentUser() authUser: AuthUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('cart') cart?: string,
  ) {
    return this.ordersService.listOrders(authUser.userId, {
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
      cartOnly: cart === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detail order (sinkronisasi status dari escrow — pull/polling)',
  })
  async getOne(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.ordersService.getOrder(id, authUser.userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update qty draft PENDING milik buyer (halaman /cart)',
  })
  async updateQuantity(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderQuantityDto,
  ) {
    return this.ordersService.updateDraftQuantity(
      id,
      authUser.userId,
      dto.quantity,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Hapus/cancel draft PENDING milik buyer (halaman /cart)',
  })
  async cancel(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.ordersService.cancelDraft(id, authUser.userId);
  }
}
