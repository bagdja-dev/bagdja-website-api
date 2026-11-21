import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { WebsitePartner } from './website-partner.entity';
import { Website } from './website.entity';

export interface WebsitePortfolioPhoto {
  url: string;
  alt: string;
  caption: string;
}

@Entity('website_portfolio_projects')
@Unique(['website_id', 'slug'])
@Unique(['id', 'website_id'])
export class WebsitePortfolioProject {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'varchar', length: 255 }) slug: string;
  @Column({ type: 'uuid', nullable: true }) client_id: string | null;
  @ManyToOne(() => WebsitePartner, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'client_id' }) client: WebsitePartner | null;
  @Column({ type: 'jsonb', default: [] }) tags: string[];
  @Column({ type: 'varchar', length: 1000, nullable: true }) cover_image: string | null;
  @Column({ type: 'jsonb', default: [] }) photos: WebsitePortfolioPhoto[];
  @Column({ type: 'varchar', length: 1000, nullable: true }) video_url: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) model3d_url: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) project_url: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) project_type: string | null;
  @Column({ type: 'int', nullable: true }) year: number | null;
  @Column({ type: 'int', default: 0 }) sort_order: number;
  @Column({ type: 'boolean', default: true }) is_published: boolean;
  @Column({ type: 'boolean', default: false }) seo_no_index: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
