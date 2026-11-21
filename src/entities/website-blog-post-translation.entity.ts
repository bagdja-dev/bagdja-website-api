import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Website } from './website.entity';
import { WebsiteBlogPost } from './website-blog-post.entity';

@Entity('website_blog_post_translations')
@Unique(['post_id', 'locale'])
@Unique(['website_id', 'locale', 'slug'])
export class WebsiteBlogPostTranslation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'uuid' }) post_id: string;
  @ManyToOne(() => WebsiteBlogPost, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'post_id' }) post: WebsiteBlogPost;
  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'varchar', length: 255 }) slug: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'text', nullable: true }) excerpt: string | null;
  @Column({ type: 'text', nullable: true }) content: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) seo_title: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) seo_description: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) seo_image: string | null;
  @Column({ type: 'boolean', default: false }) seo_no_index: boolean;
  @Column({ type: 'boolean', default: true }) is_published: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
