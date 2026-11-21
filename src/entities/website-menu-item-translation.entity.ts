import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Website } from './website.entity';
import { WebsiteMenuItem } from './website-menu-item.entity';

@Entity('website_menu_item_translations')
@Unique(['menu_item_id', 'locale'])
export class WebsiteMenuItemTranslation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'uuid' }) menu_item_id: string;
  @ManyToOne(() => WebsiteMenuItem, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'menu_item_id' }) menu_item: WebsiteMenuItem;
  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'varchar', length: 255 }) label: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) internal_slug: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) external_url: string | null;
  @Column({ type: 'varchar', length: 10, default: '_self' }) target: '_self' | '_blank';
  @Column({ type: 'varchar', length: 255, nullable: true }) rel: string | null;
  @Column({ type: 'boolean', default: true }) is_active: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
