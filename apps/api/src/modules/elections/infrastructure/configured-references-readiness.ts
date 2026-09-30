import type {
  ElectionReadinessAssessment,
  ElectionReadinessVerifier,
} from '../application/ports/election-readiness.port.js';
import type { ElectionState } from '../domain/election.js';

/** Provisional boundary. Stages 09 and 10 replace these reference checks with real adapters. */
export class ConfiguredReferencesReadinessVerifier implements ElectionReadinessVerifier {
  assess(election: ElectionState): Promise<ElectionReadinessAssessment> {
    return Promise.resolve({
      eligibilityPrepared: Boolean(election.references.eligibilityConfigurationRef),
      protocolCompatible: Boolean(
        election.references.protocolVersion && election.references.circuitVersion,
      ),
    });
  }
}
