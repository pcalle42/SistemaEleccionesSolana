import type { Redis } from 'ioredis';

import type { ValkeyKey } from './key-factory.js';
import type { ValkeyObserver } from './valkey.client.js';

export class ValkeyUnavailableError extends Error {
  constructor(operation: string, options?: ErrorOptions) {
    super(`Valkey is unavailable for ${operation}`, options);
    this.name = 'ValkeyUnavailableError';
  }
}

export interface CacheAsideResult {
  readonly degraded: boolean;
  readonly source: 'cache' | 'authoritative';
  readonly value: string;
}

function assertTtl(ttlSeconds: number): void {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError('TTL must be a positive integer number of seconds');
  }
}

export class ValkeyService {
  constructor(
    private readonly client: Redis,
    private readonly observer: ValkeyObserver = {},
  ) {}

  async connect(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.required('connect', () => this.client.connect());
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.status === 'ready') {
      try {
        await this.client.quit();
        return;
      } catch {
        this.client.disconnect();
        return;
      }
    }
    this.client.disconnect();
  }

  async ping(): Promise<void> {
    const response = await this.required('health', () => this.client.ping());
    if (response !== 'PONG') {
      throw new ValkeyUnavailableError('health');
    }
  }

  async get(key: ValkeyKey): Promise<string | null> {
    return this.required('get', () => this.client.get(key));
  }

  async setTemporary(key: ValkeyKey, value: string, ttlSeconds: number): Promise<void> {
    assertTtl(ttlSeconds);
    await this.required('set-temporary', () => this.client.set(key, value, 'EX', ttlSeconds));
  }

  async setIfAbsent(key: ValkeyKey, value: string, ttlSeconds: number): Promise<boolean> {
    assertTtl(ttlSeconds);
    const response = await this.required('set-if-absent', () =>
      this.client.set(key, value, 'EX', ttlSeconds, 'NX'),
    );
    return response === 'OK';
  }

  async consumeTemporary(key: ValkeyKey): Promise<string | null> {
    return this.required('consume-temporary', () => this.client.getdel(key));
  }

  async delete(key: ValkeyKey): Promise<void> {
    await this.required('delete', () => this.client.del(key));
  }

  async ttl(key: ValkeyKey): Promise<number> {
    return this.required('ttl', () => this.client.ttl(key));
  }

  async getOrLoadString(
    key: ValkeyKey,
    ttlSeconds: number,
    loadAuthoritative: () => Promise<string>,
    validateCached: (value: string) => boolean,
  ): Promise<CacheAsideResult> {
    assertTtl(ttlSeconds);
    try {
      const cached = await this.observe('cache-get', () => this.client.get(key));
      if (cached !== null && validateCached(cached)) {
        return { degraded: false, source: 'cache', value: cached };
      }
      if (cached !== null) {
        await this.observe('cache-delete-invalid', () => this.client.del(key));
      }
    } catch {
      const value = await loadAuthoritative();
      return { degraded: true, source: 'authoritative', value };
    }

    const value = await loadAuthoritative();
    try {
      await this.observe('cache-set', () => this.client.set(key, value, 'EX', ttlSeconds));
      return { degraded: false, source: 'authoritative', value };
    } catch {
      return { degraded: true, source: 'authoritative', value };
    }
  }

  private async required<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await this.observe(operation, action);
    } catch (error: unknown) {
      throw new ValkeyUnavailableError(operation, { cause: error });
    }
  }

  private async observe<T>(operation: string, action: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await action();
      this.observer.operation?.(operation, 'success', performance.now() - startedAt);
      return result;
    } catch (error: unknown) {
      this.observer.operation?.(operation, 'error', performance.now() - startedAt);
      throw error;
    }
  }
}
