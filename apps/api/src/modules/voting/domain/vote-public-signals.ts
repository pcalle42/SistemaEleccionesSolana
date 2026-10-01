import { mapPublicSignalsV1, type VotePublicSignalsV1 } from '@votaciones/zk-protocol';

export interface VotingPublicSignalsV1 {
  readonly electionContext: string;
  readonly merkleRoot: string;
  readonly nullifier: string;
  readonly optionCount: number;
  readonly voteEncoding: number;
}

export function mapVotingPublicSignalsV1(input: readonly string[]): VotingPublicSignalsV1 {
  const signals: VotePublicSignalsV1 = mapPublicSignalsV1(input);
  return {
    electionContext: signals.electionContext,
    merkleRoot: signals.merkleRoot,
    nullifier: signals.nullifier,
    optionCount: signals.optionCount,
    voteEncoding: signals.voteChoice,
  };
}
