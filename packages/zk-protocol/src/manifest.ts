import {
  CIRCUIT_ID_V1,
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  NULLIFIER_SCHEME_VERSION_V1,
  PROTOCOL_VERSION_V1,
  PUBLIC_SIGNAL_NAMES_V1,
  TREE_DEPTH_V1,
  VOTE_ENCODING_VERSION_V1,
} from './constants.js';
import { ZkProtocolError } from './field.js';

export interface ProtocolArtifactDigests {
  readonly powersOfTauSha256: string;
  readonly r1csSha256: string;
  readonly setupTranscriptSha256: string;
  readonly verificationKeySha256: string;
  readonly wasmSha256: string;
  readonly zkeySha256: string;
}

export interface ProtocolManifestV1 {
  readonly $schema: './protocol-manifest.schema.json';
  readonly artifactDigests: ProtocolArtifactDigests;
  readonly circuitId: typeof CIRCUIT_ID_V1;
  readonly circuitVersion: typeof CIRCUIT_VERSION_V1;
  readonly commitmentSchemeVersion: typeof COMMITMENT_SCHEME_VERSION_V1;
  readonly curve: 'bn128';
  readonly environment: 'DEVNET / NOT FOR PRODUCTION';
  readonly nullifierSchemeVersion: typeof NULLIFIER_SCHEME_VERSION_V1;
  readonly protocolVersion: typeof PROTOCOL_VERSION_V1;
  readonly provingSystem: 'groth16';
  readonly publicSignals: typeof PUBLIC_SIGNAL_NAMES_V1;
  readonly treeDepth: typeof TREE_DEPTH_V1;
  readonly voteEncodingVersion: typeof VOTE_ENCODING_VERSION_V1;
}

const SHA256_HEX = /^[a-f0-9]{64}$/u;

export function assertProtocolManifestV1(value: unknown): asserts value is ProtocolManifestV1 {
  if (typeof value !== 'object' || value === null) {
    throw new ZkProtocolError('INVALID_PROTOCOL_MANIFEST', 'Protocol manifest must be an object.');
  }
  const manifest = value as Partial<ProtocolManifestV1>;
  if (
    manifest.$schema !== './protocol-manifest.schema.json' ||
    manifest.protocolVersion !== PROTOCOL_VERSION_V1 ||
    manifest.circuitId !== CIRCUIT_ID_V1 ||
    manifest.circuitVersion !== CIRCUIT_VERSION_V1 ||
    manifest.provingSystem !== 'groth16' ||
    manifest.curve !== 'bn128' ||
    manifest.treeDepth !== TREE_DEPTH_V1 ||
    manifest.commitmentSchemeVersion !== COMMITMENT_SCHEME_VERSION_V1 ||
    manifest.nullifierSchemeVersion !== NULLIFIER_SCHEME_VERSION_V1 ||
    manifest.voteEncodingVersion !== VOTE_ENCODING_VERSION_V1 ||
    manifest.environment !== 'DEVNET / NOT FOR PRODUCTION' ||
    JSON.stringify(manifest.publicSignals) !== JSON.stringify(PUBLIC_SIGNAL_NAMES_V1)
  ) {
    throw new ZkProtocolError(
      'INVALID_PROTOCOL_MANIFEST',
      'Unsupported protocol manifest metadata.',
    );
  }
  const digests = manifest.artifactDigests;
  if (
    !digests ||
    !SHA256_HEX.test(digests.powersOfTauSha256) ||
    !SHA256_HEX.test(digests.r1csSha256) ||
    !SHA256_HEX.test(digests.setupTranscriptSha256) ||
    !SHA256_HEX.test(digests.verificationKeySha256) ||
    !SHA256_HEX.test(digests.wasmSha256) ||
    !SHA256_HEX.test(digests.zkeySha256)
  ) {
    throw new ZkProtocolError('INVALID_PROTOCOL_MANIFEST', 'Artifact digests are invalid.');
  }
}
