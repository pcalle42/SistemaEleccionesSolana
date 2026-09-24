import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApplication } from './bootstrap.js';
import { DATABASE_POOL } from './database/database.tokens.js';
import type { ValkeyService } from './valkey/valkey.service.js';
import { VALKEY_SERVICE } from './valkey/valkey.tokens.js';

describe('real NestJS infrastructure integration', () => {
  it('boots, reports readiness, and releases PostgreSQL and Valkey on shutdown', async () => {
    const app: NestExpressApplication = await createApplication();
    const pool = app.get<pg.Pool>(DATABASE_POOL);
    const valkey = app.get<ValkeyService>(VALKEY_SERVICE);

    await app.init();
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200, {
        dependencies: { postgresql: 'healthy', valkey: 'healthy' },
        status: 'ready',
      });

    await app.close();

    await expect(pool.query('SELECT 1')).rejects.toThrow('Cannot use a pool after calling end');
    await expect(valkey.ping()).rejects.toMatchObject({ name: 'ValkeyUnavailableError' });
  });
});
