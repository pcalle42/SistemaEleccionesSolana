import { Inject, Injectable } from '@nestjs/common';
import { CIRCUIT_VERSION_V1, PROTOCOL_VERSION_V1 } from '@votaciones/zk-protocol';

import { DependencyUnavailableError } from '../common/errors/application-error.js';
import { DatabaseLifecycleService } from '../database/database-lifecycle.service.js';
import { ValkeyLifecycleService } from '../valkey/valkey-lifecycle.service.js';
import type { TrustedArtifactRegistry } from '../modules/zk/infrastructure/snarkjs/trusted-artifact-registry.js';
import { TRUSTED_ARTIFACT_REGISTRY } from '../modules/zk/zk.tokens.js';
import type { LiveHealthResponseDto, ReadyHealthResponseDto } from './health.dto.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseLifecycleService,
    private readonly valkey: ValkeyLifecycleService,
    @Inject(TRUSTED_ARTIFACT_REGISTRY) private readonly artifacts: TrustedArtifactRegistry,
  ) {}

  live(): LiveHealthResponseDto {
    return { status: 'ok' };
  }

  async ready(): Promise<ReadyHealthResponseDto> {
    try {
      await this.database.readiness();
    } catch (error: unknown) {
      throw new DependencyUnavailableError(
        'DATABASE_UNAVAILABLE',
        'A required dependency is unavailable.',
        { cause: error },
      );
    }

    try {
      await this.artifacts.get(PROTOCOL_VERSION_V1, CIRCUIT_VERSION_V1);
    } catch (error: unknown) {
      throw new DependencyUnavailableError(
        'PROTOCOL_ARTIFACTS_UNAVAILABLE',
        'A required dependency is unavailable.',
        { cause: error },
      );
    }

    const valkey = await this.valkey.health();
    return {
      dependencies: { postgresql: 'healthy', protocolArtifacts: 'healthy', valkey },
      status: valkey === 'healthy' ? 'ready' : 'degraded',
    };
  }
}
