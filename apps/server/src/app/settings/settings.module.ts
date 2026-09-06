import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { UserModule } from '../user/user.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuthModule, UserModule, OrderModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
