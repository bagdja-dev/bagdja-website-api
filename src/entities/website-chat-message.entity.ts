import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WebsiteChatMessageAuthorType = 'customer' | 'admin' | 'system';

@Entity('website_chat_messages')
export class WebsiteChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  thread_id: string;

  @Column({ type: 'varchar', default: 'customer' })
  author_type: WebsiteChatMessageAuthorType;

  @Column({ type: 'uuid' })
  @Index()
  author_user_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  author_name: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  parent_message_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
