import { randomUUID } from 'node:crypto';

import { ElectionDomainError } from './election-errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ElectionId = string & { readonly __brand: 'ElectionId' };
export type ElectionOptionId = string & { readonly __brand: 'ElectionOptionId' };

function asOpaqueUuid<T extends string>(value: string, label: string): T {
  if (!UUID_PATTERN.test(value)) {
    throw new ElectionDomainError('INVALID_ELECTION_OPTION', `${label} must be a UUID.`);
  }
  return value as T;
}

export function electionId(value: string): ElectionId {
  return asOpaqueUuid<ElectionId>(value, 'Election id');
}

export function electionOptionId(value: string): ElectionOptionId {
  return asOpaqueUuid<ElectionOptionId>(value, 'Election option id');
}

export function newElectionId(): ElectionId {
  return electionId(randomUUID());
}

export function newElectionOptionId(): ElectionOptionId {
  return electionOptionId(randomUUID());
}
