import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Studio S1 — daftar minat "Kabari saya" untuk business profile yang masih
 * `coming_soon` (admin-redesign-onboarding-plan.md §2.2). Satu baris per user + profile.
 */
@Entity('business_profile_waitlist')
@Unique('uq_business_profile_waitlist_user_profile', ['user_id', 'business_profile'])
export class BusinessProfileWaitlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 50 })
  business_profile: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
