import { config, createLoggerModuleOpts, DatabaseModule } from '@app/shared';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './app/admin/admin.module';
import { AuditLogModule } from './app/audit-log/audit-log.module';
import { AuthModule } from './app/auth/auth.module';
import { CartModule } from './app/cart/cart.module';
import { CatalogModule } from './app/catalog/catalog.module';
import { HealthModule } from './app/health/health.module';
import { InventoryModule } from './app/inventory/inventory.module';
import { OrderModule } from './app/order/order.module';
import { PaymentGatewayModule } from './app/payment-gateway/payment-gateway.module';
import { ProcurementModule } from './app/procurement/procurement.module';
import { RoleModule } from './app/role/role.module';
import { SeedModule } from './app/seed/seed.module';
import { StorageModule } from './app/storage/storage.module';
import { SettingsModule } from './app/settings/settings.module';
import { TransactionModule } from './app/transaction/transaction.module';
import { UserModule } from './app/user/user.module';

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
    AuditLogModule,
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
  ],
})
export class AppModule {}
