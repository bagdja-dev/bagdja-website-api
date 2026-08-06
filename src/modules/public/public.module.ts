import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Website,
  WebsiteBlogPost,
  WebsiteCategory,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
} from '../../entities';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Website,
      WebsitePage,
      WebsiteProduct,
      WebsiteLocation,
      WebsiteFaq,
      WebsiteBlogPost,
      WebsiteCategory,
    ]),
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
