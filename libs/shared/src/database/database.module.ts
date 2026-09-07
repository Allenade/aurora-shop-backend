import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EnvTypes } from '../config/env.config';

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
          synchronize: config.get('nodeEnv', { infer: true }) !== 'production',
          logging: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
