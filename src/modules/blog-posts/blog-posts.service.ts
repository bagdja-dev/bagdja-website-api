import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteBlogPost } from '../../entities';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@Injectable()
export class BlogPostsService {
  constructor(
    @InjectRepository(WebsiteBlogPost)
    private readonly blogPostRepo: Repository<WebsiteBlogPost>,
  ) {}

  async findAll(websiteId: string, published?: boolean) {
    return this.blogPostRepo.find({
      where: {
        website_id: websiteId,
        ...(published !== undefined ? { is_published: published } : {}),
      },
      order: { published_at: 'DESC', created_at: 'DESC' },
    });
  }

  async findOne(postId: string) {
    const post = await this.blogPostRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Blog post not found');
    return post;
  }

  private async assertSlugAvailable(websiteId: string, slug: string, excludeId?: string) {
    const existing = await this.blogPostRepo.findOne({ where: { website_id: websiteId, slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug "${slug}" already exists in this website`);
    }
  }

  async create(websiteId: string, dto: CreateBlogPostDto) {
    await this.assertSlugAvailable(websiteId, dto.slug);

    const post = this.blogPostRepo.create({
      website_id: websiteId,
      title: dto.title,
      slug: dto.slug,
      excerpt: dto.excerpt ?? null,
      content: dto.content ?? null,
      cover_image: dto.cover_image ?? null,
      is_published: dto.is_published ?? false,
      published_at: dto.is_published ? new Date() : null,
    });
    return this.blogPostRepo.save(post);
  }

  async update(postId: string, websiteId: string, dto: UpdateBlogPostDto) {
    const post = await this.findOne(postId);

    if (dto.slug && dto.slug !== post.slug) {
      await this.assertSlugAvailable(websiteId, dto.slug, postId);
    }

    const wasPublished = post.is_published;
    Object.assign(post, dto);

    if (dto.is_published && !wasPublished && !post.published_at) {
      post.published_at = new Date();
    }

    return this.blogPostRepo.save(post);
  }

  async remove(postId: string) {
    const post = await this.findOne(postId);
    await this.blogPostRepo.remove(post);
    return { deleted: true };
  }
}
