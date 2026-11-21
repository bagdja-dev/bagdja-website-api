import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { WebsitePartner } from './website-partner.entity';

@Entity('website_partner_accounts')
@Unique(['partner_id', 'bagdja_account_id', 'role'])
export class WebsitePartnerAccount {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) partner_id: string;
  @ManyToOne(() => WebsitePartner, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'partner_id' }) partner: WebsitePartner;
  @Column({ type: 'uuid' }) bagdja_account_id: string;
  @Column({ type: 'varchar', length: 100 }) role: string;
  @Column({ type: 'varchar', length: 20, default: 'active' }) status: 'active' | 'inactive';
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
