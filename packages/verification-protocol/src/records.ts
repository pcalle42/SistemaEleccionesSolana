import { parseFieldElement } from '@votaciones/zk-protocol';

import {
  canonicalDigestV1,
  canonicalJsonLinesV1,
  type CanonicalValue,
  VerificationProtocolError,
} from './canonical.js';
import {
  ELECTION_MANIFEST_VERSION_V1,
  PUBLIC_VOTE_VERSION_V1,
  TALLY_VERSION_V1,
  VOTE_SET_VERSION_V1,
  type AcceptedVoteSetSnapshotV1,
  type ElectionManifestEnvelopeV1,
  type ElectionManifestV1,
  type PublicAcceptedVoteV1,
  type TallyManifestV1,
} from './types.js';

const SHA256 = /^[0-9a-f]{64}$/u;

export function electionManifestDigestV1(manifest: ElectionManifestV1): string {
  return canonicalDigestV1(
    'votaciones/election-manifest/v1',
    manifest as unknown as CanonicalValue,
  );
}

export function electionManifestEnvelopeV1(
  manifest: ElectionManifestV1,
): ElectionManifestEnvelopeV1 {
  assertElectionManifestV1(manifest);
  return { manifest, manifestDigest: electionManifestDigestV1(manifest) };
}

export function compareCanonicalNullifiers(left: string, right: string): number {
  const leftValue = parseFieldElement(left, 'nullifier');
  const rightValue = parseFieldElement(right, 'nullifier');
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function canonicalVoteJsonlV1(votes: readonly PublicAcceptedVoteV1[]): string {
  const sorted = [...votes].sort((left, right) =>
    compareCanonicalNullifiers(left.nullifier, right.nullifier),
  );
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]!.nullifier === sorted[index]!.nullifier) {
      throw new VerificationProtocolError('DUPLICATE_NULLIFIER', 'Nullifiers must be unique.');
    }
  }
  sorted.forEach(assertPublicAcceptedVoteV1);
  return canonicalJsonLinesV1(sorted as unknown as CanonicalValue[]);
}

export function voteSetDigestV1(jsonl: string): string {
  return canonicalDigestV1('votaciones/accepted-vote-set/v1', jsonl);
}

export function acceptedVoteSetSnapshotV1(
  manifest: ElectionManifestV1,
  jsonl: string,
  recordCount: number,
  frozenAt: string,
): AcceptedVoteSetSnapshotV1 {
  return {
    canonicalDigest: voteSetDigestV1(jsonl),
    configurationVersion: manifest.electionConfigurationVersion,
    electionId: manifest.electionId,
    frozenAt,
    protocolVersion: manifest.protocolVersion,
    recordCount,
    snapshotVersion: VOTE_SET_VERSION_V1,
  };
}

export function computeTallyV1(
  manifest: ElectionManifestV1,
  snapshot: AcceptedVoteSetSnapshotV1,
  votes: readonly PublicAcceptedVoteV1[],
): TallyManifestV1 {
  if (snapshot.recordCount !== votes.length) {
    throw new VerificationProtocolError('TALLY_MISMATCH', 'Vote count does not match snapshot.');
  }
  const counts = new Map(manifest.options.map((option) => [option.encoding, 0]));
  for (const vote of votes) {
    const current = counts.get(vote.voteEncoding);
    if (current === undefined) {
      throw new VerificationProtocolError('TALLY_MISMATCH', 'Vote encoding is not in manifest.');
    }
    counts.set(vote.voteEncoding, current + 1);
  }
  const totalsByOption = manifest.options.map((option) => ({
    count: counts.get(option.encoding) ?? 0,
    encoding: option.encoding,
    optionId: option.id,
  }));
  const total = totalsByOption.reduce((sum, option) => sum + option.count, 0);
  if (total !== votes.length) {
    throw new VerificationProtocolError('TALLY_MISMATCH', 'Tally sum invariant failed.');
  }
  return {
    acceptedVoteCount: votes.length,
    acceptedVoteSetDigest: snapshot.canonicalDigest,
    computedAt: snapshot.frozenAt,
    configurationVersion: manifest.electionConfigurationVersion,
    electionId: manifest.electionId,
    invalidAcceptedVoteCount: 0,
    protocolVersion: manifest.protocolVersion,
    tallyVersion: TALLY_VERSION_V1,
    totalsByOption,
  };
}

export function assertElectionManifestV1(value: unknown): asserts value is ElectionManifestV1 {
  const manifest = value as Partial<ElectionManifestV1> | null;
  if (
    !manifest ||
    manifest.manifestVersion !== ELECTION_MANIFEST_VERSION_V1 ||
    typeof manifest.electionId !== 'string' ||
    !Number.isInteger(manifest.electionConfigurationVersion) ||
    manifest.electionConfigurationVersion! < 1 ||
    typeof manifest.electionContext !== 'string' ||
    typeof manifest.merkleRoot !== 'string' ||
    !Array.isArray(manifest.options) ||
    manifest.options.length < 2 ||
    !SHA256.test(manifest.verificationKeyDigest ?? '')
  ) {
    throw new VerificationProtocolError('INVALID_MANIFEST', 'Election manifest is invalid.');
  }
}

export function assertPublicAcceptedVoteV1(value: unknown): asserts value is PublicAcceptedVoteV1 {
  const vote = value as Partial<PublicAcceptedVoteV1> | null;
  if (
    !vote ||
    vote.recordVersion !== PUBLIC_VOTE_VERSION_V1 ||
    typeof vote.electionId !== 'string' ||
    typeof vote.nullifier !== 'string' ||
    typeof vote.electionContext !== 'string' ||
    typeof vote.merkleRoot !== 'string' ||
    !Number.isInteger(vote.voteEncoding) ||
    vote.voteEncoding! < 0 ||
    !Array.isArray(vote.publicSignals) ||
    !SHA256.test(vote.proofDigest ?? '') ||
    !SHA256.test(vote.publicSignalsDigest ?? '') ||
    !SHA256.test(vote.receiptCommitment ?? '')
  ) {
    throw new VerificationProtocolError('INVALID_VOTE_RECORD', 'Public vote record is invalid.');
  }
  parseFieldElement(vote.nullifier, 'nullifier');
}
