import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { WebsitePortfolioCategory } from './website-portfolio-category.entity';
import { WebsitePortfolioProject } from './website-portfolio-project.entity';

@Entity('website_portfolio_project_categories')
export class WebsitePortfolioProjectCategory {
  @PrimaryColumn({ type: 'uuid' }) project_id: string;
  @ManyToOne(() => WebsitePortfolioProject, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'project_id' }) project: WebsitePortfolioProject;
  @PrimaryColumn({ type: 'uuid' }) category_id: string;
  @ManyToOne(() => WebsitePortfolioCategory, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'category_id' }) category: WebsitePortfolioCategory;
  @Column({ type: 'uuid' }) website_id: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
