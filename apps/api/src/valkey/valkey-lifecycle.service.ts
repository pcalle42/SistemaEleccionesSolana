import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';

import type { ValkeyModule } from './valkey.module.js';
import { VALKEY_RUNTIME } from './valkey.tokens.js';

export type ValkeyDependencyState = 'healthy' | 'degraded' | 'unavailable';

@Injectable()
export class ValkeyLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ValkeyLifecycleService.name);

  constructor(@Inject(VALKEY_RUNTIME) private readonly runtime: ValkeyModule) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.runtime.service.connect();
    } catch {
      this.logger.warn({ event: 'valkey_startup_unavailable' }, 'Valkey is unavailable at startup');
    }
  }

  async health(): Promise<ValkeyDependencyState> {
    try {
      await this.runtime.service.connect();
      await this.runtime.service.ping();
      return 'healthy';
    } catch {
      return 'unavailable';
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.runtime.service.disconnect();
  }
}
