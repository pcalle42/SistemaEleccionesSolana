import { asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/client.js';
import { eligibilityEvent } from '../../../../database/schema/audit.js';
import { eligibleVoters } from '../../../../database/schema/eligibility.js';
import type {
  EligibilityAuditContext,
  EligibleVoterRepository,
} from '../../application/ports/eligible-voter-repository.port.js';
import { EligibleVoter, type EligibleVoterStatus } from '../../domain/eligible-voter.js';
import { eligibleVoterId, type EligibleVoterId } from '../../domain/eligibility-id.js';
import { EligibilityDomainError } from '../../domain/eligibility-errors.js';
import { concurrencyError, databaseCode } from './persistence-errors.js';

type VoterRow = typeof eligibleVoters.$inferSelect;

function mapVoter(row: VoterRow): EligibleVoter {
  return EligibleVoter.reconstitute({
    createdAt: row.createdAt,
    displayName: row.displayName,
    externalReference: row.externalReference,
    id: eligibleVoterId(row.id),
    rowVersion: row.rowVersion,
    status: row.status as EligibleVoterStatus,
    updatedAt: row.updatedAt,
  });
}

function values(voter: EligibleVoter): typeof eligibleVoters.$inferInsert {
  const state = voter.snapshot();
  return {
    createdAt: state.createdAt,
    displayName: state.displayName,
    externalReference: state.externalReference,
    id: state.id,
    rowVersion: state.rowVersion,
    status: state.status,
    updatedAt: state.updatedAt,
  };
}

export class DrizzleEligibleVoterRepository implements EligibleVoterRepository {
  constructor(private readonly database: Database) {}

  async create(voter: EligibleVoter, audit: EligibilityAuditContext): Promise<void> {
    try {
      await this.database.transaction(async (transaction) => {
        const state = voter.snapshot();
        await transaction.insert(eligibleVoters).values(values(voter));
        await transaction.insert(eligibilityEvent).values({
          actorAdminId: audit.actorAdminId,
          entityId: state.id,
          entityType: 'eligible_voter',
          event: 'eligible_voter_registered',
          requestId: audit.requestId,
        });
      });
    } catch (error: unknown) {
      if (databaseCode(error) === '23505') {
        throw new EligibilityDomainError(
          'INVALID_ELIGIBLE_VOTER',
          'External reference is already registered.',
        );
      }
      throw error;
    }
  }

  async findById(id: EligibleVoterId): Promise<EligibleVoter | null> {
    const rows = await this.database
      .select()
      .from(eligibleVoters)
      .where(eq(eligibleVoters.id, id))
      .limit(1);
    return rows[0] ? mapVoter(rows[0]) : null;
  }

  async list(): Promise<readonly EligibleVoter[]> {
    return (
      await this.database.select().from(eligibleVoters).orderBy(asc(eligibleVoters.createdAt))
    ).map(mapVoter);
  }

  async saveDeactivation(
    voter: EligibleVoter,
    expectedRowVersion: number,
    audit: EligibilityAuditContext,
  ): Promise<void> {
    const state = voter.snapshot();
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(eligibleVoters)
        .set({
          rowVersion: sql`${eligibleVoters.rowVersion} + 1`,
          status: state.status,
          updatedAt: state.updatedAt,
        })
        .where(
          sql`${eligibleVoters.id} = ${state.id} AND ${eligibleVoters.status} = 'ACTIVE' AND ${eligibleVoters.rowVersion} = ${expectedRowVersion}`,
        )
        .returning({ id: eligibleVoters.id });
      if (updated.length !== 1) throw concurrencyError();
      await transaction.insert(eligibilityEvent).values({
        actorAdminId: audit.actorAdminId,
        entityId: state.id,
        entityType: 'eligible_voter',
        event: 'eligible_voter_deactivated',
        requestId: audit.requestId,
      });
    });
  }

  async upsertAdministrativeRecord(
    voter: EligibleVoter,
    audit: EligibilityAuditContext,
  ): Promise<'created' | 'updated'> {
    const state = voter.snapshot();
    if (!state.externalReference) {
      await this.create(voter, audit);
      return 'created';
    }
    return this.database.transaction(async (transaction) => {
      const existing = await transaction
        .select({ id: eligibleVoters.id })
        .from(eligibleVoters)
        .where(eq(eligibleVoters.externalReference, state.externalReference!))
        .limit(1);
      if (!existing[0]) {
        await transaction.insert(eligibleVoters).values(values(voter));
        await transaction.insert(eligibilityEvent).values({
          actorAdminId: audit.actorAdminId,
          entityId: state.id,
          entityType: 'eligible_voter',
          event: 'eligible_voter_registered',
          requestId: audit.requestId,
        });
        return 'created';
      }
      await transaction
        .update(eligibleVoters)
        .set({
          displayName: state.displayName,
          rowVersion: sql`${eligibleVoters.rowVersion} + 1`,
          updatedAt: state.updatedAt,
        })
        .where(eq(eligibleVoters.id, existing[0].id));
      return 'updated';
    });
  }
}
