export type ZkVerificationErrorCode =
  | 'UNSUPPORTED_PROTOCOL_VERSION'
  | 'INVALID_PROOF_FORMAT'
  | 'INVALID_PUBLIC_SIGNALS'
  | 'PROOF_VERIFICATION_FAILED'
  | 'PROOF_ROOT_MISMATCH'
  | 'PROOF_ELECTION_CONTEXT_MISMATCH'
  | 'PROOF_NULLIFIER_INVALID'
  | 'PROOF_VOTE_ENCODING_INVALID'
  | 'ZK_VERIFIER_UNAVAILABLE';

export class ZkVerificationError extends Error {
  constructor(
    readonly code: ZkVerificationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ZkVerificationError';
  }
}
