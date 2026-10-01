import {
  buildMerkleTreeV1,
  CIRCUIT_ID_V1,
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  deriveElectionContextV1,
  deriveIdentityCommitmentV1,
  deriveNullifierV1,
  NULLIFIER_SCHEME_VERSION_V1,
  PROTOCOL_VERSION_V1,
  protocolArtifactLocationsV1,
  TREE_DEPTH_V1,
  VOTE_ENCODING_VERSION_V1,
} from '@votaciones/zk-protocol';
import { groth16, type Groth16Proof } from 'snarkjs';
import { beforeAll, describe, expect, it } from 'vitest';

import { SnarkJsVoteProofVerifier } from './infrastructure/snarkjs/snarkjs-vote-proof-verifier.js';
import { FileTrustedArtifactRegistry } from './infrastructure/snarkjs/trusted-artifact-registry.js';

let proof: Groth16Proof;
let publicSignals: string[];
let merkleRoot: string;
let electionContext: string;

const verifier = new SnarkJsVoteProofVerifier(new FileTrustedArtifactRegistry());

beforeAll(async () => {
  const secret = '987654321012345678909876543210123456789';
  const commitment = await deriveIdentityCommitmentV1(secret);
  const otherCommitment = await deriveIdentityCommitmentV1('7654321');
  const tree = await buildMerkleTreeV1([commitment, otherCommitment]);
  merkleRoot = tree.root;
  electionContext = deriveElectionContextV1({
    circuitId: CIRCUIT_ID_V1,
    circuitVersion: CIRCUIT_VERSION_V1,
    commitmentSchemeVersion: COMMITMENT_SCHEME_VERSION_V1,
    configurationVersion: 1,
    electionId: '018f47f2-a7e3-7f1c-8a55-40db41d61c34',
    nullifierSchemeVersion: NULLIFIER_SCHEME_VERSION_V1,
    options: [
      { id: 'option-a', index: 0 },
      { id: 'option-b', index: 1 },
    ],
    protocolVersion: PROTOCOL_VERSION_V1,
    treeDepth: TREE_DEPTH_V1,
    voteEncodingVersion: VOTE_ENCODING_VERSION_V1,
  });
  const artifacts = protocolArtifactLocationsV1();
  const membership = tree.proof(tree.leaves.indexOf(commitment));
  const result = await groth16.fullProve(
    {
      electionContext,
      merklePathElements: [...membership.pathElements],
      merklePathIndices: [...membership.pathIndices],
      merkleRoot,
      nullifier: await deriveNullifierV1(secret, electionContext),
      optionCount: 2,
      voteChoice: 1,
      voterSecret: secret,
    },
    artifacts.wasm.pathname,
    artifacts.zkey.pathname,
  );
  proof = result.proof;
  publicSignals = result.publicSignals.map(String);
}, 60_000);

describe('SnarkJsVoteProofVerifier', () => {
  it('verifies a proof only with trusted artifacts and typed public signals', async () => {
    await expect(
      verifier.verify(
        { proof, protocolVersion: PROTOCOL_VERSION_V1, publicSignals },
        { circuitVersion: CIRCUIT_VERSION_V1, electionContext, merkleRoot, optionCount: 2 },
      ),
    ).resolves.toMatchObject({
      circuitVersion: CIRCUIT_VERSION_V1,
      protocolVersion: PROTOCOL_VERSION_V1,
      publicSignals: { electionContext, merkleRoot, optionCount: 2, voteChoice: 1 },
    });
  });

  it('rejects unsupported versions and malformed payloads before cryptography', async () => {
    await expect(
      verifier.verify(
        { proof, protocolVersion: 'unknown', publicSignals },
        { circuitVersion: CIRCUIT_VERSION_V1, electionContext, merkleRoot, optionCount: 2 },
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PROTOCOL_VERSION' });
    await expect(
      verifier.verify(
        { proof: {}, protocolVersion: PROTOCOL_VERSION_V1, publicSignals },
        { circuitVersion: CIRCUIT_VERSION_V1, electionContext, merkleRoot, optionCount: 2 },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PROOF_FORMAT' });
    await expect(
      verifier.verify(
        { proof, protocolVersion: PROTOCOL_VERSION_V1, publicSignals },
        { circuitVersion: 'unknown', electionContext, merkleRoot, optionCount: 2 },
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PROTOCOL_VERSION' });
  });

  it('rejects root/context/encoding mismatches and reordered signals before verification', async () => {
    await expect(
      verifier.verify(
        { proof, protocolVersion: PROTOCOL_VERSION_V1, publicSignals },
        {
          circuitVersion: CIRCUIT_VERSION_V1,
          electionContext,
          merkleRoot: '1',
          optionCount: 2,
        },
      ),
    ).rejects.toMatchObject({ code: 'PROOF_ROOT_MISMATCH' });
    await expect(
      verifier.verify(
        { proof, protocolVersion: PROTOCOL_VERSION_V1, publicSignals },
        {
          circuitVersion: CIRCUIT_VERSION_V1,
          electionContext: '1',
          merkleRoot,
          optionCount: 2,
        },
      ),
    ).rejects.toMatchObject({ code: 'PROOF_ELECTION_CONTEXT_MISMATCH' });
    await expect(
      verifier.verify(
        { proof, protocolVersion: PROTOCOL_VERSION_V1, publicSignals },
        { circuitVersion: CIRCUIT_VERSION_V1, electionContext, merkleRoot, optionCount: 3 },
      ),
    ).rejects.toMatchObject({ code: 'PROOF_VOTE_ENCODING_INVALID' });
    await expect(
      verifier.verify(
        {
          proof,
          protocolVersion: PROTOCOL_VERSION_V1,
          publicSignals: [publicSignals[1], publicSignals[0], ...publicSignals.slice(2)],
        },
        { circuitVersion: CIRCUIT_VERSION_V1, electionContext, merkleRoot, optionCount: 2 },
      ),
    ).rejects.toMatchObject({ code: 'PROOF_ROOT_MISMATCH' });
  });

  it('rejects a cryptographically altered proof without leaking snarkjs internals', async () => {
    const altered = structuredClone(proof);
    altered.pi_c[0] = String(BigInt(altered.pi_c[0]!) + 1n);
    await expect(
      verifier.verify(
        { proof: altered, protocolVersion: PROTOCOL_VERSION_V1, publicSignals },
        { circuitVersion: CIRCUIT_VERSION_V1, electionContext, merkleRoot, optionCount: 2 },
      ),
    ).rejects.toMatchObject({
      code: 'PROOF_VERIFICATION_FAILED',
      message: 'Proof verification failed.',
    });
  });
});
