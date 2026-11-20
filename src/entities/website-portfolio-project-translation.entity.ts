import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { WebsitePortfolioProject } from './website-portfolio-project.entity';
import { Website } from './website.entity';

@Entity('website_portfolio_project_translations')
@Unique(['project_id', 'locale'])
@Unique(['website_id', 'locale', 'slug'])
export class WebsitePortfolioProjectTranslation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'uuid' }) project_id: string;
  @ManyToOne(() => WebsitePortfolioProject, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'project_id' }) project: WebsitePortfolioProject;
  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'varchar', length: 255 }) slug: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) excerpt: string | null;
  @Column({ type: 'text', nullable: true }) detail: string | null;
  @Column({ type: 'jsonb', default: [] }) tags: string[];
  @Column({ type: 'varchar', length: 500, nullable: true }) summary: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) seo_title: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) seo_description: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) seo_image: string | null;
  @Column({ type: 'boolean', default: false }) seo_no_index: boolean;
  @Column({ type: 'boolean', default: false }) is_published: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
