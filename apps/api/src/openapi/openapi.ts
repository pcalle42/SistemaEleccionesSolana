import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import type { AppConfig } from '../config/app-config.js';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('Votaciones API')
    .setDescription('Technical API foundation for Votaciones.')
    .setVersion('1.0')
    .build();
  return SwaggerModule.createDocument(app, options);
}

export function configureOpenApi(app: INestApplication, config: AppConfig): void {
  if (!config.openApi.enabled) {
    return;
  }
  const document = createOpenApiDocument(app);
  SwaggerModule.setup(config.openApi.path, app, document, {
    jsonDocumentUrl: `${config.openApi.path}/openapi.json`,
  });
}
