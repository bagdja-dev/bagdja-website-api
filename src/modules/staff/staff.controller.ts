import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  CurrentUser,
  CurrentStaff,
  AuthUser,
  TenantStaffGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import type { TenantStaff } from '../../entities';
import { StaffService } from './staff.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@ApiTags('Staff & Invitations')
@Controller('api/websites/:websiteId/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  // ─── Staff ─────────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('viewer')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all staff members for a website' })
  async listStaff(@Param('websiteId') websiteId: string) {
    return this.staffService.getStaffByWebsite(websiteId);
  }

  @Patch(':staffId')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update staff role or status (admin+ only)' })
  async updateStaff(
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.updateStaff(staffId, dto);
  }

  @Delete(':staffId')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a staff member (admin+ only)' })
  async removeStaff(@Param('staffId') staffId: string) {
    return this.staffService.removeStaff(staffId);
  }

  // ─── Invitations ───────────────────────────────────────────────

  @Get('invitations')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pending invitations for a website' })
  async listInvitations(@Param('websiteId') websiteId: string) {
    return this.staffService.getInvitations(websiteId);
  }

  @Post('invitations')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new staff invitation (admin+ only)' })
  @ApiResponse({ status: 201, description: 'Invitation created' })
  async createInvitation(
    @Param('websiteId') websiteId: string,
    @CurrentStaff() staff: TenantStaff,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.staffService.createInvitation(websiteId, staff.id, dto);
  }

  @Delete('invitations/:invitationId')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel/delete an invitation (admin+ only)' })
  async cancelInvitation(@Param('invitationId') invitationId: string) {
    return this.staffService.cancelInvitation(invitationId);
  }
}

@ApiTags('Invitation Accept')
@Controller('api/invitations')
export class InvitationAcceptController {
  constructor(private readonly staffService: StaffService) {}

  @Post('accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a staff invitation using token' })
  async acceptInvitation(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.staffService.acceptInvitation(dto.token, user.userId, user.email);
  }
}
