import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { WebsitePartner } from './website-partner.entity';
import { Website } from './website.entity';

@Entity('website_partner_translations')
@Unique(['partner_id', 'locale'])
export class WebsitePartnerTranslation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'uuid' }) partner_id: string;
  @ManyToOne(() => WebsitePartner, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'partner_id' }) partner: WebsitePartner;
  @Column({ type: 'varchar', length: 10 }) locale: string;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) description: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
