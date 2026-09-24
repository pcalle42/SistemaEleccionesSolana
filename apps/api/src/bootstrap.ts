import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { requestIdMiddleware } from './common/logging/request-id.js';
import type { AppConfig } from './config/app-config.js';
import { APP_CONFIG } from './config/config.tokens.js';
import { loadEnvironment } from './config/environment.js';
import { configureOpenApi } from './openapi/openapi.js';

export function configureApplication(app: NestExpressApplication, config: AppConfig): void {
  app.useSecurityHeaders({
    contentSecurityPolicy: config.openApi.enabled
      ? {
          directives: {
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
          },
        }
      : true,
  });
  app.use(requestIdMiddleware);
  app.enableCors({
    allowedHeaders: ['content-type', 'authorization', 'x-request-id'],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: [...config.http.corsOrigins],
  });
  app.useBodyParser('json', { limit: config.http.bodyLimitBytes, strict: true });
  app.useBodyParser('urlencoded', {
    extended: false,
    limit: config.http.bodyLimitBytes,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validateCustomDecorators: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(app.get(HttpAdapterHost)));
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { method: RequestMethod.GET, path: 'health/live' },
      { method: RequestMethod.GET, path: 'health/ready' },
    ],
  });
  app.enableShutdownHooks();
  configureOpenApi(app, config);
}

export async function createApplication(): Promise<NestExpressApplication> {
  loadEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(app.get(Logger));
  configureApplication(app, config);
  return app;
}

export async function listen(app: INestApplication, config: AppConfig): Promise<Server> {
  const server = (await app.listen(config.http.port, config.http.host)) as unknown as Server;
  server.requestTimeout = config.http.requestTimeoutMs;
  server.headersTimeout = Math.max(config.http.requestTimeoutMs + 1_000, 10_000);
  return server;
}
