import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { WebsiteBlogPost, WebsiteBlogPostProduct, WebsiteProduct } from '../../entities';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@Injectable()
export class BlogPostsService {
  constructor(
    @InjectRepository(WebsiteBlogPost)
    private readonly blogPostRepo: Repository<WebsiteBlogPost>,
    @InjectRepository(WebsiteBlogPostProduct)
    private readonly blogPostProductRepo: Repository<WebsiteBlogPostProduct>,
    private readonly dataSource: DataSource,
  ) {}

  private async withRelatedProducts(posts: WebsiteBlogPost[]) {
    if (posts.length === 0) return posts;

    const relations = await this.blogPostProductRepo.find({
      where: { blog_post_id: In(posts.map((post) => post.id)) },
      relations: { product: true },
      order: { sort_order: 'ASC' },
    });
    const relationsByPost = new Map<string, WebsiteBlogPostProduct[]>();
    for (const relation of relations) {
      const postRelations = relationsByPost.get(relation.blog_post_id) ?? [];
      postRelations.push(relation);
      relationsByPost.set(relation.blog_post_id, postRelations);
    }

    return posts.map((post) => {
      const postRelations = relationsByPost.get(post.id) ?? [];
      return Object.assign(post, {
        related_product_ids: postRelations.map((relation) => relation.product_id),
        related_products: postRelations.flatMap((relation) => relation.product ? [{
          id: relation.product.id,
          name: relation.product.name,
          slug: relation.product.slug,
          price: relation.product.price,
          images: relation.product.images,
          is_active: relation.product.is_active,
        }] : []),
      });
    });
  }

  private async saveRelatedProducts(
    manager: EntityManager,
    postId: string,
    websiteId: string,
    productIds?: string[],
  ) {
    if (productIds === undefined) return;
    if (productIds.length > 3) {
      throw new BadRequestException('A blog post can have at most 3 related products');
    }

    if (productIds.length > 0) {
      const products = await manager.getRepository(WebsiteProduct).find({
        where: { website_id: websiteId, id: In(productIds) },
        select: ['id'],
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException('Related products must belong to this website');
      }
    }

    const relationRepo = manager.getRepository(WebsiteBlogPostProduct);
    await relationRepo.delete({ blog_post_id: postId });
    if (productIds.length > 0) {
      await relationRepo.save(productIds.map((productId, sortOrder) => relationRepo.create({
        blog_post_id: postId,
        product_id: productId,
        sort_order: sortOrder,
      })));
    }
  }

  async findAll(websiteId: string, published?: boolean) {
    const posts = await this.blogPostRepo.find({
      where: {
        website_id: websiteId,
        ...(published !== undefined ? { is_published: published } : {}),
      },
      order: { published_at: 'DESC', created_at: 'DESC' },
    });
    return this.withRelatedProducts(posts);
  }

  async findOne(postId: string) {
    const post = await this.blogPostRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Blog post not found');
    const [postWithRelatedProducts] = await this.withRelatedProducts([post]);
    return postWithRelatedProducts;
  }

  private async assertSlugAvailable(websiteId: string, slug: string, excludeId?: string) {
    const existing = await this.blogPostRepo.findOne({ where: { website_id: websiteId, slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug "${slug}" already exists in this website`);
    }
  }

  async create(websiteId: string, dto: CreateBlogPostDto) {
    await this.assertSlugAvailable(websiteId, dto.slug);

    const post = await this.dataSource.transaction(async (manager) => {
      const postRepo = manager.getRepository(WebsiteBlogPost);
      const savedPost = await postRepo.save(postRepo.create({
        website_id: websiteId,
        title: dto.title,
        slug: dto.slug,
        excerpt: dto.excerpt ?? null,
        content: dto.content ?? null,
        cover_image: dto.cover_image ?? null,
        is_published: dto.is_published ?? false,
        published_at: dto.is_published ? new Date() : null,
      }));
      await this.saveRelatedProducts(manager, savedPost.id, websiteId, dto.related_product_ids);
      return savedPost;
    });
    const [postWithRelatedProducts] = await this.withRelatedProducts([post]);
    return postWithRelatedProducts;
  }

  async update(postId: string, websiteId: string, dto: UpdateBlogPostDto) {
    const post = await this.blogPostRepo.findOne({ where: { id: postId, website_id: websiteId } });
    if (!post) throw new NotFoundException('Blog post not found');

    if (dto.slug && dto.slug !== post.slug) {
      await this.assertSlugAvailable(websiteId, dto.slug, postId);
    }

    const savedPost = await this.dataSource.transaction(async (manager) => {
      const postRepo = manager.getRepository(WebsiteBlogPost);
      const currentPost = await postRepo.findOne({ where: { id: postId, website_id: websiteId } });
      if (!currentPost) throw new NotFoundException('Blog post not found');

      const wasPublished = currentPost.is_published;
      const { related_product_ids: relatedProductIds, ...postFields } = dto;
      Object.assign(currentPost, postFields);
      if (dto.is_published && !wasPublished && !currentPost.published_at) {
        currentPost.published_at = new Date();
      }

      const saved = await postRepo.save(currentPost);
      await this.saveRelatedProducts(manager, postId, websiteId, relatedProductIds);
      return saved;
    });
    const [postWithRelatedProducts] = await this.withRelatedProducts([savedPost]);
    return postWithRelatedProducts;
  }

  async remove(postId: string) {
    const post = await this.findOne(postId);
    await this.blogPostRepo.remove(post);
    return { deleted: true };
  }
}
