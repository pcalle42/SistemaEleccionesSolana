export interface ProductionProfile {
  artifacts: Record<string, boolean | string | null>;
  capacity: {
    baselineEvidence: string | null;
    headroomPercent: number | null;
    peakVotesPerSecond: number | null;
    status: 'approved' | 'pending';
  };
  data: {
    postgresql: {
      backupScheduled: boolean;
      private: boolean;
      restoreTested: boolean;
      rpoMinutes: number | null;
      rtoMinutes: number | null;
      [key: string]: boolean | number | string | null;
    };
    valkey: { lossTested: boolean; [key: string]: boolean | string };
  };
  deployment: { rollbackPlan: string | null; [key: string]: unknown };
  gates: Record<string, { evidence: string[]; status: 'approved' | 'pending' }>;
  iam: Record<string, boolean>;
  operations: {
    alertsActive: boolean;
    clockEvidence: string | null;
    metricsProtected: boolean;
    onCallDefined: boolean;
    restoreEvidence: string | null;
    [key: string]: boolean | string | null;
  };
  profileId: string;
  providerDecision: { adr: string | null; status: 'approved' | 'pending' };
  secrets: {
    audited: boolean;
    rotationRunbook: string | null;
    [key: string]: boolean | string | null;
  };
  synthetic: boolean;
  topology: { certificateLifecycleEvidence: string | null; [key: string]: unknown };
  [key: string]: unknown;
}

export function verifyProductionProfile(
  profile: ProductionProfile,
  options?: { allowSynthetic?: boolean },
): Promise<{ profileId: string; releaseManifestDigest: string; verified: true }>;

export function readAndVerifyProductionProfile(
  path: string,
  options?: { allowSynthetic?: boolean },
): Promise<{
  profile: ProductionProfile;
  result: { profileId: string; releaseManifestDigest: string; verified: true };
}>;

export const productionProfileTemplate: string;
