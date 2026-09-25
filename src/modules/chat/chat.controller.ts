import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard, TenantStaffGuard } from '../../common/auth';
import { CreateWebsiteChatThreadDto } from './dto/create-thread.dto';
import { SendWebsiteChatMessageDto } from './dto/send-message.dto';
import { ChatService } from './chat.service';

@ApiTags('Chat')
@Controller('api/chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':websiteId/threads')
  @ApiOperation({ summary: 'List chat threads for a specific website, either admin or customer scope.' })
  async listThreads(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
    @Query('channel_type') channelType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.chatService.listThreads(websiteId, authUser.userId, channelType, status, search);
  }

  @Post(':websiteId/threads')
  @ApiOperation({ summary: 'Create a website-scoped chat thread for either a staff admin or a customer user.' })
  async createThread(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateWebsiteChatThreadDto,
  ) {
    return this.chatService.createThread(websiteId, authUser, dto);
  }

  @Get(':websiteId/threads/:threadId')
  @ApiOperation({ summary: 'Get a single chat thread in a website scope.' })
  async getThread(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
    @Param('threadId') threadId: string,
  ) {
    return this.chatService.getThread(websiteId, threadId, authUser.userId);
  }

  @Get(':websiteId/threads/:threadId/messages')
  @ApiOperation({ summary: 'List all messages inside a thread.' })
  async listMessages(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
    @Param('threadId') threadId: string,
  ) {
    return this.chatService.listMessages(websiteId, threadId, authUser.userId);
  }

  @Post(':websiteId/threads/:threadId/messages')
  @ApiOperation({ summary: 'Send a message in a website-scoped thread.' })
  async sendMessage(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
    @Param('threadId') threadId: string,
    @Body() dto: SendWebsiteChatMessageDto,
  ) {
    return this.chatService.sendMessage(websiteId, threadId, authUser.userId, dto);
  }

  @Post(':websiteId/threads/:threadId/read')
  @ApiOperation({ summary: 'Mark thread as read for this website.' })
  async markThreadRead(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
    @Param('threadId') threadId: string,
  ) {
    return this.chatService.markThreadRead(websiteId, threadId, authUser.userId);
  }

  @Get(':websiteId/unread-count')
  @ApiOperation({ summary: 'Count unread messages for this website and user context.' })
  async getUnreadCount(
    @CurrentUser() authUser: AuthUser,
    @Param('websiteId') websiteId: string,
  ) {
    return this.chatService.getUnreadCount(websiteId, authUser.userId);
  }
}
