import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, CurrentUser, AuthUser } from '../../common/auth';
import { WebsitesService } from './websites.service';
import { UserWebsiteResponseDto } from './dto/website-response.dto';

@ApiTags('User Websites')
@Controller('api/user')
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get('websites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all websites accessible by the authenticated user' })
  @ApiResponse({ status: 200, type: [UserWebsiteResponseDto] })
  async getUserWebsites(@CurrentUser() user: AuthUser) {
    return this.websitesService.findWebsitesByUserId(user.userId);
  }
}
