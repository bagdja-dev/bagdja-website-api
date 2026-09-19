import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WebsiteLocation } from './website-location.entity';
import { WebsiteVendor } from './website-vendor.entity';

@Entity('website_vendor_locations')
export class WebsiteVendorLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vendor_id: string;

  @ManyToOne(() => WebsiteVendor, (vendor) => vendor.vendor_locations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vendor_id' })
  vendor: WebsiteVendor;

  @Column({ type: 'uuid' })
  location_id: string;

  @ManyToOne(() => WebsiteLocation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location: WebsiteLocation;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
