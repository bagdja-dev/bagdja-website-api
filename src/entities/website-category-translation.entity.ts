import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { WebsiteCategory } from './website-category.entity';

@Entity('website_category_translations')
@Unique(['category_id', 'locale'])
export class WebsiteCategoryTranslation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @Column({ type: 'uuid' }) category_id: string;
  @ManyToOne(() => WebsiteCategory, (category) => category.translations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: WebsiteCategory;
  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'varchar', length: 100 }) label: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
