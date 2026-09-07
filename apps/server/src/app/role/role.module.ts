import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RoleRepository } from './repositories/role.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleEntity,
      RolePermissionEntity,
      UserRoleEntity,
    ]),
  ],
  providers: [RoleRepository],
  exports: [RoleRepository, TypeOrmModule],
})
export class RoleModule {}
