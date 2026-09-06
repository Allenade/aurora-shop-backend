import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity } from 'typeorm';

export type QuoteStatus =
  | 'draft'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected';

@Entity('quote')
@WithTimestamps()
export class QuoteEntity extends DatabaseEntity {
  @Column({ unique: true })
  reference: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: QuoteStatus;

  @Column({ name: 'company_name' })
  companyName: string;

  @Column({ name: 'contact_person' })
  contactPerson: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column({ type: 'text' })
  components: string;

  @Column()
  quantity: string;

  @Column({ default: '' })
  budget: string;

  @Column({ name: 'delivery_date', default: '' })
  deliveryDate: string;

  @Column({ type: 'text', default: '' })
  specs: string;

  @Column({ default: '' })
  title: string;
}
