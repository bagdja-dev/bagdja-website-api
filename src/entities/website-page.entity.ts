import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from 'typeorm';

import { Website } from './website.entity';
import { WebsiteSection } from './website-section.entity';

@Entity('website_pages')
@Unique(['website_id', 'slug'])
export class WebsitePage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @ManyToOne(() => Website, (website) => website.pages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  seo_title: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  seo_description: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  seo_image: string | null;

  @Column({ type: 'boolean', default: false })
  seo_no_index: boolean;

  @Column({ type: 'varchar', length: 20, default: 'internal' })
  link_mode: 'internal' | 'external';

  @Column({ type: 'varchar', length: 1000, nullable: true })
  external_url: string | null;

  @Column({ type: 'jsonb', default: {} })
  content: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  is_home: boolean;

  @Column({ type: 'varchar', length: 20, default: 'regular' })
  placement: string;

  @Column({ type: 'int', default: 0 })
  order: number;

  @OneToMany(() => WebsiteSection, (section) => section.page)
  sections: WebsiteSection[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
