import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreSettingsController } from './core-settings.controller';
import { CoreSettingsService } from './core-settings.service';
import { SettingEntity } from './entities/setting.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SettingEntity])],
  controllers: [CoreSettingsController],
  providers: [CoreSettingsService],
  exports: [CoreSettingsService],
})
export class CoreSettingsModule {}
