import { Action, DatabaseEntity, Resource, WithTimestamps } from '@app/shared';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { RoleEntity } from './role.entity';

@Entity('role_permission')
@WithTimestamps()
export class RolePermissionEntity extends DatabaseEntity {
  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({ type: 'varchar' })
  action: Action;

  @Column({ type: 'varchar' })
  resource: Resource;

  @ManyToOne(() => RoleEntity, (role) => role.permissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;
}
