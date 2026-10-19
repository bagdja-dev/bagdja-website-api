import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

export type GatheringOperationKind = 'INVOICE_ISSUANCE' | 'INVITATION_REVOCATION' | 'INVITATION_DISPATCH';
export type GatheringOperationStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

@Entity('website_gathering_operations')
export class GatheringOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  group_id: string;

  @Column({ type: 'uuid' })
  initiator_user_id: string;

  @Column({ type: 'varchar', length: 32 })
  kind: GatheringOperationKind;

  @Column({ type: 'varchar', length: 16, default: 'QUEUED' })
  status: GatheringOperationStatus;

  @Column({ type: 'int', default: 0 })
  total_count: number;

  @Column({ type: 'int', default: 0 })
  processed_count: number;

  @Column({ type: 'int', default: 0 })
  success_count: number;

  @Column({ type: 'int', default: 0 })
  failed_count: number;

  @Column({ type: 'jsonb', default: [] })
  failed_items: string[];

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
