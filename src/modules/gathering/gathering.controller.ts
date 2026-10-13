import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';

import { CreateGatheringPlanDto } from './dto/create-gathering-plan.dto';
import { GatheringPlanResponseDto } from './dto/gathering-plan-response.dto';
import { UpdateGatheringPlanDto } from './dto/update-gathering-plan.dto';
import { CreateGatheringInvitationDto } from './dto/create-gathering-invitation.dto';
import { RejectGatheringRegistrationsDto } from './dto/reject-gathering-registrations.dto';
import { GatheringOccurrenceService } from './gathering-occurrence.service';

@ApiTags('Gathering Plans')
@Controller('api/gathering')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GatheringController {
  constructor(private readonly occurrenceService: GatheringOccurrenceService) {}

  @Post('plans')
  @ApiOperation({
    summary: 'Create a gathering plan in the initiator cart',
    description: 'Creates the plan order (website_orders PENDING, quantity 0, never checked out) plus the PREORDER group and occurrence attached to it.',
  })
  @ApiCreatedResponse({ type: GatheringPlanResponseDto, description: 'Plan dibuat; `order_id` adalah order rencana yang kini ada di cart initiator.' })
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreateGatheringPlanDto): Promise<GatheringPlanResponseDto> {
    return this.occurrenceService.createPlan(user, dto);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List open gathering plans (not cancelled/completed) for the current initiator in a website' })
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

  @Post('plans/:id/confirm-reservations')
  @ApiOperation({ summary: 'Lock the RSVP list and open participant payment after minimum is reached' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  confirmReservations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string) {
    return this.occurrenceService.confirmReservations(id, websiteId, user.userId);
  }

  @Post('plans/:id/confirm-event')
  @ApiOperation({ summary: 'Confirm the event after the minimum number of seats are paid and settle held seat escrows' })
  @ApiQuery({ name: 'website_id', required: true, type: String })
  confirmEvent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('website_id') websiteId: string) {
    return this.occurrenceService.confirmGathering(id, websiteId, user.userId);
  }

  @Get('registrations/:registrationId/receipt')
  @ApiOperation({ summary: 'Get the attendee-safe status and seat-order pointer for a registration' })
  getRegistrationReceipt(@CurrentUser() user: AuthUser, @Param('registrationId') registrationId: string) {
    return this.occurrenceService.getRegistrationReceipt(registrationId, user);
  }

  @Post('registrations/:registrationId/seat-order')
  @ApiOperation({ summary: 'Create or return the logged-in attendee seat order after payment opens' })
  createParticipantSeatOrder(@CurrentUser() user: AuthUser, @Param('registrationId') registrationId: string) {
    return this.occurrenceService.createParticipantSeatOrder(registrationId, user);
  }

  @Post('plans/:id/invitations/submit')
  @ApiOperation({ summary: 'Submit stage 2: create open link or send closed invitations by email' })
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