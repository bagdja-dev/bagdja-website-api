import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Website } from './website.entity';
import { WebsiteSection } from './website-section.entity';

@Entity('website_section_translations')
@Unique(['section_id', 'locale'])
export class WebsiteSectionTranslation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'uuid' }) section_id: string;
  @ManyToOne(() => WebsiteSection, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'section_id' }) section: WebsiteSection;
  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'jsonb', default: {} }) content: Record<string, unknown>;
  @Column({ type: 'boolean', default: true }) is_published: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
