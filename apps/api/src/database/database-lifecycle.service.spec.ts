import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseLifecycleService } from './database-lifecycle.service.js';

function poolWithSchema(migrationVersion: string | null): pg.Pool {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ healthy: 1 }] })
      .mockResolvedValueOnce({ rows: [{ migrationVersion, ready: true }] }),
  } as unknown as pg.Pool;
}

describe('DatabaseLifecycleService release compatibility', () => {
  it('accepts the exact schema declared by this release', async () => {
    const pool = poolWithSchema('0011_release_schema_compatibility.sql');
    await expect(new DatabaseLifecycleService(pool).readiness()).resolves.toBeUndefined();
  });

  it('fails readiness when the database schema is incompatible', async () => {
    const pool = poolWithSchema('0010_youthful_triton.sql');
    await expect(new DatabaseLifecycleService(pool).readiness()).rejects.toThrow(
      'Database schema is incompatible with this release',
    );
  });
});
