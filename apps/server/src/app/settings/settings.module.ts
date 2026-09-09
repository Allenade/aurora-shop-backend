import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { StorageModule } from '../storage/storage.module';
import { UserModule } from '../user/user.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuthModule, UserModule, OrderModule, StorageModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
