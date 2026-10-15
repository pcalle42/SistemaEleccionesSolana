import { Module } from '@nestjs/common';

import type { AppConfig } from '../../config/app-config.js';
import { APP_CONFIG } from '../../config/config.tokens.js';
import { OperationalMetricsService } from '../../observability/metrics.service.js';
import { SnarkJsVoteProofVerifier } from './infrastructure/snarkjs/snarkjs-vote-proof-verifier.js';
import { FileTrustedArtifactRegistry } from './infrastructure/snarkjs/trusted-artifact-registry.js';
import { TRUSTED_ARTIFACT_REGISTRY, VOTE_PROOF_VERIFIER } from './zk.tokens.js';

@Module({
  exports: [TRUSTED_ARTIFACT_REGISTRY, VOTE_PROOF_VERIFIER],
  providers: [
    {
      inject: [APP_CONFIG],
      provide: TRUSTED_ARTIFACT_REGISTRY,
      useFactory: (config: AppConfig) =>
        new FileTrustedArtifactRegistry(
          config.environment,
          config.deployment.protocolArtifactClassification,
        ),
    },
    {
      inject: [TRUSTED_ARTIFACT_REGISTRY, OperationalMetricsService],
      provide: VOTE_PROOF_VERIFIER,
      useFactory: (registry: FileTrustedArtifactRegistry, metrics: OperationalMetricsService) =>
        new SnarkJsVoteProofVerifier(registry, metrics),
    },
  ],
})
export class ZkModule {}
