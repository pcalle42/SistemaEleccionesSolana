export const ELECTION_STATUSES = [
  'DRAFT',
  'READY',
  'OPEN',
  'CLOSED',
  'COUNTING',
  'RESULTS_PUBLISHED',
  'CANCELLED',
] as const;

export type ElectionStatus = (typeof ELECTION_STATUSES)[number];

export const ALLOWED_ELECTION_TRANSITIONS: Readonly<
  Record<ElectionStatus, readonly ElectionStatus[]>
> = {
  CANCELLED: [],
  CLOSED: ['COUNTING', 'CANCELLED'],
  COUNTING: ['RESULTS_PUBLISHED', 'CANCELLED'],
  DRAFT: ['READY', 'CANCELLED'],
  OPEN: ['CLOSED', 'CANCELLED'],
  READY: ['DRAFT', 'OPEN', 'CANCELLED'],
  RESULTS_PUBLISHED: [],
};
