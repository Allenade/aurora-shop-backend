import {
  DatabaseEntity,
  UserStatus,
  UserType,
  WithTimestamps,
} from '@app/shared';
import { Column, Entity, OneToMany } from 'typeorm';
import { UserRoleEntity } from '../../role/entities/user-role.entity';

export type DefaultShipping = {
  fullName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  note?: string;
};

@Entity('user')
@WithTimestamps()
export class UserEntity extends DatabaseEntity {
  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash?: string;

  @Column({ type: 'varchar' })
  type!: UserType;

  @Column({ type: 'varchar', default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ name: 'first_name' })
  firstName!: string;

  @Column({ name: 'last_name' })
  lastName!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ name: 'company_name', nullable: true })
  companyName?: string;

  @Column({ nullable: true })
  industry?: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl?: string | null;

  @Column({ name: 'email_verified', default: false })
  emailVerified!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  notifications?: Record<string, boolean>;

  /** Saved checkout/settings delivery defaults for form prefill. */
  @Column({ name: 'default_shipping', type: 'jsonb', nullable: true })
  defaultShipping?: DefaultShipping | null;

  @OneToMany(() => UserRoleEntity, (assignment) => assignment.user, {
    cascade: true,
  })
  roleAssignments?: UserRoleEntity[];
}
