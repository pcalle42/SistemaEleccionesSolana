import type { EligibleVoter } from '../../domain/eligible-voter.js';
import type { EligibleVoterId } from '../../domain/eligibility-id.js';

export interface EligibilityAuditContext {
  readonly actorAdminId: string;
  readonly requestId: string | undefined;
}

export interface EligibleVoterRepository {
  create(voter: EligibleVoter, audit: EligibilityAuditContext): Promise<void>;
  findById(id: EligibleVoterId): Promise<EligibleVoter | null>;
  list(): Promise<readonly EligibleVoter[]>;
  saveDeactivation(
    voter: EligibleVoter,
    expectedRowVersion: number,
    audit: EligibilityAuditContext,
  ): Promise<void>;
  upsertAdministrativeRecord(
    voter: EligibleVoter,
    audit: EligibilityAuditContext,
  ): Promise<'created' | 'updated'>;
}
