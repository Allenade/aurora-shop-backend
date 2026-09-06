import {
  DatabaseEntity,
  UserStatus,
  UserType,
  WithTimestamps,
} from '@app/shared';
import { Column, Entity, OneToMany } from 'typeorm';
import { UserRoleEntity } from '../../role/entities/user-role.entity';

@Entity('user')
@WithTimestamps()
export class UserEntity extends DatabaseEntity {
  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash?: string;

  @Column({ type: 'varchar' })
  type: UserType;

  @Column({ type: 'varchar', default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ name: 'company_name', nullable: true })
  companyName?: string;

  @Column({ nullable: true })
  industry?: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ type: 'jsonb', nullable: true })
  notifications?: Record<string, boolean>;

  @OneToMany(() => UserRoleEntity, (assignment) => assignment.user, {
    cascade: true,
  })
  roleAssignments?: UserRoleEntity[];
}
