import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WebsiteBlogPost, WebsiteBlogPostProduct, WebsiteProduct } from '../../entities';
import { AuthModule } from '../../common/auth';
import { BlogPostsController } from './blog-posts.controller';
import { BlogPostsService } from './blog-posts.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebsiteBlogPost, WebsiteBlogPostProduct, WebsiteProduct]), AuthModule],
  controllers: [BlogPostsController],
  providers: [BlogPostsService],
  exports: [BlogPostsService],
})
export class BlogPostsModule {}
