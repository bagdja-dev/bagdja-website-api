import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user in a website.' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('website_id') websiteId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unread') unread?: string,
  ) {
    return this.notificationsService.listForUser(
      user.userId,
      websiteId ?? '',
      limit ? Number(limit) : 20,
      offset ? Number(offset) : 0,
      unread === 'true' ? true : unread === 'false' ? false : undefined,
    );
  }

  @Get('sound-config')
  @ApiOperation({ summary: 'Get notification sound settings for a website.' })
  async soundConfig(@Query('website_id') websiteId?: string) {
    return this.notificationsService.getSoundConfig(websiteId ?? '');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count unread notifications for the current user in a website.' })
  async unreadCount(@CurrentUser() user: AuthUser, @Query('website_id') websiteId?: string) {
    return this.notificationsService.unreadCount(user.userId, websiteId ?? '');
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all website notifications as read for the current user.' })
  async markAllRead(@CurrentUser() user: AuthUser, @Query('website_id') websiteId?: string) {
    return this.notificationsService.markAllRead(user.userId, websiteId ?? '');
  }

  @Patch(':notificationId/read')
  @ApiOperation({ summary: 'Mark one notification as read.' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Query('website_id') websiteId?: string,
  ) {
    return this.notificationsService.markRead(user.userId, websiteId ?? '', notificationId);
  }
}
