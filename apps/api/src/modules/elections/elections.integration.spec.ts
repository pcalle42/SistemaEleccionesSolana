import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CIRCUIT_VERSION_V1, PROTOCOL_VERSION_V1 } from '@votaciones/zk-protocol';

import { createDatabase } from '../../database/client.js';
import { createDatabasePool } from '../../database/pool.js';
import type { Clock } from './domain/clock.js';
import { Election } from './domain/election.js';
import { electionId, electionOptionId } from './domain/election-id.js';
import { DrizzleElectionRepository } from './infrastructure/persistence/drizzle-election.repository.js';

const runtimePool = createDatabasePool('runtime');
const migrationPool = createDatabasePool('migration');
const repository = new DrizzleElectionRepository(createDatabase(runtimePool));
const adminId = randomUUID();
const fixedNow = new Date('2030-01-01T12:00:00.000Z');
const clock: Clock = { now: () => new Date(fixedNow) };

function aggregate(): Election {
  return Election.create(
    {
      closesAt: new Date('2030-01-01T13:00:00.000Z'),
      id: electionId(randomUUID()),
      opensAt: new Date('2030-01-01T11:00:00.000Z'),
      options: [
        { displayOrder: 0, id: electionOptionId(randomUUID()), label: 'Option A' },
        { displayOrder: 1, id: electionOptionId(randomUUID()), label: 'Option B' },
      ],
      references: {
        circuitVersion: CIRCUIT_VERSION_V1,
        eligibilityConfigurationRef: 'eligibility-v1',
        protocolVersion: PROTOCOL_VERSION_V1,
      },
      title: 'Integration election',
    },
    clock,
  );
}

async function seedFrozenEligibility(electionIdValue: string, configurationVersion: number) {
  await migrationPool.query(
    `INSERT INTO eligibility.eligibility_snapshots
      (commitment_scheme_version, configuration_version, created_at, election_id, frozen_at,
       id, leaf_count, merkle_root, status, tree_depth, version)
     VALUES ($1,$2,$3,$4,$3,$5,1,$6,'FROZEN',20,1)`,
    [
      'poseidon-bn254-v1',
      configurationVersion,
      fixedNow,
      electionIdValue,
      randomUUID(),
      String(configurationVersion + 100),
    ],
  );
}

async function clearElectionData() {
  await migrationPool.query('DELETE FROM result.result_publications');
  await migrationPool.query('DELETE FROM result.verification_packages');
  await migrationPool.query('DELETE FROM result.election_results');
  await migrationPool.query('DELETE FROM result.tally_manifests');
  await migrationPool.query('DELETE FROM result.accepted_vote_set_snapshots');
  await migrationPool.query('DELETE FROM result.election_manifests');
  await migrationPool.query('DELETE FROM audit.audit_checkpoint');
  await migrationPool.query('DELETE FROM audit.audit_event');
  await migrationPool.query('DELETE FROM audit.audit_chain_head');
  await migrationPool.query('DELETE FROM eligibility.eligibility_snapshot_members');
  await migrationPool.query('DELETE FROM eligibility.eligibility_snapshots');
  await migrationPool.query('DELETE FROM voting.vote_proof_evidence');
  await migrationPool.query('DELETE FROM voting.accepted_votes');
  await migrationPool.query('DELETE FROM election.election_state_event');
  await migrationPool.query('DELETE FROM election.election_configuration_versions');
  await migrationPool.query('DELETE FROM election.election_options');
  await migrationPool.query('DELETE FROM election.elections');
}

beforeAll(async () => {
  await clearElectionData();
  await migrationPool.query('DELETE FROM audit.admin_auth_event');
  await migrationPool.query('DELETE FROM admin.admin_account');
  await migrationPool.query(
    `INSERT INTO admin.admin_account (id, username, password_hash)
     VALUES ($1, 'election-integration-admin', 'not-used')`,
    [adminId],
  );
});

afterAll(async () => {
  await clearElectionData();
  await migrationPool.query('DELETE FROM admin.admin_account WHERE id = $1', [adminId]);
  await runtimePool.end();
  await migrationPool.end();
});

describe('Drizzle election repository', () => {
  it('persists draft/options, versions configuration, audits, and reloads', async () => {
    const election = aggregate();
    await repository.create(election);
    const loaded = await repository.findById(election.snapshot().id);
    expect(loaded?.snapshot()).toMatchObject({ status: 'DRAFT', title: 'Integration election' });
    expect(loaded?.snapshot().options).toHaveLength(2);

    const rowVersion = loaded!.snapshot().rowVersion;
    loaded!.updateDraft({ title: 'Updated election' }, clock);
    await repository.saveDraftChanges(loaded!, rowVersion);

    const prepared = await repository.findById(election.snapshot().id);
    await seedFrozenEligibility(election.snapshot().id, 1);
    const expectedVersion = prepared!.snapshot().rowVersion;
    const event = prepared!.prepare(adminId, clock);
    await repository.transitionState(prepared!, event, expectedVersion, 'integration-request');

    const reloaded = await repository.findById(election.snapshot().id);
    expect(reloaded?.snapshot()).toMatchObject({
      configurationVersion: 1,
      status: 'READY',
      title: 'Updated election',
    });
    const reopenEvent = reloaded!.reopenDraft(adminId, clock, 'Correct configuration');
    await repository.transitionState(
      reloaded!,
      reopenEvent,
      reloaded!.snapshot().rowVersion,
      'reopen-request',
    );
    const reopened = await repository.findById(election.snapshot().id);
    const draftVersion = reopened!.snapshot().rowVersion;
    reopened!.updateDraft({ description: 'Second configuration' }, clock);
    await repository.saveDraftChanges(reopened!, draftVersion);
    const secondDraft = await repository.findById(election.snapshot().id);
    await seedFrozenEligibility(election.snapshot().id, 2);
    const secondReady = secondDraft!.prepare(adminId, clock);
    await repository.transitionState(
      secondDraft!,
      secondReady,
      secondDraft!.snapshot().rowVersion,
      'second-ready-request',
    );

    const versionRows = await migrationPool.query<{
      cryptographicConfiguration: { electionContext: string; optionMapping: unknown[] };
      version: number;
    }>(
      `SELECT version,
              snapshot->'cryptographicConfiguration' AS "cryptographicConfiguration"
       FROM election.election_configuration_versions
       WHERE election_id = $1 ORDER BY version`,
      [election.snapshot().id],
    );
    const eventRows = await migrationPool.query(
      'SELECT previous_state, new_state FROM election.election_state_event WHERE election_id = $1',
      [election.snapshot().id],
    );
    expect(versionRows.rows.map(({ version }) => ({ version }))).toEqual([
      { version: 1 },
      { version: 2 },
    ]);
    expect(versionRows.rows[0]?.cryptographicConfiguration.optionMapping).toEqual([
      expect.objectContaining({ index: 0 }),
      expect.objectContaining({ index: 1 }),
    ]);
    expect(versionRows.rows[0]?.cryptographicConfiguration.electionContext).toMatch(/^[0-9]+$/u);
    expect(versionRows.rows[1]?.cryptographicConfiguration.electionContext).not.toBe(
      versionRows.rows[0]?.cryptographicConfiguration.electionContext,
    );
    expect(eventRows.rows).toHaveLength(3);
    expect(eventRows.rows).toEqual(
      expect.arrayContaining([
        { previous_state: 'READY', new_state: 'DRAFT' },
        { previous_state: 'DRAFT', new_state: 'READY' },
      ]),
    );
  });

  it('rejects a stale concurrent transition', async () => {
    const election = aggregate();
    await repository.create(election);
    const first = await repository.findById(election.snapshot().id);
    const second = await repository.findById(election.snapshot().id);
    await seedFrozenEligibility(election.snapshot().id, 1);
    const firstEvent = first!.prepare(adminId, clock);
    const secondEvent = second!.prepare(adminId, clock);
    await repository.transitionState(first!, firstEvent, 0);
    await expect(repository.transitionState(second!, secondEvent, 0)).rejects.toThrowError(
      expect.objectContaining({ code: 'ELECTION_CONCURRENT_MODIFICATION' }),
    );
  });

  it('enforces voting-window and status constraints in PostgreSQL', async () => {
    await expect(
      migrationPool.query(
        `INSERT INTO election.elections
          (id, title, status, voting_method, opens_at, closes_at, created_at, updated_at)
         VALUES ($1, 'Invalid', 'BROKEN', 'SINGLE_CHOICE', $2, $2, $2, $2)`,
        [randomUUID(), fixedNow],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rolls back the state update and snapshot when mandatory audit persistence fails', async () => {
    const election = aggregate();
    await repository.create(election);
    await seedFrozenEligibility(election.snapshot().id, 1);
    const event = election.prepare(randomUUID(), clock);

    await expect(repository.transitionState(election, event, 0)).rejects.toMatchObject({
      cause: { code: '23503' },
    });
    const reloaded = await repository.findById(election.snapshot().id);
    expect(reloaded?.snapshot()).toMatchObject({ configurationVersion: 0, status: 'DRAFT' });
    const snapshots = await migrationPool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM election.election_configuration_versions WHERE election_id = $1',
      [election.snapshot().id],
    );
    expect(snapshots.rows[0]?.count).toBe('0');
  });
});
