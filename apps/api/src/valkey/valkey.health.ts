import type { ValkeyService } from './valkey.service.js';

export async function checkValkeyHealth(service: ValkeyService): Promise<void> {
  await service.ping();
}
