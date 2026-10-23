import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Website } from './website.entity';

export const ANDROID_DISPLAY_MODES = ['standalone', 'fullscreen', 'fullscreen-sticky'] as const;
export type AndroidDisplayMode = (typeof ANDROID_DISPLAY_MODES)[number];

@Entity('website_android_apps')
export class WebsiteAndroidApp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  website_id: string;

  @ManyToOne(() => Website, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'varchar', length: 50 })
  app_name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  package_name: string;

  @Column({ type: 'varchar', length: 64, default: '1.0.0' })
  version_name: string;

  @Column({ type: 'integer', default: 1 })
  version_code: number;

  @Column({ type: 'boolean', default: false })
  package_name_locked: boolean;

  @Column({ type: 'uuid', nullable: true })
  keystore_storage_file_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  icon_storage_file_id: string | null;

  @Column({ type: 'text', nullable: true })
  icon_url: string | null;

  @Column({ type: 'uuid', nullable: true })
  splash_storage_file_id: string | null;

  @Column({ type: 'text', nullable: true })
  splash_image_url: string | null;

  @Column({ type: 'varchar', length: 7, default: '#7C3AED' })
  primary_color: string;

  @Column({ type: 'varchar', length: 7, default: '#0F172A' })
  splash_color: string;

  /** NULL = mengikuti `splash_color`. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  navigation_bar_color: string | null;

  /** NULL = tanpa garis pemisah di atas navigation bar. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  navigation_bar_divider_color: string | null;

  @Column({ type: 'varchar', length: 32, default: 'standalone' })
  display_mode: AndroidDisplayMode;

  @Column({ type: 'varchar', length: 255, nullable: true })
  keystore_alias: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  store_password_encrypted: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  key_password_encrypted: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  release_signing_cert_sha256: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  retired_signing_cert_sha256: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  play_store_signing_cert_sha256: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
