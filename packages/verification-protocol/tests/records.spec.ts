import { describe, expect, it } from 'vitest';

import {
  acceptedVoteSetSnapshotV1,
  canonicalDigestV1,
  canonicalVoteJsonlV1,
  computeTallyV1,
  electionResultV1,
  ELECTION_MANIFEST_VERSION_V1,
  PUBLIC_VOTE_VERSION_V1,
  type ElectionManifestV1,
  type PublicAcceptedVoteV1,
} from '../src/index.js';

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
  leafCount: 2,
  manifestVersion: ELECTION_MANIFEST_VERSION_V1,
  merkleRoot: '2',
  nullifierSchemeVersion: 'poseidon-election-v1',
  opensAt: '2030-01-01T01:00:00.000Z',
  optionEncoding: 'zero-based-index',
  options: [
    { encoding: 0, id: '00000000-0000-4000-8000-000000000010', label: 'A' },
    { encoding: 1, id: '00000000-0000-4000-8000-000000000011', label: 'B' },
  ],
  protocolVersion: 'anonymous-single-choice-v1',
  title: 'Election',
  treeDepth: 20,
  verificationKeyDigest: 'a'.repeat(64),
  voteEncodingVersion: 'single-choice-index-v1',
  votingMethod: 'SINGLE_CHOICE',
};

function vote(nullifier: string, voteEncoding: number): PublicAcceptedVoteV1 {
  return {
    circuitVersion: manifest.circuitVersion,
    configurationVersion: 1,
    electionContext: manifest.electionContext,
    electionId: manifest.electionId,
    merkleRoot: manifest.merkleRoot,
    nullifier,
    proof: { pi_a: [], pi_b: [], pi_c: [], protocol: 'groth16', curve: 'bn128' },
    proofDigest: 'b'.repeat(64),
    protocolVersion: manifest.protocolVersion,
    publicSignals: ['2', nullifier, '3', String(voteEncoding), '2'],
    publicSignalsDigest: 'c'.repeat(64),
    receiptCommitment: 'd'.repeat(64),
    recordVersion: PUBLIC_VOTE_VERSION_V1,
    voteEncoding,
  };
}

describe('verification protocol records', () => {
  it('canonicalizes object keys and Unicode deterministically', () => {
    expect(canonicalDigestV1('domain', { a: 'é', b: 2 })).toBe(
      canonicalDigestV1('domain', { b: 2, a: 'e\u0301' }),
    );
  });

  it('orders votes by numeric nullifier and rejects duplicates', () => {
    const jsonl = canonicalVoteJsonlV1([vote('10', 1), vote('2', 0)]);
    expect(jsonl.indexOf('"nullifier":"2"')).toBeLessThan(jsonl.indexOf('"nullifier":"10"'));
    expect(() => canonicalVoteJsonlV1([vote('2', 0), vote('2', 1)])).toThrow(
      'Nullifiers must be unique',
    );
  });

  it('recomputes a tally only from the frozen canonical vote set', () => {
    const votes = [vote('2', 0), vote('10', 1), vote('11', 1)];
    const jsonl = canonicalVoteJsonlV1(votes);
    const snapshot = acceptedVoteSetSnapshotV1(
      manifest,
      jsonl,
      votes.length,
      '2030-01-01T03:00:00.000Z',
    );
    expect(computeTallyV1(manifest, snapshot, votes).totalsByOption).toEqual([
      { count: 1, encoding: 0, optionId: manifest.options[0]!.id },
      { count: 2, encoding: 1, optionId: manifest.options[1]!.id },
    ]);
  });

  it('includes every option for a zero-vote election', () => {
    const jsonl = canonicalVoteJsonlV1([]);
    const snapshot = acceptedVoteSetSnapshotV1(manifest, jsonl, 0, '2030-01-01T03:00:00.000Z');
    const tally = computeTallyV1(manifest, snapshot, []);
    expect(tally.acceptedVoteCount).toBe(0);
    expect(tally.totalsByOption.map(({ count }) => count)).toEqual([0, 0]);
    expect(tally.totalsByOption.reduce((sum, option) => sum + option.count, 0)).toBe(0);
  });

  it('is invariant to input permutation and produces stable tally/result digests', () => {
    const first = [vote('2', 0), vote('10', 1), vote('11', 1)];
    const second = [first[2]!, first[0]!, first[1]!];
    const jsonl = canonicalVoteJsonlV1(first);
    const snapshot = acceptedVoteSetSnapshotV1(
      manifest,
      jsonl,
      first.length,
      '2030-01-01T03:00:00.000Z',
    );
    const firstTally = computeTallyV1(manifest, snapshot, first);
    const secondTally = computeTallyV1(manifest, snapshot, second);
    expect(secondTally.tallyDigest).toBe(firstTally.tallyDigest);
    expect(
      electionResultV1({
        manifest,
        previousResultDigest: null,
        publishedAt: '2030-01-01T04:00:00.000Z',
        resultVersion: 1,
        tally: secondTally,
        verificationPackageDigest: 'e'.repeat(64),
      }).resultContentDigest,
    ).toBe(
      electionResultV1({
        manifest,
        previousResultDigest: null,
        publishedAt: '2030-01-01T04:00:00.000Z',
        resultVersion: 1,
        tally: firstTally,
        verificationPackageDigest: 'e'.repeat(64),
      }).resultContentDigest,
    );
  });

  it('rejects invalid accepted vote encodings and snapshot count mismatches', () => {
    const invalid = vote('12', 2);
    const jsonl = canonicalVoteJsonlV1([invalid]);
    const snapshot = acceptedVoteSetSnapshotV1(manifest, jsonl, 1, '2030-01-01T03:00:00.000Z');
    expect(() => computeTallyV1(manifest, snapshot, [invalid])).toThrow(
      'Vote encoding is not in manifest',
    );
    expect(() => computeTallyV1(manifest, { ...snapshot, recordCount: 2 }, [vote('2', 0)])).toThrow(
      'Vote count does not match snapshot',
    );
  });
});
