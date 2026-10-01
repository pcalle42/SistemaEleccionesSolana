import type { VotePublicSignalsV1 } from '@votaciones/zk-protocol';

export interface VoteProofPayload {
  readonly proof: unknown;
  readonly protocolVersion: string;
  readonly publicSignals: unknown;
}

export interface VoteProofExpectation {
  readonly circuitVersion: string;
  readonly electionContext: string;
  readonly merkleRoot: string;
  readonly optionCount: number;
}

export interface VerifiedVoteProof {
  readonly circuitVersion: string;
  readonly protocolVersion: string;
  readonly publicSignals: VotePublicSignalsV1;
}

export interface VoteProofVerifier {
  verify(payload: VoteProofPayload, expectation: VoteProofExpectation): Promise<VerifiedVoteProof>;
}
