import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { Website } from './website.entity';

@Entity('website_portfolio_categories')
@Unique(['website_id', 'slug'])
@Unique(['id', 'website_id'])
export class WebsitePortfolioCategory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'varchar', length: 100 }) slug: string;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) description: string | null;
  @Column({ type: 'boolean', default: true }) is_public: boolean;
  @Column({ type: 'boolean', default: true }) is_active: boolean;
  @Column({ type: 'int', default: 0 }) sort_order: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
