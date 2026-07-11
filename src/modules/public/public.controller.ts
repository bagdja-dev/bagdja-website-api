import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { PublicService } from './public.service';

@ApiTags('Public (No Auth)')
@Controller('api/public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('sites/:slug')
  @ApiOperation({ summary: 'Get website profile by slug (for web renderer)' })
  async getWebsite(@Param('slug') slug: string) {
    return this.publicService.getWebsiteBySlug(slug);
  }

  @Get('sites/:slug/home')
  @ApiOperation({ summary: 'Get home page with sections' })
  async getHomePage(@Param('slug') slug: string) {
    return this.publicService.getHomePage(slug);
  }

  @Get('sites/:slug/pages/:pageSlug')
  @ApiOperation({ summary: 'Get a specific page by slug with sections' })
  async getPage(
    @Param('slug') slug: string,
    @Param('pageSlug') pageSlug: string,
  ) {
    return this.publicService.getPageBySlug(slug, pageSlug);
  }

  @Get('sites/:slug/products')
  @ApiOperation({ summary: 'Get published products/services for a website' })
  @ApiQuery({ name: 'type', required: false, example: 'service' })
  async getProducts(
    @Param('slug') slug: string,
    @Query('type') type?: string,
  ) {
    return this.publicService.getProducts(slug, type);
  }

  @Get('sites/:slug/locations')
  @ApiOperation({ summary: 'Get public locations for a website' })
  @ApiQuery({ name: 'type', required: false, example: 'branch' })
  async getLocations(
    @Param('slug') slug: string,
    @Query('type') type?: string,
  ) {
    return this.publicService.getLocations(slug, type);
  }

  @Get('sites/:slug/faqs')
  @ApiOperation({ summary: 'Get public FAQs for a website' })
  @ApiQuery({ name: 'category', required: false, example: 'general' })
  async getFaqs(
    @Param('slug') slug: string,
    @Query('category') category?: string,
  ) {
    return this.publicService.getFaqs(slug, category);
  }

  @Get('sites/:slug/blog-posts')
  @ApiOperation({ summary: 'Get published blog posts for a website (optional search / id filter)' })
  @ApiQuery({ name: 'search', required: false, example: 'rambut' })
  @ApiQuery({ name: 'ids', required: false, example: 'uuid1,uuid2', description: 'Comma-separated post IDs' })
  async getBlogPosts(
    @Param('slug') slug: string,
    @Query('search') search?: string,
    @Query('ids') ids?: string,
  ) {
    const idList = ids ? ids.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
    return this.publicService.getBlogPosts(slug, search, idList);
  }

  @Get('sites/:slug/blog-posts/:postSlug')
  @ApiOperation({ summary: 'Get a published blog post by slug' })
  async getBlogPost(
    @Param('slug') slug: string,
    @Param('postSlug') postSlug: string,
  ) {
    return this.publicService.getBlogPostBySlug(slug, postSlug);
  }
}
