import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

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
  TREE_DEPTH_V1,
  VOTE_ENCODING_VERSION_V1,
} from '../dist/src/index.js';

const voterSecret = '1234567890123456789012345678901234567890';
const otherSecrets = ['42', '3141592653589793238462643383279502884197'];
const identityCommitment = await deriveIdentityCommitmentV1(voterSecret);
const otherCommitments = await Promise.all(otherSecrets.map(deriveIdentityCommitmentV1));
const tree = await buildMerkleTreeV1([
  otherCommitments[1],
  identityCommitment,
  otherCommitments[0],
]);
const leafIndex = tree.leaves.indexOf(identityCommitment);
const path = tree.proof(leafIndex);
const electionManifest = {
  protocolVersion: PROTOCOL_VERSION_V1,
  circuitId: CIRCUIT_ID_V1,
  circuitVersion: CIRCUIT_VERSION_V1,
  electionId: '018f47f2-a7e3-7f1c-8a55-40db41d61c34',
  configurationVersion: 3,
  commitmentSchemeVersion: COMMITMENT_SCHEME_VERSION_V1,
  nullifierSchemeVersion: NULLIFIER_SCHEME_VERSION_V1,
  voteEncodingVersion: VOTE_ENCODING_VERSION_V1,
  treeDepth: TREE_DEPTH_V1,
  options: [
    { id: 'option-candidate-alpha', index: 0 },
    { id: 'option-candidate-beta', index: 1 },
    { id: 'option-blank', index: 2 },
  ],
};
const electionContext = deriveElectionContextV1(electionManifest);
const nullifier = await deriveNullifierV1(voterSecret, electionContext);

const vector = {
  warning: 'TEST FIXTURE ONLY — NEVER USE THIS SECRET IN PRODUCTION',
  voterSecret,
  identityCommitment,
  leaves: tree.leaves,
  zeroValues: tree.zeroValues,
  merkleRoot: tree.root,
  leafIndex,
  merklePathElements: path.pathElements,
  merklePathIndices: path.pathIndices,
  electionManifest,
  electionContext,
  nullifier,
  voteChoice: 1,
  optionCount: electionManifest.options.length,
};

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(packageDirectory, 'test-vectors'), { recursive: true });
await writeFile(
  join(packageDirectory, 'test-vectors', 'anonymous-single-choice-v1.json'),
  await format(JSON.stringify(vector), { parser: 'json', printWidth: 100 }),
);
