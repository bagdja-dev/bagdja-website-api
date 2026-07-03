import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PublicService } from './public.service';

@ApiTags('Public (No Auth)')
@Controller('api/public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('sites/:slug')
  @ApiOperation({ summary: 'Get website data by slug (for web renderer)' })
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
  @ApiOperation({ summary: 'Get published products for a website' })
  async getProducts(@Param('slug') slug: string) {
    return this.publicService.getProducts(slug);
  }
}
