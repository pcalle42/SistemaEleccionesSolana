import type { ElectionState } from '../../domain/election.js';

export interface ElectionReadinessAssessment {
  readonly eligibilityPrepared: boolean;
  readonly protocolCompatible: boolean;
}

export interface ElectionReadinessVerifier {
  assess(election: ElectionState): Promise<ElectionReadinessAssessment>;
}
