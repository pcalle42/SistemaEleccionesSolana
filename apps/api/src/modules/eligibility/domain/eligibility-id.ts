import { randomUUID } from 'node:crypto';

import { EligibilityDomainError } from './eligibility-errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EligibleVoterId = string & { readonly __brand: 'EligibleVoterId' };
export type ElectoralCredentialId = string & { readonly __brand: 'ElectoralCredentialId' };
export type EligibilitySnapshotId = string & { readonly __brand: 'EligibilitySnapshotId' };

function opaqueUuid<T extends string>(value: string, label: string): T {
  if (!UUID_PATTERN.test(value)) {
    throw new EligibilityDomainError('INVALID_ELIGIBLE_VOTER', `${label} must be a UUID.`);
  }
  return value as T;
}

export const eligibleVoterId = (value: string): EligibleVoterId =>
  opaqueUuid<EligibleVoterId>(value, 'Eligible voter id');
export const electoralCredentialId = (value: string): ElectoralCredentialId =>
  opaqueUuid<ElectoralCredentialId>(value, 'Electoral credential id');
export const eligibilitySnapshotId = (value: string): EligibilitySnapshotId =>
  opaqueUuid<EligibilitySnapshotId>(value, 'Eligibility snapshot id');
export const newEligibleVoterId = (): EligibleVoterId => eligibleVoterId(randomUUID());
export const newElectoralCredentialId = (): ElectoralCredentialId =>
  electoralCredentialId(randomUUID());
export const newEligibilitySnapshotId = (): EligibilitySnapshotId =>
  eligibilitySnapshotId(randomUUID());
