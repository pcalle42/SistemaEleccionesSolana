export type ElectionErrorCode =
  | 'ELECTION_NOT_FOUND'
  | 'INVALID_ELECTION_TRANSITION'
  | 'ELECTION_CONFIGURATION_INCOMPLETE'
  | 'ELECTION_CONFIGURATION_FROZEN'
  | 'ELECTION_NOT_OPEN'
  | 'ELECTION_NOT_STARTED'
  | 'ELECTION_CLOSED'
  | 'INVALID_VOTING_WINDOW'
  | 'INVALID_ELECTION_OPTION'
  | 'INVALID_ELECTION_METADATA'
  | 'ELECTION_CONCURRENT_MODIFICATION';

export class ElectionDomainError extends Error {
  constructor(
    readonly code: ElectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ElectionDomainError';
  }
}
