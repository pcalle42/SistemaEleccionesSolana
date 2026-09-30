import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/client.js';
import { eligibilitySnapshots } from '../../../../database/schema/eligibility.js';
import type {
  ElectionReadinessAssessment,
  ElectionReadinessVerifier,
} from '../../../elections/application/ports/election-readiness.port.js';
import type { ElectionState } from '../../../elections/domain/election.js';

export class DrizzleElectionReadinessVerifier implements ElectionReadinessVerifier {
  constructor(private readonly database: Database) {}

  async assess(election: ElectionState): Promise<ElectionReadinessAssessment> {
    const reference = election.references.eligibilityConfigurationRef;
    const expectedConfigurationVersion =
      election.status === 'DRAFT'
        ? election.configurationVersion + 1
        : election.configurationVersion;
    const rows = reference
      ? await this.database
          .select({ id: eligibilitySnapshots.id })
          .from(eligibilitySnapshots)
          .where(
            and(
              eq(eligibilitySnapshots.id, reference),
              eq(eligibilitySnapshots.electionId, election.id),
              eq(eligibilitySnapshots.configurationVersion, expectedConfigurationVersion),
              eq(eligibilitySnapshots.status, 'FROZEN'),
            ),
          )
          .limit(1)
      : [];
    return {
      eligibilityPrepared: rows.length === 1,
      protocolCompatible: Boolean(
        election.references.protocolVersion && election.references.circuitVersion,
      ),
    };
  }
}
