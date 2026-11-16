import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';

export type InviteOfferType = 'discount_percent' | 'discount_fixed' | 'free';

export type InviteTrackScope = 'all' | 'selected';

@Entity('enter_first_invite')
@WithTimestamps()
export class EnterFirstInviteEntity extends DatabaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  label?: string | null;

  /** Optional person this invite was created for. */
  @Index()
  @Column({ name: 'person_id', type: 'uuid', nullable: true })
  personId?: string | null;

  /**
   * When true and personId is set, enroll email must match the person email.
   */
  @Column({ name: 'lock_to_person', type: 'boolean', default: true })
  lockToPerson: boolean;

  @Column({ name: 'offer_type', type: 'varchar', length: 32 })
  offerType: InviteOfferType;

  /** Percent off (1–100) when offerType is discount_percent. */
  @Column({ name: 'discount_percent', type: 'int', nullable: true })
  discountPercent?: number | null;

  /** Fixed amount off in major units when offerType is discount_fixed. */
  @Column({ name: 'discount_amount', type: 'int', nullable: true })
  discountAmount?: number | null;

  @Column({ name: 'track_scope', type: 'varchar', length: 16, default: 'all' })
  trackScope: InviteTrackScope;

  /** Track slugs covered when trackScope is selected. Empty when all. */
  @Column({ name: 'track_slugs', type: 'jsonb', default: [] })
  trackSlugs: string[];

  @Column({ name: 'max_redemptions', type: 'int', nullable: true })
  maxRedemptions?: number | null;

  @Column({ name: 'redemption_count', type: 'int', default: 0 })
  redemptionCount: number;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'varchar', length: 280, nullable: true })
  notes?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;
}
