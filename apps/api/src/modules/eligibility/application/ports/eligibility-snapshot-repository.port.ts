import type { ElectionId } from '../../../elections/domain/election-id.js';
import type { EligibilitySnapshot } from '../../domain/eligibility-snapshot.js';
import type { EligibilitySnapshotId } from '../../domain/eligibility-id.js';
import type { EligibilityAuditContext } from './eligible-voter-repository.port.js';

export interface EligibilitySnapshotRepository {
  createForElection(
    electionId: ElectionId,
    configurationVersion: number,
    expectedElectionRowVersion: number,
    factory: (version: number) => EligibilitySnapshot,
    audit: EligibilityAuditContext,
  ): Promise<EligibilitySnapshot>;
  findById(id: EligibilitySnapshotId): Promise<EligibilitySnapshot | null>;
  freeze(
    snapshot: EligibilitySnapshot,
    expectedRowVersion: number,
    audit: EligibilityAuditContext,
  ): Promise<void>;
}
