import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('website_templates')
export class WebsiteTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  preview_image: string | null;

  @Column({ type: 'jsonb', default: {} })
  structure: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  /** Studio S1 — profile bisnis yang direkomendasikan memakai template ini (`BusinessProfileId[]`). */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  business_profiles: string[];

  /** R1 — manifest template (template-contract.md §3). NULL = belum dideklarasikan. */
  @Column({ type: 'jsonb', nullable: true })
  manifest: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
