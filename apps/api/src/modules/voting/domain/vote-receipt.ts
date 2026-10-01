import { createHash } from 'node:crypto';

export const RECEIPT_VERSION_V1 = 'anonymous-vote-receipt-v1' as const;
export const PROOF_EVIDENCE_SCHEMA_V1 = 'groth16-proof-evidence-v1' as const;

export interface VoteReceiptV1 {
  readonly acceptedAt: Date;
  readonly electionId: string;
  readonly nullifier: string;
  readonly receiptCommitment: string;
  readonly receiptVersion: typeof RECEIPT_VERSION_V1;
}

export interface ReceiptMaterialV1 {
  readonly acceptedAt: Date;
  readonly configurationVersion: number;
  readonly electionId: string;
  readonly nullifier: string;
  readonly protocolVersion: string;
  readonly voteEncoding: number;
}

export interface SubmissionMaterialV1 {
  readonly electionContext: string;
  readonly merkleRoot: string;
  readonly nullifier: string;
  readonly protocolVersion: string;
  readonly voteEncoding: number;
}

function canonicalFrame(domain: string, fields: readonly string[]): Buffer {
  const parts: Buffer[] = [];
  for (const value of [domain, ...fields]) {
    const bytes = Buffer.from(value.normalize('NFC'), 'utf8');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    parts.push(length, bytes);
  }
  return Buffer.concat(parts);
}

function digest(domain: string, fields: readonly string[]): string {
  return createHash('sha256').update(canonicalFrame(domain, fields)).digest('hex');
}

export function submissionFingerprintV1(material: SubmissionMaterialV1): string {
  return digest('votaciones/submission-fingerprint/v1', [
    material.protocolVersion,
    material.electionContext,
    material.merkleRoot,
    material.nullifier,
    String(material.voteEncoding),
  ]);
}

export function createVoteReceiptV1(material: ReceiptMaterialV1): VoteReceiptV1 {
  if (!Number.isInteger(material.configurationVersion) || material.configurationVersion < 1) {
    throw new RangeError('configurationVersion must be a positive integer.');
  }
  if (!Number.isInteger(material.voteEncoding) || material.voteEncoding < 0) {
    throw new RangeError('voteEncoding must be a non-negative integer.');
  }
  if (!Number.isFinite(material.acceptedAt.getTime())) {
    throw new RangeError('acceptedAt must be valid.');
  }
  return {
    acceptedAt: new Date(material.acceptedAt),
    electionId: material.electionId,
    nullifier: material.nullifier,
    receiptCommitment: digest('votaciones/receipt/v1', [
      RECEIPT_VERSION_V1,
      material.electionId,
      String(material.configurationVersion),
      material.protocolVersion,
      material.nullifier,
      String(material.voteEncoding),
      material.acceptedAt.toISOString(),
    ]),
    receiptVersion: RECEIPT_VERSION_V1,
  };
}
