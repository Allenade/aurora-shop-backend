import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { EnvTypes } from '@app/shared';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { setupSwagger } from './config/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
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

  const configService = app.get(ConfigService<EnvTypes, true>);
  app.enableCors({
    origin: configService.get('frontend.allowedOrigins', { infer: true }),
    credentials: true,
  });
  setupSwagger(app, configService);
  app.enableShutdownHooks();

  const port = configService.get('port', { infer: true });
  await app.listen(port);
  console.log(`Aurora Shop API listening on ${port}`);
}

void bootstrap();
