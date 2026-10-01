import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assertProtocolManifestV1,
  deriveElectionContextV1,
  mapPublicSignalsV1,
  type ProtocolManifestV1,
} from '@votaciones/zk-protocol';
import { groth16 } from 'snarkjs';

import {
  canonicalDigestV1,
  canonicalJsonFileV1,
  canonicalizeV1,
  sha256Hex,
  type CanonicalValue,
} from './canonical.js';
import {
  assertElectionManifestV1,
  assertPublicAcceptedVoteV1,
  canonicalVoteJsonlV1,
  compareCanonicalNullifiers,
  computeTallyV1,
  electionManifestDigestV1,
  voteSetDigestV1,
} from './records.js';
import {
  PACKAGE_VERSION_V1,
  VERIFICATION_REPORT_VERSION_V1,
  type AcceptedVoteSetSnapshotV1,
  type AuditCheckpointV1,
  type ElectionManifestEnvelopeV1,
  type PublicAcceptedVoteV1,
  type PublicReceiptV1,
  type TallyManifestV1,
  type VerificationPackageManifestV1,
  type VerificationReportV1,
} from './types.js';

const REQUIRED_FILES = [
  'README.md',
  'accepted-vote-set.json',
  'accepted-votes.jsonl',
  'artifact-digests.json',
  'checkpoints.json',
  'election-manifest.json',
  'eligibility.json',
  'protocol-manifest.json',
  'receipts.jsonl',
  'tally.json',
  'verification_key.json',
] as const;
const SHA256 = /^[0-9a-f]{64}$/u;

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error: unknown) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function parseJsonl<T>(text: string, label: string): T[] {
  if (text === '') return [];
  if (!text.endsWith('\n')) throw new Error(`${label} must end with LF.`);
  return text
    .slice(0, -1)
    .split('\n')
    .map((line, index) => parseJson<T>(line, `${label} line ${index + 1}`));
}

function packageContentDigest(files: Readonly<Record<string, string>>): string {
  return canonicalDigestV1(
    'votaciones/verification-package-content/v1',
    Object.keys(files)
      .sort()
      .map((name) => ({ digest: files[name]!, name })),
  );
}

export async function verifyElectionPackage(directory: string): Promise<VerificationReportV1> {
  const errors: string[] = [];
  let manifestValid = false;
  let artifactsValid = false;
  let voteSetDigestValid = false;
  let proofsValid = false;
  let nullifiersUnique = false;
  let tallyValid = false;
  let checkpointsValid = false;
  let packageDigest = '';
  let packageContentDigestValue = '';
  let packageVersion = 'unknown';

  try {
    const packageBytes = await readFile(join(directory, 'package-manifest.json'));
    packageDigest = sha256Hex(packageBytes);
    const packageManifest = parseJson<VerificationPackageManifestV1>(
      packageBytes.toString('utf8'),
      'package-manifest.json',
    );
    packageVersion = packageManifest.packageVersion;
    packageContentDigestValue = packageManifest.contentDigest;
    if (packageManifest.packageVersion !== PACKAGE_VERSION_V1) {
      errors.push('UNSUPPORTED_PACKAGE_VERSION');
    }
    if (
      !REQUIRED_FILES.every(
        (name) =>
          typeof packageManifest.files[name] === 'string' &&
          SHA256.test(packageManifest.files[name]),
      ) ||
      packageManifest.contentDigest !== packageContentDigest(packageManifest.files)
    ) {
      errors.push('PACKAGE_MANIFEST_INVALID');
    }

    const contents = new Map<string, Buffer>();
    for (const name of REQUIRED_FILES) {
      try {
        const bytes = await readFile(join(directory, name));
        contents.set(name, bytes);
        if (sha256Hex(bytes) !== packageManifest.files[name]) {
          errors.push(`FILE_DIGEST_MISMATCH:${name}`);
        }
      } catch {
        errors.push(`VERIFICATION_ARTIFACT_MISSING:${name}`);
      }
    }
    if (errors.some((error) => error.startsWith('VERIFICATION_ARTIFACT_MISSING'))) {
      throw new Error('Required package files are missing.');
    }

    const envelope = parseJson<ElectionManifestEnvelopeV1>(
      contents.get('election-manifest.json')!.toString('utf8'),
      'election-manifest.json',
    );
    assertElectionManifestV1(envelope.manifest);
    if (
      envelope.manifestDigest !== electionManifestDigestV1(envelope.manifest) ||
      contents.get('election-manifest.json')!.toString('utf8') !==
        canonicalJsonFileV1(envelope as unknown as CanonicalValue)
    ) {
      errors.push('MANIFEST_DIGEST_MISMATCH');
    } else {
      manifestValid = true;
    }

    const protocolManifest = parseJson<ProtocolManifestV1>(
      contents.get('protocol-manifest.json')!.toString('utf8'),
      'protocol-manifest.json',
    );
    assertProtocolManifestV1(protocolManifest);
    const verificationKey: unknown = parseJson(
      contents.get('verification_key.json')!.toString('utf8'),
      'verification_key.json',
    );
    const artifactDigests = parseJson<Record<string, string>>(
      contents.get('artifact-digests.json')!.toString('utf8'),
      'artifact-digests.json',
    );
    const vkDigest = sha256Hex(contents.get('verification_key.json')!);
    if (
      vkDigest !== envelope.manifest.verificationKeyDigest ||
      vkDigest !== protocolManifest.artifactDigests.verificationKeySha256 ||
      canonicalizeV1(artifactDigests) !==
        canonicalizeV1(protocolManifest.artifactDigests as unknown as CanonicalValue)
    ) {
      errors.push('ARTIFACT_DIGEST_MISMATCH');
    } else {
      artifactsValid = true;
    }

    if (
      envelope.manifest.protocolVersion !== protocolManifest.protocolVersion ||
      envelope.manifest.circuitVersion !== protocolManifest.circuitVersion ||
      envelope.manifest.commitmentSchemeVersion !== protocolManifest.commitmentSchemeVersion ||
      envelope.manifest.nullifierSchemeVersion !== protocolManifest.nullifierSchemeVersion ||
      envelope.manifest.treeDepth !== protocolManifest.treeDepth ||
      envelope.manifest.voteEncodingVersion !== protocolManifest.voteEncodingVersion
    ) {
      errors.push('MANIFEST_PROTOCOL_BINDING_MISMATCH');
      manifestValid = false;
    }
    const derivedContext = deriveElectionContextV1({
      circuitId: protocolManifest.circuitId,
      circuitVersion: protocolManifest.circuitVersion,
      commitmentSchemeVersion: protocolManifest.commitmentSchemeVersion,
      configurationVersion: envelope.manifest.electionConfigurationVersion,
      electionId: envelope.manifest.electionId,
      nullifierSchemeVersion: protocolManifest.nullifierSchemeVersion,
      options: envelope.manifest.options.map((option) => ({
        id: option.id,
        index: option.encoding,
      })),
      protocolVersion: protocolManifest.protocolVersion,
      treeDepth: protocolManifest.treeDepth,
      voteEncodingVersion: protocolManifest.voteEncodingVersion,
    });
    if (derivedContext !== envelope.manifest.electionContext) {
      errors.push('ELECTION_CONTEXT_MISMATCH');
      manifestValid = false;
    }

    const eligibility = parseJson<{
      commitmentSchemeVersion: string;
      configurationVersion: number;
      electionId: string;
      leafCount: number;
      merkleRoot: string;
      snapshotVersion: number;
      treeDepth: number;
    }>(contents.get('eligibility.json')!.toString('utf8'), 'eligibility.json');
    if (
      eligibility.electionId !== envelope.manifest.electionId ||
      eligibility.configurationVersion !== envelope.manifest.electionConfigurationVersion ||
      eligibility.snapshotVersion !== envelope.manifest.eligibilitySnapshotVersion ||
      eligibility.commitmentSchemeVersion !== envelope.manifest.commitmentSchemeVersion ||
      eligibility.merkleRoot !== envelope.manifest.merkleRoot ||
      eligibility.leafCount !== envelope.manifest.leafCount ||
      eligibility.treeDepth !== envelope.manifest.treeDepth
    ) {
      errors.push('ELIGIBILITY_MANIFEST_BINDING_MISMATCH');
      manifestValid = false;
    }

    const voteText = contents.get('accepted-votes.jsonl')!.toString('utf8');
    const votes = parseJsonl<PublicAcceptedVoteV1>(voteText, 'accepted-votes.jsonl');
    votes.forEach(assertPublicAcceptedVoteV1);
    const canonicalVoteText = canonicalVoteJsonlV1(votes);
    if (canonicalVoteText !== voteText) errors.push('VOTE_RECORD_ORDER_OR_ENCODING_INVALID');
    const snapshot = parseJson<AcceptedVoteSetSnapshotV1>(
      contents.get('accepted-vote-set.json')!.toString('utf8'),
      'accepted-vote-set.json',
    );
    if (
      snapshot.canonicalDigest !== voteSetDigestV1(voteText) ||
      snapshot.recordCount !== votes.length ||
      snapshot.electionId !== envelope.manifest.electionId
    ) {
      errors.push('VOTE_SET_DIGEST_MISMATCH');
    } else {
      voteSetDigestValid = true;
    }

    const nullifiers = votes.map((vote) => vote.nullifier);
    nullifiersUnique = new Set(nullifiers).size === nullifiers.length;
    if (!nullifiersUnique) errors.push('DUPLICATE_NULLIFIER');
    if (
      votes.some(
        (vote) =>
          vote.electionId !== envelope.manifest.electionId ||
          vote.configurationVersion !== envelope.manifest.electionConfigurationVersion ||
          vote.protocolVersion !== envelope.manifest.protocolVersion ||
          vote.circuitVersion !== envelope.manifest.circuitVersion ||
          vote.electionContext !== envelope.manifest.electionContext ||
          vote.merkleRoot !== envelope.manifest.merkleRoot,
      )
    ) {
      errors.push('VOTE_MANIFEST_BINDING_MISMATCH');
    }

    proofsValid = true;
    for (const vote of votes) {
      const signals = mapPublicSignalsV1(vote.publicSignals);
      if (
        signals.nullifier !== vote.nullifier ||
        signals.voteChoice !== vote.voteEncoding ||
        signals.electionContext !== vote.electionContext ||
        signals.merkleRoot !== vote.merkleRoot ||
        canonicalDigestV1('votaciones/proof/v1', vote.proof as unknown as CanonicalValue) !==
          vote.proofDigest ||
        canonicalDigestV1('votaciones/public-signals/v1', vote.publicSignals) !==
          vote.publicSignalsDigest ||
        !(await groth16.verify(verificationKey, [...vote.publicSignals], vote.proof))
      ) {
        proofsValid = false;
        errors.push(`PROOF_VERIFICATION_FAILED:${vote.nullifier}`);
      }
    }

    const receiptsText = contents.get('receipts.jsonl')!.toString('utf8');
    const receipts = parseJsonl<PublicReceiptV1>(receiptsText, 'receipts.jsonl');
    const sortedReceipts = [...receipts].sort((left, right) =>
      compareCanonicalNullifiers(left.nullifier, right.nullifier),
    );
    if (
      receiptsText !==
        (sortedReceipts.length > 0
          ? `${sortedReceipts.map((item) => canonicalizeV1(item as unknown as CanonicalValue)).join('\n')}\n`
          : '') ||
      canonicalizeV1(
        receipts.map((item) => ({
          nullifier: item.nullifier,
          receiptCommitment: item.receiptCommitment,
        })),
      ) !==
        canonicalizeV1(
          votes.map((item) => ({
            nullifier: item.nullifier,
            receiptCommitment: item.receiptCommitment,
          })),
        )
    ) {
      errors.push('RECEIPT_SET_MISMATCH');
    }

    const tally = parseJson<TallyManifestV1>(
      contents.get('tally.json')!.toString('utf8'),
      'tally.json',
    );
    const expectedTally = computeTallyV1(envelope.manifest, snapshot, votes);
    tallyValid =
      canonicalizeV1(tally as unknown as CanonicalValue) ===
      canonicalizeV1(expectedTally as unknown as CanonicalValue);
    if (!tallyValid) errors.push('TALLY_MISMATCH');

    const checkpoints = parseJson<readonly AuditCheckpointV1[]>(
      contents.get('checkpoints.json')!.toString('utf8'),
      'checkpoints.json',
    );
    checkpointsValid =
      checkpoints.length > 0 &&
      checkpoints.every(
        (checkpoint) =>
          checkpoint.fromSequence > 0 &&
          checkpoint.toSequence >= checkpoint.fromSequence &&
          SHA256.test(checkpoint.headHash),
      );
    if (!checkpointsValid) errors.push('CHECKPOINT_INVALID');
  } catch (error: unknown) {
    errors.push(error instanceof Error ? `PACKAGE_INVALID:${error.message}` : 'PACKAGE_INVALID');
  }

  const uniqueErrors = [...new Set(errors)];
  return {
    artifactsValid,
    checkpointsValid,
    errors: uniqueErrors,
    manifestValid,
    nullifiersUnique,
    packageDigest,
    packageContentDigest: packageContentDigestValue,
    packageVersion,
    proofsValid,
    tallyValid,
    valid:
      uniqueErrors.length === 0 &&
      manifestValid &&
      artifactsValid &&
      voteSetDigestValid &&
      proofsValid &&
      nullifiersUnique &&
      tallyValid &&
      checkpointsValid,
    verificationReportVersion: VERIFICATION_REPORT_VERSION_V1,
    voteSetDigestValid,
  };
}

export function verificationPackageContentDigestV1(
  files: Readonly<Record<string, string>>,
): string {
  return packageContentDigest(files);
}
