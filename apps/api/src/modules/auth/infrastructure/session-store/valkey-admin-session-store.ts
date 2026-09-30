import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { AppConfig } from '../../../../config/app-config.js';
import type { ValkeyKeyFactory } from '../../../../valkey/key-factory.js';
import type { ValkeyService } from '../../../../valkey/valkey.service.js';
import type {
  AdminSessionStore,
  CreatedAdminSession,
} from '../../application/ports/admin-session-store.port.js';
import type { AdminPrincipal } from '../../domain/admin-principal.js';
import { securityDigest } from '../security-digest.js';

interface StoredAdminSession {
  readonly adminId: string;
  readonly createdAt: string;
  readonly generation: number;
  readonly lastSeenAt: string;
  readonly v: 1;
}

export interface AdminSessionStoreRuntime {
  readonly now?: () => number;
  readonly randomToken?: () => string;
}

function isStoredSession(value: unknown): value is StoredAdminSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record['v'] === 1 &&
    typeof record['adminId'] === 'string' &&
    typeof record['createdAt'] === 'string' &&
    Number.isSafeInteger(record['generation']) &&
    typeof record['lastSeenAt'] === 'string'
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export class ValkeyAdminSessionStore implements AdminSessionStore {
  readonly #absoluteSeconds: number;
  readonly #idleSeconds: number;
  readonly #now: () => number;
  readonly #randomToken: () => string;

  constructor(
    private readonly valkey: ValkeyService,
    private readonly keys: ValkeyKeyFactory,
    config: AppConfig['auth'],
    runtime: AdminSessionStoreRuntime = {},
  ) {
    this.#absoluteSeconds = config.sessionAbsoluteSeconds;
    this.#idleSeconds = config.sessionIdleSeconds;
    this.#now = runtime.now ?? Date.now;
    this.#randomToken = runtime.randomToken ?? (() => randomBytes(32).toString('base64url'));
  }

  async create(adminId: string): Promise<CreatedAdminSession> {
    const sessionToken = this.#randomToken();
    if (!this.#validToken(sessionToken)) {
      throw new Error('Session token generator returned an invalid token');
    }
    const authSessionId = securityDigest('admin-session', sessionToken);
    const generation = await this.#generation(adminId);
    const now = new Date(this.#now()).toISOString();
    const record: StoredAdminSession = {
      adminId,
      createdAt: now,
      generation,
      lastSeenAt: now,
      v: 1,
    };
    await this.valkey.setTemporary(
      this.keys.adminSession(authSessionId),
      JSON.stringify(record),
      this.#idleSeconds,
    );
    return {
      csrfToken: this.csrfToken(sessionToken),
      principal: { adminId, authSessionId },
      sessionToken,
    };
  }

  csrfToken(sessionToken: string): string {
    if (!this.#validToken(sessionToken)) {
      return '';
    }
    return createHmac('sha256', sessionToken)
      .update('votaciones:admin-csrf:v1', 'utf8')
      .digest('base64url');
  }

  async resolve(sessionToken: string): Promise<AdminPrincipal | null> {
    if (!this.#validToken(sessionToken)) {
      return null;
    }
    const authSessionId = securityDigest('admin-session', sessionToken);
    const key = this.keys.adminSession(authSessionId);
    const serialized = await this.valkey.get(key);
    if (serialized === null) {
      return null;
    }

    let record: unknown;
    try {
      record = JSON.parse(serialized) as unknown;
    } catch {
      await this.valkey.delete(key);
      return null;
    }
    if (!isStoredSession(record)) {
      await this.valkey.delete(key);
      return null;
    }

    const now = this.#now();
    const createdAt = Date.parse(record.createdAt);
    const lastSeenAt = Date.parse(record.lastSeenAt);
    const absoluteRemainingMs = createdAt + this.#absoluteSeconds * 1_000 - now;
    if (
      !Number.isFinite(createdAt) ||
      !Number.isFinite(lastSeenAt) ||
      absoluteRemainingMs <= 0 ||
      now - lastSeenAt > this.#idleSeconds * 1_000 ||
      record.generation !== (await this.#generation(record.adminId))
    ) {
      await this.valkey.delete(key);
      return null;
    }

    const ttlSeconds = Math.max(
      1,
      Math.min(this.#idleSeconds, Math.floor(absoluteRemainingMs / 1_000)),
    );
    await this.valkey.setTemporary(
      key,
      JSON.stringify({ ...record, lastSeenAt: new Date(now).toISOString() }),
      ttlSeconds,
    );
    return { adminId: record.adminId, authSessionId };
  }

  async revoke(sessionToken: string): Promise<void> {
    if (this.#validToken(sessionToken)) {
      await this.valkey.delete(
        this.keys.adminSession(securityDigest('admin-session', sessionToken)),
      );
    }
  }

  async revokeAll(adminId: string): Promise<void> {
    await this.valkey.incrementWithExpiry(
      this.keys.adminSessionGeneration(adminId),
      this.#absoluteSeconds * 2,
    );
  }

  verifyCsrf(sessionToken: string, csrfToken: string): boolean {
    const expected = this.csrfToken(sessionToken);
    return expected.length > 0 && safeEqual(expected, csrfToken);
  }

  async #generation(adminId: string): Promise<number> {
    const value = await this.valkey.get(this.keys.adminSessionGeneration(adminId));
    if (value === null) {
      return 0;
    }
    if (!/^\d+$/.test(value)) {
      throw new Error('Invalid administrator session generation');
    }
    const generation = Number(value);
    if (!Number.isSafeInteger(generation)) {
      throw new Error('Invalid administrator session generation');
    }
    return generation;
  }

  #validToken(value: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/.test(value);
  }
}
