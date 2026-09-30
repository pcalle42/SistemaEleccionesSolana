import type { Clock } from '../../elections/domain/clock.js';
import type { ElectionId } from '../../elections/domain/election-id.js';
import type { ElectoralCredentialId, EligibilitySnapshotId } from './eligibility-id.js';
import { EligibilityDomainError } from './eligibility-errors.js';

export const ELIGIBILITY_SNAPSHOT_STATUSES = ['BUILDING', 'FROZEN', 'SUPERSEDED'] as const;
export type EligibilitySnapshotStatus = (typeof ELIGIBILITY_SNAPSHOT_STATUSES)[number];

export interface EligibilitySnapshotMember {
  readonly credentialId: ElectoralCredentialId;
  readonly leafIndex: number;
  readonly leafValue: string;
}

export interface EligibilitySnapshotState {
  readonly commitmentSchemeVersion: string;
  readonly configurationVersion: number;
  readonly createdAt: Date;
  readonly electionId: ElectionId;
  readonly frozenAt: Date | null;
  readonly id: EligibilitySnapshotId;
  readonly leafCount: number;
  readonly members: readonly EligibilitySnapshotMember[];
  readonly merkleRoot: string;
  readonly rowVersion: number;
  readonly status: EligibilitySnapshotStatus;
  readonly treeDepth: number;
  readonly version: number;
}

export class EligibilitySnapshot {
  private constructor(private state: EligibilitySnapshotState) {}

  static build(
    input: Omit<EligibilitySnapshotState, 'createdAt' | 'frozenAt' | 'rowVersion' | 'status'>,
    clock: Clock,
  ): EligibilitySnapshot {
    if (input.configurationVersion < 1 || input.version < 1 || input.members.length === 0) {
      throw new EligibilityDomainError(
        'ELIGIBILITY_SNAPSHOT_EMPTY',
        'Snapshot is empty or invalid.',
      );
    }
    if (
      input.leafCount !== input.members.length ||
      input.treeDepth < 1 ||
      !input.merkleRoot.trim()
    ) {
      throw new EligibilityDomainError(
        'ELIGIBILITY_SNAPSHOT_CAPACITY_EXCEEDED',
        'Merkle artifact is invalid.',
      );
    }
    const indexes = new Set(input.members.map((member) => member.leafIndex));
    const leaves = new Set(input.members.map((member) => member.leafValue));
    if (indexes.size !== input.members.length || leaves.size !== input.members.length) {
      throw new EligibilityDomainError(
        'ELIGIBILITY_SNAPSHOT_DUPLICATE_LEAF',
        'Snapshot leaf values and indexes must be unique.',
      );
    }
    input.members.forEach((member, index) => {
      if (member.leafIndex !== index) {
        throw new EligibilityDomainError(
          'ELIGIBILITY_SNAPSHOT_CAPACITY_EXCEEDED',
          'Snapshot leaf indexes must be contiguous and deterministic.',
        );
      }
    });
    return new EligibilitySnapshot({
      ...input,
      createdAt: new Date(clock.now()),
      frozenAt: null,
      members: input.members.map((member) => ({ ...member })),
      rowVersion: 0,
      status: 'BUILDING',
    });
  }

  static reconstitute(state: EligibilitySnapshotState): EligibilitySnapshot {
    return new EligibilitySnapshot({
      ...state,
      createdAt: new Date(state.createdAt),
      frozenAt: state.frozenAt ? new Date(state.frozenAt) : null,
      members: state.members.map((member) => ({ ...member })),
    });
  }

  snapshot(): EligibilitySnapshotState {
    return {
      ...this.state,
      createdAt: new Date(this.state.createdAt),
      frozenAt: this.state.frozenAt ? new Date(this.state.frozenAt) : null,
      members: this.state.members.map((member) => ({ ...member })),
    };
  }

  freeze(clock: Clock): void {
    if (this.state.status !== 'BUILDING') {
      throw new EligibilityDomainError(
        this.state.status === 'FROZEN'
          ? 'ELIGIBILITY_SNAPSHOT_FROZEN'
          : 'ELIGIBILITY_SNAPSHOT_NOT_BUILDING',
        'Only a building snapshot can be frozen.',
      );
    }
    this.state = { ...this.state, frozenAt: new Date(clock.now()), status: 'FROZEN' };
  }
}
