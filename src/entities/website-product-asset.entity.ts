import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { WebsiteAsset } from './website-asset.entity';
import { WebsiteProduct } from './website-product.entity';

export type WebsiteProductAssetRole = 'download' | 'attachment' | 'preview';

@Entity('website_product_assets')
export class WebsiteProductAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => WebsiteProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: WebsiteProduct;

  @Column({ type: 'uuid' })
  asset_id: string;

  @ManyToOne(() => WebsiteAsset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset: WebsiteAsset;

  @Column({ type: 'varchar', length: 30, default: 'download' })
  role: WebsiteProductAssetRole;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'uuid' })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}