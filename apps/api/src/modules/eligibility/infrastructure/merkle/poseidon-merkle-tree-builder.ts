import {
  buildMerkleTreeV1,
  COMMITMENT_SCHEME_VERSION_V1,
  ZkProtocolError,
} from '@votaciones/zk-protocol';

import type {
  MerkleArtifact,
  MerkleBuildInput,
  MerkleTreeBuilder,
} from '../../application/ports/merkle-tree-builder.port.js';
import { EligibilityDomainError } from '../../domain/eligibility-errors.js';

function translate(error: unknown): never {
  if (!(error instanceof ZkProtocolError)) throw error;
  const code =
    error.code === 'MERKLE_TREE_CAPACITY_EXCEEDED'
      ? 'ELIGIBILITY_SNAPSHOT_CAPACITY_EXCEEDED'
      : error.code === 'DUPLICATE_MERKLE_LEAF'
        ? 'ELIGIBILITY_SNAPSHOT_DUPLICATE_LEAF'
        : 'INVALID_IDENTITY_COMMITMENT';
  throw new EligibilityDomainError(code, error.message);
}

export class PoseidonMerkleTreeBuilder implements MerkleTreeBuilder {
  async build(input: MerkleBuildInput): Promise<MerkleArtifact> {
    this.assertScheme(input.schemeVersion);
    try {
      const tree = await buildMerkleTreeV1(input.identityCommitments);
      return {
        leafValues: tree.leaves,
        merkleRoot: tree.root,
        treeDepth: tree.depth,
      };
    } catch (error: unknown) {
      return translate(error);
    }
  }

  async verify(schemeVersion: string, artifact: MerkleArtifact): Promise<boolean> {
    this.assertScheme(schemeVersion);
    if (artifact.treeDepth !== 20) return false;
    try {
      const rebuilt = await buildMerkleTreeV1(artifact.leafValues);
      return (
        rebuilt.root === artifact.merkleRoot &&
        rebuilt.leaves.every((leaf, index) => leaf === artifact.leafValues[index])
      );
    } catch (error: unknown) {
      if (error instanceof ZkProtocolError) return false;
      throw error;
    }
  }

  private assertScheme(schemeVersion: string): void {
    if (schemeVersion !== COMMITMENT_SCHEME_VERSION_V1) {
      throw new EligibilityDomainError(
        'INVALID_IDENTITY_COMMITMENT',
        'Unsupported identity commitment scheme.',
      );
    }
  }
}
