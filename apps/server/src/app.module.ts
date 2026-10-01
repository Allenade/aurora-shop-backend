import { config, createLoggerModuleOpts, DatabaseModule } from '@app/shared';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AccessModule } from './app/access/access.module';
import { AdminModule } from './app/admin/admin.module';
import { AuditLogModule } from './app/audit-log/audit-log.module';
import { AuthModule } from './app/auth/auth.module';
import { CartModule } from './app/cart/cart.module';
import { CatalogModule } from './app/catalog/catalog.module';
import { ComplianceModule } from './app/compliance/compliance.module';
import { CoreSettingsModule } from './app/core-settings/core-settings.module';
import { CourseModule } from './app/course/course.module';
import { EmailModule } from './app/email/email.module';
import { EnterFirstModule } from './app/enter-first/enter-first.module';
import { HealthModule } from './app/health/health.module';
import { InventoryModule } from './app/inventory/inventory.module';
import { OpsModule } from './app/ops/ops.module';
import { OrderModule } from './app/order/order.module';
import { PaymentGatewayModule } from './app/payment-gateway/payment-gateway.module';
import { RefundModule } from './app/refund/refund.module';
import { ProcurementModule } from './app/procurement/procurement.module';
import { RoleModule } from './app/role/role.module';
import { SeedModule } from './app/seed/seed.module';
import { StorageModule } from './app/storage/storage.module';
import { SettingsModule } from './app/settings/settings.module';
import { TransactionModule } from './app/transaction/transaction.module';
import { UserModule } from './app/user/user.module';
import { MailModule } from './app/mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [config],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 20 }],
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync(createLoggerModuleOpts('aurora-server')),
    DatabaseModule,
    MailModule,
    OpsModule,
    AuditLogModule,
    CoreSettingsModule,
    AuthModule,
    RoleModule,
    UserModule,
    HealthModule,
    CatalogModule,
    CartModule,
    InventoryModule,
    PaymentGatewayModule,
    TransactionModule,
    OrderModule,
    ProcurementModule,
    SettingsModule,
    AdminModule,
    SeedModule,
    StorageModule,
    AccessModule,
    CourseModule,
    EnterFirstModule,
    EmailModule,
    RefundModule,
    ComplianceModule,
  ],
})
export class AppModule {}
