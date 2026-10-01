import { randomUUID } from 'node:crypto';

import { CIRCUIT_VERSION_V1, PROTOCOL_VERSION_V1 } from '@votaciones/zk-protocol';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDatabasePool } from '../../database/pool.js';
import type { VoteAcceptanceContext } from './domain/accepted-vote.js';
import { submissionFingerprintV1 } from './domain/vote-receipt.js';
import { PostgresVoteRepository } from './infrastructure/persistence/postgres-vote.repository.js';

const runtimePool = createDatabasePool('runtime');
const migrationPool = createDatabasePool('migration');
const repository = new PostgresVoteRepository(runtimePool);

async function clean(): Promise<void> {
  await migrationPool.query('DELETE FROM voting.vote_proof_evidence');
  await migrationPool.query('DELETE FROM voting.accepted_votes');
  await migrationPool.query('DELETE FROM eligibility.eligibility_snapshot_members');
  await migrationPool.query('DELETE FROM eligibility.eligibility_snapshots');
  await migrationPool.query('DELETE FROM election.election_state_event');
  await migrationPool.query('DELETE FROM election.election_configuration_versions');
  await migrationPool.query('DELETE FROM election.election_options');
  await migrationPool.query('DELETE FROM election.elections');
}

async function seedElection(status = 'OPEN', closesAt = new Date(Date.now() + 3_600_000)) {
  const id = randomUUID();
  const opensAt = new Date(Date.now() - 3_600_000);
  const optionIds = [randomUUID(), randomUUID()];
  await migrationPool.query(
    `INSERT INTO election.elections
      (id, title, status, voting_method, opens_at, closes_at, configuration_version,
       protocol_version, circuit_version, eligibility_configuration_ref, created_at, updated_at)
     VALUES ($1, 'Voting integration', $2, 'SINGLE_CHOICE', $3, $4, 1, $5, $6,
             'eligibility-v1', clock_timestamp(), clock_timestamp())`,
    [id, status, opensAt, closesAt, PROTOCOL_VERSION_V1, CIRCUIT_VERSION_V1],
  );
  for (const [index, optionId] of optionIds.entries()) {
    await migrationPool.query(
      `INSERT INTO election.election_options (id, election_id, label, display_order)
       VALUES ($1, $2, $3, $4)`,
      [optionId, id, `Option ${index}`, index],
    );
  }
  const cryptographicConfiguration = {
    circuitVersion: CIRCUIT_VERSION_V1,
    electionContext: '30',
    optionMapping: optionIds.map((optionId, index) => ({ id: optionId, index })),
    protocolVersion: PROTOCOL_VERSION_V1,
  };
  await migrationPool.query(
    `INSERT INTO election.election_configuration_versions (election_id, version, frozen_at, snapshot)
     VALUES ($1, 1, clock_timestamp(), $2::jsonb)`,
    [id, JSON.stringify({ cryptographicConfiguration })],
  );
  await migrationPool.query(
    `INSERT INTO eligibility.eligibility_snapshots
      (id, election_id, configuration_version, version, status, merkle_root, tree_depth,
       leaf_count, commitment_scheme_version, created_at, frozen_at)
     VALUES ($1, $2, 1, 1, 'FROZEN', '10', 20, 2, 'poseidon-bn254-v1',
             clock_timestamp(), clock_timestamp())`,
    [randomUUID(), id],
  );
  return id;
}

function command(context: VoteAcceptanceContext, voteEncoding = 1, nullifier = '20') {
  return {
    context,
    nullifier,
    proof: { curve: 'bn128', protocol: 'groth16', test: true },
    publicSignals: ['10', nullifier, '30', String(voteEncoding), '2'],
    submissionFingerprint: submissionFingerprintV1({
      electionContext: '30',
      merkleRoot: '10',
      nullifier,
      protocolVersion: PROTOCOL_VERSION_V1,
      voteEncoding,
    }),
    voteEncoding,
  };
}

beforeAll(clean);
beforeEach(clean);
afterAll(async () => {
  await clean();
  await runtimePool.end();
  await migrationPool.end();
});

describe('PostgreSQL vote acceptance', () => {
  it('atomically inserts an immutable canonical vote and mandatory proof evidence', async () => {
    const electionId = await seedElection();
    const context = (await repository.loadAcceptanceContext(electionId))!;
    const result = await repository.accept(command(context));
    const stored = await repository.findByNullifier(electionId, PROTOCOL_VERSION_V1, '20');
    const evidence = await migrationPool.query<{
      proof_digest: string;
      public_signals_digest: string;
    }>(
      'SELECT proof_digest, public_signals_digest FROM voting.vote_proof_evidence WHERE vote_id = $1',
      [stored!.id],
    );

    expect(result.idempotentRetry).toBe(false);
    expect(stored).toMatchObject({ nullifier: '20', voteEncoding: 1 });
    expect(result.receipt).toEqual(stored!.receipt);
    expect(evidence.rowCount).toBe(1);
    expect(evidence.rows[0]?.proof_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(evidence.rows[0]?.public_signals_digest).toMatch(/^[0-9a-f]{64}$/u);
    await expect(
      runtimePool.query('UPDATE voting.accepted_votes SET vote_encoding = 0 WHERE id = $1', [
        stored!.id,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      runtimePool.query('DELETE FROM voting.accepted_votes WHERE id = $1', [stored!.id]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      migrationPool.query('UPDATE voting.accepted_votes SET nullifier = $2 WHERE id = $1', [
        stored!.id,
        '020',
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    const foreignKeys = await migrationPool.query<{ target_schema: string; target_table: string }>(
      `SELECT target_ns.nspname AS target_schema, target.relname AS target_table
         FROM pg_constraint constraint_row
         JOIN pg_class source ON source.oid = constraint_row.conrelid
         JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
         JOIN pg_class target ON target.oid = constraint_row.confrelid
         JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
        WHERE constraint_row.contype = 'f'
          AND source_ns.nspname = 'voting'
          AND source.relname = 'accepted_votes'`,
    );
    expect(foreignKeys.rows).toEqual([{ target_schema: 'election', target_table: 'elections' }]);
  });

  it('rolls back the vote when mandatory evidence cannot be inserted', async () => {
    const electionId = await seedElection();
    const context = (await repository.loadAcceptanceContext(electionId))!;
    await migrationPool.query(
      'REVOKE INSERT ON voting.vote_proof_evidence FROM votaciones_runtime',
    );
    try {
      await expect(repository.accept(command(context))).rejects.toMatchObject({
        code: 'VOTE_ACCEPTANCE_UNAVAILABLE',
      });
      const rows = await migrationPool.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM voting.accepted_votes WHERE election_id = $1',
        [electionId],
      );
      expect(rows.rows[0]?.count).toBe(0);
    } finally {
      await migrationPool.query(
        'GRANT SELECT, INSERT ON voting.vote_proof_evidence TO votaciones_runtime',
      );
    }
  });

  it('accepts one concurrent logical vote and returns the same receipt to every retry', async () => {
    const electionId = await seedElection();
    const context = (await repository.loadAcceptanceContext(electionId))!;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repository.accept(command(context))),
    );
    const rows = await migrationPool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM voting.accepted_votes WHERE election_id = $1',
      [electionId],
    );
    expect(rows.rows[0]?.count).toBe(1);
    expect(new Set(results.map((result) => result.receipt.receiptCommitment)).size).toBe(1);
    expect(results.filter((result) => !result.idempotentRetry)).toHaveLength(1);
  });

  it('allows one winner for the same nullifier with different votes without disclosing the prior choice', async () => {
    const electionId = await seedElection();
    const context = (await repository.loadAcceptanceContext(electionId))!;
    const settled = await Promise.allSettled([
      repository.accept(command(context, 0)),
      repository.accept(command(context, 1)),
    ]);
    expect(settled.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejection = settled.find((item) => item.status === 'rejected');
    expect(rejection).toMatchObject({
      reason: { code: 'NULLIFIER_ALREADY_USED', message: 'Nullifier has already been used.' },
    });
    expect(JSON.stringify(rejection)).not.toContain('voteEncoding');
  });

  it('recovers the committed receipt after a simulated response loss', async () => {
    const electionId = await seedElection();
    const context = (await repository.loadAcceptanceContext(electionId))!;
    const committed = await repository.accept(command(context));
    const retry = await repository.accept(command(context));
    expect(retry.idempotentRetry).toBe(true);
    expect(retry.receipt).toEqual(committed.receipt);
  });

  it('revalidates the frozen root after proof verification and before insert', async () => {
    const electionId = await seedElection();
    const context = (await repository.loadAcceptanceContext(electionId))!;
    await migrationPool.query(
      "UPDATE eligibility.eligibility_snapshots SET merkle_root = '11' WHERE election_id = $1",
      [electionId],
    );
    await expect(repository.accept(command(context))).rejects.toMatchObject({
      code: 'VOTE_SUBMISSION_CONFLICT',
    });
  });

  it.each(['CLOSED', 'CANCELLED'])(
    'orders a %s transition before a waiting vote',
    async (status) => {
      const electionId = await seedElection();
      const context = (await repository.loadAcceptanceContext(electionId))!;
      const transition = await migrationPool.connect();
      await transition.query('BEGIN');
      await transition.query('UPDATE election.elections SET status = $2 WHERE id = $1', [
        electionId,
        status,
      ]);
      const pendingVote = repository.accept(command(context));
      await transition.query('COMMIT');
      transition.release();
      await expect(pendingVote).rejects.toMatchObject({ code: 'ELECTION_NOT_OPEN' });
    },
  );

  it.each(['CLOSED', 'CANCELLED'])(
    'orders a committed vote before a later %s transition',
    async (status) => {
      const electionId = await seedElection();
      const context = (await repository.loadAcceptanceContext(electionId))!;
      await expect(repository.accept(command(context))).resolves.toMatchObject({
        idempotentRetry: false,
      });
      await migrationPool.query('UPDATE election.elections SET status = $2 WHERE id = $1', [
        electionId,
        status,
      ]);
      expect(
        await repository.findByNullifier(electionId, PROTOCOL_VERSION_V1, '20'),
      ).not.toBeNull();
    },
  );

  it('rejects the exclusive closing boundary even while status remains OPEN', async () => {
    const electionId = await seedElection('OPEN', new Date(Date.now() - 1));
    const context = (await repository.loadAcceptanceContext(electionId))!;
    await expect(repository.accept(command(context))).rejects.toMatchObject({
      code: 'ELECTION_CLOSED',
    });
  });
});
