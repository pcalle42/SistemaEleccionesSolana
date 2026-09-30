import type { Election } from '../../domain/election.js';
import type { ElectionId } from '../../domain/election-id.js';
import type { ElectionStateChanged } from '../../domain/election.js';

export interface ElectionRepository {
  create(election: Election): Promise<void>;
  findById(id: ElectionId): Promise<Election | null>;
  list(): Promise<readonly Election[]>;
  saveDraftChanges(election: Election, expectedRowVersion: number): Promise<void>;
  transitionState(
    election: Election,
    event: ElectionStateChanged,
    expectedRowVersion: number,
    requestId?: string,
  ): Promise<void>;
}
