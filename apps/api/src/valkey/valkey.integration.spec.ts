import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { VALKEY_TTL_SECONDS } from './valkey.constants.js';
import { checkValkeyHealth } from './valkey.health.js';
import { createValkeyModule } from './valkey.module.js';
import { ValkeyUnavailableError } from './valkey.service.js';

const valkey = createValkeyModule();

beforeAll(async () => {
  await valkey.service.connect();
});

afterAll(async () => {
  await valkey.service.disconnect();
});

describe('Valkey integration', () => {
  it('connects, responds to PING, and implements cache-aside', async () => {
    await checkValkeyHealth(valkey.service);
    const key = valkey.keys.testProbe(randomUUID());
    let loads = 0;

    try {
      await valkey.service.setTemporary(key, 'invalid-cache-shape', VALKEY_TTL_SECONDS.testProbe);
      const first = await valkey.service.getOrLoadString(
        key,
        VALKEY_TTL_SECONDS.testProbe,
        () => {
          loads += 1;
          return Promise.resolve('authoritative-value');
        },
        (value) => value === 'authoritative-value',
      );
      const second = await valkey.service.getOrLoadString(
        key,
        VALKEY_TTL_SECONDS.testProbe,
        () => {
          loads += 1;
          return Promise.resolve('unexpected');
        },
        (value) => value === 'authoritative-value',
      );

      expect(first).toEqual({
        degraded: false,
        source: 'authoritative',
        value: 'authoritative-value',
      });
      expect(second).toEqual({
        degraded: false,
        source: 'cache',
        value: 'authoritative-value',
      });
      expect(loads).toBe(1);
    } finally {
      await valkey.service.delete(key);
    }
  });

  it('applies TTL and expires temporary state', async () => {
    const key = valkey.keys.testProbe(randomUUID());
    await valkey.service.setTemporary(key, 'short-lived', 1);
    expect(await valkey.service.ttl(key)).toBeGreaterThan(0);

    await delay(1_200);
    expect(await valkey.service.get(key)).toBeNull();
  });

  it('uses atomic ownership and single-use consumption', async () => {
    const ownershipKey = valkey.keys.testProbe(randomUUID());
    const challengeKey = valkey.keys.temporaryChallenge(randomUUID());

    try {
      const owners = await Promise.all([
        valkey.service.setIfAbsent(ownershipKey, 'owner-a', VALKEY_TTL_SECONDS.testProbe),
        valkey.service.setIfAbsent(ownershipKey, 'owner-b', VALKEY_TTL_SECONDS.testProbe),
      ]);
      expect(owners.filter(Boolean)).toHaveLength(1);

      await valkey.service.setTemporary(
        challengeKey,
        'bound-context',
        VALKEY_TTL_SECONDS.temporaryChallenge,
      );
      const consumed = await Promise.all([
        valkey.service.consumeTemporary(challengeKey),
        valkey.service.consumeTemporary(challengeKey),
      ]);
      expect(consumed.filter((value) => value === 'bound-context')).toHaveLength(1);
      expect(consumed.filter((value) => value === null)).toHaveLength(1);
    } finally {
      await valkey.service.delete(ownershipKey);
      await valkey.service.delete(challengeKey);
    }
  });

  it('isolates namespaces for different environments', async () => {
    const identifier = randomUUID();
    const localKey = valkey.keys.testProbe(identifier);
    const isolated = createValkeyModule({
      VALKEY_HOST: valkey.config.host,
      VALKEY_PORT: String(valkey.config.port),
      VOTACIONES_ENV: 'test',
    });
    const testKey = isolated.keys.testProbe(identifier);

    try {
      await isolated.service.connect();
      await valkey.service.setTemporary(localKey, 'local', VALKEY_TTL_SECONDS.testProbe);
      await isolated.service.setTemporary(testKey, 'test', VALKEY_TTL_SECONDS.testProbe);
      expect(await valkey.service.get(localKey)).toBe('local');
      expect(await isolated.service.get(testKey)).toBe('test');
      expect(await valkey.service.get(testKey)).toBe('test');
      expect(testKey).not.toBe(localKey);
    } finally {
      await valkey.service.delete(localKey);
      await isolated.service.delete(testKey);
      await isolated.service.disconnect();
    }
  });

  it('falls back for cache and fails closed for required temporary state', async () => {
    const unavailable = createValkeyModule({
      VALKEY_COMMAND_TIMEOUT_MS: '100',
      VALKEY_CONNECT_TIMEOUT_MS: '100',
      VALKEY_HOST: '127.0.0.1',
      VALKEY_MAX_RECONNECT_ATTEMPTS: '0',
      VALKEY_PORT: '1',
      VOTACIONES_ENV: 'test',
    });
    const key = unavailable.keys.testProbe(randomUUID());

    try {
      await expect(unavailable.service.connect()).rejects.toBeInstanceOf(ValkeyUnavailableError);
      await expect(
        unavailable.service.getOrLoadString(
          key,
          VALKEY_TTL_SECONDS.testProbe,
          () => Promise.resolve('db'),
          (value) => value === 'db',
        ),
      ).resolves.toEqual({ degraded: true, source: 'authoritative', value: 'db' });
      await expect(
        unavailable.service.setTemporary(key, 'required', VALKEY_TTL_SECONDS.testProbe),
      ).rejects.toBeInstanceOf(ValkeyUnavailableError);
    } finally {
      await unavailable.service.disconnect();
    }
  });
});
