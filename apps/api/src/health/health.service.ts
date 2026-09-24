import { Injectable } from '@nestjs/common';

import { DependencyUnavailableError } from '../common/errors/application-error.js';
import { DatabaseLifecycleService } from '../database/database-lifecycle.service.js';
import { ValkeyLifecycleService } from '../valkey/valkey-lifecycle.service.js';
import type { LiveHealthResponseDto, ReadyHealthResponseDto } from './health.dto.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseLifecycleService,
    private readonly valkey: ValkeyLifecycleService,
  ) {}

  live(): LiveHealthResponseDto {
    return { status: 'ok' };
  }

  async ready(): Promise<ReadyHealthResponseDto> {
    try {
      await this.database.health();
    } catch (error: unknown) {
      throw new DependencyUnavailableError(
        'DATABASE_UNAVAILABLE',
        'A required dependency is unavailable.',
        { cause: error },
      );
    }

    const valkey = await this.valkey.health();
    return {
      dependencies: { postgresql: 'healthy', valkey },
      status: valkey === 'healthy' ? 'ready' : 'degraded',
    };
  }
}
