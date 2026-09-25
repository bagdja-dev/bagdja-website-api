import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Website } from './website.entity';
import { WebsiteOrder } from './website-order.entity';
import { WebsiteProduct } from './website-product.entity';
import { WebsiteChatMessage } from './website-chat-message.entity';

export type WebsiteChatThreadChannelType = 'product' | 'support' | 'order' | 'transaction';
export type WebsiteChatThreadStatus = 'open' | 'waiting' | 'resolved' | 'closed';

@Entity('website_chat_threads')
export class WebsiteChatThread {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  topic_id: string | null;

  @Column({ type: 'uuid' })
  @Index()
  merchant_id: string;

  @Column({ type: 'uuid' })
  @Index()
  website_id: string;

  @ManyToOne(() => Website, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'varchar' })
  channel_type: WebsiteChatThreadChannelType;

  @Column({ type: 'varchar', nullable: true })
  channel_label: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  product_id: string | null;

  @ManyToOne(() => WebsiteProduct, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: WebsiteProduct | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  order_id: string | null;

  @ManyToOne(() => WebsiteOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order: WebsiteOrder | null;

  @Column({ type: 'uuid', nullable: true })
  order_item_id: string | null;

  @Column({ type: 'uuid' })
  @Index()
  customer_user_id: string;

  @Column({ type: 'jsonb', default: [] })
  participant_admin_user_ids: string[];

  @Column({ type: 'uuid', nullable: true })
  assigned_admin_user_id: string | null;

  @Column({ type: 'varchar', default: 'open' })
  status: WebsiteChatThreadStatus;

  @Column({ type: 'timestamptz', nullable: true })
  last_message_at: Date | null;

  @Column({ type: 'text', nullable: true })
  last_message_preview: string | null;

  @Column({ type: 'int', default: 0 })
  unread_count_by_admin: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_admin_read_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_customer_read_at: Date | null;

  @Column({ type: 'boolean', default: false })
  is_archived: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
