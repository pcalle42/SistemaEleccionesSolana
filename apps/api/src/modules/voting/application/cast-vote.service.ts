import { Inject, Injectable } from '@nestjs/common';
import { ZkProtocolError } from '@votaciones/zk-protocol';

import { ApplicationError } from '../../../common/errors/application-error.js';
import { electionId } from '../../elections/domain/election-id.js';
import type { VoteProofVerifier } from '../../zk/application/ports/vote-proof-verifier.port.js';
import { ZkVerificationError } from '../../zk/domain/zk-errors.js';
import { VOTE_PROOF_VERIFIER } from '../../zk/zk.tokens.js';
import type { VoteReceiptV1 } from '../domain/vote-receipt.js';
import { submissionFingerprintV1 } from '../domain/vote-receipt.js';
import { mapVotingPublicSignalsV1 } from '../domain/vote-public-signals.js';
import { VotingError, type VotingErrorCode } from '../domain/voting-errors.js';
import { VOTE_REPOSITORY } from '../voting.tokens.js';
import type { VoteRepository } from './ports/vote-repository.port.js';

export interface CastVoteCommand {
  readonly electionId: string;
  readonly proof: unknown;
  readonly protocolVersion: string;
  readonly publicSignals: unknown;
}

export interface CastVoteResult {
  readonly idempotentRetry: boolean;
  readonly receipt: VoteReceiptV1;
  readonly status: 'accepted';
}

const CATEGORY_BY_CODE: Partial<
  Record<
    VotingErrorCode,
    'not-found' | 'conflict' | 'domain-rule' | 'dependency-unavailable' | 'rate-limit'
  >
> = {
  ELECTION_CLOSED: 'domain-rule',
  ELECTION_NOT_FOUND: 'not-found',
  ELECTION_NOT_OPEN: 'domain-rule',
  ELECTION_NOT_STARTED: 'domain-rule',
  NULLIFIER_ALREADY_USED: 'conflict',
  PROOF_ELECTION_CONTEXT_MISMATCH: 'conflict',
  PROOF_ROOT_MISMATCH: 'conflict',
  VOTE_ACCEPTANCE_UNAVAILABLE: 'dependency-unavailable',
  VOTE_RATE_LIMITED: 'rate-limit',
  VOTE_SUBMISSION_CONFLICT: 'conflict',
  ZK_VERIFIER_UNAVAILABLE: 'dependency-unavailable',
};

function applicationError(error: VotingError): ApplicationError {
  return new ApplicationError(
    error.code,
    error.message,
    CATEGORY_BY_CODE[error.code] ?? 'validation',
    { cause: error },
  );
}

function votingError(error: ZkVerificationError): VotingError {
  const code =
    error.code === 'PROOF_VOTE_ENCODING_INVALID'
      ? 'INVALID_VOTE_ENCODING'
      : error.code === 'INVALID_PROOF_FORMAT' ||
          error.code === 'INVALID_PUBLIC_SIGNALS' ||
          error.code === 'PROOF_NULLIFIER_INVALID'
        ? 'PROOF_VERIFICATION_FAILED'
        : error.code;
  return new VotingError(code, error.message, { cause: error });
}

function assertOpen(status: string, observedAt: Date, opensAt: Date, closesAt: Date): void {
  if (status !== 'OPEN') {
    throw new VotingError('ELECTION_NOT_OPEN', 'Election is not open.');
  }
  if (observedAt < opensAt) {
    throw new VotingError('ELECTION_NOT_STARTED', 'Election has not started.');
  }
  if (observedAt >= closesAt) {
    throw new VotingError('ELECTION_CLOSED', 'Election voting window is closed.');
  }
}

@Injectable()
export class CastVoteService {
  constructor(
    @Inject(VOTE_REPOSITORY) private readonly votes: VoteRepository,
    @Inject(VOTE_PROOF_VERIFIER) private readonly verifier: VoteProofVerifier,
  ) {}

  async cast(command: CastVoteCommand): Promise<CastVoteResult> {
    try {
      let id: string;
      try {
        id = electionId(command.electionId);
      } catch {
        throw new VotingError('ELECTION_NOT_FOUND', 'Election not found.');
      }
      const context = await this.votes.loadAcceptanceContext(id);
      if (!context) {
        throw new VotingError('ELECTION_NOT_FOUND', 'Election not found.');
      }
      assertOpen(context.status, context.observedAt, context.opensAt, context.closesAt);
      if (command.protocolVersion !== context.protocolVersion) {
        throw new VotingError(
          'UNSUPPORTED_PROTOCOL_VERSION',
          'Protocol does not match the frozen election configuration.',
        );
      }
      if (
        !Array.isArray(command.publicSignals) ||
        !command.publicSignals.every((v) => typeof v === 'string')
      ) {
        throw new VotingError('PROOF_VERIFICATION_FAILED', 'Public signals are malformed.');
      }
      let signals;
      try {
        signals = mapVotingPublicSignalsV1(command.publicSignals);
      } catch (error: unknown) {
        if (error instanceof ZkProtocolError) {
          throw new VotingError('PROOF_VERIFICATION_FAILED', 'Public signals are malformed.', {
            cause: error,
          });
        }
        throw error;
      }
      if (signals.merkleRoot !== context.merkleRoot) {
        throw new VotingError('PROOF_ROOT_MISMATCH', 'Proof uses an unexpected Merkle root.');
      }
      if (signals.electionContext !== context.electionContext) {
        throw new VotingError(
          'PROOF_ELECTION_CONTEXT_MISMATCH',
          'Proof uses an unexpected election context.',
        );
      }
      if (
        signals.optionCount !== context.optionCount ||
        signals.voteEncoding < 0 ||
        signals.voteEncoding >= context.optionCount
      ) {
        throw new VotingError('INVALID_VOTE_ENCODING', 'Vote encoding is invalid.');
      }

      let verified;
      try {
        verified = await this.verifier.verify(
          {
            proof: command.proof,
            protocolVersion: command.protocolVersion,
            publicSignals: command.publicSignals,
          },
          {
            circuitVersion: context.circuitVersion,
            electionContext: context.electionContext,
            merkleRoot: context.merkleRoot,
            optionCount: context.optionCount,
          },
        );
      } catch (error: unknown) {
        if (error instanceof ZkVerificationError) throw votingError(error);
        throw new VotingError('ZK_VERIFIER_UNAVAILABLE', 'Proof verifier is unavailable.', {
          cause: error,
        });
      }
      if (
        verified.protocolVersion !== context.protocolVersion ||
        verified.circuitVersion !== context.circuitVersion ||
        verified.publicSignals.nullifier !== signals.nullifier ||
        verified.publicSignals.voteChoice !== signals.voteEncoding
      ) {
        throw new VotingError('PROOF_VERIFICATION_FAILED', 'Proof verification failed.');
      }

      const accepted = await this.votes.accept({
        context,
        nullifier: signals.nullifier,
        proof: command.proof,
        publicSignals: command.publicSignals,
        submissionFingerprint: submissionFingerprintV1({
          electionContext: signals.electionContext,
          merkleRoot: signals.merkleRoot,
          nullifier: signals.nullifier,
          protocolVersion: command.protocolVersion,
          voteEncoding: signals.voteEncoding,
        }),
        voteEncoding: signals.voteEncoding,
      });
      return { ...accepted, status: 'accepted' };
    } catch (error: unknown) {
      if (error instanceof VotingError) throw applicationError(error);
      throw error;
    }
  }
}
