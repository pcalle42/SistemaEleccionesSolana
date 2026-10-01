import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  assertProtocolManifestV1,
  buildMerkleTreeV1,
  deriveElectionContextV1,
  deriveIdentityCommitmentV1,
  deriveNullifierV1,
  protocolArtifactLocationsV1,
} from '../src/index.js';

interface TestVector {
  readonly electionContext: string;
  readonly electionManifest: Parameters<typeof deriveElectionContextV1>[0];
  readonly identityCommitment: string;
  readonly leaves: readonly string[];
  readonly merkleRoot: string;
  readonly nullifier: string;
  readonly voterSecret: string;
  readonly zeroValues: readonly string[];
}

describe('shared V1 fixtures and manifest', () => {
  it('reproduces every cryptographic test-vector value', async () => {
    const vector = JSON.parse(
      await readFile(
        new URL('../test-vectors/anonymous-single-choice-v1.json', import.meta.url),
        'utf8',
      ),
    ) as TestVector;
    const tree = await buildMerkleTreeV1(vector.leaves);
    expect(await deriveIdentityCommitmentV1(vector.voterSecret)).toBe(vector.identityCommitment);
    expect(deriveElectionContextV1(vector.electionManifest)).toBe(vector.electionContext);
    expect(await deriveNullifierV1(vector.voterSecret, vector.electionContext)).toBe(
      vector.nullifier,
    );
    expect(tree.root).toBe(vector.merkleRoot);
    expect(tree.zeroValues).toEqual(vector.zeroValues);
  });

  it('loads a supported manifest with complete artifact digests', async () => {
    const locations = protocolArtifactLocationsV1();
    const manifest: unknown = JSON.parse(await readFile(locations.manifest, 'utf8'));
    expect(() => assertProtocolManifestV1(manifest)).not.toThrow();
  });
});
