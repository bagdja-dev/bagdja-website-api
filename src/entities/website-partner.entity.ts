import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { WebsiteVendorLocation } from './website-vendor-location.entity';
import { Website } from './website.entity';

@Entity('website_partners')
export class WebsitePartner {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) website_id: string;
  @ManyToOne(() => Website, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'website_id' }) website: Website;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'varchar', length: 1000, nullable: true }) logo_url: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) website_url: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) contact_whatsapp: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'boolean', default: false }) is_client = false;
  @Column({ type: 'boolean', default: false }) is_provider = false;
  @Column({ type: 'boolean', default: false }) is_public = false;
  @Column({ type: 'boolean', default: true }) is_active = true;
  @Column({ type: 'varchar', length: 20, default: 'active' }) status: 'active' | 'inactive' = 'active';
  @Column({ type: 'int', default: 0 }) sort_order = 0;
  @OneToMany(() => WebsiteVendorLocation, (joinRow) => joinRow.partner) vendor_locations: WebsiteVendorLocation[];
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
