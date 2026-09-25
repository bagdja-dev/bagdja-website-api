import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import { ChatServiceModule } from '../../common/chat-service/chat-service.module';
import { WebsiteEventBroadcasterService } from '../../common/website-event-broadcaster/website-event-broadcaster.service';
import {
  TenantStaff,
  User,
  Website,
  WebsiteChatThread,
  WebsiteOrder,
  WebsiteProduct,
} from '../../entities';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebsiteChatThread,
      TenantStaff,
      User,
      Website,
      WebsiteProduct,
      WebsiteOrder,
    ]),
    AuthModule,
    ChatServiceModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, WebsiteEventBroadcasterService],
  exports: [ChatService, WebsiteEventBroadcasterService],
})
export class ChatModule {}
