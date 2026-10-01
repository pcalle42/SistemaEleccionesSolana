export type VotingErrorCode =
  | 'ELECTION_NOT_FOUND'
  | 'ELECTION_NOT_OPEN'
  | 'ELECTION_NOT_STARTED'
  | 'ELECTION_CLOSED'
  | 'UNSUPPORTED_PROTOCOL_VERSION'
  | 'PROOF_ROOT_MISMATCH'
  | 'PROOF_ELECTION_CONTEXT_MISMATCH'
  | 'PROOF_VERIFICATION_FAILED'
  | 'INVALID_VOTE_ENCODING'
  | 'NULLIFIER_ALREADY_USED'
  | 'VOTE_SUBMISSION_CONFLICT'
  | 'ZK_VERIFIER_UNAVAILABLE'
  | 'VOTE_ACCEPTANCE_UNAVAILABLE'
  | 'VOTE_RATE_LIMITED';

export class VotingError extends Error {
  constructor(
    readonly code: VotingErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'VotingError';
  }
}
