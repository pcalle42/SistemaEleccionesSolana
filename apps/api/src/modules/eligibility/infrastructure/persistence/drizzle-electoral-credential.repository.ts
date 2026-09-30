import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/client.js';
import { eligibilityEvent } from '../../../../database/schema/audit.js';
import { electoralCredentials, eligibleVoters } from '../../../../database/schema/eligibility.js';
import type { ElectoralCredentialRepository } from '../../application/ports/electoral-credential-repository.port.js';
import type { EligibilityAuditContext } from '../../application/ports/eligible-voter-repository.port.js';
import {
  ElectoralCredential,
  type ElectoralCredentialStatus,
} from '../../domain/electoral-credential.js';
import {
  electoralCredentialId,
  eligibleVoterId,
  type ElectoralCredentialId,
  type EligibleVoterId,
} from '../../domain/eligibility-id.js';
import { EligibilityDomainError } from '../../domain/eligibility-errors.js';
import { concurrencyError, databaseCode } from './persistence-errors.js';

type CredentialRow = typeof electoralCredentials.$inferSelect;

function mapCredential(row: CredentialRow): ElectoralCredential {
  return ElectoralCredential.reconstitute({
    activatedAt: row.activatedAt,
    createdAt: row.createdAt,
    eligibleVoterId: eligibleVoterId(row.eligibleVoterId),
    id: electoralCredentialId(row.id),
    identityCommitment: row.identityCommitment,
    revokedAt: row.revokedAt,
    rowVersion: row.rowVersion,
    schemeVersion: row.schemeVersion,
    status: row.status as ElectoralCredentialStatus,
  });
}

export class DrizzleElectoralCredentialRepository implements ElectoralCredentialRepository {
  constructor(private readonly database: Database) {}

  async findById(id: ElectoralCredentialId): Promise<ElectoralCredential | null> {
    const rows = await this.database
      .select()
      .from(electoralCredentials)
      .where(eq(electoralCredentials.id, id))
      .limit(1);
    return rows[0] ? mapCredential(rows[0]) : null;
  }

  async findActiveForVoter(id: EligibleVoterId): Promise<ElectoralCredential | null> {
    const rows = await this.database
      .select()
      .from(electoralCredentials)
      .where(
        and(
          eq(electoralCredentials.eligibleVoterId, id),
          eq(electoralCredentials.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return rows[0] ? mapCredential(rows[0]) : null;
  }

  async listActiveDeterministically(): Promise<readonly ElectoralCredential[]> {
    return (
      await this.database
        .select()
        .from(electoralCredentials)
        .innerJoin(eligibleVoters, eq(electoralCredentials.eligibleVoterId, eligibleVoters.id))
        .where(and(eq(electoralCredentials.status, 'ACTIVE'), eq(eligibleVoters.status, 'ACTIVE')))
        .orderBy(
          asc(electoralCredentials.schemeVersion),
          asc(electoralCredentials.identityCommitment),
          asc(electoralCredentials.id),
        )
    ).map((row) => mapCredential(row.electoral_credentials));
  }

  async registerAndRotate(
    credential: ElectoralCredential,
    audit: EligibilityAuditContext,
  ): Promise<void> {
    const state = credential.snapshot();
    try {
      await this.database.transaction(async (transaction) => {
        const voters = await transaction.execute<{ status: string }>(
          sql`SELECT status FROM eligibility.eligible_voters WHERE id = ${state.eligibleVoterId} FOR UPDATE`,
        );
        if (voters.rows[0]?.status !== 'ACTIVE') {
          throw new EligibilityDomainError(
            'ELIGIBLE_VOTER_INACTIVE',
            'Eligible voter is not active.',
          );
        }
        await transaction
          .update(electoralCredentials)
          .set({
            revokedAt: state.activatedAt,
            rowVersion: sql`${electoralCredentials.rowVersion} + 1`,
            status: 'ROTATED',
          })
          .where(
            and(
              eq(electoralCredentials.eligibleVoterId, state.eligibleVoterId),
              eq(electoralCredentials.status, 'ACTIVE'),
            ),
          );
        await transaction.insert(electoralCredentials).values({
          activatedAt: state.activatedAt,
          createdAt: state.createdAt,
          eligibleVoterId: state.eligibleVoterId,
          id: state.id,
          identityCommitment: state.identityCommitment,
          revokedAt: state.revokedAt,
          rowVersion: state.rowVersion,
          schemeVersion: state.schemeVersion,
          status: state.status,
        });
        await transaction.insert(eligibilityEvent).values({
          actorAdminId: audit.actorAdminId,
          entityId: state.id,
          entityType: 'electoral_credential',
          event: 'credential_registered',
          requestId: audit.requestId,
        });
      });
    } catch (error: unknown) {
      if (databaseCode(error) === '23505') {
        throw new EligibilityDomainError(
          'CREDENTIAL_ALREADY_REGISTERED',
          'Identity commitment is already registered.',
        );
      }
      throw error;
    }
  }

  async revoke(
    credential: ElectoralCredential,
    expectedRowVersion: number,
    audit: EligibilityAuditContext,
  ): Promise<void> {
    const state = credential.snapshot();
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(electoralCredentials)
        .set({
          revokedAt: state.revokedAt,
          rowVersion: sql`${electoralCredentials.rowVersion} + 1`,
          status: state.status,
        })
        .where(
          and(
            eq(electoralCredentials.id, state.id),
            eq(electoralCredentials.status, 'ACTIVE'),
            eq(electoralCredentials.rowVersion, expectedRowVersion),
          ),
        )
        .returning({ id: electoralCredentials.id });
      if (updated.length !== 1) throw concurrencyError();
      await transaction.insert(eligibilityEvent).values({
        actorAdminId: audit.actorAdminId,
        entityId: state.id,
        entityType: 'electoral_credential',
        event: 'credential_revoked',
        requestId: audit.requestId,
      });
    });
  }
}
