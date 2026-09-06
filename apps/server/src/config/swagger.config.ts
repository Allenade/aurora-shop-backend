import { ErrorResponseDto } from '@app/shared';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// chowbea-axios/api is ESM; require works from Nest CJS (package >=2.6).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { busHandler, DEFAULT_API_ROUTE } = require('chowbea-axios/api');
import type { NextFunction, Request, Response } from 'express';
import type { EnvTypes } from '@app/shared';

export function setupSwagger(
  app: NestExpressApplication,
  configService: ConfigService<EnvTypes, true>,
) {
  const nodeEnv = configService.get('nodeEnv', { infer: true });
  if (nodeEnv !== 'development') {
    const username = configService.get('docs.username', { infer: true });
    const password = configService.get('docs.password', { infer: true });
    app.use(
      ['/docs', '/docs/swagger', '/docs/swagger/json'],
      (req: Request, res: Response, next: NextFunction) => {
        const header = req.headers.authorization ?? '';
        const encoded = Buffer.from(`${username}:${password}`).toString('base64');
        if (header === `Basic ${encoded}`) return next();
        res.setHeader('WWW-Authenticate', 'Basic realm="Aurora Shop API Docs"');
        res.status(401).send('Authentication required');
      },
    );
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Aurora Shop API')
    .setDescription('Bank-grade vault API for Aurora Stores. Tokens stay on the BFF.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [ErrorResponseDto],
  });

  SwaggerModule.setup('/docs/swagger', app, document, {
    jsonDocumentUrl: '/docs/swagger/json',
    swaggerOptions: { tagsSorter: 'alpha', operationsSorter: 'alpha' },
  });

  app.use(DEFAULT_API_ROUTE, busHandler());
}
