import type { VoteAcceptanceContext, AcceptedVoteRecord } from '../../domain/accepted-vote.js';
import type { VoteReceiptV1 } from '../../domain/vote-receipt.js';

export interface AcceptVerifiedVote {
  readonly context: VoteAcceptanceContext;
  readonly nullifier: string;
  readonly proof: unknown;
  readonly publicSignals: readonly string[];
  readonly submissionFingerprint: string;
  readonly voteEncoding: number;
}

export interface VoteAcceptanceResult {
  readonly idempotentRetry: boolean;
  readonly receipt: VoteReceiptV1;
}

export interface VoteRepository {
  loadAcceptanceContext(electionId: string): Promise<VoteAcceptanceContext | null>;
  accept(command: AcceptVerifiedVote): Promise<VoteAcceptanceResult>;
  findByNullifier(
    electionId: string,
    protocolVersion: string,
    nullifier: string,
  ): Promise<AcceptedVoteRecord | null>;
}
