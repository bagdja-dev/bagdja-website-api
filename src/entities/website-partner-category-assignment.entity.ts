import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { WebsitePartnerCategory } from './website-partner-category.entity';
import { WebsitePartner } from './website-partner.entity';

@Entity('website_partner_category_assignments')
export class WebsitePartnerCategoryAssignment {
  @PrimaryColumn({ type: 'uuid' }) partner_id: string;
  @ManyToOne(() => WebsitePartner, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'partner_id' }) partner: WebsitePartner;
  @PrimaryColumn({ type: 'uuid' }) category_id: string;
  @ManyToOne(() => WebsitePartnerCategory, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'category_id' }) category: WebsitePartnerCategory;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
