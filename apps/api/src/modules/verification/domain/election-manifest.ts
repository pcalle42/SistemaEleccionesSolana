import { readFileSync } from 'node:fs';

import {
  assertProtocolManifestV1,
  protocolArtifactLocationsV1,
  type ProtocolManifestV1,
} from '@votaciones/zk-protocol';
import {
  ELECTION_MANIFEST_VERSION_V1,
  electionManifestEnvelopeV1,
  type ElectionManifestEnvelopeV1,
} from '@votaciones/verification-protocol';

import type { ElectionState } from '../../elections/domain/election.js';
import type { FrozenCryptographicConfigurationV1 } from '../../zk/application/election-context-v1.js';

export interface FrozenEligibilityForManifest {
  readonly leafCount: number;
  readonly merkleRoot: string;
  readonly treeDepth: number;
  readonly version: number;
}

let cachedProtocolManifest: ProtocolManifestV1 | undefined;

export function trustedProtocolManifestV1(): ProtocolManifestV1 {
  if (!cachedProtocolManifest) {
    const value: unknown = JSON.parse(readFileSync(protocolArtifactLocationsV1().manifest, 'utf8'));
    assertProtocolManifestV1(value);
    cachedProtocolManifest = value;
  }
  return cachedProtocolManifest;
}

export function buildElectionManifestV1(
  election: ElectionState,
  cryptographic: FrozenCryptographicConfigurationV1,
  eligibility: FrozenEligibilityForManifest,
  createdAt: Date,
): ElectionManifestEnvelopeV1 {
  const protocol = trustedProtocolManifestV1();
  if (
    eligibility.treeDepth !== cryptographic.treeDepth ||
    election.references.protocolVersion !== protocol.protocolVersion ||
    election.references.circuitVersion !== protocol.circuitVersion
  ) {
    throw new Error('ELECTION_MANIFEST_PROTOCOL_MISMATCH');
  }
  return electionManifestEnvelopeV1({
    artifactDigests: { ...protocol.artifactDigests },
    circuitVersion: protocol.circuitVersion,
    closesAt: election.closesAt.toISOString(),
    commitmentSchemeVersion: protocol.commitmentSchemeVersion,
    createdAt: createdAt.toISOString(),
    electionConfigurationVersion: election.configurationVersion,
    electionContext: cryptographic.electionContext,
    electionId: election.id,
    eligibilitySnapshotVersion: eligibility.version,
    leafCount: eligibility.leafCount,
    manifestVersion: ELECTION_MANIFEST_VERSION_V1,
    merkleRoot: eligibility.merkleRoot,
    nullifierSchemeVersion: protocol.nullifierSchemeVersion,
    opensAt: election.opensAt.toISOString(),
    optionEncoding: 'zero-based-index',
    options: election.options.map((option, encoding) => ({
      encoding,
      id: option.id,
      label: option.label,
    })),
    protocolVersion: protocol.protocolVersion,
    title: election.title,
    treeDepth: protocol.treeDepth,
    verificationKeyDigest: protocol.artifactDigests.verificationKeySha256,
    voteEncodingVersion: protocol.voteEncodingVersion,
    votingMethod: 'SINGLE_CHOICE',
  });
}
