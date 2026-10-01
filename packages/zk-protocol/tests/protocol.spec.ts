import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';

import {
  BN254_SCALAR_FIELD,
  buildMerkleTreeV1,
  deriveElectionContextV1,
  deriveIdentityCommitmentV1,
  deriveNullifierV1,
  DOMAIN_IDENTITY_COMMITMENT_V1,
  DOMAIN_LABELS_V1,
  mapPublicSignalsV1,
  verifyMerkleProofV1,
} from '../src/index.js';

const electionManifest = {
  protocolVersion: 'anonymous-single-choice-v1',
  circuitId: 'AnonymousSingleChoiceVoteV1',
  circuitVersion: '1.0.0',
  electionId: '018f47f2-a7e3-7f1c-8a55-40db41d61c34',
  configurationVersion: 3,
  commitmentSchemeVersion: 'poseidon-bn254-v1',
  nullifierSchemeVersion: 'poseidon-election-v1',
  voteEncodingVersion: 'single-choice-index-v1',
  treeDepth: 20,
  options: [
    { id: 'option-alpha', index: 0 },
    { id: 'option-beta', index: 1 },
  ],
} as const;

describe('anonymous-single-choice-v1 primitives', () => {
  it('freezes domain constants from documented SHA-256 labels', () => {
    const digest = sha256(utf8ToBytes(DOMAIN_LABELS_V1.identityCommitment));
    let value = 0n;
    for (const byte of digest) value = (value << 8n) | BigInt(byte);
    expect(value % BN254_SCALAR_FIELD).toBe(DOMAIN_IDENTITY_COMMITMENT_V1);
  });

  it('derives stable commitments and context-separated nullifiers', async () => {
    const secret = '1234567890123456789012345678901234567890';
    const commitment = await deriveIdentityCommitmentV1(secret);
    const context = deriveElectionContextV1(electionManifest);
    const same = await deriveNullifierV1(secret, context);
    expect(await deriveIdentityCommitmentV1(secret)).toBe(commitment);
    expect(await deriveNullifierV1(secret, context)).toBe(same);

    const otherContext = deriveElectionContextV1({
      ...electionManifest,
      configurationVersion: 4,
    });
    expect(otherContext).not.toBe(context);
    expect(await deriveNullifierV1(secret, otherContext)).not.toBe(same);
  });

  it('builds a deterministic sparse depth-20 tree and verifies membership', async () => {
    const leaves = await Promise.all(['101', '202', '303'].map(deriveIdentityCommitmentV1));
    const first = await buildMerkleTreeV1(leaves);
    const reordered = await buildMerkleTreeV1([...leaves].reverse());
    expect(first.root).toBe(reordered.root);
    expect(first.leaves).toEqual(reordered.leaves);
    expect(first.zeroValues).toHaveLength(21);

    const index = first.leaves.indexOf(leaves[1]!);
    const proof = first.proof(index);
    expect(await verifyMerkleProofV1(leaves[1]!, proof, first.root)).toBe(true);
    expect(await verifyMerkleProofV1(leaves[0]!, proof, first.root)).toBe(false);
    expect(
      await verifyMerkleProofV1(
        leaves[1]!,
        { ...proof, pathIndices: [2, ...proof.pathIndices.slice(1)] },
        first.root,
      ),
    ).toBe(false);
  });

  it('rejects ambiguous fields, duplicate leaves, and invalid public signal ranges', async () => {
    await expect(deriveIdentityCommitmentV1('0')).rejects.toMatchObject({
      code: 'INVALID_VOTER_SECRET',
    });
    await expect(buildMerkleTreeV1(['01'])).rejects.toMatchObject({
      code: 'INVALID_FIELD_ELEMENT',
    });
    await expect(buildMerkleTreeV1(['1', '1'])).rejects.toMatchObject({
      code: 'DUPLICATE_MERKLE_LEAF',
    });
    expect(() => mapPublicSignalsV1(['1', '2', '3', '2', '2'])).toThrowError(
      expect.objectContaining({ code: 'INVALID_PUBLIC_SIGNALS' }),
    );
  });
});
