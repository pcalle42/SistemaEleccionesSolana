import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { performance } from 'node:perf_hooks';

import { OperationalMetricsService } from '../observability/metrics.service.js';
import type { ValkeyModule } from './valkey.module.js';
import { VALKEY_RUNTIME } from './valkey.tokens.js';

export type ValkeyDependencyState = 'healthy' | 'degraded' | 'unavailable';

@Injectable()
export class ValkeyLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ValkeyLifecycleService.name);

  constructor(
    @Inject(VALKEY_RUNTIME) private readonly runtime: ValkeyModule,
    private readonly metrics: OperationalMetricsService = new OperationalMetricsService(),
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.runtime.service.connect();
    } catch {
      this.logger.warn({ event: 'valkey_startup_unavailable' }, 'Valkey is unavailable at startup');
    }
  }

  async health(): Promise<ValkeyDependencyState> {
    const startedAt = performance.now();
    try {
      await this.runtime.service.connect();
      await this.runtime.service.ping();
      this.metrics.recordValkeyHealth(performance.now() - startedAt, 'healthy');
      return 'healthy';
    } catch {
      this.metrics.recordValkeyHealth(performance.now() - startedAt, 'unavailable');
      return 'unavailable';
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.runtime.service.disconnect();
  }
}
