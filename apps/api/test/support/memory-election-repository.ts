import type { ElectionRepository } from '../../src/modules/elections/application/ports/election-repository.port.js';
import {
  Election,
  type ElectionStateChanged,
} from '../../src/modules/elections/domain/election.js';
import type { ElectionId } from '../../src/modules/elections/domain/election-id.js';
import { ElectionDomainError } from '../../src/modules/elections/domain/election-errors.js';

export class MemoryElectionRepository implements ElectionRepository {
  private readonly elections = new Map<ElectionId, Election>();

  create(election: Election): Promise<void> {
    const state = election.snapshot();
    this.elections.set(state.id, Election.reconstitute(state));
    return Promise.resolve();
  }

  findById(id: ElectionId): Promise<Election | null> {
    const election = this.elections.get(id);
    return Promise.resolve(election ? Election.reconstitute(election.snapshot()) : null);
  }

  list(): Promise<readonly Election[]> {
    return Promise.resolve(
      [...this.elections.values()].map((election) => Election.reconstitute(election.snapshot())),
    );
  }

  saveDraftChanges(election: Election, expectedRowVersion: number): Promise<void> {
    this.store(election, expectedRowVersion);
    return Promise.resolve();
  }

  transitionState(
    election: Election,
    _event: ElectionStateChanged,
    expectedRowVersion: number,
  ): Promise<void> {
    this.store(election, expectedRowVersion);
    return Promise.resolve();
  }

  private store(election: Election, expectedRowVersion: number): void {
    const state = election.snapshot();
    const current = this.elections.get(state.id);
    if (current && current.snapshot().rowVersion !== expectedRowVersion) {
      throw new ElectionDomainError(
        'ELECTION_CONCURRENT_MODIFICATION',
        'Election state changed concurrently.',
      );
    }
    this.elections.set(
      state.id,
      Election.reconstitute({ ...state, rowVersion: expectedRowVersion + 1 }),
    );
  }
}
