import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/client.js';
import { eligibilityEvent } from '../../../../database/schema/audit.js';
import { elections } from '../../../../database/schema/election.js';
import {
  eligibilitySnapshotMembers,
  eligibilitySnapshots,
} from '../../../../database/schema/eligibility.js';
import type { ElectionId } from '../../../elections/domain/election-id.js';
import type { EligibilitySnapshotRepository } from '../../application/ports/eligibility-snapshot-repository.port.js';
import type { EligibilityAuditContext } from '../../application/ports/eligible-voter-repository.port.js';
import {
  electoralCredentialId,
  eligibilitySnapshotId,
  type EligibilitySnapshotId,
} from '../../domain/eligibility-id.js';
import { EligibilityDomainError } from '../../domain/eligibility-errors.js';
import {
  EligibilitySnapshot,
  type EligibilitySnapshotStatus,
} from '../../domain/eligibility-snapshot.js';
import { concurrencyError } from './persistence-errors.js';

type SnapshotRow = typeof eligibilitySnapshots.$inferSelect;
type MemberRow = typeof eligibilitySnapshotMembers.$inferSelect;

function mapSnapshot(row: SnapshotRow, members: readonly MemberRow[]): EligibilitySnapshot {
  return EligibilitySnapshot.reconstitute({
    commitmentSchemeVersion: row.commitmentSchemeVersion,
    configurationVersion: row.configurationVersion,
    createdAt: row.createdAt,
    electionId: row.electionId as ElectionId,
    frozenAt: row.frozenAt,
    id: eligibilitySnapshotId(row.id),
    leafCount: row.leafCount,
    members: members.map((member) => ({
      credentialId: electoralCredentialId(member.credentialId),
      leafIndex: member.leafIndex,
      leafValue: member.leafValue,
    })),
    merkleRoot: row.merkleRoot,
    rowVersion: row.rowVersion,
    status: row.status as EligibilitySnapshotStatus,
    treeDepth: row.treeDepth,
    version: row.version,
  });
}

export class DrizzleEligibilitySnapshotRepository implements EligibilitySnapshotRepository {
  constructor(private readonly database: Database) {}

  async createForElection(
    electionId: ElectionId,
    configurationVersion: number,
    expectedElectionRowVersion: number,
    factory: (version: number) => EligibilitySnapshot,
    audit: EligibilityAuditContext,
  ): Promise<EligibilitySnapshot> {
    return this.database.transaction(async (transaction) => {
      const electionRows = await transaction.execute<{
        configuration_version: number;
        row_version: number;
        status: string;
      }>(sql`SELECT configuration_version, row_version, status
             FROM election.elections WHERE id = ${electionId} FOR UPDATE`);
      const election = electionRows.rows[0];
      if (
        !election ||
        election.status !== 'DRAFT' ||
        election.row_version !== expectedElectionRowVersion ||
        election.configuration_version + 1 !== configurationVersion
      ) {
        throw concurrencyError();
      }
      const versions = await transaction.execute<{ next_version: number }>(
        sql`SELECT COALESCE(MAX(version), 0)::int + 1 AS next_version
            FROM eligibility.eligibility_snapshots
            WHERE election_id = ${electionId} AND configuration_version = ${configurationVersion}`,
      );
      const snapshot = factory(versions.rows[0]?.next_version ?? 1);
      const state = snapshot.snapshot();
      const supersededBuilding = await transaction
        .update(eligibilitySnapshots)
        .set({ rowVersion: sql`${eligibilitySnapshots.rowVersion} + 1`, status: 'SUPERSEDED' })
        .where(
          and(
            eq(eligibilitySnapshots.electionId, electionId),
            eq(eligibilitySnapshots.configurationVersion, configurationVersion),
            eq(eligibilitySnapshots.status, 'BUILDING'),
          ),
        )
        .returning({ id: eligibilitySnapshots.id });
      if (supersededBuilding.length > 0) {
        await transaction.insert(eligibilityEvent).values(
          supersededBuilding.map((item) => ({
            actorAdminId: audit.actorAdminId,
            entityId: item.id,
            entityType: 'eligibility_snapshot',
            event: 'eligibility_snapshot_superseded',
            requestId: audit.requestId,
          })),
        );
      }
      await transaction.insert(eligibilitySnapshots).values({
        commitmentSchemeVersion: state.commitmentSchemeVersion,
        configurationVersion: state.configurationVersion,
        createdAt: state.createdAt,
        electionId: state.electionId,
        frozenAt: state.frozenAt,
        id: state.id,
        leafCount: state.leafCount,
        merkleRoot: state.merkleRoot,
        rowVersion: state.rowVersion,
        status: state.status,
        treeDepth: state.treeDepth,
        version: state.version,
      });
      await transaction.insert(eligibilitySnapshotMembers).values(
        state.members.map((member) => ({
          credentialId: member.credentialId,
          leafIndex: member.leafIndex,
          leafValue: member.leafValue,
          snapshotId: state.id,
        })),
      );
      const linked = await transaction
        .update(elections)
        .set({
          eligibilityConfigurationRef: state.id,
          rowVersion: sql`${elections.rowVersion} + 1`,
          updatedAt: state.createdAt,
        })
        .where(
          and(
            eq(elections.id, electionId),
            eq(elections.status, 'DRAFT'),
            eq(elections.rowVersion, expectedElectionRowVersion),
          ),
        )
        .returning({ id: elections.id });
      if (linked.length !== 1) throw concurrencyError();
      await transaction.insert(eligibilityEvent).values({
        actorAdminId: audit.actorAdminId,
        entityId: state.id,
        entityType: 'eligibility_snapshot',
        event: 'eligibility_snapshot_built',
        requestId: audit.requestId,
      });
      return snapshot;
    });
  }

  async findById(id: EligibilitySnapshotId): Promise<EligibilitySnapshot | null> {
    const rows = await this.database
      .select()
      .from(eligibilitySnapshots)
      .where(eq(eligibilitySnapshots.id, id))
      .limit(1);
    if (!rows[0]) return null;
    const members = await this.database
      .select()
      .from(eligibilitySnapshotMembers)
      .where(eq(eligibilitySnapshotMembers.snapshotId, id))
      .orderBy(asc(eligibilitySnapshotMembers.leafIndex));
    return mapSnapshot(rows[0], members);
  }

  async freeze(
    snapshot: EligibilitySnapshot,
    expectedRowVersion: number,
    audit: EligibilityAuditContext,
  ): Promise<void> {
    const state = snapshot.snapshot();
    await this.database.transaction(async (transaction) => {
      const electionRows = await transaction.execute<{
        eligibility_configuration_ref: string;
        status: string;
      }>(
        sql`SELECT eligibility_configuration_ref, status FROM election.elections
            WHERE id = ${state.electionId} FOR UPDATE`,
      );
      const election = electionRows.rows[0];
      if (election?.status !== 'DRAFT' || election.eligibility_configuration_ref !== state.id) {
        throw concurrencyError();
      }
      const supersededFrozen = await transaction
        .update(eligibilitySnapshots)
        .set({ rowVersion: sql`${eligibilitySnapshots.rowVersion} + 1`, status: 'SUPERSEDED' })
        .where(
          and(
            eq(eligibilitySnapshots.electionId, state.electionId),
            eq(eligibilitySnapshots.configurationVersion, state.configurationVersion),
            eq(eligibilitySnapshots.status, 'FROZEN'),
          ),
        )
        .returning({ id: eligibilitySnapshots.id });
      if (supersededFrozen.length > 0) {
        await transaction.insert(eligibilityEvent).values(
          supersededFrozen.map((item) => ({
            actorAdminId: audit.actorAdminId,
            entityId: item.id,
            entityType: 'eligibility_snapshot',
            event: 'eligibility_snapshot_superseded',
            requestId: audit.requestId,
          })),
        );
      }
      const updated = await transaction
        .update(eligibilitySnapshots)
        .set({
          frozenAt: state.frozenAt,
          rowVersion: sql`${eligibilitySnapshots.rowVersion} + 1`,
          status: 'FROZEN',
        })
        .where(
          and(
            eq(eligibilitySnapshots.id, state.id),
            eq(eligibilitySnapshots.status, 'BUILDING'),
            eq(eligibilitySnapshots.rowVersion, expectedRowVersion),
          ),
        )
        .returning({ id: eligibilitySnapshots.id });
      if (updated.length !== 1) {
        throw new EligibilityDomainError(
          'ELIGIBILITY_SNAPSHOT_NOT_BUILDING',
          'Eligibility snapshot is no longer building.',
        );
      }
      await transaction.insert(eligibilityEvent).values({
        actorAdminId: audit.actorAdminId,
        entityId: state.id,
        entityType: 'eligibility_snapshot',
        event: 'eligibility_snapshot_frozen',
        requestId: audit.requestId,
      });
    });
  }
}
