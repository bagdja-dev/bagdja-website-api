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
import { WebsiteProduct } from './website-product.entity';

@Entity('website_product_locations')
export class WebsiteProductLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => WebsiteProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: WebsiteProduct;

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
