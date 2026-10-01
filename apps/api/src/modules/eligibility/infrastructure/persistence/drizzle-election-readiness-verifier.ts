import { and, eq } from 'drizzle-orm';
import {
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  PROTOCOL_VERSION_V1,
  TREE_DEPTH_V1,
} from '@votaciones/zk-protocol';

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
          .select({
            commitmentSchemeVersion: eligibilitySnapshots.commitmentSchemeVersion,
            id: eligibilitySnapshots.id,
            treeDepth: eligibilitySnapshots.treeDepth,
          })
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
      eligibilityPrepared:
        rows.length === 1 &&
        rows[0]!.commitmentSchemeVersion === COMMITMENT_SCHEME_VERSION_V1 &&
        rows[0]!.treeDepth === TREE_DEPTH_V1,
      protocolCompatible:
        election.references.protocolVersion === PROTOCOL_VERSION_V1 &&
        election.references.circuitVersion === CIRCUIT_VERSION_V1,
    };
  }
}
