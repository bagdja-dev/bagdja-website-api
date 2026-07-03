import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

import { WebsiteTemplate } from './website-template.entity';
import { WebsitePage } from './website-page.entity';
import { TenantStaff } from './tenant-staff.entity';
import { WebsiteProduct } from './website-product.entity';

@Entity('websites')
export class Website {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  org_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string | null;

  @Column({ type: 'uuid', nullable: true })
  template_id: string | null;

  @ManyToOne(() => WebsiteTemplate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template: WebsiteTemplate | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @OneToMany(() => WebsitePage, (page) => page.website)
  pages: WebsitePage[];

  @OneToMany(() => TenantStaff, (staff) => staff.website)
  staff: TenantStaff[];

  @OneToMany(() => WebsiteProduct, (product) => product.website)
  products: WebsiteProduct[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
