import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('website_analytics_events')
@Index('idx_website_analytics_events_created', ['created_at'])
@Index('idx_website_analytics_events_website_created', ['website_id', 'created_at'])
@Index('idx_website_analytics_events_website_type_created', ['website_id', 'event_type', 'created_at'])
export class WebsiteAnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'varchar', length: 20 })
  event_type: 'page_view' | 'cta_click';

  @Column({ type: 'varchar', length: 64 })
  visitor_hash: string;

  @Column({ type: 'varchar', length: 500 })
  page_path: string;

  @Column({ type: 'varchar', length: 120, default: 'Langsung' })
  source: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
