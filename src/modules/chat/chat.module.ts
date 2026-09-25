import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import { ChatServiceModule } from '../../common/chat-service/chat-service.module';
import {
  TenantStaff,
  User,
  Website,
  WebsiteChatThread,
  WebsiteOrder,
  WebsiteProduct,
} from '../../entities';
import { NotificationsModule } from '../notifications/notifications.module';
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
    NotificationsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
