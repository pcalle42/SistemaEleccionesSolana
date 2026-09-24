import { describe, expect, it, vi } from 'vitest';

import type { DatabaseLifecycleService } from '../database/database-lifecycle.service.js';
import type { ValkeyLifecycleService } from '../valkey/valkey-lifecycle.service.js';
import { HealthService } from './health.service.js';

function dependencies(
  options: { databaseFails?: boolean; valkey?: 'healthy' | 'degraded' | 'unavailable' } = {},
) {
  const database = {
    health: options.databaseFails
      ? vi.fn().mockRejectedValue(new Error('private SQL detail'))
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseLifecycleService;
  const valkey = {
    health: vi.fn().mockResolvedValue(options.valkey ?? 'healthy'),
  } as unknown as ValkeyLifecycleService;
  return { database, valkey };
}

describe('HealthService', () => {
  it('keeps liveness independent of dependencies', () => {
    const { database, valkey } = dependencies({ databaseFails: true, valkey: 'unavailable' });
    expect(new HealthService(database, valkey).live()).toEqual({ status: 'ok' });
  });

  it('reports ready when required dependencies are healthy', async () => {
    const { database, valkey } = dependencies();
    await expect(new HealthService(database, valkey).ready()).resolves.toEqual({
      dependencies: { postgresql: 'healthy', valkey: 'healthy' },
      status: 'ready',
    });
  });

  it('reports degradation when optional Valkey is unavailable', async () => {
    const { database, valkey } = dependencies({ valkey: 'unavailable' });
    await expect(new HealthService(database, valkey).ready()).resolves.toEqual({
      dependencies: { postgresql: 'healthy', valkey: 'unavailable' },
      status: 'degraded',
    });
  });

  it('fails readiness safely when PostgreSQL is unavailable', async () => {
    const { database, valkey } = dependencies({ databaseFails: true });
    await expect(new HealthService(database, valkey).ready()).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      publicMessage: 'A required dependency is unavailable.',
    });
  });
});
