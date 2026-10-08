import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  acceptedVoteSetSnapshotV1,
  canonicalDigestV1,
  canonicalVoteJsonlV1,
  computeTallyV1,
  ELECTION_MANIFEST_VERSION_V1,
  PUBLIC_VOTE_VERSION_V1,
  type ElectionManifestV1,
  type PublicAcceptedVoteV1,
} from '../../packages/verification-protocol/src/index.js';
import {
  buildMerkleTreeV1,
  deriveIdentityCommitmentV1,
  verifyMerkleProofV1,
} from '../../packages/zk-protocol/src/index.js';

const optionIds = [
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
] as const;
const manifest: ElectionManifestV1 = {
  artifactDigests: { verificationKeySha256: 'a'.repeat(64) },
  circuitVersion: '1.0.0',
  closesAt: '2030-01-01T02:00:00.000Z',
  commitmentSchemeVersion: 'poseidon-bn254-v1',
  createdAt: '2030-01-01T00:00:00.000Z',
  electionConfigurationVersion: 1,
  electionContext: '3',
  electionId: '00000000-0000-4000-8000-000000000001',
  eligibilitySnapshotVersion: 1,
  leafCount: 3,
  manifestVersion: ELECTION_MANIFEST_VERSION_V1,
  merkleRoot: '2',
  nullifierSchemeVersion: 'poseidon-election-v1',
  opensAt: '2030-01-01T01:00:00.000Z',
  optionEncoding: 'zero-based-index',
  options: optionIds.map((id, encoding) => ({ encoding, id, label: `Option ${encoding}` })),
  protocolVersion: 'anonymous-single-choice-v1',
  title: 'Property election',
  treeDepth: 20,
  verificationKeyDigest: 'a'.repeat(64),
  voteEncodingVersion: 'single-choice-index-v1',
  votingMethod: 'SINGLE_CHOICE',
};

function vote(index: number, voteEncoding: number): PublicAcceptedVoteV1 {
  const nullifier = String(index + 1);
  return {
    circuitVersion: manifest.circuitVersion,
    configurationVersion: 1,
    electionContext: manifest.electionContext,
    electionId: manifest.electionId,
    merkleRoot: manifest.merkleRoot,
    nullifier,
    proof: { curve: 'bn128', pi_a: [], pi_b: [], pi_c: [], protocol: 'groth16' },
    proofDigest: 'b'.repeat(64),
    protocolVersion: manifest.protocolVersion,
    publicSignals: ['2', nullifier, '3', String(voteEncoding), '3'],
    publicSignalsDigest: 'c'.repeat(64),
    receiptCommitment: 'd'.repeat(64),
    recordVersion: PUBLIC_VOTE_VERSION_V1,
    voteEncoding,
  };
}

describe('electoral properties', () => {
  it('tally is total, non-negative and invariant to vote permutation', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 200 }), (choices) => {
        const votes = choices.map((choice, index) => vote(index, choice));
        const reversed = [...votes].reverse();
        const canonical = canonicalVoteJsonlV1(votes);
        const snapshot = acceptedVoteSetSnapshotV1(
          manifest,
          canonical,
          votes.length,
          '2030-01-01T03:00:00.000Z',
        );
        const first = computeTallyV1(manifest, snapshot, votes);
        const second = computeTallyV1(manifest, snapshot, reversed);

        expect(first.totalsByOption).toHaveLength(manifest.options.length);
        expect(first.totalsByOption.every(({ count }) => count >= 0)).toBe(true);
        expect(first.totalsByOption.reduce((sum, { count }) => sum + count, 0)).toBe(votes.length);
        expect(second.tallyDigest).toBe(first.tallyDigest);
      }),
      { numRuns: 100 },
    );
  });

  it('canonical object order is irrelevant while committed value changes alter the digest', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer(), (text, number) => {
        const first = canonicalDigestV1('property/domain/v1', { number, text });
        const reordered = canonicalDigestV1('property/domain/v1', { text, number });
        expect(reordered).toBe(first);
        expect(canonicalDigestV1('property/domain/v1', { number: number + 1, text })).not.toBe(
          first,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('Merkle roots and membership paths are deterministic and reject altered leaves', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 1, max: 1_000_000 }), {
          maxLength: 12,
          minLength: 1,
        }),
        async (secrets) => {
          const leaves = await Promise.all(
            secrets.map((secret) => deriveIdentityCommitmentV1(String(secret))),
          );
          const first = await buildMerkleTreeV1(leaves);
          const second = await buildMerkleTreeV1(leaves);
          expect(second.root).toBe(first.root);
          const proof = first.proof(0);
          const canonicalLeaf = first.leaves[0]!;
          expect(await verifyMerkleProofV1(canonicalLeaf, proof, first.root)).toBe(true);
          expect(
            await verifyMerkleProofV1(String(BigInt(canonicalLeaf) + 1n), proof, first.root),
          ).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });
});
