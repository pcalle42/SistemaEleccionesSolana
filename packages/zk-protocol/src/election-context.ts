import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

import {
  BN254_SCALAR_FIELD,
  CIRCUIT_ID_V1,
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  DOMAIN_ELECTION_CONTEXT_V1,
  DOMAIN_VOTE_ENCODING_V1,
  NULLIFIER_SCHEME_VERSION_V1,
  PROTOCOL_VERSION_V1,
  VOTE_ENCODING_VERSION_V1,
} from './constants.js';
import type { TREE_DEPTH_V1 } from './constants.js';
import { bigIntToBytes, bytesToBigInt, encodeFieldElement, ZkProtocolError } from './field.js';

export interface ElectionContextOptionV1 {
  readonly id: string;
  readonly index: number;
}

export interface ElectionContextManifestV1 {
  readonly circuitId: typeof CIRCUIT_ID_V1;
  readonly circuitVersion: typeof CIRCUIT_VERSION_V1;
  readonly commitmentSchemeVersion: typeof COMMITMENT_SCHEME_VERSION_V1;
  readonly configurationVersion: number;
  readonly electionId: string;
  readonly nullifierSchemeVersion: typeof NULLIFIER_SCHEME_VERSION_V1;
  readonly options: readonly ElectionContextOptionV1[];
  readonly protocolVersion: typeof PROTOCOL_VERSION_V1;
  readonly treeDepth: typeof TREE_DEPTH_V1;
  readonly voteEncodingVersion: typeof VOTE_ENCODING_VERSION_V1;
}

function encodeLengthPrefixed(value: string): Uint8Array {
  const normalized = value.normalize('NFC');
  if (normalized !== value || normalized.length === 0) {
    throw new ZkProtocolError(
      'INVALID_ELECTION_CONTEXT',
      'Context strings must be non-empty NFC strings.',
    );
  }
  const bytes = utf8ToBytes(value);
  if (bytes.length > 65_535) {
    throw new ZkProtocolError('INVALID_ELECTION_CONTEXT', 'Context string is too long.');
  }
  const output = new Uint8Array(bytes.length + 4);
  new DataView(output.buffer).setUint32(0, bytes.length, false);
  output.set(bytes, 4);
  return output;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function assertManifestV1(manifest: ElectionContextManifestV1): void {
  const fixedValues = [
    [manifest.protocolVersion, PROTOCOL_VERSION_V1],
    [manifest.circuitId, CIRCUIT_ID_V1],
    [manifest.circuitVersion, CIRCUIT_VERSION_V1],
    [manifest.commitmentSchemeVersion, COMMITMENT_SCHEME_VERSION_V1],
    [manifest.nullifierSchemeVersion, NULLIFIER_SCHEME_VERSION_V1],
    [manifest.voteEncodingVersion, VOTE_ENCODING_VERSION_V1],
  ] as const;
  if (fixedValues.some(([actual, expected]) => actual !== expected) || manifest.treeDepth !== 20) {
    throw new ZkProtocolError('INVALID_ELECTION_CONTEXT', 'Manifest uses unsupported V1 metadata.');
  }
  if (!Number.isSafeInteger(manifest.configurationVersion) || manifest.configurationVersion < 1) {
    throw new ZkProtocolError(
      'INVALID_ELECTION_CONTEXT',
      'configurationVersion must be a positive safe integer.',
    );
  }
  if (manifest.options.length < 2 || manifest.options.length > 0xffff_ffff) {
    throw new ZkProtocolError('INVALID_ELECTION_CONTEXT', 'V1 requires at least two options.');
  }
  const optionIds = new Set<string>();
  manifest.options.forEach((option, index) => {
    if (option.index !== index || optionIds.has(option.id)) {
      throw new ZkProtocolError(
        'INVALID_ELECTION_CONTEXT',
        'Options must have unique IDs and contiguous canonical indices.',
      );
    }
    encodeLengthPrefixed(option.id);
    optionIds.add(option.id);
  });
  encodeLengthPrefixed(manifest.electionId);
}

export function encodeElectionContextManifestV1(manifest: ElectionContextManifestV1): Uint8Array {
  assertManifestV1(manifest);
  return concat([
    bigIntToBytes(DOMAIN_ELECTION_CONTEXT_V1, 32),
    bigIntToBytes(DOMAIN_VOTE_ENCODING_V1, 32),
    encodeLengthPrefixed(manifest.protocolVersion),
    encodeLengthPrefixed(manifest.circuitId),
    encodeLengthPrefixed(manifest.circuitVersion),
    encodeLengthPrefixed(manifest.electionId),
    bigIntToBytes(BigInt(manifest.configurationVersion), 8),
    encodeLengthPrefixed(manifest.commitmentSchemeVersion),
    encodeLengthPrefixed(manifest.nullifierSchemeVersion),
    encodeLengthPrefixed(manifest.voteEncodingVersion),
    bigIntToBytes(BigInt(manifest.treeDepth), 4),
    bigIntToBytes(BigInt(manifest.options.length), 4),
    ...manifest.options.flatMap((option) => [
      bigIntToBytes(BigInt(option.index), 4),
      encodeLengthPrefixed(option.id),
    ]),
  ]);
}

export function deriveElectionContextV1(manifest: ElectionContextManifestV1): string {
  return encodeFieldElement(
    bytesToBigInt(sha256(encodeElectionContextManifestV1(manifest))) % BN254_SCALAR_FIELD,
  );
}
