import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, Roles, RolesGuard, TenantStaffGuard } from '../../common/auth';

import { AnalyticsService } from './analytics.service';
import { TrackAnalyticsEventDto } from './dto/track-analytics-event.dto';

@ApiTags('Website Analytics')
@Controller('api/websites/:websiteId/analytics')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'Get website analytics overview for the last 7, 30, or 90 days' })
  getOverview(@Param('websiteId') websiteId: string, @Query('days') days?: string) {
    const period = this.parsePeriod(days);
    return this.analyticsService.getOverview(websiteId, period);
  }

  private parsePeriod(days?: string): 7 | 30 | 90 {
    if (days === undefined || days === '7') return 7;
    if (days === '30') return 30;
    if (days === '90') return 90;
    throw new BadRequestException('days must be 7, 30, or 90');
  }
}

@ApiTags('Public (No Auth)')
@Controller('api/public/sites/:slug/analytics')
export class PublicAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('events')
  @ApiOperation({ summary: 'Record a privacy-conscious public website analytics event' })
  track(@Param('slug') slug: string, @Body() event: TrackAnalyticsEventDto) {
    return this.analyticsService.track(slug, event);
  }
}
