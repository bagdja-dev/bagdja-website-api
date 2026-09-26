import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { WebsiteBlogPost } from './website-blog-post.entity';
import { WebsiteProduct } from './website-product.entity';

@Entity('website_blog_post_products')
@Index(['blog_post_id', 'sort_order'])
export class WebsiteBlogPostProduct {
  @PrimaryColumn({ type: 'uuid' })
  blog_post_id: string;

  @ManyToOne(() => WebsiteBlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blog_post_id' })
  blog_post: WebsiteBlogPost;

  @PrimaryColumn({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => WebsiteProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: WebsiteProduct;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}