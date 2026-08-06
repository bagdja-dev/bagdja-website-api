import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { PublicService } from './public.service';

@ApiTags('Public (No Auth)')
@Controller('api/public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('resolve-domain')
  @ApiOperation({ summary: 'Resolve a verified custom domain to its website slug (for web renderer middleware)' })
  @ApiQuery({ name: 'host', required: true, example: 'www.mybusiness.com' })
  async resolveDomain(@Query('host') host: string) {
    return this.publicService.resolveDomain(host);
  }

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

  @Get('sites/:slug/categories')
  @ApiOperation({ summary: 'Get active categories for a website' })
  async getCategories(@Param('slug') slug: string) {
    return this.publicService.getCategories(slug);
  }

  @Get('sites/:slug/products')
  @ApiOperation({
    summary:
      'List produk/layanan publik — paginated: page/size/sort/filter[type]/filter[category_id]/search',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  @ApiQuery({ name: 'type', required: false, example: 'service', description: 'Alias filter[type] (backward-compat)' })
  async getProducts(
    @Param('slug') slug: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.publicService.getProducts(slug, query);
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
