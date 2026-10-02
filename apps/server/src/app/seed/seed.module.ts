import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolePermissionEntity } from '../role/entities/role-permission.entity';
import { RoleEntity } from '../role/entities/role.entity';
import { UserRoleEntity } from '../role/entities/user-role.entity';
import { UserEntity } from '../user/entities/user.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleEntity,
      RolePermissionEntity,
      UserEntity,
      UserRoleEntity,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
