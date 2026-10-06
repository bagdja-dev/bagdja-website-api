import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { Website } from './website.entity';

@Entity('website_assets')
export class WebsiteAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @ManyToOne(() => Website, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'uuid', unique: true })
  storage_file_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'downloadable' })
  asset_type: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'varchar', length: 255 })
  mime_type: string;

  @Column({
    type: 'bigint',
    transformer: { to: (value: number) => value, from: (value: string) => Number(value) },
  })
  size_bytes: number;

  @Column({ type: 'boolean', default: false })
  is_public: boolean;

  @Column({ type: 'text', nullable: true })
  public_url: string | null;

  @Column({ type: 'uuid' })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}