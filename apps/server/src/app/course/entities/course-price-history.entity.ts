import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { CourseEntity } from './course.entity';

@Entity('course_price_history')
@WithTimestamps()
export class CoursePriceHistoryEntity extends DatabaseEntity {
  @Index()
  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => CourseEntity, (course) => course.priceHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'course_id' })
  course?: CourseEntity;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy?: string | null;

  @Column({ name: 'old_price', type: 'int', nullable: true })
  oldPrice?: number | null;

  @Column({ name: 'new_price', type: 'int', nullable: true })
  newPrice: number | null;

  @Column({ name: 'old_currency', type: 'varchar', length: 8, nullable: true })
  oldCurrency?: string | null;

  @Column({ name: 'new_currency', type: 'varchar', length: 8 })
  newCurrency: string;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;
}
