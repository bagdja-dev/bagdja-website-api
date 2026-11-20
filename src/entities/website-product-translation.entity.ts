import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Website } from './website.entity';
import { WebsiteProduct } from './website-product.entity';

@Entity('website_product_translations')
@Unique(['product_id', 'locale'])
@Unique(['website_id', 'locale', 'slug'])
export class WebsiteProductTranslation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'uuid' }) product_id: string;
  @ManyToOne(() => WebsiteProduct, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'product_id' }) product: WebsiteProduct;
  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'varchar', length: 255 }) slug: string;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'text', nullable: true }) detail: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) seo_title: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) seo_description: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) seo_image: string | null;
  @Column({ type: 'boolean', default: false }) seo_no_index: boolean;
  @Column({ type: 'boolean', default: true }) is_published: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
