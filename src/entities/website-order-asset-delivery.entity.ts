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
import { WebsiteOrder } from './website-order.entity';
import { WebsiteProduct } from './website-product.entity';

export type WebsiteAssetEmailStatus = 'PENDING' | 'SENT' | 'FAILED';

@Entity('website_order_asset_deliveries')
export class WebsiteOrderAssetDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => WebsiteOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: WebsiteOrder;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => WebsiteProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: WebsiteProduct;

  @Column({ type: 'uuid' })
  asset_id: string;

  @ManyToOne(() => WebsiteAsset, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_id' })
  asset: WebsiteAsset;

  @Column({ type: 'varchar', length: 30 })
  role: 'download' | 'attachment';

  @Column({ type: 'varchar', length: 320, nullable: true })
  email_to: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  email_status: WebsiteAssetEmailStatus;

  @Column({ type: 'timestamptz', nullable: true })
  last_email_attempt_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  email_sent_at: Date | null;

  @Column({ type: 'int', default: 0 })
  delivery_attempts: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_url_issued_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_url_expires_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}