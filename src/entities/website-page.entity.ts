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
  title: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'jsonb', default: {} })
  content: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  is_home: boolean;

  @Column({ type: 'int', default: 0 })
  order: number;

  @OneToMany(() => WebsiteSection, (section) => section.page)
  sections: WebsiteSection[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
