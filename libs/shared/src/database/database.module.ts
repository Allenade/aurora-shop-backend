import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { shouldSynchronizeSchema, type EnvTypes } from '../config/env.config';
import { Core30Compliance1735689600000 } from './migrations/1735689600000-Core30Compliance';
import { CoursePriceNullable1735689700000 } from './migrations/1735689700000-CoursePriceNullable';
import { EnrollmentColumnAlign1735689800000 } from './migrations/1735689800000-EnrollmentColumnAlign';
import { RemoveSeededRows1735689900000 } from './migrations/1735689900000-RemoveSeededRows';
import { AuditLogColumns1735690000000 } from './migrations/1735690000000-AuditLogColumns';
import { Core30Program1735690100000 } from './migrations/1735690100000-Core30Program';
import { CourseSlugReuse1735690200000 } from './migrations/1735690200000-CourseSlugReuse';
import { CoursePriceHistoryCascade1735690300000 } from './migrations/1735690300000-CoursePriceHistoryCascade';
import { CourseImageSyllabus1735690400000 } from './migrations/1735690400000-CourseImageSyllabus';
import { CourseAfterPaymentEmail1735690500000 } from './migrations/1735690500000-CourseAfterPaymentEmail';
import { EmailCampaignHiddenAt1735690600000 } from './migrations/1735690600000-EmailCampaignHiddenAt';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvTypes, true>) => {
        const url = config.get('database.url', { infer: true });
        const isSsl =
          url.includes('sslmode=require') ||
          url.includes('neon.tech') ||
          url.includes('ssl=true');
        return {
          type: 'postgres',
          url,
          ssl: isSsl ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: shouldSynchronizeSchema({
            nodeEnv: config.get('nodeEnv', { infer: true }),
            databaseUrl: url,
            dbSynchronize: config.get('database.synchronize', { infer: true }),
          }),
          migrations: [
            Core30Compliance1735689600000,
            CoursePriceNullable1735689700000,
            EnrollmentColumnAlign1735689800000,
            RemoveSeededRows1735689900000,
            AuditLogColumns1735690000000,
            Core30Program1735690100000,
            CourseSlugReuse1735690200000,
            CoursePriceHistoryCascade1735690300000,
            CourseImageSyllabus1735690400000,
            CourseAfterPaymentEmail1735690500000,
            EmailCampaignHiddenAt1735690600000,
          ],
          migrationsRun: true,
          logging: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
