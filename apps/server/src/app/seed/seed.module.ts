import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseModule } from '../course/course.module';
import { EmailModule } from '../email/email.module';
import { ProductEntity } from '../catalog/entities/product.entity';
import { OrgSettingsModule } from '../org-settings/org-settings.module';
import { InventoryEntity } from '../inventory/entities/inventory.entity';
import { OrderEntity } from '../order/entities/order.entity';
import { QuoteEntity } from '../procurement/entities/quote.entity';
import { RolePermissionEntity } from '../role/entities/role-permission.entity';
import { RoleEntity } from '../role/entities/role.entity';
import { UserRoleEntity } from '../role/entities/user-role.entity';
import { UserEntity } from '../user/entities/user.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    CourseModule,
    EmailModule,
    OrgSettingsModule,
    TypeOrmModule.forFeature([
      RoleEntity,
      RolePermissionEntity,
      UserEntity,
      UserRoleEntity,
      ProductEntity,
      InventoryEntity,
      OrderEntity,
      QuoteEntity,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
