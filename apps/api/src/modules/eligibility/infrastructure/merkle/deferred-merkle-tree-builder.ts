import { EligibilityDomainError } from '../../domain/eligibility-errors.js';
import type {
  MerkleArtifact,
  MerkleBuildInput,
  MerkleTreeBuilder,
} from '../../application/ports/merkle-tree-builder.port.js';

/** Stage 10 replaces this adapter after fixing field, hash, encoding, depth, and zero values. */
export class DeferredMerkleTreeBuilder implements MerkleTreeBuilder {
  build(input: MerkleBuildInput): Promise<MerkleArtifact> {
    void input;
    return Promise.reject(this.unavailable());
  }

  verify(schemeVersion: string, artifact: MerkleArtifact): Promise<boolean> {
    void schemeVersion;
    void artifact;
    return Promise.reject(this.unavailable());
  }

  private unavailable(): EligibilityDomainError {
    return new EligibilityDomainError(
      'ELIGIBILITY_CRYPTOGRAPHY_NOT_CONFIGURED',
      'Merkle cryptography is not configured until stage 10.',
    );
  }
}
