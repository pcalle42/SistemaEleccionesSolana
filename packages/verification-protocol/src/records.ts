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
  RESULT_SCHEMA_VERSION_V1,
  TALLY_MANIFEST_VERSION_V1,
  TALLY_VERSION_V1,
  VOTE_SET_VERSION_V1,
  type AcceptedVoteSetSnapshotV1,
  type ElectionManifestEnvelopeV1,
  type ElectionManifestV1,
  type ElectionResultV1,
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
  if (
    snapshot.electionId !== manifest.electionId ||
    snapshot.configurationVersion !== manifest.electionConfigurationVersion ||
    snapshot.protocolVersion !== manifest.protocolVersion
  ) {
    throw new VerificationProtocolError(
      'TALLY_MISMATCH',
      'Vote set snapshot does not match the election manifest.',
    );
  }
  if (snapshot.recordCount !== votes.length) {
    throw new VerificationProtocolError('TALLY_MISMATCH', 'Vote count does not match snapshot.');
  }
  const canonicalVotes = canonicalVoteJsonlV1(votes);
  if (voteSetDigestV1(canonicalVotes) !== snapshot.canonicalDigest) {
    throw new VerificationProtocolError(
      'TALLY_MISMATCH',
      'Vote set digest does not match snapshot.',
    );
  }
  const counts = new Map(manifest.options.map((option) => [option.encoding, 0]));
  for (const vote of votes) {
    if (
      vote.electionId !== manifest.electionId ||
      vote.configurationVersion !== manifest.electionConfigurationVersion ||
      vote.protocolVersion !== manifest.protocolVersion ||
      vote.circuitVersion !== manifest.circuitVersion ||
      vote.electionContext !== manifest.electionContext ||
      vote.merkleRoot !== manifest.merkleRoot
    ) {
      throw new VerificationProtocolError(
        'INVALID_ACCEPTED_VOTE',
        'Accepted vote does not match the frozen manifest.',
      );
    }
    const current = counts.get(vote.voteEncoding);
    if (current === undefined) {
      throw new VerificationProtocolError(
        'INVALID_ACCEPTED_VOTE',
        'Vote encoding is not in manifest.',
      );
    }
    if (!Number.isSafeInteger(current + 1)) {
      throw new VerificationProtocolError(
        'TALLY_MISMATCH',
        'Vote count exceeds safe integer range.',
      );
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
  const content = {
    acceptedVoteCount: votes.length,
    acceptedVoteSetDigest: snapshot.canonicalDigest,
    configurationVersion: manifest.electionConfigurationVersion,
    electionId: manifest.electionId,
    invalidAcceptedVoteCount: 0,
    manifestVersion: TALLY_MANIFEST_VERSION_V1,
    protocolVersion: manifest.protocolVersion,
    tallyVersion: TALLY_VERSION_V1,
    totalsByOption,
  } as const;
  return {
    ...content,
    computedAt: snapshot.frozenAt,
    tallyDigest: canonicalDigestV1('votaciones/tally-content/v1', content),
  };
}

export function electionResultV1(input: {
  readonly manifest: ElectionManifestV1;
  readonly previousResultDigest: string | null;
  readonly publishedAt: string;
  readonly resultVersion: number;
  readonly tally: TallyManifestV1;
  readonly verificationPackageDigest: string;
}): ElectionResultV1 {
  if (!Number.isInteger(input.resultVersion) || input.resultVersion < 1) {
    throw new VerificationProtocolError('INVALID_RESULT_VERSION', 'Result version is invalid.');
  }
  const totalsByOption = input.manifest.options.map((option) => {
    const total = input.tally.totalsByOption.find((item) => item.encoding === option.encoding);
    if (!total || total.optionId !== option.id) {
      throw new VerificationProtocolError('TALLY_MISMATCH', 'Tally option mapping is invalid.');
    }
    return { ...total, label: option.label };
  });
  const content = {
    acceptedVoteSetDigest: input.tally.acceptedVoteSetDigest,
    configurationVersion: input.manifest.electionConfigurationVersion,
    electionId: input.manifest.electionId,
    protocolVersion: input.manifest.protocolVersion,
    resultSchemaVersion: RESULT_SCHEMA_VERSION_V1,
    resultVersion: input.resultVersion,
    tallyDigest: input.tally.tallyDigest,
    totalAcceptedVotes: input.tally.acceptedVoteCount,
    totalsByOption,
  } as const;
  const resultContentDigest = canonicalDigestV1('votaciones/result-content/v1', content);
  const publication = {
    previousResultDigest: input.previousResultDigest,
    publishedAt: input.publishedAt,
    resultContentDigest,
    resultVersion: input.resultVersion,
    verificationPackageDigest: input.verificationPackageDigest,
  } as const;
  return {
    ...content,
    previousResultDigest: input.previousResultDigest,
    publicationDigest: canonicalDigestV1('votaciones/result-publication/v1', publication),
    publishedAt: input.publishedAt,
    resultContentDigest,
    verificationPackageDigest: input.verificationPackageDigest,
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
