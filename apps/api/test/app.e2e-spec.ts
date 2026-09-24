import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/bootstrap.js';
import { getAppConfig } from '../src/config/app-config.js';
import { APP_CONFIG } from '../src/config/config.tokens.js';
import { DatabaseLifecycleService } from '../src/database/database-lifecycle.service.js';
import { createOpenApiDocument } from '../src/openapi/openapi.js';
import { ValkeyLifecycleService } from '../src/valkey/valkey-lifecycle.service.js';

class ValidationBodyDto {
  @IsString()
  @MaxLength(32)
  name!: string;
}

class UuidParameterDto {
  @IsUUID('4')
  id!: string;
}

@Controller('test/validation')
class ValidationTestController {
  @Post(':id')
  validate(
    @Param() parameters: UuidParameterDto,
    @Body() body: ValidationBodyDto,
  ): { id: string; name: string } {
    return { id: parameters.id, name: body.name };
  }
}

@Controller('test/error')
class ErrorTestController {
  @Get()
  fail(): never {
    throw new Error('SELECT private_column FROM voters; password=secret');
  }
}

const config = getAppConfig({
  DATABASE_URL: 'postgresql://runtime:not-logged@127.0.0.1:5432/test',
  HTTP_BODY_LIMIT_BYTES: '1024',
  HTTP_CORS_ORIGINS: 'http://localhost:3001',
  LOG_LEVEL: 'silent',
  OPENAPI_ENABLED: 'false',
  VALKEY_HOST: '127.0.0.1',
  VOTACIONES_ENV: 'test',
});

const database = {
  health: vi.fn().mockResolvedValue(undefined),
  onApplicationShutdown: vi.fn().mockResolvedValue(undefined),
};
const valkey = {
  health: vi.fn().mockResolvedValue('healthy'),
  onApplicationShutdown: vi.fn().mockResolvedValue(undefined),
  onModuleInit: vi.fn().mockResolvedValue(undefined),
};

function asSupertestServer(value: unknown): Parameters<typeof request>[0] {
  return value as Parameters<typeof request>[0];
}

describe('NestJS HTTP foundation', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ValidationTestController, ErrorTestController],
      imports: [AppModule],
    })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(DatabaseLifecycleService)
      .useValue(database)
      .overrideProvider(ValkeyLifecycleService)
      .useValue(valkey)
      .compile();

    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    app.useLogger(app.get(Logger));
    configureApplication(app as NestExpressApplication, config);
    await app.init();
    httpServer = asSupertestServer(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    expect(database.onApplicationShutdown).toHaveBeenCalledOnce();
    expect(valkey.onApplicationShutdown).toHaveBeenCalledOnce();
  });

  it('serves liveness outside the API prefix with security headers and request ID', async () => {
    const response = await request(httpServer)
      .get('/health/live')
      .set('x-request-id', 'client-request-123')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBe('client-request-123');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('reports readiness and explicit Valkey degradation', async () => {
    await request(httpServer)
      .get('/health/ready')
      .expect(200, {
        dependencies: { postgresql: 'healthy', valkey: 'healthy' },
        status: 'ready',
      });

    valkey.health.mockResolvedValueOnce('unavailable');
    await request(httpServer)
      .get('/health/ready')
      .expect(200, {
        dependencies: { postgresql: 'healthy', valkey: 'unavailable' },
        status: 'degraded',
      });
  });

  it('returns a safe 503 when PostgreSQL is unavailable', async () => {
    database.health.mockRejectedValueOnce(new Error('connection to private-host failed'));
    const response = await request(httpServer).get('/health/ready').expect(503);

    expect(response.body).toMatchObject({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'A required dependency is unavailable.',
      },
    });
    expect(response.text).not.toContain('private-host');
  });

  it('rejects unknown properties and invalid UUIDs', async () => {
    const validId = 'c5d42d9b-8509-4d9f-898f-a3b1f82f49fe';
    const unknown = await request(httpServer)
      .post(`/api/v1/test/validation/${validId}`)
      .send({ name: 'valid', unexpected: true })
      .expect(400);
    const invalidUuid = await request(httpServer)
      .post('/api/v1/test/validation/not-a-uuid')
      .send({ name: 'valid' })
      .expect(400);

    expect(unknown.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(invalidUuid.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('rejects malformed JSON and excessive payloads', async () => {
    const id = 'c5d42d9b-8509-4d9f-898f-a3b1f82f49fe';
    const malformed = await request(httpServer)
      .post(`/api/v1/test/validation/${id}`)
      .set('content-type', 'application/json')
      .send('{"name":')
      .expect(400);
    const excessive = await request(httpServer)
      .post(`/api/v1/test/validation/${id}`)
      .send({ name: 'x'.repeat(2_000) })
      .expect(413);

    expect(malformed.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(excessive.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('does not expose stack, SQL, or secrets from unexpected errors', async () => {
    const response = await request(httpServer).get('/api/v1/test/error').expect(500);
    expect(response.body).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(response.text).not.toContain('SELECT');
    expect(response.text).not.toContain('password');
    expect(response.text).not.toContain('stack');
  });

  it('enforces the explicit CORS allowlist', async () => {
    const allowed = await request(httpServer)
      .get('/health/live')
      .set('origin', 'http://localhost:3001')
      .expect(200);
    const denied = await request(httpServer)
      .get('/health/live')
      .set('origin', 'https://untrusted.example')
      .expect(200);

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('generates OpenAPI without exposing runtime configuration', () => {
    const document = createOpenApiDocument(app);
    const serialized = JSON.stringify(document);

    expect(document.paths['/health/live']).toBeDefined();
    expect(document.paths['/health/ready']).toBeDefined();
    expect(serialized).not.toContain('DATABASE_URL');
    expect(serialized).not.toContain('VALKEY_URL');
    expect(serialized).not.toContain('not-logged');
  });

  it('does not expose Swagger UI when disabled', async () => {
    await request(httpServer).get(`/${config.openApi.path}`).expect(404);
  });
});
