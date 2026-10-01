import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import type { CourseStatus } from '../course-pricing';
import { CoursePriceHistoryEntity } from './course-price-history.entity';

@Entity('course')
@WithTimestamps()
export class CourseEntity extends DatabaseEntity {
  @Index({ unique: true })
  @Column({ length: 40 })
  slug: string;

  @Column({ length: 160 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /**
   * Whole naira (or other major units), not kobo.
   * Null until an admin sets a price. Never defaulted.
   */
  @Column({ type: 'int', nullable: true })
  price: number | null;

  @Column({ type: 'varchar', length: 8, default: 'NGN' })
  currency: string;

  @Column({ name: 'is_free', type: 'boolean', default: false })
  isFree: boolean;

  @Column({ name: 'seat_cap', type: 'int', nullable: true })
  seatCap?: number | null;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate?: Date | null;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate?: Date | null;

  @Column({ name: 'enrollment_cutoff', type: 'timestamptz', nullable: true })
  enrollmentCutoff?: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: CourseStatus;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** Optional cohort label, e.g. "October 2026". */
  @Column({ type: 'varchar', length: 80, nullable: true })
  cohort?: string | null;

  @OneToMany(() => CoursePriceHistoryEntity, (row) => row.course)
  priceHistory?: CoursePriceHistoryEntity[];
}
