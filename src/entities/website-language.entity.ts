import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { Website } from './website.entity';

@Entity('website_languages')
@Unique(['website_id', 'locale'])
export class WebsiteLanguage {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) website_id: string;

  @ManyToOne(() => Website, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'varchar', length: 100 }) label: string;
  @Column({ type: 'boolean', default: false }) is_default: boolean;
  @Column({ type: 'boolean', default: true }) is_active: boolean;
  @Column({ type: 'int', default: 0 }) sort_order: number;

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
