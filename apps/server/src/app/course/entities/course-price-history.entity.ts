import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';

@Entity('course_price_history')
@WithTimestamps()
export class CoursePriceHistoryEntity extends DatabaseEntity {
  @Index()
  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId?: string | null;

  @Column({ name: 'old_price', type: 'int' })
  oldPrice: number;

  @Column({ name: 'new_price', type: 'int' })
  newPrice: number;

  @Column({ name: 'old_currency', type: 'varchar', nullable: true })
  oldCurrency?: string | null;

  @Column({ name: 'new_currency', type: 'varchar', nullable: true })
  newCurrency?: string | null;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;
}
