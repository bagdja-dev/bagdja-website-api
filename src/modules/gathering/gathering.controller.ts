import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';

import { CreateGatheringPlanDto } from './dto/create-gathering-plan.dto';
import { GatheringPlanResponseDto } from './dto/gathering-plan-response.dto';
import { UpdateGatheringPlanDto } from './dto/update-gathering-plan.dto';
import { CreateGatheringInvitationDto } from './dto/create-gathering-invitation.dto';
import { UpdateGatheringInvitationContentDto } from './dto/update-gathering-invitation-content.dto';
import { RejectGatheringRegistrationsDto } from './dto/reject-gathering-registrations.dto';
import { CollectiveGatheringCheckoutDto } from './dto/collective-gathering-checkout.dto';
import { ConfirmGatheringEventDto } from './dto/confirm-gathering-event.dto';
import { GatheringOccurrenceService } from './gathering-occurrence.service';
import { TransactionsService } from '../transactions/transactions.service';
import { StorageClientService } from '../storage/storage-client.service';

@ApiTags('Gathering Plans')
@Controller('api/gathering')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GatheringController {
  constructor(
    private readonly occurrenceService: GatheringOccurrenceService,
    private readonly transactionsService: TransactionsService,
    private readonly storageClient: StorageClientService,
  ) {}

  @Post('plans')
  @ApiOperation({
    summary: 'Create a gathering plan for the initiator calendar',
    description: 'Creates the gathering plan and occurrence. The compatibility plan-order ID is retained for existing detail links but is excluded from cart checkout.',
  })
  @ApiCreatedResponse({ type: GatheringPlanResponseDto, description: 'Plan acara dibuat dan tampil pada kalender initiator.' })
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreateGatheringPlanDto): Promise<GatheringPlanResponseDto> {
    return this.occurrenceService.createPlan(user, dto);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List gathering plans of every status for the current initiator calendar' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  @ApiOkResponse({ type: GatheringPlanResponseDto, isArray: true, description: 'Plan aktif milik initiator di website ini, terbaru dulu.' })
  listPlans(@CurrentUser() user: AuthUser, @Query('website_id') websiteId: string): Promise<GatheringPlanResponseDto[]> {
    return this.occurrenceService.listPlansForInitiator(websiteId, user.userId);
  }

  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a gathering plan owned by the current initiator' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  @ApiOkResponse({ type: GatheringPlanResponseDto, description: 'Detail plan beserta occurrence-nya.' })
  getPlan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string): Promise<GatheringPlanResponseDto> {
    return this.occurrenceService.findPlanForInitiator(id, websiteId, user.userId);
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update PREORDER plan title or invitation policy' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  @ApiOkResponse({ type: GatheringPlanResponseDto, description: 'Plan setelah judul/kebijakan undangan diperbarui.' })
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @Body() dto: UpdateGatheringPlanDto,
  ): Promise<GatheringPlanResponseDto> {
    return this.occurrenceService.updatePlanForInitiator(id, websiteId, user.userId, dto);
  }

  @Get('plans/:id/invitations')
  @ApiOperation({ summary: 'List invitations for an initiator-owned gathering plan' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  listInvitations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string) {
    return this.occurrenceService.listInvitations(id, websiteId, user.userId);
  }

  @Post('plans/:id/invitations')
  @ApiOperation({ summary: 'Create a secure gathering invitation for an email or WhatsApp contact' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  createInvitation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @Body() dto: CreateGatheringInvitationDto,
  ) {
    return this.occurrenceService.createInvitation(id, websiteId, user.userId, dto);
  }

  @Patch('plans/:id/invitation-content')
  @ApiOperation({ summary: 'Update the invitation banner and description during the invitations stage' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  updateInvitationContent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @Body() dto: UpdateGatheringInvitationContentDto,
  ) {
    return this.occurrenceService.updateInvitationContent(id, websiteId, user.userId, dto);
  }

  @Post('plans/:id/invitation-banner')
  @ApiOperation({ summary: 'Upload an invitation banner as the gathering initiator' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'website_id', required: true, type: String })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadInvitationBanner(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Banner image is required');
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('Banner must be an image');
    await this.occurrenceService.assertCanUploadInvitationBanner(id, websiteId, user.userId);
    return this.storageClient.uploadFile(file.buffer, file.mimetype, file.originalname, 'gathering-invitations');
  }

  @Delete('plans/:id/invitations/:invitationId')
  @ApiOperation({ summary: 'Revoke a pending invitation for an initiator-owned gathering plan' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  revokeInvitation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Query('website_id') websiteId: string,
  ) {
    return this.occurrenceService.revokeInvitation(id, invitationId, websiteId, user.userId);
  }

  @Get('plans/:id/registrations')
  @ApiOperation({ summary: 'List attendee RSVP and seat payment status for an initiator-owned plan' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  listRegistrations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string) {
    return this.occurrenceService.listRegistrations(id, websiteId, user.userId);
  }

  @Post('plans/:id/registrations/reject')
  @ApiOperation({ summary: 'Reject a batch of unpaid RSVP registrations with an email notification' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  rejectRegistrations(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @Body() dto: RejectGatheringRegistrationsDto,
  ) {
    return this.occurrenceService.rejectRegistrations(id, websiteId, user.userId, dto);
  }

  @Post('plans/:id/registrations/collective-checkout')
  @ApiOperation({ summary: 'Create one escrow checkout for selected unpaid participant seats, paid by the initiator' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  async collectiveCheckout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @Body() dto: CollectiveGatheringCheckoutDto,
    @Headers('x-return-origin') returnOrigin?: string,
  ) {
    const existingCheckout = await this.occurrenceService.findCollectiveCheckoutToRetry(
      id,
      websiteId,
      user,
      dto.registration_ids,
    );
    if (existingCheckout) {
      return this.transactionsService.retryCheckout(
        existingCheckout.transaction_id,
        user,
        returnOrigin,
        existingCheckout.plan_order_id,
      );
    }

    const orders = await this.occurrenceService.createInitiatorSeatOrders(id, websiteId, user, dto.registration_ids);
    const planOrderId = orders[0]?.parent_order_id;
    if (!planOrderId || orders.some((order) => order.parent_order_id !== planOrderId)) {
      throw new BadRequestException('Gathering seat orders do not share a plan order');
    }
    return this.transactionsService.createCheckout(
      user,
      { order_ids: orders.map((order) => order.id) },
      returnOrigin,
      planOrderId,
    );
  }

  @Post('plans/:id/registrations/:registrationId/cancel-checkout')
  @ApiOperation({ summary: 'Cancel an unstarted pending participant checkout so the initiator can pay the seat collectively' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  cancelParticipantCheckout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Query('website_id') websiteId: string,
  ) {
    return this.occurrenceService.cancelParticipantCheckout(id, websiteId, user, registrationId);
  }

  @Post('plans/:id/registrations/:registrationId/refund')
  @ApiOperation({ summary: 'Refund one participant seat from its held gathering escrow' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  refundRegistration(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Query('website_id') websiteId: string,
  ) {
    return this.occurrenceService.refundRegistration(id, websiteId, registrationId, user.userId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List issued Gathering invoices for the signed-in attendee or payer' })
  listMyInvoices(@CurrentUser() user: AuthUser, @Query('website_id') websiteId?: string) {
    return this.occurrenceService.listInvoicesForUser(user, websiteId);
  }

  @Post('plans/:id/confirm-reservations')
  @ApiOperation({ summary: 'Lock the RSVP list and open participant payment after minimum is reached' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  confirmReservations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string) {
    return this.occurrenceService.confirmReservations(id, websiteId, user.userId);
  }

  @Post('plans/:id/resend-invoices')
  @ApiOperation({ summary: 'Resend Gathering invoice links to active participants' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  resendInvoices(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string) {
    return this.occurrenceService.resendInvoiceEmails(id, websiteId, user.userId);
  }

  @Post('plans/:id/cancel')
  @ApiOperation({ summary: 'Cancel an active gathering and mark registrations as cancelled without hard deleting the event' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  cancelGathering(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @Body() body?: { reason?: string },
  ) {
    return this.occurrenceService.cancelGathering(id, websiteId, user.userId, body?.reason);
  }

  @Post('plans/:id/confirm-event')
  @ApiOperation({ summary: 'Confirm final options after reviewing votes, then release only the configured per-seat booking deposit' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  confirmEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('website_id') websiteId: string,
    @Body() dto: ConfirmGatheringEventDto,
  ) {
    return this.occurrenceService.confirmGathering(id, websiteId, user.userId, dto);
  }

  @Get('registrations/:registrationId/receipt')
  @ApiOperation({ summary: 'Get the attendee-safe status and seat-order pointer for a registration' })
  getRegistrationReceipt(@CurrentUser() user: AuthUser, @Param('registrationId') registrationId: string) {
    return this.occurrenceService.getRegistrationReceipt(registrationId, user);
  }

  @Post('registrations/:registrationId/seat-order')
  @ApiOperation({ summary: 'Create or return the logged-in attendee seat order after payment opens' })
  async createParticipantSeatOrder(
    @CurrentUser() user: AuthUser,
    @Param('registrationId') registrationId: string,
    @Headers('x-return-origin') returnOrigin?: string,
  ) {
    const order = await this.occurrenceService.createParticipantSeatOrder(registrationId, user);
    // checkout_url tersimpan tidak pernah dikembalikan apa adanya: sesi Pay UI punya TTL,
    // jadi checkout yang masih pending selalu diterbitkan ulang lewat retryCheckout.
    if (!order.transaction_id || order.transaction_status !== 'PENDING_PAYMENT') return { ...order, checkout_url: null };

    const transaction = await this.transactionsService.retryCheckout(order.transaction_id, user, returnOrigin);
    return { ...order, checkout_url: transaction.checkout_url };
  }

  @Post('plans/:id/invitations/submit')
  @ApiOperation({ summary: 'Submit stage 2: create an open link or queue closed invitation emails' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  submitInvitations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string) {
    return this.occurrenceService.submitInvitationStage(id, websiteId, user.userId);
  }

  @Post('plans/:id/invitations/:invitationId/link')
  @ApiOperation({ summary: 'Rotate the share token for a pending invitation' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  rotateInvitationLink(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @Query('website_id') websiteId: string,
  ) {
    return this.occurrenceService.rotateInvitationLink(id, invitationId, websiteId, user.userId);
  }
}