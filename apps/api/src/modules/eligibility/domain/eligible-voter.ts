import type { Clock } from '../../elections/domain/clock.js';
import type { EligibleVoterId } from './eligibility-id.js';
import { EligibilityDomainError } from './eligibility-errors.js';

export const ELIGIBLE_VOTER_STATUSES = ['ACTIVE', 'INACTIVE', 'REVOKED'] as const;
export type EligibleVoterStatus = (typeof ELIGIBLE_VOTER_STATUSES)[number];

export interface EligibleVoterState {
  readonly createdAt: Date;
  readonly displayName: string | null;
  readonly externalReference: string | null;
  readonly id: EligibleVoterId;
  readonly rowVersion: number;
  readonly status: EligibleVoterStatus;
  readonly updatedAt: Date;
}

export function normalizeExternalReference(value?: string | null): string | null {
  const normalized = value?.normalize('NFKC').trim() || null;
  const hasControlCharacter = normalized
    ? [...normalized].some((character) => {
        const code = character.codePointAt(0)!;
        return code < 32 || code === 127;
      })
    : false;
  if (normalized !== null && (normalized.length > 128 || hasControlCharacter)) {
    throw new EligibilityDomainError('INVALID_ELIGIBLE_VOTER', 'External reference is invalid.');
  }
  return normalized;
}

function normalizeDisplayName(value?: string | null): string | null {
  const normalized = value?.normalize('NFKC').trim() || null;
  if (normalized !== null && (normalized.length > 200 || /[<>]/u.test(normalized))) {
    throw new EligibilityDomainError('INVALID_ELIGIBLE_VOTER', 'Display name is invalid.');
  }
  return normalized;
}

export class EligibleVoter {
  private constructor(private state: EligibleVoterState) {}

  static create(
    id: EligibleVoterId,
    input: { externalReference?: string | null; displayName?: string | null },
    clock: Clock,
  ): EligibleVoter {
    const now = new Date(clock.now());
    return new EligibleVoter({
      createdAt: now,
      displayName: normalizeDisplayName(input.displayName),
      externalReference: normalizeExternalReference(input.externalReference),
      id,
      rowVersion: 0,
      status: 'ACTIVE',
      updatedAt: now,
    });
  }

  static reconstitute(state: EligibleVoterState): EligibleVoter {
    return new EligibleVoter({
      ...state,
      createdAt: new Date(state.createdAt),
      updatedAt: new Date(state.updatedAt),
    });
  }

  snapshot(): EligibleVoterState {
    return {
      ...this.state,
      createdAt: new Date(this.state.createdAt),
      updatedAt: new Date(this.state.updatedAt),
    };
  }

  updateAdministrativeMetadata(
    input: { externalReference?: string | null; displayName?: string | null },
    clock: Clock,
  ): void {
    this.state = {
      ...this.state,
      displayName:
        input.displayName === undefined
          ? this.state.displayName
          : normalizeDisplayName(input.displayName),
      externalReference:
        input.externalReference === undefined
          ? this.state.externalReference
          : normalizeExternalReference(input.externalReference),
      updatedAt: new Date(clock.now()),
    };
  }

  deactivate(clock: Clock): void {
    if (this.state.status !== 'ACTIVE') {
      throw new EligibilityDomainError('ELIGIBLE_VOTER_INACTIVE', 'Eligible voter is not active.');
    }
    this.state = { ...this.state, status: 'INACTIVE', updatedAt: new Date(clock.now()) };
  }
}
