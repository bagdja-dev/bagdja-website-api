import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantStaff, WebsitePage } from '../../entities';
import { AuthModule } from '../../common/auth';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebsitePage, TenantStaff]),
    AuthModule,
    SubscriptionsModule,
  ],
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
