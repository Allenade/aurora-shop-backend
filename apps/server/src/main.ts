import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { EnvTypes } from '@app/shared';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { setupSwagger } from './config/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  const configService = app.get(ConfigService<EnvTypes, true>);
  app.set('trust proxy', configService.get('trustProxyHops', { infer: true }));
  app.useLogger(app.get(Logger));
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: configService.get('frontend.allowedOrigins', { infer: true }),
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Forwarded-For',
    ],
    exposedHeaders: ['X-Request-Id'],
  });
  setupSwagger(app, configService);
  app.enableShutdownHooks();

  const port = configService.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  console.log(`Aurora Shop API listening on ${port}`);
}

void bootstrap();
