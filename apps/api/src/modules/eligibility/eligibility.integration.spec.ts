import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  PROTOCOL_VERSION_V1,
} from '@votaciones/zk-protocol';

import { createDatabase } from '../../database/client.js';
import { createDatabasePool } from '../../database/pool.js';
import type { Clock } from '../elections/domain/clock.js';
import { Election } from '../elections/domain/election.js';
import { electionId } from '../elections/domain/election-id.js';
import { DrizzleElectionRepository } from '../elections/infrastructure/persistence/drizzle-election.repository.js';
import { EligibleVoter } from './domain/eligible-voter.js';
import { ElectoralCredential } from './domain/electoral-credential.js';
import {
  newElectoralCredentialId,
  newEligibilitySnapshotId,
  newEligibleVoterId,
} from './domain/eligibility-id.js';
import { EligibilitySnapshot } from './domain/eligibility-snapshot.js';
import { DrizzleElectionReadinessVerifier } from './infrastructure/persistence/drizzle-election-readiness-verifier.js';
import { DrizzleElectoralCredentialRepository } from './infrastructure/persistence/drizzle-electoral-credential.repository.js';
import { DrizzleEligibilitySnapshotRepository } from './infrastructure/persistence/drizzle-eligibility-snapshot.repository.js';
import { DrizzleEligibleVoterRepository } from './infrastructure/persistence/drizzle-eligible-voter.repository.js';

const runtimePool = createDatabasePool('runtime');
const migrationPool = createDatabasePool('migration');
const database = createDatabase(runtimePool);
const elections = new DrizzleElectionRepository(database);
const voters = new DrizzleEligibleVoterRepository(database);
const credentials = new DrizzleElectoralCredentialRepository(database);
const snapshots = new DrizzleEligibilitySnapshotRepository(database);
const readiness = new DrizzleElectionReadinessVerifier(database);
const adminId = randomUUID();
const clock: Clock = { now: () => new Date('2030-01-01T12:00:00.000Z') };
const audit = { actorAdminId: adminId, requestId: 'eligibility-integration' };

async function clearEligibilityData(): Promise<void> {
  await migrationPool.query('DELETE FROM voting.vote_proof_evidence');
  await migrationPool.query('DELETE FROM voting.accepted_votes');
  await migrationPool.query('DELETE FROM audit.eligibility_event');
  await migrationPool.query("UPDATE eligibility.eligibility_snapshots SET status = 'BUILDING'");
  await migrationPool.query('DELETE FROM eligibility.eligibility_snapshot_members');
  await migrationPool.query('DELETE FROM eligibility.eligibility_snapshots');
  await migrationPool.query('DELETE FROM eligibility.electoral_credentials');
  await migrationPool.query('DELETE FROM eligibility.eligible_voters');
  await migrationPool.query('DELETE FROM election.election_state_event');
  await migrationPool.query('DELETE FROM election.election_configuration_versions');
  await migrationPool.query('DELETE FROM election.election_options');
  await migrationPool.query('DELETE FROM election.elections');
}

async function createElection(): Promise<Election> {
  const election = Election.create(
    {
      closesAt: new Date('2030-01-01T13:00:00.000Z'),
      id: electionId(randomUUID()),
      opensAt: new Date('2030-01-01T11:00:00.000Z'),
      references: { circuitVersion: CIRCUIT_VERSION_V1, protocolVersion: PROTOCOL_VERSION_V1 },
      title: 'Eligibility integration election',
    },
    clock,
  );
  await elections.create(election);
  return election;
}

async function createActiveCredential(reference: string, commitment: string) {
  const voter = EligibleVoter.create(newEligibleVoterId(), { externalReference: reference }, clock);
  await voters.create(voter, audit);
  const credential = ElectoralCredential.createPending(
    newElectoralCredentialId(),
    voter.snapshot().id,
    commitment,
    COMMITMENT_SCHEME_VERSION_V1,
    clock,
  );
  credential.activate(clock);
  await credentials.registerAndRotate(credential, audit);
  return { credential, voter };
}

function snapshotFactory(
  election: Election,
  credentialIds: readonly string[],
  leafValues: readonly string[],
) {
  return (version: number) =>
    EligibilitySnapshot.build(
      {
        commitmentSchemeVersion: COMMITMENT_SCHEME_VERSION_V1,
        configurationVersion: election.snapshot().configurationVersion + 1,
        electionId: election.snapshot().id,
        id: newEligibilitySnapshotId(),
        leafCount: leafValues.length,
        members: leafValues.map((leafValue, leafIndex) => ({
          credentialId: credentialIds[leafIndex] as ReturnType<typeof newElectoralCredentialId>,
          leafIndex,
          leafValue,
        })),
        merkleRoot: `fixture-root-${leafValues.join('-')}`,
        treeDepth: 20,
        version,
      },
      clock,
    );
}

beforeAll(async () => {
  await clearEligibilityData();
  await migrationPool.query('DELETE FROM audit.admin_auth_event');
  await migrationPool.query('DELETE FROM admin.admin_account');
  await migrationPool.query(
    `INSERT INTO admin.admin_account (id, username, password_hash)
     VALUES ($1, 'eligibility-integration-admin', 'not-used')`,
    [adminId],
  );
});

afterAll(async () => {
  await clearEligibilityData();
  await migrationPool.query('DELETE FROM admin.admin_account WHERE id = $1', [adminId]);
  await runtimePool.end();
  await migrationPool.end();
});

describe('eligibility PostgreSQL persistence', () => {
  it('rotates credentials while preserving exactly one active credential per voter', async () => {
    const { credential: first, voter } = await createActiveCredential('ROTATE-001', '101');
    const replacement = ElectoralCredential.createPending(
      newElectoralCredentialId(),
      voter.snapshot().id,
      '102',
      COMMITMENT_SCHEME_VERSION_V1,
      clock,
    );
    replacement.activate(clock);
    await credentials.registerAndRotate(replacement, audit);

    expect((await credentials.findById(first.snapshot().id))?.snapshot().status).toBe('ROTATED');
    expect((await credentials.findActiveForVoter(voter.snapshot().id))?.snapshot().id).toBe(
      replacement.snapshot().id,
    );
  });

  it('builds, links, freezes, and makes a compatible snapshot authoritative for readiness', async () => {
    const election = await createElection();
    const first = await createActiveCredential('SNAPSHOT-001', '201');
    const second = await createActiveCredential('SNAPSHOT-002', '202');
    const created = await snapshots.createForElection(
      election.snapshot().id,
      1,
      0,
      snapshotFactory(
        election,
        [first.credential.snapshot().id, second.credential.snapshot().id],
        ['leaf-a', 'leaf-b'],
      ),
      audit,
    );
    const linkedElection = await elections.findById(election.snapshot().id);
    expect(linkedElection?.snapshot().references.eligibilityConfigurationRef).toBe(
      created.snapshot().id,
    );
    expect((await readiness.assess(linkedElection!.snapshot())).eligibilityPrepared).toBe(false);

    const firstFreeze = EligibilitySnapshot.reconstitute(created.snapshot());
    const secondFreeze = EligibilitySnapshot.reconstitute(created.snapshot());
    firstFreeze.freeze(clock);
    secondFreeze.freeze(clock);
    const results = await Promise.allSettled([
      snapshots.freeze(firstFreeze, 0, audit),
      snapshots.freeze(secondFreeze, 0, audit),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const frozen = await snapshots.findById(created.snapshot().id);
    expect(frozen?.snapshot()).toMatchObject({ leafCount: 2, status: 'FROZEN' });
    expect((await readiness.assess(linkedElection!.snapshot())).eligibilityPrepared).toBe(true);

    await expect(
      runtimePool.query(
        'UPDATE eligibility.eligibility_snapshots SET merkle_root = $1 WHERE id = $2',
        ['tampered-root', created.snapshot().id],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      runtimePool.query(
        `INSERT INTO eligibility.eligibility_snapshot_members
          (snapshot_id, credential_id, leaf_value, leaf_index) VALUES ($1, $2, $3, $4)`,
        [created.snapshot().id, first.credential.snapshot().id, 'late-leaf', 2],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects stale concurrent snapshot builds and rolls back mandatory audit failure', async () => {
    const election = await createElection();
    const entry = await createActiveCredential('CONCURRENT-001', '301');
    const factory = snapshotFactory(
      election,
      [entry.credential.snapshot().id],
      ['leaf-concurrent'],
    );
    const attempts = await Promise.allSettled([
      snapshots.createForElection(election.snapshot().id, 1, 0, factory, audit),
      snapshots.createForElection(election.snapshot().id, 1, 0, factory, audit),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const rollbackVoter = EligibleVoter.create(
      newEligibleVoterId(),
      { externalReference: 'ROLLBACK-001' },
      clock,
    );
    await expect(
      voters.create(rollbackVoter, { actorAdminId: randomUUID(), requestId: undefined }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    expect(await voters.findById(rollbackVoter.snapshot().id)).toBeNull();
  });

  it('versions replacement builds and audits the superseded snapshot', async () => {
    const election = await createElection();
    const entry = await createActiveCredential('VERSION-001', '401');
    const factory = snapshotFactory(election, [entry.credential.snapshot().id], ['leaf-versioned']);
    const first = await snapshots.createForElection(election.snapshot().id, 1, 0, factory, audit);
    const linked = await elections.findById(election.snapshot().id);
    const second = await snapshots.createForElection(
      election.snapshot().id,
      1,
      linked!.snapshot().rowVersion,
      factory,
      audit,
    );

    expect((await snapshots.findById(first.snapshot().id))?.snapshot().status).toBe('SUPERSEDED');
    expect(second.snapshot()).toMatchObject({ status: 'BUILDING', version: 2 });
    const events = await migrationPool.query<{ event: string }>(
      `SELECT event FROM audit.eligibility_event
       WHERE entity_id = $1 AND event = 'eligibility_snapshot_superseded'`,
      [first.snapshot().id],
    );
    expect(events.rows).toEqual([{ event: 'eligibility_snapshot_superseded' }]);
  });
});
