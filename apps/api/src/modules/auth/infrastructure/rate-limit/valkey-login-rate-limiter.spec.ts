import { describe, expect, it } from 'vitest';

import { ValkeyKeyFactory, type ValkeyKey } from '../../../../valkey/key-factory.js';
import type { ValkeyService } from '../../../../valkey/valkey.service.js';
import { ValkeyLoginRateLimiter } from './valkey-login-rate-limiter.js';

describe('ValkeyLoginRateLimiter', () => {
  it('uses separated digests and limits before password verification', async () => {
    const keys: string[] = [];
    const counts = new Map<string, number>();
    const valkey = {
      incrementWithExpiry: (key: ValkeyKey, ttlSeconds: number) => {
        keys.push(key);
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return Promise.resolve({ count, ttlSeconds });
      },
    } as unknown as ValkeyService;
    const limiter = new ValkeyLoginRateLimiter(valkey, new ValkeyKeyFactory('test'), {
      networkMaximum: 1,
      userMaximum: 1,
      windowSeconds: 300,
    });

    await expect(limiter.consume('admin@example.test', '192.0.2.1')).resolves.toMatchObject({
      allowed: true,
    });
    await expect(limiter.consume('admin@example.test', '192.0.2.1')).resolves.toMatchObject({
      allowed: false,
    });
    expect(keys.join(' ')).not.toContain('admin@example.test');
    expect(keys.join(' ')).not.toContain('192.0.2.1');
    expect(new Set(keys.map((key) => key.split(':').at(-2))).size).toBe(2);
  });
});
