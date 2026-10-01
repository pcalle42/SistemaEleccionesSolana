import type { Clock } from '../../elections/domain/clock.js';
import type { ElectoralCredentialId, EligibleVoterId } from './eligibility-id.js';
import { EligibilityDomainError } from './eligibility-errors.js';

export const ELECTORAL_CREDENTIAL_STATUSES = ['PENDING', 'ACTIVE', 'REVOKED', 'ROTATED'] as const;
export type ElectoralCredentialStatus = (typeof ELECTORAL_CREDENTIAL_STATUSES)[number];

export interface ElectoralCredentialState {
  readonly activatedAt: Date | null;
  readonly createdAt: Date;
  readonly eligibleVoterId: EligibleVoterId;
  readonly id: ElectoralCredentialId;
  readonly identityCommitment: string;
  readonly revokedAt: Date | null;
  readonly rowVersion: number;
  readonly schemeVersion: string;
  readonly status: ElectoralCredentialStatus;
}

function validateOpaqueCommitment(value: string): string {
  try {
    return encodeFieldElement(parseFieldElement(value, 'identityCommitment'));
  } catch (error: unknown) {
    if (!(error instanceof ZkProtocolError)) throw error;
    throw new EligibilityDomainError(
      'INVALID_IDENTITY_COMMITMENT',
      'Identity commitment must be a canonical BN254 field element.',
    );
  }
}

function validateSchemeVersion(value: string): string {
  const normalized = value.trim();
  if (normalized !== COMMITMENT_SCHEME_VERSION_V1) {
    throw new EligibilityDomainError(
      'INVALID_IDENTITY_COMMITMENT',
      'Identity commitment scheme is unsupported.',
    );
  }
  return normalized;
}

export class ElectoralCredential {
  private constructor(private state: ElectoralCredentialState) {}

  static createPending(
    id: ElectoralCredentialId,
    eligibleVoterId: EligibleVoterId,
    identityCommitment: string,
    schemeVersion: string,
    clock: Clock,
  ): ElectoralCredential {
    return new ElectoralCredential({
      activatedAt: null,
      createdAt: new Date(clock.now()),
      eligibleVoterId,
      id,
      identityCommitment: validateOpaqueCommitment(identityCommitment),
      revokedAt: null,
      rowVersion: 0,
      schemeVersion: validateSchemeVersion(schemeVersion),
      status: 'PENDING',
    });
  }

  static reconstitute(state: ElectoralCredentialState): ElectoralCredential {
    return new ElectoralCredential({
      ...state,
      activatedAt: state.activatedAt ? new Date(state.activatedAt) : null,
      createdAt: new Date(state.createdAt),
      revokedAt: state.revokedAt ? new Date(state.revokedAt) : null,
    });
  }

  snapshot(): ElectoralCredentialState {
    return {
      ...this.state,
      activatedAt: this.state.activatedAt ? new Date(this.state.activatedAt) : null,
      createdAt: new Date(this.state.createdAt),
      revokedAt: this.state.revokedAt ? new Date(this.state.revokedAt) : null,
    };
  }

  activate(clock: Clock): void {
    if (this.state.status !== 'PENDING') {
      throw new EligibilityDomainError(
        'CREDENTIAL_ALREADY_REGISTERED',
        'Credential cannot be activated.',
      );
    }
    this.state = { ...this.state, activatedAt: new Date(clock.now()), status: 'ACTIVE' };
  }

  revoke(clock: Clock): void {
    if (this.state.status !== 'ACTIVE') {
      throw new EligibilityDomainError('CREDENTIAL_REVOKED', 'Credential is not active.');
    }
    this.state = { ...this.state, revokedAt: new Date(clock.now()), status: 'REVOKED' };
  }

  rotate(clock: Clock): void {
    if (this.state.status !== 'ACTIVE') {
      throw new EligibilityDomainError('CREDENTIAL_REVOKED', 'Credential is not active.');
    }
    this.state = { ...this.state, revokedAt: new Date(clock.now()), status: 'ROTATED' };
  }
}
import {
  COMMITMENT_SCHEME_VERSION_V1,
  encodeFieldElement,
  parseFieldElement,
  ZkProtocolError,
} from '@votaciones/zk-protocol';
