import { readFile } from 'node:fs/promises';

import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const schemaRoot = new URL('../../packages/verification-protocol/schemas/', import.meta.url);

async function validator(file: string): Promise<ValidateFunction> {
  const schema: unknown = JSON.parse(await readFile(new URL(file, schemaRoot), 'utf8'));
  const ajv = new Ajv2020({
    allErrors: true,
    formats: {
      'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    },
    strict: true,
  });
  return ajv.compile(schema);
}

const electionId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';
const digest = 'a'.repeat(64);
const timestamp = '2030-01-01T12:00:00.000Z';
const credential = {
  electionId,
  formatVersion: 'voter-credential-v1',
  identityCommitment: '2',
  protocolVersion: 'anonymous-single-choice-v1',
  voterSecret: '1',
};
const receipt = {
  acceptedAt: timestamp,
  electionId,
  nullifier: '3',
  receiptCommitment: digest,
  receiptVersion: 'anonymous-vote-receipt-v1',
};
const electionManifest = {
  artifactDigests: { wasmSha256: digest },
  circuitVersion: '1.0.0',
  closesAt: timestamp,
  commitmentSchemeVersion: 'poseidon-bn254-v1',
  createdAt: timestamp,
  electionConfigurationVersion: 1,
  electionContext: '3',
  electionId,
  eligibilitySnapshotVersion: 1,
  leafCount: 1,
  manifestVersion: 'election-manifest-v1',
  merkleRoot: '2',
  nullifierSchemeVersion: 'poseidon-election-v1',
  opensAt: timestamp,
  optionEncoding: 'zero-based-index',
  options: [
    { encoding: 0, id: optionId, label: 'A' },
    { encoding: 1, id: electionId, label: 'B' },
  ],
  protocolVersion: 'anonymous-single-choice-v1',
  title: 'Synthetic election',
  treeDepth: 20,
  verificationKeyDigest: digest,
  voteEncodingVersion: 'single-choice-index-v1',
  votingMethod: 'SINGLE_CHOICE',
};
const publicAcceptedVote = {
  circuitVersion: '1.0.0',
  configurationVersion: 1,
  electionContext: '3',
  electionId,
  merkleRoot: '2',
  nullifier: '4',
  proof: { curve: 'bn128', protocol: 'groth16' },
  proofDigest: digest,
  protocolVersion: 'anonymous-single-choice-v1',
  publicSignals: ['2', '3', '4', '0', '2'],
  publicSignalsDigest: digest,
  receiptCommitment: digest,
  recordVersion: 'public-accepted-vote-v1',
  voteEncoding: 0,
};
const totalsByOption = [{ count: 1, encoding: 0, optionId }];
const tallyManifest = {
  acceptedVoteCount: 1,
  acceptedVoteSetDigest: digest,
  computedAt: timestamp,
  configurationVersion: 1,
  electionId,
  invalidAcceptedVoteCount: 0,
  manifestVersion: 'tally-manifest-v1',
  protocolVersion: 'anonymous-single-choice-v1',
  tallyDigest: digest,
  tallyVersion: 'single-choice-tally-v1',
  totalsByOption,
};
const electionResult = {
  acceptedVoteSetDigest: digest,
  configurationVersion: 1,
  electionId,
  previousResultDigest: null,
  protocolVersion: 'anonymous-single-choice-v1',
  publicationDigest: digest,
  publishedAt: timestamp,
  resultContentDigest: digest,
  resultSchemaVersion: 'election-result-v1',
  resultVersion: 1,
  tallyDigest: digest,
  totalAcceptedVotes: 1,
  totalsByOption: [{ ...totalsByOption[0], label: 'A' }],
  verificationPackageDigest: digest,
};
const packageManifest = {
  electionId,
  evidenceDigest: digest,
  files: [{ logicalPath: 'manifest.json', sha256: digest, size: 123 }],
  packageContentDigest: digest,
  packageVersion: 'verification-package-v1',
  resultVersion: 1,
};
const auditCheckpoint = {
  checkpointVersion: 'audit-checkpoint-v1',
  createdAt: timestamp,
  fromSequence: 1,
  headHash: digest,
  id: optionId,
  streamId: `election:${electionId}`,
  toSequence: 2,
};

const objectContracts = [
  ['election-manifest-v1.schema.json', electionManifest, 'manifestVersion'],
  ['voter-credential-v1.schema.json', credential, 'formatVersion'],
  [
    'cast-vote-v1.schema.json',
    {
      proof: { curve: 'bn128', protocol: 'groth16' },
      protocolVersion: 'anonymous-single-choice-v1',
      publicSignals: ['2', '3', '4', '0', '2'],
    },
    'protocolVersion',
  ],
  ['vote-receipt-v1.schema.json', receipt, 'receiptVersion'],
  ['public-accepted-vote-v1.schema.json', publicAcceptedVote, 'recordVersion'],
  ['tally-manifest-v1.schema.json', tallyManifest, 'manifestVersion'],
  ['election-result-v1.schema.json', electionResult, 'resultSchemaVersion'],
  ['verification-package-manifest-v1.schema.json', packageManifest, 'packageVersion'],
  ['audit-checkpoint-v1.schema.json', auditCheckpoint, 'checkpointVersion'],
] as const;

describe('versioned public contracts', () => {
  it.each([
    ['election-manifest-v1.schema.json', electionManifest],
    ['voter-credential-v1.schema.json', credential],
    ['vote-public-signals-v1.schema.json', ['2', '3', '4', '0', '2']],
    [
      'cast-vote-v1.schema.json',
      {
        proof: { curve: 'bn128', protocol: 'groth16' },
        protocolVersion: 'anonymous-single-choice-v1',
        publicSignals: ['2', '3', '4', '0', '2'],
      },
    ],
    ['vote-receipt-v1.schema.json', receipt],
    ['public-accepted-vote-v1.schema.json', publicAcceptedVote],
    ['tally-manifest-v1.schema.json', tallyManifest],
    ['election-result-v1.schema.json', electionResult],
    ['verification-package-manifest-v1.schema.json', packageManifest],
    ['audit-checkpoint-v1.schema.json', auditCheckpoint],
  ])('accepts the supported fixture for %s', async (file, fixture) => {
    expect((await validator(file))(fixture)).toBe(true);
  });

  it.each([
    ['voter-credential-v1.schema.json', { ...credential, formatVersion: 'voter-credential-v2' }],
    ['vote-receipt-v1.schema.json', { ...receipt, receiptVersion: 'anonymous-vote-receipt-v2' }],
    [
      'cast-vote-v1.schema.json',
      {
        proof: { protocol: 'groth16' },
        protocolVersion: 'unknown-protocol',
        publicSignals: ['2', '3', '4', '0', '2'],
      },
    ],
  ])('rejects unknown versions for %s', async (file, fixture) => {
    expect((await validator(file))(fixture)).toBe(false);
  });

  it.each([
    ['voter-credential-v1.schema.json', { ...credential, adminSession: 'forbidden' }],
    ['vote-receipt-v1.schema.json', { ...receipt, voteEncoding: 1 }],
    [
      'cast-vote-v1.schema.json',
      {
        eligibleVoterId: electionId,
        proof: { protocol: 'groth16' },
        protocolVersion: 'anonymous-single-choice-v1',
        publicSignals: ['2', '3', '4', '0', '2'],
      },
    ],
  ])('rejects additional privacy-sensitive properties for %s', async (file, fixture) => {
    expect((await validator(file))(fixture)).toBe(false);
  });

  it.each(objectContracts)(
    'rejects an unknown version discriminator for %s',
    async (file, fixture, discriminator) => {
      expect((await validator(file))({ ...fixture, [discriminator]: 'unknown-version' })).toBe(
        false,
      );
    },
  );

  it.each(objectContracts)(
    'rejects additional properties for strict contract %s',
    async (file, fixture) => {
      expect((await validator(file))({ ...fixture, privateCanary: 'forbidden' })).toBe(false);
    },
  );
});
