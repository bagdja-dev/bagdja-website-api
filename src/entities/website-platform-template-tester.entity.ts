import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Penguji milik designer (plan/website-builder/template-candidate-trial-plan.md §2.2).
 * Dikenali dari email login; hanya melihat & bertransaksi di versi uji, tidak memulai uji.
 */
@Entity('website_platform_template_tester')
@Index('uq_website_platform_template_tester_designer_email', ['designer_user_id', 'email'], { unique: true })
export class WebsitePlatformTemplateTester {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  designer_user_id: string;

  /** Selalu huruf kecil. */
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
