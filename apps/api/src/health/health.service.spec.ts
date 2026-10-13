import { describe, expect, it, vi } from 'vitest';

import type { DatabaseLifecycleService } from '../database/database-lifecycle.service.js';
import type { TrustedArtifactRegistry } from '../modules/zk/infrastructure/snarkjs/trusted-artifact-registry.js';
import type { ValkeyLifecycleService } from '../valkey/valkey-lifecycle.service.js';
import { HealthService } from './health.service.js';

function dependencies(
  options: {
    artifactsFail?: boolean;
    databaseFails?: boolean;
    valkey?: 'healthy' | 'degraded' | 'unavailable';
  } = {},
) {
  const database = {
    readiness: options.databaseFails
      ? vi.fn().mockRejectedValue(new Error('private SQL detail'))
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseLifecycleService;
  const valkey = {
    health: vi.fn().mockResolvedValue(options.valkey ?? 'healthy'),
  } as unknown as ValkeyLifecycleService;
  const artifacts = {
    get: options.artifactsFail
      ? vi.fn().mockRejectedValue(new Error('private artifact path'))
      : vi.fn().mockResolvedValue({}),
  } as unknown as TrustedArtifactRegistry;
  return { artifacts, database, valkey };
}

describe('HealthService', () => {
  it('keeps liveness independent of dependencies', () => {
    const { artifacts, database, valkey } = dependencies({
      databaseFails: true,
      valkey: 'unavailable',
    });
    expect(new HealthService(database, valkey, artifacts).live()).toEqual({ status: 'ok' });
  });

  it('reports ready when required dependencies are healthy', async () => {
    const { artifacts, database, valkey } = dependencies();
    await expect(new HealthService(database, valkey, artifacts).ready()).resolves.toEqual({
      dependencies: { postgresql: 'healthy', protocolArtifacts: 'healthy', valkey: 'healthy' },
      status: 'ready',
    });
  });

  it('reports degradation when optional Valkey is unavailable', async () => {
    const { artifacts, database, valkey } = dependencies({ valkey: 'unavailable' });
    await expect(new HealthService(database, valkey, artifacts).ready()).resolves.toEqual({
      dependencies: { postgresql: 'healthy', protocolArtifacts: 'healthy', valkey: 'unavailable' },
      status: 'degraded',
    });
  });

  it('fails readiness safely when PostgreSQL is unavailable', async () => {
    const { artifacts, database, valkey } = dependencies({ databaseFails: true });
    await expect(new HealthService(database, valkey, artifacts).ready()).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      publicMessage: 'A required dependency is unavailable.',
    });
  });

  it('fails readiness safely when trusted protocol artifacts are unavailable', async () => {
    const { artifacts, database, valkey } = dependencies({ artifactsFail: true });
    await expect(new HealthService(database, valkey, artifacts).ready()).rejects.toMatchObject({
      code: 'PROTOCOL_ARTIFACTS_UNAVAILABLE',
      publicMessage: 'A required dependency is unavailable.',
    });
  });
});
