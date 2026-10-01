import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/client.js';
import {
  electionConfigurationVersions,
  electionOptions,
  elections,
  electionStateEvent,
} from '../../../../database/schema/election.js';
import type { ElectionRepository } from '../../application/ports/election-repository.port.js';
import { Election, type ElectionState, type ElectionStateChanged } from '../../domain/election.js';
import { electionId, electionOptionId, type ElectionId } from '../../domain/election-id.js';
import { ElectionDomainError } from '../../domain/election-errors.js';
import type { ElectionStatus } from '../../domain/election-status.js';
import type { VotingMethod } from '../../domain/voting-method.js';
import { freezeCryptographicConfigurationV1 } from '../../../zk/application/election-context-v1.js';

type ElectionRow = typeof elections.$inferSelect;
type OptionRow = typeof electionOptions.$inferSelect;

function mapElection(row: ElectionRow, optionRows: readonly OptionRow[]): Election {
  const state: ElectionState = {
    cancellationReason: row.cancellationReason,
    closesAt: row.closesAt,
    configurationVersion: row.configurationVersion,
    createdAt: row.createdAt,
    description: row.description,
    id: electionId(row.id),
    opensAt: row.opensAt,
    options: optionRows.map((option) => ({
      description: option.description,
      displayOrder: option.displayOrder,
      id: electionOptionId(option.id),
      label: option.label,
    })),
    references: {
      circuitVersion: row.circuitVersion,
      eligibilityConfigurationRef: row.eligibilityConfigurationRef,
      protocolVersion: row.protocolVersion,
    },
    rowVersion: row.rowVersion,
    status: row.status as ElectionStatus,
    title: row.title,
    updatedAt: row.updatedAt,
    votingMethod: row.votingMethod as VotingMethod,
  };
  return Election.reconstitute(state);
}

function electionValues(state: ElectionState): typeof elections.$inferInsert {
  return {
    cancellationReason: state.cancellationReason,
    circuitVersion: state.references.circuitVersion,
    closesAt: state.closesAt,
    configurationVersion: state.configurationVersion,
    createdAt: state.createdAt,
    description: state.description,
    eligibilityConfigurationRef: state.references.eligibilityConfigurationRef,
    id: state.id,
    opensAt: state.opensAt,
    protocolVersion: state.references.protocolVersion,
    rowVersion: state.rowVersion,
    status: state.status,
    title: state.title,
    updatedAt: state.updatedAt,
    votingMethod: state.votingMethod,
  };
}

function optionValues(state: ElectionState): (typeof electionOptions.$inferInsert)[] {
  return state.options.map((option) => ({
    description: option.description,
    displayOrder: option.displayOrder,
    electionId: state.id,
    id: option.id,
    label: option.label,
  }));
}

function concurrencyError(): ElectionDomainError {
  return new ElectionDomainError(
    'ELECTION_CONCURRENT_MODIFICATION',
    'Election state changed concurrently; reload and retry.',
  );
}

export class DrizzleElectionRepository implements ElectionRepository {
  constructor(private readonly database: Database) {}

  async create(election: Election): Promise<void> {
    const state = election.snapshot();
    await this.database.transaction(async (transaction) => {
      await transaction.insert(elections).values(electionValues(state));
      const options = optionValues(state);
      if (options.length > 0) {
        await transaction.insert(electionOptions).values(options);
      }
    });
  }

  async findById(id: ElectionId): Promise<Election | null> {
    const rows = await this.database.select().from(elections).where(eq(elections.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    const options = await this.database
      .select()
      .from(electionOptions)
      .where(eq(electionOptions.electionId, id))
      .orderBy(asc(electionOptions.displayOrder));
    return mapElection(row, options);
  }

  async list(): Promise<readonly Election[]> {
    const rows = await this.database.select().from(elections).orderBy(asc(elections.createdAt));
    if (rows.length === 0) {
      return [];
    }
    const options = await this.database
      .select()
      .from(electionOptions)
      .orderBy(asc(electionOptions.displayOrder));
    return rows.map((row) =>
      mapElection(
        row,
        options.filter((option) => option.electionId === row.id),
      ),
    );
  }

  async saveDraftChanges(election: Election, expectedRowVersion: number): Promise<void> {
    const state = election.snapshot();
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(elections)
        .set({
          circuitVersion: state.references.circuitVersion,
          closesAt: state.closesAt,
          description: state.description,
          eligibilityConfigurationRef: state.references.eligibilityConfigurationRef,
          opensAt: state.opensAt,
          protocolVersion: state.references.protocolVersion,
          rowVersion: sql`${elections.rowVersion} + 1`,
          title: state.title,
          updatedAt: state.updatedAt,
          votingMethod: state.votingMethod,
        })
        .where(
          and(
            eq(elections.id, state.id),
            eq(elections.status, 'DRAFT'),
            eq(elections.rowVersion, expectedRowVersion),
          ),
        )
        .returning({ id: elections.id });
      if (updated.length !== 1) {
        throw concurrencyError();
      }
      await transaction.delete(electionOptions).where(eq(electionOptions.electionId, state.id));
      const options = optionValues(state);
      if (options.length > 0) {
        await transaction.insert(electionOptions).values(options);
      }
    });
  }

  async transitionState(
    election: Election,
    event: ElectionStateChanged,
    expectedRowVersion: number,
    requestId?: string,
  ): Promise<void> {
    const state = election.snapshot();
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(elections)
        .set({
          cancellationReason: state.cancellationReason,
          configurationVersion: state.configurationVersion,
          rowVersion: sql`${elections.rowVersion} + 1`,
          status: state.status,
          updatedAt: state.updatedAt,
        })
        .where(
          and(
            eq(elections.id, state.id),
            eq(elections.status, event.previousState),
            eq(elections.rowVersion, expectedRowVersion),
          ),
        )
        .returning({ id: elections.id });
      if (updated.length !== 1) {
        throw concurrencyError();
      }
      if (event.newState === 'READY') {
        const cryptographicConfiguration = freezeCryptographicConfigurationV1(state);
        await transaction.insert(electionConfigurationVersions).values({
          electionId: state.id,
          frozenAt: event.timestamp,
          snapshot: {
            closesAt: state.closesAt.toISOString(),
            description: state.description,
            opensAt: state.opensAt.toISOString(),
            options: state.options,
            cryptographicConfiguration,
            references: state.references,
            title: state.title,
            votingMethod: state.votingMethod,
          },
          version: state.configurationVersion,
        });
      }
      await transaction.insert(electionStateEvent).values({
        actorAdminId: event.actorAdminId,
        configurationVersion: state.configurationVersion,
        electionId: state.id,
        newState: event.newState,
        occurredAt: event.timestamp,
        previousState: event.previousState,
        reason: event.reason,
        requestId,
      });
    });
  }
}
