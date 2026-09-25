import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type WebsiteNotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export type WebsiteNotificationType = 'chat.new_message' | 'chat.assigned' | 'order.updated' | 'system';

@Entity('website_notifications')
@Index(['website_id', 'user_id', 'created_at'])
@Index(['website_id', 'user_id', 'read_at'])
export class WebsiteNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 80 })
  type: WebsiteNotificationType;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  message: string;

  @Column({ type: 'varchar', length: 16, default: 'info' })
  severity: WebsiteNotificationSeverity;

  @Column({ type: 'varchar', length: 80, nullable: true })
  action_label: string | null;

  @Column({ type: 'varchar', length: 500 })
  action_url: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entity_type: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  entity_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  read_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
