import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import { TenantStaff, WebsiteLanguage, WebsitePage, WebsitePageTranslation } from '../../entities';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebsitePage, WebsitePageTranslation, WebsiteLanguage, TenantStaff]),
    AuthModule,
    SubscriptionsModule,
  ],
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
