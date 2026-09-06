import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EnvTypes } from '../config/env.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvTypes, true>) => ({
        type: 'postgres',
        url: config.get('database.url', { infer: true }),
        autoLoadEntities: true,
        synchronize: config.get('nodeEnv', { infer: true }) !== 'production',
        logging: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
