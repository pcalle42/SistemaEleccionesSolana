import type { Groth16Proof } from 'snarkjs';

export const ELECTION_MANIFEST_VERSION_V1 = 'election-manifest-v1' as const;
export const PUBLIC_VOTE_VERSION_V1 = 'public-accepted-vote-v1' as const;
export const VOTE_SET_VERSION_V1 = 'accepted-vote-set-v1' as const;
export const TALLY_VERSION_V1 = 'single-choice-tally-v1' as const;
export const TALLY_MANIFEST_VERSION_V1 = 'tally-manifest-v1' as const;
export const RESULT_SCHEMA_VERSION_V1 = 'election-result-v1' as const;
export const CHECKPOINT_VERSION_V1 = 'audit-checkpoint-v1' as const;
export const PACKAGE_VERSION_V1 = 'verification-package-v1' as const;
export const VERIFICATION_REPORT_VERSION_V1 = 'verification-report-v1' as const;
export const AUDIT_CHAIN_VERSION_V1 = 'audit-chain-v1' as const;

export interface ElectionManifestV1 {
  readonly artifactDigests: Readonly<Record<string, string>>;
  readonly circuitVersion: string;
  readonly closesAt: string;
  readonly commitmentSchemeVersion: string;
  readonly createdAt: string;
  readonly electionConfigurationVersion: number;
  readonly electionContext: string;
  readonly electionId: string;
  readonly eligibilitySnapshotVersion: number;
  readonly leafCount: number;
  readonly manifestVersion: typeof ELECTION_MANIFEST_VERSION_V1;
  readonly merkleRoot: string;
  readonly nullifierSchemeVersion: string;
  readonly opensAt: string;
  readonly optionEncoding: string;
  readonly options: readonly {
    readonly encoding: number;
    readonly id: string;
    readonly label: string;
  }[];
  readonly protocolVersion: string;
  readonly title: string;
  readonly treeDepth: number;
  readonly verificationKeyDigest: string;
  readonly voteEncodingVersion: string;
  readonly votingMethod: 'SINGLE_CHOICE';
}

export interface ElectionManifestEnvelopeV1 {
  readonly manifest: ElectionManifestV1;
  readonly manifestDigest: string;
}

export interface PublicAcceptedVoteV1 {
  readonly circuitVersion: string;
  readonly configurationVersion: number;
  readonly electionContext: string;
  readonly electionId: string;
  readonly merkleRoot: string;
  readonly nullifier: string;
  readonly proof: Groth16Proof;
  readonly proofDigest: string;
  readonly protocolVersion: string;
  readonly publicSignals: readonly string[];
  readonly publicSignalsDigest: string;
  readonly receiptCommitment: string;
  readonly recordVersion: typeof PUBLIC_VOTE_VERSION_V1;
  readonly voteEncoding: number;
}

export interface PublicReceiptV1 {
  readonly nullifier: string;
  readonly receiptCommitment: string;
  readonly receiptVersion: string;
}

export interface AcceptedVoteSetSnapshotV1 {
  readonly canonicalDigest: string;
  readonly configurationVersion: number;
  readonly electionId: string;
  readonly frozenAt: string;
  readonly protocolVersion: string;
  readonly recordCount: number;
  readonly snapshotVersion: typeof VOTE_SET_VERSION_V1;
}

export interface TallyManifestV1 {
  readonly acceptedVoteCount: number;
  readonly acceptedVoteSetDigest: string;
  readonly computedAt: string;
  readonly configurationVersion: number;
  readonly electionId: string;
  readonly invalidAcceptedVoteCount: 0;
  readonly manifestVersion: typeof TALLY_MANIFEST_VERSION_V1;
  readonly protocolVersion: string;
  readonly tallyVersion: typeof TALLY_VERSION_V1;
  readonly tallyDigest: string;
  readonly totalsByOption: readonly {
    readonly count: number;
    readonly encoding: number;
    readonly optionId: string;
  }[];
}

export interface ElectionResultV1 {
  readonly acceptedVoteSetDigest: string;
  readonly configurationVersion: number;
  readonly electionId: string;
  readonly previousResultDigest: string | null;
  readonly protocolVersion: string;
  readonly publicationDigest: string;
  readonly publishedAt: string;
  readonly resultContentDigest: string;
  readonly resultSchemaVersion: typeof RESULT_SCHEMA_VERSION_V1;
  readonly resultVersion: number;
  readonly tallyDigest: string;
  readonly totalAcceptedVotes: number;
  readonly totalsByOption: readonly {
    readonly count: number;
    readonly encoding: number;
    readonly label: string;
    readonly optionId: string;
  }[];
  readonly verificationPackageDigest: string;
}

export interface AuditCheckpointV1 {
  readonly checkpointVersion: typeof CHECKPOINT_VERSION_V1;
  readonly createdAt: string;
  readonly fromSequence: number;
  readonly headHash: string;
  readonly id: string;
  readonly streamId: string;
  readonly toSequence: number;
}

export interface PublicAuditEventV1 {
  readonly actorId: string | null;
  readonly actorType: 'ADMIN' | 'SYSTEM' | 'ANONYMOUS';
  readonly aggregateId: string | null;
  readonly aggregateType: string | null;
  readonly eventHash: string;
  readonly eventType: string;
  readonly eventVersion: 1;
  readonly occurredAt: string;
  readonly payload: unknown;
  readonly payloadDigest: string;
  readonly previousHash: string;
  readonly sequence: number;
  readonly streamId: string;
}

export interface VerificationPackageManifestV1 {
  readonly evidenceDigest: string;
  readonly electionId: string;
  readonly files: readonly {
    readonly logicalPath: string;
    readonly sha256: string;
    readonly size: number;
  }[];
  readonly packageContentDigest: string;
  readonly packageVersion: typeof PACKAGE_VERSION_V1;
  readonly resultVersion: number;
}

export interface VerificationReportV1 {
  readonly artifactsValid: boolean;
  readonly checkpointsValid: boolean;
  readonly errors: readonly string[];
  readonly manifestValid: boolean;
  readonly nullifiersUnique: boolean;
  readonly packageDigest: string;
  readonly packageContentDigest: string;
  readonly packageVersion: string;
  readonly proofsValid: boolean;
  readonly tallyValid: boolean;
  readonly resultValid: boolean;
  readonly valid: boolean;
  readonly verificationReportVersion: typeof VERIFICATION_REPORT_VERSION_V1;
  readonly voteSetDigestValid: boolean;
}
