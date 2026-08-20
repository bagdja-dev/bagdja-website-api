import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { WebsiteTransaction } from './website-transaction.entity';
import { WebsiteOrder } from './website-order.entity';

/**
 * Transaction item — W2.8. Item transaksi: link `transaction_id` →
 * website_transactions dan `order_id` → website_orders (item = id order,
 * sesuai keputusan user). `product_id`/`quantity`/`unit_price`/`total_amount`
 * adalah SNAPSHOT harga saat checkout (harga terkunci, tidak berubah walau
 * harga produk diubah nanti).
 */
@Entity('website_transaction_items')
export class WebsiteTransactionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transaction_id: string;

  @ManyToOne(() => WebsiteTransaction, (transaction) => transaction.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction: WebsiteTransaction;

  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => WebsiteOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: WebsiteOrder;

  @Column({ type: 'uuid' })
  product_id: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({
    type: 'numeric',
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  unit_price: number;

  @Column({
    type: 'numeric',
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  total_amount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
