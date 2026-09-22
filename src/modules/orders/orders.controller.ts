import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { CompleteFulfillmentStepDto } from '../transactions/dto/complete-fulfillment-step.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderQuantityDto } from './dto/update-order-quantity.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('api/orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly transactionsService: TransactionsService,
  ) {}

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
    const result = await this.ordersService.listOrders(authUser.userId, {
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
      cartOnly: cart === 'true',
    });
    // Cart perlu tahu produk mana yang punya step Praorder WALAU harganya
    // sudah fix (bukan cuma produk price=0) — supaya buyer bisa diarahkan
    // isi step-nya sebelum checkout. `getOrderPraorderProgress` early-return
    // murah untuk order yang produknya tidak punya fulfillment_flow_id.
    const data = await Promise.all(
      result.data.map(async (order) => ({
        ...order,
        praorderProgress: await this.transactionsService.getOrderPraorderProgress(order),
      })),
    );
    return { ...result, data };
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Detail order (sinkronisasi status dari escrow — pull/polling). Menyertakan praorderProgress kalau produknya punya step Praorder (halaman "Progres Penawaran").',
  })
  async getOne(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    const order = await this.ordersService.getOrder(id, authUser.userId);
    const praorderProgress = await this.transactionsService.getOrderPraorderProgress(order);
    return { ...order, praorderProgress };
  }

  @Post(':id/steps/complete')
  @ApiOperation({
    summary:
      'Buyer menyelesaikan 1 step Praorder miliknya sendiri (fulfillment-praorder-plan.md §2.1) — order masih PENDING, belum checkout',
  })
  async completePraorderStep(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteFulfillmentStepDto,
  ) {
    await this.transactionsService.completePraorderStepAsBuyer(id, dto, authUser.userId);
    return { success: true };
  }

  @Post(':id/fulfillment-assets')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadFulfillmentAsset(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File wajib diunggah');
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'].includes(file.mimetype)) {
      throw new BadRequestException('Tipe file tidak didukung');
    }
    return this.ordersService.uploadBuyerFulfillmentAsset(id, authUser.userId, file);
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
