import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  TenantStaffGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import { BlogPostsService } from './blog-posts.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@ApiTags('Website Blog Posts')
@Controller('api/websites/:websiteId/blog-posts')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class BlogPostsController {
  constructor(private readonly blogPostsService: BlogPostsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List blog posts of a website (optional filter by published status)' })
  @ApiQuery({ name: 'published', required: false, type: Boolean })
  async findAll(
    @Param('websiteId') websiteId: string,
    @Query('published') published?: string,
  ) {
    const filter = published === undefined ? undefined : published === 'true';
    return this.blogPostsService.findAll(websiteId, filter);
  }

  @Get(':postId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get blog post detail' })
  async findOne(@Param('postId') postId: string) {
    return this.blogPostsService.findOne(postId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create a new blog post' })
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateBlogPostDto,
  ) {
    return this.blogPostsService.create(websiteId, dto);
  }

  @Patch(':postId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update a blog post' })
  async update(
    @Param('websiteId') websiteId: string,
    @Param('postId') postId: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    return this.blogPostsService.update(postId, websiteId, dto);
  }

  @Delete(':postId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a blog post (admin+ only)' })
  async remove(@Param('postId') postId: string) {
    return this.blogPostsService.remove(postId);
  }
}
