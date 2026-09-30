import type { ElectoralCredential } from '../../domain/electoral-credential.js';
import type { ElectoralCredentialId, EligibleVoterId } from '../../domain/eligibility-id.js';
import type { EligibilityAuditContext } from './eligible-voter-repository.port.js';

export interface ElectoralCredentialRepository {
  findById(id: ElectoralCredentialId): Promise<ElectoralCredential | null>;
  listActiveDeterministically(): Promise<readonly ElectoralCredential[]>;
  registerAndRotate(credential: ElectoralCredential, audit: EligibilityAuditContext): Promise<void>;
  revoke(
    credential: ElectoralCredential,
    expectedRowVersion: number,
    audit: EligibilityAuditContext,
  ): Promise<void>;
  findActiveForVoter(id: EligibleVoterId): Promise<ElectoralCredential | null>;
}
