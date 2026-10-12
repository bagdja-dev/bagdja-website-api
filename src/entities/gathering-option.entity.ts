import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

import { GatheringOptionGroup } from './gathering-option-group.entity';

@Entity('website_gathering_options')
export class GatheringOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @Column({ type: 'uuid' })
  group_id: string;

  @ManyToOne(() => GatheringOptionGroup)
  @JoinColumn({ name: 'group_id' })
  group: GatheringOptionGroup;

  @Column({ type: 'varchar', length: 64 })
  option_key: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', default: {} })
  availability_window: Record<string, any>;

  @Column({ type: 'int', nullable: true })
  capacity_limit?: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
