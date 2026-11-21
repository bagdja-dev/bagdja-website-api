import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { Website } from './website.entity';
import { WebsitePage } from './website-page.entity';

@Entity('website_page_translations')
@Unique(['page_id', 'locale'])
@Unique(['website_id', 'locale', 'slug'])
export class WebsitePageTranslation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'uuid' }) page_id: string;
  @ManyToOne(() => WebsitePage, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'page_id' }) page: WebsitePage;
  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'varchar', length: 255 }) slug: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'jsonb', default: {} }) content: Record<string, unknown>;
  @Column({ type: 'varchar', length: 255, nullable: true }) seo_title: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) seo_description: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) seo_image: string | null;
  @Column({ type: 'boolean', default: false }) seo_no_index: boolean;
  @Column({ type: 'varchar', length: 1000, nullable: true }) external_url: string | null;
  @Column({ type: 'varchar', length: 10, default: '_self' }) external_target: '_self' | '_blank';
  @Column({ type: 'varchar', length: 255, nullable: true }) external_rel: string | null;
  @Column({ type: 'boolean', default: true }) is_published: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
