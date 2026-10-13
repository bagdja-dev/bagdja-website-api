import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { GatheringOccurrenceService } from './gathering-occurrence.service';
import { SubmitGatheringRsvpDto } from './dto/submit-gathering-rsvp.dto';
import { VerifyGatheringRsvpOtpDto } from './dto/verify-gathering-rsvp-otp.dto';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';

@ApiTags('Public Gathering Invitations')
@Controller('api/public/gathering-invitations')
export class PublicGatheringInvitationController {
  constructor(private readonly occurrenceService: GatheringOccurrenceService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Resolve a time-limited, revocable gathering invitation token to a public event preview' })
  @ApiOkResponse({ description: 'Public event details and only the option choices opened by its initiator.' })
  @ApiNotFoundResponse({ description: 'Invitation is invalid, expired, revoked, or unavailable.' })
  async getPreview(@Param('token') token: string) {
    if (!isInvitationReference(token)) throw new NotFoundException('Invitation is invalid or expired');
    return this.occurrenceService.getInvitationPreview(token);
  }

  @Post(':token/rsvp')
  @ApiOperation({ summary: 'Start a public RSVP reservation and send an email verification code' })
  async submitRsvp(@Param('token') token: string, @Body() dto: SubmitGatheringRsvpDto) {
    if (!isInvitationReference(token)) throw new NotFoundException('Invitation is invalid or expired');
    return this.occurrenceService.startPublicRsvpVerification(token, dto);
  }

  @Post(':token/verify-otp')
  @ApiOperation({ summary: 'Verify a public RSVP email code and create the attendee registration' })
  async verifyRsvpOtp(@Param('token') token: string, @Body() dto: VerifyGatheringRsvpOtpDto) {
    if (!isInvitationReference(token)) throw new NotFoundException('Invitation is invalid or expired');
    return this.occurrenceService.verifyPublicRsvpOtp(token, dto);
  }

  @Post(':token/private-rsvp')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit private RSVP using the invited, signed-in account' })
  async submitPrivateRsvp(
    @CurrentUser() user: AuthUser,
    @Param('token') token: string,
    @Body() dto: SubmitGatheringRsvpDto,
  ) {
    if (!isInvitationReference(token)) throw new NotFoundException('Invitation is invalid or expired');
    return this.occurrenceService.submitRsvp(token, dto, user);
  }

  @Get(':token/private-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Resolve private invitation RSVP status for the invited signed-in account' })
  async getPrivateStatus(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    if (!isInvitationReference(token)) throw new NotFoundException('Invitation is invalid or expired');
    return this.occurrenceService.getPrivateInvitationStatus(token, user);
  }
}

function isInvitationReference(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    || /^[A-Za-z0-9_-]{40,64}$/.test(value);
}