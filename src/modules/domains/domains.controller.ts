import { Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, Roles, RolesGuard, TenantStaffGuard } from '../../common/auth';
import { DomainsService } from './domains.service';

@ApiTags('Websites - Custom Domain')
@Controller('api/websites/:websiteId/domain')
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Post('verify')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate (or return existing) TXT record needed to prove domain ownership' })
  async verify(@Param('websiteId') websiteId: string) {
    return this.domainsService.startVerification(websiteId);
  }

  @Post('check')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check the TXT record and activate the domain if it matches' })
  async check(@Param('websiteId') websiteId: string) {
    return this.domainsService.checkVerification(websiteId);
  }

  @Delete()
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove the custom domain from this website' })
  async remove(@Param('websiteId') websiteId: string) {
    return this.domainsService.removeDomain(websiteId);
  }
}
