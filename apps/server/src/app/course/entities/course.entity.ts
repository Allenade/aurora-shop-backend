import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { CORE_30_PROGRAM } from '../../program/core30';
import type { CourseStatus } from '../course-pricing';
import { CoursePriceHistoryEntity } from './course-price-history.entity';

@Entity('course')
@Index('IDX_course_slug', ['slug'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@WithTimestamps()
export class CourseEntity extends DatabaseEntity {
  @Column({ length: 40 })
  slug: string;

  /** Program folder this track belongs to. Compliance-created courses are Core 3.0. */
  @Index('IDX_course_program')
  @Column({ type: 'varchar', length: 80, default: CORE_30_PROGRAM })
  program: string;

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

  /** Public URL of the course picture on Cloudflare R2. Null until an admin uploads one. */
  @Column({ name: 'image_url', type: 'varchar', length: 2048, nullable: true })
  imageUrl?: string | null;

  /** Public URL of the optional syllabus PDF on Cloudflare R2. */
  @Column({
    name: 'syllabus_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  syllabusUrl?: string | null;

  /** Original file name of the syllabus PDF, for the dashboard download label. */
  @Column({
    name: 'syllabus_filename',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  syllabusFilename?: string | null;

  /** Optional rich text (sanitized HTML), such as week-by-week topics. */
  @Column({ name: 'syllabus_text', type: 'text', nullable: true })
  syllabusText?: string | null;

  /**
   * Optional sanitized HTML emailed after a successful Paystack payment.
   * Includes the joining link (WhatsApp, Meet, Zoom, and so on). Admin only.
   */
  @Column({ name: 'after_payment_email', type: 'text', nullable: true })
  afterPaymentEmail?: string | null;

  @OneToMany(() => CoursePriceHistoryEntity, (row) => row.course)
  priceHistory?: CoursePriceHistoryEntity[];
}
