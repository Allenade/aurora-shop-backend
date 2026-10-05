import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AuditLogController } from './audit-log.controller';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity, UserEntity])],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
