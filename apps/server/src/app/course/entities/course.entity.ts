import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';
import type { CourseStatus } from '../course-pricing';

@Entity('course')
@WithTimestamps()
export class CourseEntity extends DatabaseEntity {
  @Index({ unique: true })
  @Column()
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ name: 'is_free', default: false })
  isFree: boolean;

  @Column({ name: 'seat_cap', type: 'int', nullable: true })
  seatCap?: number | null;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate?: Date | null;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate?: Date | null;

  @Column({ name: 'enrollment_cutoff', type: 'timestamptz', nullable: true })
  enrollmentCutoff?: Date | null;

  @Column({ type: 'varchar', default: 'draft' })
  status: CourseStatus;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
