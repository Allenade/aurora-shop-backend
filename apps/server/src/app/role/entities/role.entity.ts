import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, OneToMany } from 'typeorm';
import { RolePermissionEntity } from './role-permission.entity';
import { UserRoleEntity } from './user-role.entity';

@Entity('role')
@WithTimestamps()
export class RoleEntity extends DatabaseEntity {
  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @OneToMany(() => RolePermissionEntity, (permission) => permission.role, {
    cascade: true,
  })
  permissions?: RolePermissionEntity[];

  @OneToMany(() => UserRoleEntity, (assignment) => assignment.role)
  assignments?: UserRoleEntity[];
}
