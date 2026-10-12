import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type GatheringSelectionSource = 'VOTE' | 'ORGANIZER';

@Entity('website_gathering_occurrence_option_selections')
export class GatheringOccurrenceOptionSelection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  occurrence_id: string;

  @Column({ type: 'uuid' })
  group_id: string;

  @Column({ type: 'uuid' })
  option_id: string;

  @Column({ type: 'varchar', length: 32 })
  source: GatheringSelectionSource;

  @Column({ type: 'uuid' })
  selected_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  selected_at: Date;
}
