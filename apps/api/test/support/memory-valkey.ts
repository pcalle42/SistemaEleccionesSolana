import type { ValkeyKey } from '../../src/valkey/key-factory.js';
import type { IncrementResult, ValkeyService } from '../../src/valkey/valkey.service.js';

export class MemoryValkey {
  fail = false;
  readonly values = new Map<string, string>();

  asService(): ValkeyService {
    return this as unknown as ValkeyService;
  }

  delete(key: ValkeyKey): Promise<void> {
    this.assertAvailable();
    this.values.delete(key);
    return Promise.resolve();
  }

  get(key: ValkeyKey): Promise<string | null> {
    this.assertAvailable();
    return Promise.resolve(this.values.get(key) ?? null);
  }

  incrementWithExpiry(key: ValkeyKey, ttlSeconds: number): Promise<IncrementResult> {
    this.assertAvailable();
    const count = Number(this.values.get(key) ?? '0') + 1;
    this.values.set(key, String(count));
    return Promise.resolve({ count, ttlSeconds });
  }

  setTemporary(key: ValkeyKey, value: string): Promise<void> {
    this.assertAvailable();
    this.values.set(key, value);
    return Promise.resolve();
  }

  private assertAvailable(): void {
    if (this.fail) {
      throw new Error('private Valkey endpoint unavailable');
    }
  }
}
