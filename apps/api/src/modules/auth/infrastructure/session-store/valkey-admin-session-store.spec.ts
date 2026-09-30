import { describe, expect, it } from 'vitest';

import { getAppConfig } from '../../../../config/app-config.js';
import { ValkeyKeyFactory, type ValkeyKey } from '../../../../valkey/key-factory.js';
import type { ValkeyService } from '../../../../valkey/valkey.service.js';
import { ValkeyAdminSessionStore } from './valkey-admin-session-store.js';

class MemoryValkey {
  readonly values = new Map<string, string>();

  delete(key: ValkeyKey): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }

  get(key: ValkeyKey): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  incrementWithExpiry(key: ValkeyKey): Promise<{ count: number; ttlSeconds: number }> {
    const count = Number(this.values.get(key) ?? '0') + 1;
    this.values.set(key, String(count));
    return Promise.resolve({ count, ttlSeconds: 600 });
  }

  setTemporary(key: ValkeyKey, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function fixture() {
  let now = 1_700_000_000_000;
  let sequence = 0;
  const valkey = new MemoryValkey();
  const config = getAppConfig({
    ADMIN_SESSION_ABSOLUTE_SECONDS: '300',
    ADMIN_SESSION_IDLE_SECONDS: '60',
    DATABASE_URL: 'postgresql://runtime:test@127.0.0.1:5432/test',
    VALKEY_HOST: '127.0.0.1',
    VOTACIONES_ENV: 'test',
  });
  const store = new ValkeyAdminSessionStore(
    valkey as unknown as ValkeyService,
    new ValkeyKeyFactory('test'),
    config.auth,
    {
      now: () => now,
      randomToken: () => `${String(++sequence).padStart(43, 'A')}`,
    },
  );
  return { advance: (milliseconds: number) => (now += milliseconds), store, valkey };
}

describe('ValkeyAdminSessionStore', () => {
  it('creates opaque sessions and binds CSRF tokens to one session', async () => {
    const { store } = fixture();
    const first = await store.create('admin-1');
    const second = await store.create('admin-1');

    expect(first.sessionToken).not.toContain('admin-1');
    await expect(store.resolve(first.sessionToken)).resolves.toEqual(first.principal);
    expect(store.verifyCsrf(first.sessionToken, first.csrfToken)).toBe(true);
    expect(store.verifyCsrf(first.sessionToken, second.csrfToken)).toBe(false);
  });

  it('enforces idle and absolute expiration server-side', async () => {
    const idle = fixture();
    const idleSession = await idle.store.create('admin-1');
    idle.advance(61_000);
    await expect(idle.store.resolve(idleSession.sessionToken)).resolves.toBeNull();

    const absolute = fixture();
    const absoluteSession = await absolute.store.create('admin-1');
    for (let step = 0; step < 5; step += 1) {
      absolute.advance(59_000);
      await expect(absolute.store.resolve(absoluteSession.sessionToken)).resolves.not.toBeNull();
    }
    absolute.advance(6_000);
    await expect(absolute.store.resolve(absoluteSession.sessionToken)).resolves.toBeNull();
  });

  it('revokes one session or all sessions immediately', async () => {
    const { store } = fixture();
    const first = await store.create('admin-1');
    await store.revoke(first.sessionToken);
    await expect(store.resolve(first.sessionToken)).resolves.toBeNull();

    const second = await store.create('admin-1');
    await store.revokeAll('admin-1');
    await expect(store.resolve(second.sessionToken)).resolves.toBeNull();
  });
});
