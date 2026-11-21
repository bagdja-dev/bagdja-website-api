import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Website } from './website.entity';

@Entity('website_menu_items')
export class WebsiteMenuItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'varchar', length: 100 }) menu_key: string;
  @Column({ type: 'uuid', nullable: true }) parent_id: string | null;
  @ManyToOne(() => WebsiteMenuItem, { nullable: true, onDelete: 'CASCADE' }) @JoinColumn({ name: 'parent_id' }) parent: WebsiteMenuItem | null;
  @Column({ type: 'varchar', length: 20 }) target_type: 'internal' | 'external';
  @Column({ type: 'varchar', length: 255, nullable: true }) target_key: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) external_url: string | null;
  @Column({ type: 'int', default: 0 }) sort_order: number;
  @Column({ type: 'boolean', default: true }) is_active: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
