import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, JwtAuthGuard } from '../../common/auth';
import type { AuthUser } from '../../common/auth/auth-user';

import { CreateAccessRequestDto } from './dto/create-access-request.dto';
import { CreatePlatformInvitationDto } from './dto/create-platform-invitation.dto';
import { ReviewAccessRequestDto } from './dto/review-access-request.dto';
import { SendAccessRequestDiscussionMessageDto } from './dto/send-access-request-discussion-message.dto';
import { WebsitePlatformService } from './website-platform.service';

@ApiTags('Website Platform Access')
@Controller('api/website-platform')
export class WebsitePlatformController {
  constructor(private readonly platform: WebsitePlatformService) {}

  @Get('access')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user’s Website Platform role' })
  getAccess(@CurrentUser() user: AuthUser, @Headers('authorization') authorization?: string) {
    return this.platform.getAccess(user, this.requireAuthorization(authorization));
  }

  @Post('access-requests')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a manual Website Platform access request' })
  createAccessRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateAccessRequestDto) {
    return this.platform.createAccessRequest(user, dto);
  }

  @Get('access-requests/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user’s active access request' })
  getMyAccessRequest(@CurrentUser() user: AuthUser) {
    return this.platform.getMyAccessRequest(user);
  }

  @Get('access-requests/mine/discussion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated applicant’s discussion messages' })
  getMyDiscussion(@CurrentUser() user: AuthUser) {
    return this.platform.getMyDiscussion(user);
  }

  @Post('access-requests/mine/discussion')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a message in the authenticated applicant’s discussion' })
  sendMyDiscussionMessage(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendAccessRequestDiscussionMessageDto,
  ) {
    return this.platform.sendMyDiscussionMessage(user, dto);
  }

  @Post('invitations/registration-status')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Check the account status for a valid platform invitation',
  })
  getInvitationRegistrationStatus(@Body('token') token: string) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) {
      throw new UnauthorizedException('A valid invitation token is required');
    }
    return this.platform.getInvitationRegistrationStatus(token);
  }

  @Get('access-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List access requests (owner/admin only)' })
  listAccessRequests(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization?: string,
  ) {
    return this.platform.listAccessRequests(user, this.requireAuthorization(authorization));
  }

  @Get('access-requests/discussions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all existing applicant discussion channels (owner/admin only)' })
  listAccessRequestDiscussions(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.platform.listAccessRequestDiscussions(
      user,
      this.requireAuthorization(authorization),
    );
  }

  @Get('access-requests/:requestId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get an access request and its review timeline' })
  getAccessRequest(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.platform.getAccessRequest(
      user,
      this.requireAuthorization(authorization),
      requestId,
    );
  }

  @Get('access-requests/:requestId/discussion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get discussion messages for a request (owner/admin only)' })
  getAccessRequestDiscussion(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.platform.getAccessRequestDiscussion(
      user,
      this.requireAuthorization(authorization),
      requestId,
    );
  }

  @Post('access-requests/:requestId/discussion')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a discussion message for a request (owner/admin only)' })
  sendAccessRequestDiscussionMessage(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: SendAccessRequestDiscussionMessageDto,
  ) {
    return this.platform.sendAccessRequestDiscussionMessage(
      user,
      this.requireAuthorization(authorization),
      requestId,
      dto,
    );
  }

  @Patch('access-requests/:requestId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an access request workflow stage (owner/admin only)' })
  reviewAccessRequest(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ReviewAccessRequestDto,
  ) {
    return this.platform.reviewAccessRequest(
      user,
      this.requireAuthorization(authorization),
      requestId,
      dto,
    );
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List platform invitations (owner/admin only)' })
  listInvitations(@CurrentUser() user: AuthUser, @Headers('authorization') authorization?: string) {
    return this.platform.listInvitations(user, this.requireAuthorization(authorization));
  }

  @Get('audit-logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List access audit logs (owner/admin only)' })
  listAuditLogs(@CurrentUser() user: AuthUser, @Headers('authorization') authorization?: string) {
    return this.platform.listAuditLogs(user, this.requireAuthorization(authorization));
  }

  @Post('invitations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a designer or reviewer (owner/admin only)' })
  createInvitation(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreatePlatformInvitationDto,
  ) {
    return this.platform.createInvitation(user, this.requireAuthorization(authorization), dto);
  }

  @Delete('invitations/:invitationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an unaccepted invitation (owner/admin only)' })
  revokeInvitation(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.platform.revokeInvitation(
      user,
      this.requireAuthorization(authorization),
      invitationId,
    );
  }

  @Post('invitations/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a platform invitation with the signed-in account' })
  acceptInvitation(@CurrentUser() user: AuthUser, @Body('token') token: string) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) {
      throw new UnauthorizedException('A valid invitation token is required');
    }
    return this.platform.acceptInvitation(user, token);
  }

  private requireAuthorization(authorization?: string): string {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('A valid bearer token is required');
    }
    return authorization;
  }
}
