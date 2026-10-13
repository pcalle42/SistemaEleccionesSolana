import { Module } from '@nestjs/common';

import { SnarkJsVoteProofVerifier } from './infrastructure/snarkjs/snarkjs-vote-proof-verifier.js';
import { FileTrustedArtifactRegistry } from './infrastructure/snarkjs/trusted-artifact-registry.js';
import { TRUSTED_ARTIFACT_REGISTRY, VOTE_PROOF_VERIFIER } from './zk.tokens.js';
import { OperationalMetricsService } from '../../observability/metrics.service.js';

@Module({
  exports: [TRUSTED_ARTIFACT_REGISTRY, VOTE_PROOF_VERIFIER],
  providers: [
    { provide: TRUSTED_ARTIFACT_REGISTRY, useClass: FileTrustedArtifactRegistry },
    {
      inject: [TRUSTED_ARTIFACT_REGISTRY, OperationalMetricsService],
      provide: VOTE_PROOF_VERIFIER,
      useFactory: (registry: FileTrustedArtifactRegistry, metrics: OperationalMetricsService) =>
        new SnarkJsVoteProofVerifier(registry, metrics),
    },
  ],
})
export class ZkModule {}
