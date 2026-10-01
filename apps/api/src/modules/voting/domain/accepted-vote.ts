import type { VoteReceiptV1 } from './vote-receipt.js';

export interface VoteAcceptanceContext {
  readonly circuitVersion: string;
  readonly closesAt: Date;
  readonly configurationVersion: number;
  readonly electionContext: string;
  readonly electionId: string;
  readonly merkleRoot: string;
  readonly observedAt: Date;
  readonly opensAt: Date;
  readonly optionCount: number;
  readonly protocolVersion: string;
  readonly status: string;
}

export interface AcceptedVoteRecord {
  readonly circuitVersion: string;
  readonly configurationVersion: number;
  readonly electionId: string;
  readonly id: string;
  readonly nullifier: string;
  readonly protocolVersion: string;
  readonly receipt: VoteReceiptV1;
  readonly submissionFingerprint: string;
  readonly voteEncoding: number;
}
