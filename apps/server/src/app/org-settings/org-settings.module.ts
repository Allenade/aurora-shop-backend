import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingEntity } from './entities/setting.entity';
import { OrgSettingsController } from './org-settings.controller';
import { OrgSettingsService } from './org-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([SettingEntity])],
  controllers: [OrgSettingsController],
  providers: [OrgSettingsService],
  exports: [OrgSettingsService],
})
export class OrgSettingsModule {}
